import * as THREE from 'three';
import { proximityVolume } from '@/video/proximityVolume';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import type { Pose } from '../people/poses';
import { playChore, type ChoreSound } from './shopSounds';

/** Something the clerk goes and does when the shop is quiet: where to go (by `path`, zone-local), how to stand there. */
export interface ShopChore {
  /** Floor points from behind the counter to the chore's spot (the last one); the way back is the same reversed. */
  path: readonly [x: number, z: number][];
  /** The way to face there (0 = +z). */
  yaw: number;
  /** Arms while at it. Default `play` (both hands forward: a can, a tin, a knuckle). */
  pose?: Pose;
  /** Seconds at it. Default 5. */
  seconds?: number;
  sound?: ChoreSound;
  /** A word to themself, in a bubble. */
  mutter?: string;
}

interface ShopClerkOptions {
  viewer: THREE.Object3D;
  seed: number;
  /** What they say when clicked, in turn. */
  lines: readonly string[];
  /** Short cries now and then with the player in front of the counter. */
  callOuts?: readonly string[];
  /** What they say after a sale, one picked at random. */
  thanks: readonly string[];
  /** Behind the counter (zone-local) and the way they face there. */
  home: { at: THREE.Vector3; yaw: number };
  chores: readonly ShopChore[];
  label: string;
}

/** Seconds between two chores, drawn in this range; never while the player is at the counter. */
const CHORE_EVERY: [number, number] = [25, 55];
/** A player this close to the counter keeps the clerk behind it. */
const SERVING_RANGE = 2.6;
/** A player this near, in front of the counter, is called out to now and then. */
const CALL_RANGE = 4.5;
const CALL_OUT_EVERY: [number, number] = [18, 40];
const STANCES: Pose[] = ['stand', 'crossed', 'hips', 'pockets', 'crossed'];

type State = { kind: 'counter'; stance: number; chore: number } | { kind: 'going' } | { kind: 'at'; chore: ShopChore; left: number } | { kind: 'back' };

/**
 * The shopkeeper of a walk-in shop: a `Walker` who stands behind the counter (shifting their weight, arms folded or on
 * the hips, eyes on the player coming up), calls out to a customer in front of it now and then, and when the shop is
 * quiet goes and does something (`chores`: sprinkle the florist's buckets, feed the fish, give a set on the TV wall a
 * knock), then comes back. Clicked, a line; after a sale, a thanks (`thank`). Zone-local like any walker; never collides.
 */
export class ShopClerk extends Walker {
  private duty: State;
  private readonly home: ShopClerkOptions['home'];
  private readonly chores: readonly ShopChore[];
  private readonly thanks: readonly string[];
  private readonly callOuts: readonly string[];
  private readonly listener: THREE.Object3D;
  private callOutTimer: number;
  private nextChore = 0;
  private readonly ear = new THREE.Vector3();
  private readonly mine = new THREE.Vector3();

  constructor(options: ShopClerkOptions) {
    super({ viewer: options.viewer, seed: options.seed, look: randomLook(options.seed, 'vendor'), speed: 0.7, lines: options.lines, label: options.label, speaker: 'Shopkeeper' });
    this.name = 'ShopClerk';
    this.home = options.home;
    this.chores = options.chores;
    this.thanks = options.thanks;
    this.callOuts = options.callOuts ?? [];
    this.listener = options.viewer;
    this.callOutTimer = CALL_OUT_EVERY[0] * (0.4 + (options.seed % 5) * 0.15);
    this.nextChore = options.seed % Math.max(1, this.chores.length);
    this.duty = { kind: 'counter', stance: 6, chore: between(CHORE_EVERY) };
    this.stand(this.home.yaw, STANCES[options.seed % STANCES.length]!);
  }

  /** The coins changed hands: a word of thanks (wherever they are), and a nod. */
  thank(): void {
    const line = this.thanks[Math.floor(Math.random() * this.thanks.length)];
    if (line) this.speak(line);
  }

  override update(dt: number): void {
    this.routine(dt);
    super.update(dt);
  }

  private routine(dt: number): void {
    const s = this.duty;
    switch (s.kind) {
      case 'counter': {
        const player = this.playerFromHome();
        if (player < CALL_RANGE && this.callOuts.length && (this.callOutTimer -= dt) <= 0) {
          this.callOutTimer = between(CALL_OUT_EVERY);
          this.say(this.callOuts[Math.floor(Math.random() * this.callOuts.length)]!);
        }
        if ((s.stance -= dt) <= 0) {
          s.stance = 10 + Math.random() * 20;
          this.setPose(STANCES[Math.floor(Math.random() * STANCES.length)]!);
        }
        s.chore -= dt;
        if (s.chore > 0 || !this.chores.length || player < SERVING_RANGE) return;
        const chore = this.chores[this.nextChore++ % this.chores.length]!;
        this.duty = { kind: 'going' };
        this.walk(chore.path.map(([x, z]) => new THREE.Vector3(x, 0, z)), () => {
          this.stand(chore.yaw, chore.pose ?? 'play');
          if (chore.mutter) this.say(chore.mutter, 2);
          if (chore.sound) playChore(chore.sound, this.heard());
          this.duty = { kind: 'at', chore, left: chore.seconds ?? 5 };
        });
        return;
      }
      case 'at': {
        s.left -= dt;
        // The watering and the feeding go on a while: a second sprinkle halfway.
        if (s.chore.sound === 'water' && s.left + dt > 2 && s.left <= 2) playChore('water', this.heard());
        if (s.left > 0) return;
        const back = [...s.chore.path].reverse().slice(1).map(([x, z]) => new THREE.Vector3(x, 0, z));
        this.duty = { kind: 'back' };
        this.walk([...back, this.home.at.clone()], () => {
          this.stand(this.home.yaw, 'stand');
          this.duty = { kind: 'counter', stance: 4 + Math.random() * 6, chore: between(CHORE_EVERY) };
        });
        return;
      }
      default:
        return;
    }
  }

  /** How far the player is from the clerk's place behind the counter (m, across the floor). */
  private playerFromHome(): number {
    this.listener.getWorldPosition(this.ear);
    this.parent?.localToWorld(this.mine.copy(this.home.at));
    return Math.hypot(this.ear.x - this.mine.x, this.ear.z - this.mine.z);
  }

  /** How loud a chore is where the player stands (0..1). */
  private heard(): number {
    this.listener.getWorldPosition(this.ear);
    this.getWorldPosition(this.mine);
    return proximityVolume(this.ear.distanceTo(this.mine), { referenceDistance: 1, rolloff: 1.2, maxDistance: 9 }) / 100;
  }
}

function between([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}
