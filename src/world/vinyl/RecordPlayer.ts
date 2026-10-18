import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { RECORDS, recordOf, type Soundtrack } from '@/vinyl/records';
import { RecordTune } from '@/vinyl/RecordTune';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { METAL } from '../materials/palette';
import { Prop, part } from '../props/Prop';
import { PointSound } from '../acoustics/PointSound';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import type { ActivityAware } from '../zone/lifecycle';
import { damp } from '@/math/damp';
import { poweredAt } from '@/building/mains';
import { playSleeveSlide } from '@/audio/furnitureSounds';

/** 33⅓ rpm, in radians per second. */
const SPIN = (33.333 / 60) * Math.PI * 2;
/** The platter spins up and down over this long (s). */
const SPIN_UP = 0.8;
/** The tonearm's yaw parked on its rest, beside the platter (rad, about the pivot; 0 points to the front). */
const ARM_REST = 0.05;
/** The radii the stylus rides at: the lead-in groove and the run-out. */
const LEAD_IN_R = 0.145;
const RUN_OUT_R = 0.06;
/** How fast the arm swings to where it goes (1/s). */
const ARM_EASE = 3;
/** How far the stylus comes down from the arm's rest height onto the record (m). */
const ARM_DROP = 0.017;
const RECORD_RADIUS = 0.15;
const LABEL_RADIUS = 0.045;

interface TurntableFile {
  /** The record last put on (`RECORDS` id), so the next click puts on the one after it. */
  last: string | null;
  /** Its side, and whether it was played to the end (then the next click turns it over). */
  side: 'A' | 'B';
  finished: boolean;
  /** The record picked out of the pile of sleeves for next (`RecordSleeves`), or null: the one after the last. */
  chosen: string | null;
}

/** The record player's share of the flat's noise for the neighbours (`building/flatNoise`: a longplay is 0.7). */
const RECORD_NOISE = 0.5;

interface RecordPlayerOptions {
  /** The turntable's parts in the host's frame (`Sideboard.turntable`). */
  turntable: { centre: THREE.Vector3; pivot: THREE.Vector3; plinth: { at: THREE.Vector3; size: THREE.Vector3 }; still: THREE.Object3D[] };
  /** How many soundtrack records are owned (`HomeUpgrades.count('record')`: the first n of `RECORDS`). */
  owned: () => number;
  listener: THREE.Object3D;
  occlusion?: SoundOcclusion;
  /** The sideboard's pile of sleeves (`Sideboard.sleevePile`): clicked, it picks the next record out. */
  sleevePile?: { at: THREE.Vector3; size: number; height: number } | null;
}

/**
 * The sideboard's turntable, working: a click with free hands puts on the next of the soundtrack LPs owned (the
 * platter spins up, the arm swings over and drops, `RecordTune` plays side A from the sideboard, through the walls);
 * a click while it plays lifts the needle. At the side's end the arm returns by itself. Rides the sideboard (placed
 * in its frame, `placeWith`), drawing its own record (the sleeve's label on it, turning) and arm over the still
 * ones. Docs: docs/household.md "The turntable".
 */
export class RecordPlayer extends Prop implements Interactable, Updatable, ActivityAware {
  readonly hitboxes: THREE.Object3D[];
  readonly contactShadow = false;
  private readonly tune = new RecordTune();
  private readonly sound: PointSound;
  private readonly disc = new THREE.Group();
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly arm = new THREE.Group();
  private readonly store: PersistedStore<TurntableFile>;
  private spin = 0;
  private armYaw = ARM_REST;
  /** 0 the stylus up, 1 down in the groove; and the arm's height up. */
  private drop = 0;
  private readonly armHeight: number;
  /** The arm's yaw with the stylus in the lead-in groove and in the run-out. */
  private readonly leadIn: number;
  private readonly runOut: number;
  private readonly highlight: THREE.MeshStandardMaterial;

