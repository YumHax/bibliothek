import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import { Prop } from '../props/Prop';
import { playShopBell } from '../travel/travelSounds';

/** Where another customer walks in and out of a shop, and what they stop to look at (zone-local). */
export interface ShopBrowsing {
  /** Just inside the exit door. */
  door: [x: number, z: number];
  /** An open spot on the floor every leg goes through, so nobody cuts through a table. */
  hub: [x: number, z: number];
  /** A point between the door and the hub, where the straight line from one to the other would brush a table. */
  entry?: [x: number, z: number];
  /** Places to stand and look, and the way to face there (0 = +z). */
  spots: readonly { at: [x: number, z: number]; yaw: number }[];
}

interface ShopCustomerOptions {
  viewer: THREE.Object3D;
  seed: number;
  browsing: ShopBrowsing;
  lines: readonly string[];
}

/** Seconds out of the shop between two visits, drawn in this range. */
const OUT_S: [number, number] = [45, 120];
/** Seconds at each spot. */
const BROWSE_S: [number, number] = [5, 11];
const FADE_S = 0.7;
/** The player looking this close to the door (cosine) keeps anyone from popping in or out under their nose. */
const DOOR_UNSEEN_COS = 0.5;
/** Nobody comes in while the player stands this near the door spot (m): just arrived, or on the way out. */
const DOOR_CLEAR = 1.2;

type State = { kind: 'out'; left: number } | { kind: 'walking' } | { kind: 'browsing'; left: number; seen: number } | { kind: 'leaving' };

/**
 * Another customer in a walk-in shop, now and then: comes in by the door (the bell over it, a fade while the player
 * is not looking that way), walks to two or three of the shop's spots in turn by its `hub` and stands at each a
 * while, hands at the chin or in the pockets, then goes back out the way they came and fades at the door. Chats
 * when clicked. An empty prop that directs its `walker` (placed by the builder).
 */
export class ShopCustomer extends Prop implements Updatable {
  readonly contactShadow = false;
  readonly walker: Walker;
  private state: State;
  private fade = 0;
  private fadeTo = 0;
  private primed = false;
  private readonly browsing: ShopBrowsing;
  private readonly viewer: THREE.Object3D;
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly door = new THREE.Vector3();

  constructor(options: ShopCustomerOptions) {
    super();
    this.name = 'ShopCustomer';
    this.browsing = options.browsing;
    this.viewer = options.viewer;
    this.walker = new Walker({ viewer: options.viewer, seed: options.seed, look: randomLook(options.seed + 300, 'shopper'), speed: 0.7, lines: options.lines, label: 'A customer · chat', fade: true });
    const [x, z] = options.browsing.door;
    this.walker.position.set(x, 0, z);
    // Out of the shop at first, back in a while (sooner the first time).
    this.state = { kind: 'out', left: 8 + (options.seed % 7) * 3 };
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    // Standing at the door until the first frame, so the start-up compile sees their materials.
    if (!this.primed) {
      this.primed = true;
      this.walker.setPresent(false);
    }
    if (this.fade !== this.fadeTo) {
      const step = dt / FADE_S;
      this.fade = this.fadeTo > this.fade ? Math.min(this.fadeTo, this.fade + step) : Math.max(this.fadeTo, this.fade - step);
      this.walker.setFade(this.fade);
      if (this.fade === 0 && this.fadeTo === 0) {
        this.walker.setPresent(false);
        this.state = { kind: 'out', left: between(OUT_S) };
      }
    }
    const s = this.state;
    switch (s.kind) {
      case 'out':
        s.left -= dt;
        if (s.left > 0 || this.doorInView() || this.playerAtDoor()) return;
        this.comeIn();
        return;
      case 'browsing':
        s.left -= dt;
        if (s.left > 0) return;
        if (s.seen >= 2 + (Math.random() < 0.4 ? 1 : 0)) this.goOut();
        else this.goTo(s.seen);
        return;
      default:
        return;
    }
  }

  private comeIn(): void {
    const [x, z] = this.browsing.door;
    this.walker.setPresent(true, new THREE.Vector3(x, 0, z));
    this.walker.rotation.y = Math.PI;
    this.walker.setFade(0);
    this.fade = 0;
    this.fadeTo = 1;
    playShopBell(0.03);
    this.goTo(0);
  }

  /** On to a spot (not the one just seen), by the hub; `seen` spots already looked at this visit. */
  private goTo(seen: number): void {
    const { spots, hub } = this.browsing;
    if (!spots.length) {
      this.goOut();
      return;
    }
    const spot = spots[Math.floor(Math.random() * spots.length)]!;
    this.state = { kind: 'walking' };
    const { entry } = this.browsing;
    // In from the door: by the entry point first, if the shop has one.
    const legs = seen === 0 && entry ? [v(entry), v(hub), v(spot.at)] : [v(hub), v(spot.at)];
    this.walker.walk(legs, () => {
      this.walker.stand(spot.yaw, Math.random() < 0.6 ? 'think' : 'pockets');
      this.state = { kind: 'browsing', left: between(BROWSE_S), seen: seen + 1 };
    });
  }

  private goOut(): void {
    const { hub, door, entry } = this.browsing;
    this.state = { kind: 'leaving' };
    this.walker.walk(entry ? [v(hub), v(entry), v(door)] : [v(hub), v(door)], () => {
      this.fadeTo = 0;
      playShopBell(0.02);
    });
  }

  /** Whether the player stands by the door spot (they would walk into each other). */
  private playerAtDoor(): boolean {
    const [x, z] = this.browsing.door;
    this.parent?.localToWorld(this.door.set(x, 0, z));
    this.viewer.getWorldPosition(this.eye);
    return Math.hypot(this.eye.x - this.door.x, this.eye.z - this.door.z) < DOOR_CLEAR;
  }

  /** Whether the player is looking towards the door. */
  private doorInView(): boolean {
    const [x, z] = this.browsing.door;
    this.parent?.localToWorld(this.door.set(x, 1.2, z));
    this.viewer.getWorldPosition(this.eye);
    this.viewer.getWorldDirection(this.look);
    const to = this.door.sub(this.eye).setY(0).normalize();
    this.look.setY(0).normalize();
    return this.look.dot(to) > DOOR_UNSEEN_COS;
  }
}

function v([x, z]: [number, number]): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}

function between([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}
