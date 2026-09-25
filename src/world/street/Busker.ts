import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { BuskerTune } from '@/audio/BuskerTune';
import { playCoins } from '@/audio/coins';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { Walker } from '../people/Walker';
import { KEYS as SAVE_KEYS } from '@/persistence';
import { DailyTally } from './DailyTally';

export interface BuskerOptions {
  /** The ears (the camera): the tune's level and side follow it. */
  viewer: THREE.Object3D;
  /** Game hours they play between. */
  hours: readonly [number, number];
  /** Tips they take a day. */
  tipsPerDay: number;
  /** How far the tune carries (metres). */
  reach: number;
  seed?: number;
}

const LINES = [
  'This one is from a game you never finished.',
  'Requests? I only know the overworld themes.',
  'The kiosk says the market had a good week.',
  'I learnt this on a cartridge with a dead save battery.',
];
/** Tips given today, saved so the daily limit holds across reloads. */
const tips = new DailyTally(SAVE_KEYS.busker, 'tips');
const THANKS = ['Cheers! This one is for you.', 'Thank you kindly!', 'You are a legend.'];
/** Where the keyboard's keys are, in the busker's frame (the stand faces them, +z is towards the passers-by). */
const KEYS = { y: 0.93, z: 0.42, spread: 0.17 };

/**
 * A street musician by the bus shelter: a person (`people/Walker`, standing, hands on a little
 * keyboard on a stand, the case open on the pavement for coins) playing a synthesised chiptune
 * (`BuskerTune`) that carries a street's width, louder and to one side as the player comes
 * near. They play by day and into the evening, not in the rain or snow (then they have packed up
 * and gone). Clicking tips a coin (`SessionActions.pay`): a thank-you in a bubble and a flourish,
 * a few tips a day at most (remembered across reloads), then a nod.
 */
export class Busker extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly person: Walker;
  private readonly tune: BuskerTune;
  private readonly kit = new THREE.Group();
  private present = true;
  private beat = 0;
  private lineIndex = 0;
  private readonly hands: readonly [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly ear = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly toMe = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: BuskerOptions) {
    super();
    this.name = 'Busker';
    this.person = new Walker({ viewer: options.viewer, seed: options.seed ?? 77, label: 'Click to tip the busker' });
    this.add(this.person);
    this.person.stand(0, 'play', null, () => this.handPoints(), 0.12);
    this.hitboxes = this.person.hitboxes;
    this.tune = new BuskerTune(options.seed ?? 77);
    this.buildKit();
    this.add(this.kit);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.3), new THREE.Vector3(0.35, 1.8, 0.65));
  }

  dispose(): void {
    this.tune.dispose();
  }

  setHovered(): void {
    // A person does not glow.
  }

  label(): string | null {
    if (!this.present) return null;
    return this.tipsToday() >= this.options.tipsPerDay ? 'The busker nods at you' : 'Click to tip the busker a coin';
  }

  activate(session: SessionActions): void {
    if (!this.present) return;
    if (this.tipsToday() >= this.options.tipsPerDay) {
      session.hint(`“${LINES[this.lineIndex++ % LINES.length]}”`);
      return;
    }
    session.pay({
      price: 1,
      paid: () => {
        this.recordTip();
        playCoins();
        this.tune.flourish();
        const thanks = THANKS[Math.floor(Math.random() * THANKS.length)]!;
        this.person.say(thanks, 2.5);
        this.person.setPose('cheer');
        window.setTimeout(() => this.person.setPose('play'), 1400);
        return `You drop a coin in the keyboard case. “${thanks}”`;
      },
    });
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const [from, to] = this.options.hours;
    const present = s.hours >= from && s.hours < to && s.rain < 0.08 && s.snow < 0.15;
    if (present !== this.present) {
      this.present = present;
      this.visible = present;
      this.person.setPresent(present);
      if (present) this.person.stand(0, 'play', null, () => this.handPoints(), 0.12);
    }
    let level = 0;
    if (present) {
      this.beat += dt;
      this.person.update(dt);
      // The tune: fainter with distance, to the side it is on.
      this.options.viewer.getWorldPosition(this.ear);
      this.getWorldPosition(this.here);
      const distance = this.ear.distanceTo(this.here);
      level = Math.max(0, 1 - distance / this.options.reach) ** 2;
      this.options.viewer.getWorldDirection(this.facing);
      this.toMe.copy(this.here).sub(this.ear).setY(0).normalize();
      // Right of the view is facing x up.
      const rightX = -this.facing.z;
      const rightZ = this.facing.x;
      const len = Math.hypot(rightX, rightZ) || 1;
      this.tune.setPan(((this.toMe.x * rightX + this.toMe.z * rightZ) / len) * 0.8);
    }
    this.tune.setLevel(level);
    this.tune.update();
  }

  /** The hands on the keys, hopping along with the beat (world points, read by the person every frame). */
  private handPoints(): readonly [THREE.Vector3, THREE.Vector3] {
    this.localToWorld(this.hands[0].set(-KEYS.spread + Math.sin(this.beat * 2.1) * 0.04, KEYS.y + this.hop(0), KEYS.z));
    this.localToWorld(this.hands[1].set(KEYS.spread + Math.sin(this.beat * 3.3) * 0.05, KEYS.y + this.hop(1.7), KEYS.z));
    return this.hands;
  }

  private hop(phase: number): number {
    return Math.max(0, Math.sin(this.beat * 8.4 + phase)) * 0.03;
  }

  private buildKit(): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.4, metalness: 0.6 });
    // The X-stand and the keyboard on it.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.05, 0.025), metal);
      leg.position.set(side * 0.3, 0.45, KEYS.z + 0.05);
      leg.rotation.x = 0.5;
      const leg2 = leg.clone();
      leg2.rotation.x = -0.5;
      this.kit.add(leg, leg2);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.28), new THREE.MeshStandardMaterial({ color: 0xd8342a, roughness: 0.35 }));
    body.position.set(0, KEYS.y - 0.05, KEYS.z + 0.04);
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.5 }));
    keys.position.set(0, KEYS.y - 0.018, KEYS.z - 0.02);
    // The open case on the pavement, a few coins in it, and the sign.
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.32), new THREE.MeshStandardMaterial({ color: 0x5a1a2a, roughness: 0.9 }));
    caseMesh.position.set(0.1, 0.04, 1.0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.9 }));
    sign.position.set(0.1, 0.18, 1.14);
    sign.rotation.x = -0.9;
    for (const mesh of [body, keys, caseMesh, sign]) this.kit.add(mesh);
    this.kit.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
  }

  private tipsToday(): number {
    return tips.today();
  }

  private recordTip(): void {
    tips.add();
  }
}

function keysTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 48);
  ctx.fillStyle = '#f4f2ea';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#888';
  for (let i = 0; i <= 21; i++) ctx.fillRect(i * (256 / 21), 0, 1, 48);
  ctx.fillStyle = '#16161a';
  const black = [0, 1, 3, 4, 5];
  for (let octave = 0; octave < 3; octave++) {
    for (const b of black) ctx.fillRect((octave * 7 + b + 0.65) * (256 / 21), 0, 7, 28);
  }
  return toTexture(canvas, 2);
}

function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(160, 104);
  ctx.fillStyle = '#e9dfc8';
  ctx.fillRect(0, 0, 160, 104);
  ctx.fillStyle = '#2a2420';
  ctx.font = 'bold 30px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TIPS ♪', 80, 46);
  ctx.font = '18px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('8-bit covers', 80, 80);
  return toTexture(canvas, 2);
}