  constructor(private readonly options: RecordPlayerOptions) {
    super();
    this.name = 'RecordPlayer';
    const { centre, pivot, plinth, still } = options.turntable;
    for (const piece of still) piece.visible = false;
    this.store = new PersistedStore<TurntableFile>({ key: KEYS.turntable, version: 1, storage: safeStorage(), defaults: () => ({ last: null, side: 'A', finished: false, chosen: null }), read: readTurntable });
    this.sleeves = options.sleevePile ? new RecordSleeves(options.sleevePile, this) : null;

    // The record: black vinyl, its grooves catching the light a little, the label of whatever is on.
    this.disc.position.copy(centre);
    const vinyl = new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.32, metalness: 0.1 });
    const record = cylinderMesh(RECORD_RADIUS, 0.003, vinyl, { y: 0.0015 }, { segments: 48 });
    record.castShadow = false;
    this.disc.add(record);
    this.labelMaterial = new THREE.MeshStandardMaterial({ map: paintLabel(null), roughness: 0.7 });
    const label = cylinderMesh(LABEL_RADIUS, 0.001, this.labelMaterial, { y: 0.0035 }, { segments: 24 });
    label.castShadow = false;
    this.disc.add(label);
    this.add(this.disc);

    // The tonearm: from its pivot, a steel tube to the headshell, swinging about the post.
    this.arm.position.copy(pivot);
    this.armHeight = pivot.y;
    this.highlight = new THREE.MeshStandardMaterial({ color: 0xc8c8cc, roughness: 0.3, metalness: 1 });
    const length = pivot.distanceTo(new THREE.Vector3(centre.x, pivot.y, centre.z)) + RECORD_RADIUS * 0.15;
    const tube = part(this.arm, 0.007, 0.006, length, this.highlight, { z: length / 2 });
    tube.castShadow = false;
    const shell = part(this.arm, 0.016, 0.008, 0.026, METAL.steel(), { z: length, y: -0.004 });
    shell.castShadow = false;
    this.arm.rotation.y = ARM_REST;
    this.add(this.arm);
    this.leadIn = armYawFor(pivot, centre, length, LEAD_IN_R);
    this.runOut = armYawFor(pivot, centre, length, RUN_OUT_R);

    const hitbox = invisibleHitbox(plinth.size.x + 0.02, plinth.size.y + 0.08, plinth.size.z + 0.02, { x: plinth.at.x, y: plinth.at.y + (plinth.size.y + 0.08) / 2, z: plinth.at.z });
    this.add(hitbox);
    this.hitboxes = [hitbox];

    this.sound = new PointSound(this.tune, { listener: options.listener, ...(options.occlusion ? { occlusion: options.occlusion } : {}), volume: { referenceDistance: 1.2, rolloff: 1.1, maxDistance: 14 } });
    this.sound.position.copy(centre);
    this.add(this.sound);
  }

  /** The records owned, in the order they were bought. */
  private get shelf(): readonly Soundtrack[] {
    return RECORDS.slice(0, Math.max(0, Math.min(RECORDS.length, this.options.owned())));
  }

  /** The record after `id` round the shelf (the first when none). */
  private after(id: string | null): Soundtrack | null {
    const shelf = this.shelf;
    if (!shelf.length) return null;
    const i = shelf.findIndex((r) => r.id === id);
    return shelf[(i + 1) % shelf.length] ?? null;
  }

  /** What a click puts on: the record picked from the sleeves, else the last one turned over once its side A ran out, else the next. */
  private get next(): { record: Soundtrack; side: 'A' | 'B' } | null {
    const file = this.store.load();
    const owned = (id: string | null): Soundtrack | null => this.shelf.find((r) => r.id === id) ?? null;
    const chosen = owned(file.chosen);
    if (chosen) return { record: chosen, side: 'A' };
    const last = owned(file.last);
    if (last && file.side === 'A' && file.finished) return { record: last, side: 'B' };
    const record = this.after(file.last);
    return record ? { record, side: 'A' } : null;
  }

  /** The pile of sleeves beside the deck (null without one): placed with it by the builder. */
  readonly sleeves: RecordSleeves | null;

  /** The sleeves' click: the next record picked out, round the shelf; null with none owned. */
  pickNext(): Soundtrack | null {
    const file = this.store.load();
    const record = this.after(file.chosen ?? this.tune.playing?.id ?? file.last);
    if (!record) return null;
    this.store.save({ ...file, chosen: record.id });
    return record;
  }

  /** The record picked out for next, if any. */
  get picked(): Soundtrack | null {
    const chosen = this.store.load().chosen;
    return this.shelf.find((r) => r.id === chosen) ?? null;
  }

  /** How much it adds to the flat's noise, for the neighbours: a record on, nothing off. */
  get noise(): number {
    return this.tune.playing ? RECORD_NOISE : 0;
  }

  get ownsRecords(): boolean {
    return this.shelf.length > 0;
  }

  setHovered(hovered: boolean): void {
    this.highlight.emissive.setHex(hovered ? 0x2a2a30 : 0x000000);
  }

  label(player: PlayerState): string | null {
    if (player.held) return null;
    const on = this.tune.playing;
    if (on) {
      const track = this.tune.trackNow;
      const names = this.tune.side === 'A' ? on.tracks : on.sideB;
      return `Turntable · ${on.title}${track !== null ? `, ${names[track]}` : `, side ${this.tune.side}`} · lift the needle`;
    }
    if (!poweredAt(this)) return 'Turntable · no power';
    const next = this.next;
    if (!next) return 'Turntable · no records yet';
    const { record, side } = next;
    return side === 'B' ? `Turntable · turn ${record.title} over: side B` : `Turntable · put on ${record.title} (${record.artist})`;
  }

  activate(session: SessionActions): void {
    if (session.held) return;
    if (this.tune.playing) {
      this.lift(false);
      return;
    }
    if (!poweredAt(this)) {
      session.refuse('The platter will not turn: the power is off in the whole building.');
      return;
    }
    const next = this.next;
    if (!next) {
      session.refuse('No records yet: the household stall at the flea market has a crate of soundtracks.');
      return;
    }
    const { record, side } = next;
    this.store.save({ last: record.id, side, finished: false, chosen: null });
    this.labelMaterial.map?.dispose();
    this.labelMaterial.map = paintLabel(record, side);
    this.labelMaterial.needsUpdate = true;
    this.tune.play(record, side);
    session.react(side === 'B' ? `Turned over: ${record.title}, side B.` : `${record.title}, ${record.artist}. Side A.`);
  }

  /** The needle up: by a click (`finished` false) or at the side's end (the next click turns it over). */
  private lift(finished: boolean): void {
    this.tune.stop();
    if (finished) this.store.save({ ...this.store.load(), finished: true });
  }

  update(dt: number): void {
    const playing = this.tune.playing;
    // The side played through: the arm comes back by itself. A power cut stops the platter where it is.
    if (playing && this.tune.elapsed > this.tune.sideSeconds) this.lift(true);
    else if (playing && !poweredAt(this)) this.lift(false);
    const on = this.tune.playing !== null;
    // The platter spins up and down; the arm follows the groove inwards across the side.
    const speed = on ? SPIN : 0;
    this.spin = damp(this.spin, speed, 3 / SPIN_UP, dt);
    this.disc.rotation.y -= this.spin * dt;
    const across = on ? Math.min(1, this.tune.elapsed / Math.max(1, this.tune.sideSeconds)) : 0;
    const target = on ? this.leadIn + (this.runOut - this.leadIn) * across : ARM_REST;
    this.armYaw = damp(this.armYaw, target, ARM_EASE, dt);
    this.arm.rotation.y = this.armYaw;
    // The stylus comes down onto the record once the arm is over it, and up before it swings back.
    const over = on && Math.abs(this.armYaw - target) < 0.08;
    this.drop = damp(this.drop, over ? 1 : 0, 5, dt);
    this.arm.position.y = this.armHeight - ARM_DROP * this.drop;
    this.sound.update(dt);
  }

  setZoneActive(active: boolean): void {
    this.sound.setZoneActive(active);
  }

  dispose(): void {
    this.sound.dispose();
    this.labelMaterial.map?.dispose();
  }
}

