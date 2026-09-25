import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

export interface FeatherWandOptions {
  prizes: OwnedPrizes;
  /** Waves it at the cat: calls it over, and says how that went (the cat comes, ignores it, sleeps on). */
  callCat?: () => string;
  /** The prize that brings it home. Default 'catToy'. */
  prizeId?: string;
}

const STICK = 0.42;
const WAVE_SECONDS = 2.2;

/**
 * The feather wand won at the prize counter, lying on the collection room's floor by the
 * armchairs: a stick, a string and a tuft of feathers. Clicked, it springs up and swishes about
 * for a moment, and the cat is called over (`callCat`) with a word on how that went. Hidden (and
 * unclickable) until the prize is owned. Origin on the floor under its middle; never collides.
 */
export class FeatherWand extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly wand = new THREE.Group();
  private readonly tuft = new THREE.Group();
  private readonly unsubscribe: () => void;
  private readonly callCat: (() => string) | undefined;
  private owned = false;
  private waving = 0;
  private clock = 0;

  constructor(options: FeatherWandOptions) {
    super();
    this.name = 'FeatherWand';
    this.callCat = options.callCat;
    const stick = cylinderMesh(0.005, STICK, matte(0xc8a060, 0.5), { y: STICK / 2 }, { segments: 8 });
    this.wand.add(stick);
    // The string and the feathers at the end of it.
    const string = cylinderMesh(0.0012, 0.18, matte(0xeeeeee, 0.6), { y: -0.09 }, { segments: 4 });
    this.tuft.add(string);
    const colours = [0x33e0ff, 0xff2fa0, 0xffd23a, 0x33e0ff, 0xff2fa0];
    colours.forEach((c, i) => {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 6), matte(c, 0.6));
      feather.position.set(Math.cos(i * 1.3) * 0.012, -0.2, Math.sin(i * 1.3) * 0.012);
      feather.rotation.set(Math.PI + Math.cos(i) * 0.4, 0, Math.sin(i * 2) * 0.4);
      this.tuft.add(feather);
    });
    this.tuft.position.y = STICK;
    this.wand.add(this.tuft);
    this.wand.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.add(this.wand);
    this.rest();
    const hitbox = invisibleHitbox(0.6, 0.12, 0.25, { y: 0.06 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.unsubscribe = showWhenOwned(options.prizes, options.prizeId ?? 'catToy', this.wand, hitbox, (owned) => (this.owned = owned));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {}

  label(): string | null {
    return this.owned ? 'Feather wand — click to wave it for the cat' : null;
  }

  activate(session: SessionActions): void {
    if (!this.owned) return;
    this.waving = WAVE_SECONDS;
    session.hint(this.callCat?.() ?? 'Swish, swish. Nobody comes.');
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.waving <= 0) return;
    this.waving = Math.max(0, this.waving - dt);
    if (this.waving === 0) {
      this.rest();
      return;
    }
    // Stood up, swishing from side to side, the feathers whipping about on their string.
    const t = this.clock;
    this.wand.position.set(0, 0.35, 0);
    this.wand.rotation.set(0.3 + Math.sin(t * 5) * 0.2, 0, Math.sin(t * 7) * 0.9);
    this.tuft.rotation.set(Math.sin(t * 11) * 0.8, 0, Math.cos(t * 9) * 0.8);
  }

  dispose(): void {
    this.unsubscribe();
  }

  /** Lying on the floor. */
  private rest(): void {
    this.wand.position.set(-STICK / 2, 0.006, 0);
    this.wand.rotation.set(0, 0, -Math.PI / 2 + 0.02);
    this.tuft.rotation.set(0, 0, Math.PI / 2 - 0.1);
  }
}
