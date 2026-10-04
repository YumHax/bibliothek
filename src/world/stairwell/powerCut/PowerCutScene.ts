import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { OccupancyAware } from '../../Furniture';
import { onBlackout, blackoutNow } from '@/building/blackout';
import { playMurmur } from '@/audio/murmur';
import { stereoPan } from '@/audio/spatial';
import { loudness } from '@/audio/hearing';
import { paint, timber } from '../../materials/palette';
import { boxMesh } from '../../meshUtils';
import { Walker } from '../../people/Walker';
import { Prop } from '../../props/Prop';
import type { Lift } from '../Lift';
import { doorKey } from '../building';
import type { StairLights } from '../StairLights';
import { Candle, FLAME_Y } from './Candle';
import { POWER_CUT_PLAN as plan, type CandleNeighbour } from './powerCutPlan';
import type { SocialServices } from '@/social/talk';
import { metName, bodyOf, talkHook, type SocialHook } from '../../people/socialHook';
import { befriend } from '@/building/friendship';
import { BUILDING_SOCIAL } from '@/building/buildingSocialPlan';
import { personAtDoor } from '@/social/people';
import { addMemory } from '@/social/standing';

interface PowerCutSceneOptions {
  viewer: THREE.Object3D;
  lights: StairLights;
  lift: Lift;
  /** The zone's collision set: the card table and its stools stand in the way only while they are out. */
  collisions: Collisions;
  /** The game day (what the stuck neighbour remembers of it, `social/`). */
  day?: () => number;
  /** The people the player talks to (docs/social.md): each resident out in the dark talks, the night their news. */
  social?: SocialServices;
}

/** Seconds people take to fade in at a cut, and out after the power is back (the cheer said first). */
const FADE_S = 1.2;
const LINGER_S = 6;

interface Out {
  walker: Walker;
  plan: CandleNeighbour;
}

/**
 * The stairwell in a power cut (`building/blackout`): candles on saucers on the landings and on a card table in the
 * hall (no light of their own: `StairLights` moves its two real lights over the nearest flames), the residents out of
 * their doors with them, chatting (Haddad and Dubois on the 2nd, Girard and Martin at cards in the hall), and, if the
 * cut fell while the player was elsewhere, the lift stuck between the 4th and the 3rd with Mrs Moreau inside, calling
 * out when the player comes near and talking through the gate. The power back, everyone cheers, the lift goes on, and
 * a few seconds later they have all gone in. Nothing of it is seen or ticked for much the rest of the time: the
 * meshes are hidden and the walkers away. The walkers are placed by the builder (they are clickable).
 */