/** The centre label: the record's colour, its title round the top, the label's name under the hole (blank when none). */
function paintLabel(record: Soundtrack | null, side: 'A' | 'B' = 'A'): THREE.Texture {
  const S = 128;
  const [canvas, ctx] = createCanvas(S, S);
  const colour = record ? `#${record.sleeve.label.toString(16).padStart(6, '0')}` : '#d9a441';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, S, S);
  if (record) {
    const ink = `#${record.sleeve.ground.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(record.title.toUpperCase(), S / 2, S * 0.28, S * 0.8);
    ctx.font = '10px sans-serif';
    ctx.fillText(record.label, S / 2, S * 0.74, S * 0.8);
    ctx.fillText(`SIDE ${side} · 33⅓`, S / 2, S * 0.86, S * 0.8);
  }
  // The spindle hole.
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas, 'facing');
}

/**
 * The arm's yaw (about its pivot, 0 to the front, + towards +x) that puts its stylus, `length` from the pivot, `radius`
 * from the platter's centre, on the near side of the record (the arm swings in from its rest at the front).
 */
function armYawFor(pivot: THREE.Vector3, centre: THREE.Vector3, length: number, radius: number): number {
  const cx = centre.x - pivot.x;
  const cz = centre.z - pivot.z;
  const d = Math.hypot(cx, cz);
  const toCentre = Math.atan2(cx, cz);
  const cos = THREE.MathUtils.clamp((length * length + d * d - radius * radius) / (2 * length * d), -1, 1);
  const off = Math.acos(cos);
  // Of the two yaws, the one nearer the rest.
  const a = toCentre + off;
  const b = toCentre - off;
  return Math.abs(a - ARM_REST) < Math.abs(b - ARM_REST) ? a : b;
}

function readTurntable(data: unknown): TurntableFile | null {
  if (typeof data !== 'object' || data === null) return null;
  const { last, side, finished, chosen } = data as Partial<Record<keyof TurntableFile, unknown>>;
  const known = (id: unknown): string | null => (typeof id === 'string' && recordOf(id) ? id : null);
  return { last: known(last), side: side === 'B' ? 'B' : 'A', finished: finished === true, chosen: known(chosen) };
}

/**
 * The pile of sleeves on the sideboard beside the deck: a click pulls the next record out of the pile for the turntable
 * (`RecordPlayer.pickNext`), round the records owned; the deck puts that one on next. An invisible hitbox over the pile.
 */
class RecordSleeves extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly contactShadow = false;

  constructor(pile: { at: THREE.Vector3; size: number; height: number }, private readonly player: RecordPlayer) {
    super();
    this.name = 'RecordSleeves';
    const hitbox = invisibleHitbox(pile.size + 0.02, pile.height + 0.04, pile.size + 0.02, { x: pile.at.x, y: pile.at.y + (pile.height + 0.04) / 2, z: pile.at.z });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  setHovered(): void {}

  label(player: PlayerState): string | null {
    if (player.held) return null;
    if (!this.player.ownsRecords) return 'Record sleeves · empty, waiting for records';
    const picked = this.player.picked;
    return picked ? `Records · ${picked.title} is out, pick another` : 'Records · pick one out for the turntable';
  }

  activate(session: SessionActions): void {
    if (session.held) return;
    const record = this.player.pickNext();
    if (!record) {
      session.refuse('No records yet: the household stall at the flea market has a crate of soundtracks.');
      return;
    }
    playSleeveSlide();
    session.react(`${record.title} out of its sleeve: on next.`);
  }
}