export class PowerCutScene extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  /** Everyone of the scene, for the builder to place: the residents out with candles, then Mrs Moreau in the lift. */
  readonly walkers: Walker[] = [];
  private readonly candles: Candle[] = [];
  private readonly flames: THREE.Vector3[];
  private readonly props = new THREE.Group();
  private readonly out: Out[] = [];
  private readonly stuck: Walker;
  private readonly ear = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private time = 0;
  /** 0 .. 1: how much of the scene shows (people fading in and out). */
  private shown = 0;
  private lingering = 0;
  private active = false;
  private stranded = false;
  private called = false;
  private occupied = false;
  private readonly unsubscribe: () => void;
  /** The card table's box (world, once placed) while it is in the collision set. */
  private tableBox: THREE.Box3 | null = null;

  constructor(private readonly options: PowerCutSceneOptions) {
    super();
    this.name = 'PowerCutScene';
    this.flames = plan.candles.map(([x, y, z]) => new THREE.Vector3(x, y + FLAME_Y, z));
    plan.candles.forEach(([x, y, z], i) => {
      const candle = new Candle(i + 1);
      candle.position.set(x, y, z);
      this.candles.push(candle);
      this.props.add(candle);
    });
    this.buildTable();
    this.props.visible = false;
    this.add(this.props);
    const { viewer } = options;
    for (const who of plan.neighbours) {
      const walker: Walker = new Walker({ viewer, seed: who.seed, lines: who.lines, label: `${who.who} · chat`, speaker: metName(who.person, who.who), fade: true, yields: false, social: this.inTheDark(who.person, who.lines, () => walker) });
      walker.setPresent(false);
      this.out.push({ walker, plan: who });
      this.walkers.push(walker);
    }
    const { stuck } = plan;
    this.stuck = new Walker({ viewer, seed: stuck.seed, lines: stuck.lines, label: `${stuck.who}, stuck in the lift · talk`, speaker: metName(stuck.person, stuck.who), fade: true, yields: false, social: this.inTheDark(stuck.person, stuck.lines, () => this.stuck) });
    this.stuck.setPresent(false);
    this.walkers.push(this.stuck);
    this.unsubscribe = onBlackout((cut) => (cut ? this.begin() : this.end()));
    if (blackoutNow()) this.begin();
  }

  /** `person` met in the dark: talked to like anywhere, their lines of the night an entry of their own. */
  private inTheDark(person: string, lines: readonly string[], body: () => Walker): SocialHook | undefined {
    let next = 0;
    return talkHook(this.options.social, person, () => ({
      person,
      place: 'stairs',
      body: bodyOf(body()),
      extras: [{ id: 'dark', group: 'talk', label: 'Some night, eh?', run: () => ({ line: lines[next++ % lines.length]! }) }],
    }));
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  dispose(): void {
    this.unsubscribe();
    this.blockTable(false);
  }

  update(dt: number): void {
    if (!this.active && this.shown === 0) return;
    this.time += dt;
    if (!this.active) this.lingering -= dt;
    const target = this.active || this.lingering > 0 ? 1 : 0;
    this.shown = THREE.MathUtils.clamp(this.shown + Math.sign(target - this.shown) * (dt / FADE_S), 0, 1);
    if (this.shown === 0 && !this.active) return this.putAway();
    if (this.active) this.blockTable(true);
    for (const { walker } of this.out) walker.setFade(this.shown);
    for (const candle of this.candles) candle.flicker(this.time);
    if (this.stranded) this.keepInCar();
    if (this.active && this.stranded && !this.called && this.occupied) this.callOut();
  }

  /** The power goes: the candles are lit, the residents come out, the lift is stuck (if nobody saw it stop). */
  private begin(): void {
    this.active = true;
    this.lingering = 0;
    this.props.visible = true;
    this.options.lights.setCandles(this.flames);
    this.blockTable(true);
    for (const { walker, plan: who } of this.out) {
      const [x, y, z] = who.at;
      walker.setPresent(true, this.at.set(x, y, z));
      walker.position.y = y;
      if (who.seat !== undefined) walker.sit(who.yaw, who.seat, who.pose);
      else walker.stand(who.yaw, who.pose, 'viewer');
      walker.setFade(this.shown);
    }
    const { lift } = this.options;
    this.stranded = false;
    this.called = false;
    // Only set up out of the player's sight: away from the stairs, the car idle.
    // Nor while the car waits on our landing for the player up in the attic: they come back down in it.
    if (!this.occupied && !lift.isBetweenFloors && !lift.isHeldForPlayer) {
      lift.strand(plan.stuck.k);
      this.stranded = true;
      this.stuck.setPresent(true, this.at.set(plan.stuck.at[0], lift.carFloor, plan.stuck.at[1]));
      this.stuck.stand(0, 'crossed', 'viewer');
      this.stuck.setFade(1);
    }
  }

  /** The power is back: a cheer from everyone, Mrs Moreau's thanks, then they go in. */
  private end(): void {
    if (!this.active) return;
    this.active = false;
    this.lingering = LINGER_S;
    this.options.lights.setCandles([]);
    this.options.viewer.getWorldPosition(this.ear);
    this.out.forEach(({ walker, plan: who }, i) => {
      walker.say(who.cheer, 3);
      if (!this.occupied) return;
      walker.getWorldPosition(this.at);
      const volume = loudness(this.ear.distanceTo(this.at), { referenceDistance: 2, rolloff: 1, maxDistance: 18 });
      playMurmur(who.cheer, 0.05 * volume, { pan: stereoPan(this.options.viewer, this.at), walls: 0 }, 0.3 + 0.15 * i);
    });
    if (this.stranded) {
      this.stuck.speak(plan.stuck.freed);
      // The player was there with her (on the stairs): she won't forget it (docs/social.md "The building").
      const freed = BUILDING_SOCIAL.freedFromLift;
      if (this.occupied && befriend(doorKey(plan.stuck.k, plan.stuck.i), freed.warmth, 'freedFromLift', this.options.day?.() ?? 0)) {
        const id = personAtDoor(doorKey(plan.stuck.k, plan.stuck.i));
        if (id) addMemory(id, this.options.day?.() ?? 0, freed.memory, freed.warmth * 2);
      }
    }
  }

  /** Mrs Moreau rides with the car (it goes on once the power is back) and fades with the rest of the scene. */
  private keepInCar(): void {
    this.stuck.position.y = this.options.lift.carFloor;
    this.stuck.setFade(this.active ? 1 : this.shown);
  }

  /** The first time the player comes near the stuck car, she calls out. */
  private callOut(): void {
    this.options.viewer.getWorldPosition(this.ear);
    this.stuck.getWorldPosition(this.at);
    if (this.ear.distanceTo(this.at) > plan.stuck.callRange) return;
    this.called = true;
    this.stuck.speak(plan.stuck.call);
  }

  /** The door of whoever is stuck in the car now (`doorKey`), or null: they are not at home meanwhile. */
  get strandedDoor(): string | null {
    return this.stranded ? doorKey(plan.stuck.k, plan.stuck.i) : null;
  }

  /** Over: the candles out of sight, everyone away. */
  private putAway(): void {
    this.props.visible = false;
    this.blockTable(false);
    for (const { walker } of this.out) walker.setPresent(false);
    this.stuck.setPresent(false);
    this.stranded = false;
  }

  /** The card table and its stools in the way (world box), or out of it. */
  private blockTable(blocking: boolean): void {
    const { collisions } = this.options;
    if (!blocking) {
      if (this.tableBox) collisions.remove(this.tableBox);
      this.tableBox = null;
      return;
    }
    if (this.tableBox || !this.parent) return;
    const { table } = plan;
    const [x, z] = table.at;
    const xs = table.stools.map(([sx]) => sx);
    const zs = table.stools.map(([, sz]) => sz);
    const min = new THREE.Vector3(Math.min(x - table.width / 2, ...xs.map((v) => v - 0.16)), 0, Math.min(z - table.depth / 2, ...zs.map((v) => v - 0.16)));
    const max = new THREE.Vector3(Math.max(x + table.width / 2, ...xs.map((v) => v + 0.16)), table.height, Math.max(z + table.depth / 2, ...zs.map((v) => v + 0.16)));
    this.updateWorldMatrix(true, false);
    this.tableBox = new THREE.Box3(min, max).applyMatrix4(this.matrixWorld);
    collisions.add(this.tableBox);
  }

  /** The card table in the hall and its two stools, merged into the props (shown with the scene). */
  private buildTable(): void {
    const { table } = plan;
    const [x, z] = table.at;
    const wood = timber(0x6a4a30, 0.6);
    const legs = paint(0x2a2a2c, 0.5);
    const top = boxMesh(table.width, 0.03, table.depth, wood, { x, y: table.height - 0.015, z });
    this.props.add(top);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.props.add(boxMesh(0.03, table.height - 0.03, 0.03, legs, { x: x + dx * (table.width / 2 - 0.04), y: (table.height - 0.03) / 2, z: z + dz * (table.depth / 2 - 0.04) }));
    }
    // A hand of cards dealt on the cloth.
    this.props.add(boxMesh(0.2, 0.004, 0.13, paint(0xf4f0e6, 0.5), { x: x - 0.08, y: table.height + 0.002, z: z + 0.1 }));
    for (const [sx, sz] of table.stools) {
      this.props.add(boxMesh(0.32, 0.04, 0.32, wood, { x: sx, y: table.stoolHeight - 0.02, z: sz }));
      this.props.add(boxMesh(0.05, table.stoolHeight - 0.04, 0.05, legs, { x: sx, y: (table.stoolHeight - 0.04) / 2, z: sz }));
    }
  }
}
