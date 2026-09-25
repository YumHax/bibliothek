import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part } from './Prop';

export interface HouseKeysOptions {
  /** Called on every change: true once the keys are in the player's pocket. */
  onChange?: (inPocket: boolean) => void;
}

const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, metalness: 0.8, roughness: 0.28 });
const LEATHER = 0x7a3b22;
const HOVER_GLOW = 0.35;

/**
 * The flat's keys, lying in the hall console's bowl: a split ring, a brass door key, a steel
 * mailbox key and a leather fob. Clicking takes them (the front door only lets the player out with
 * them in the pocket); clicking the bowl again puts them back. The hitbox stays over the bowl
 * either way. Origin at the bottom of the bowl, the keys flat on it. Decoration: never collides.
 */
export class HouseKeys extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly contactShadow = false;
  private readonly bunch = new THREE.Group();
  private readonly fob: THREE.MeshStandardMaterial;
  private pocketed = false;

  constructor(private readonly options: HouseKeysOptions = {}) {
    super();
    this.name = 'HouseKeys';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0016, 6, 20), STEEL);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    this.bunch.add(ring);
    // Two keys fanned out from the ring: a head, a blade, a few bits cut along it.
    // `lift` stacks the second key on the first: their bows overlap by the ring and would z-fight level.
    const key = (angle: number, length: number, metal: THREE.Material, lift: number): void => {
      const k = new THREE.Group();
      k.rotation.y = angle;
      k.position.y = lift;
      part(k, 0.022, 0.003, 0.02, metal, { x: 0.022, y: 0.002 });
      part(k, length, 0.002, 0.007, metal, { x: 0.033 + length / 2, y: 0.002 });
      for (let i = 0; i < 3; i++) part(k, 0.004, 0.002, 0.004, metal, { x: 0.038 + length * (0.3 + i * 0.22), y: 0.002, z: 0.005 });
      this.bunch.add(k);
    };
    key(0.3, 0.04, BRASS, 0);
    key(-0.9, 0.028, STEEL, 0.001);
    // The fob, a leather tab on the other side of the ring.
    this.fob = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.7, emissive: 0xc9a75b, emissiveIntensity: 0 });
    part(this.bunch, 0.05, 0.004, 0.018, this.fob, { x: -0.035, y: 0.002 }).rotation.y = -0.4;
    this.bunch.traverse((o) => (o.castShadow = false));
    this.add(this.bunch);

    const hitbox = invisibleHitbox(0.2, 0.08, 0.2, { y: 0.01 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** Whether the player has the keys on them. */
  get inPocket(): boolean {
    return this.pocketed;
  }

  /** Takes the keys (true) or drops them back in the bowl (false). */
  setInPocket(inPocket: boolean): void {
    this.pocketed = inPocket;
    this.bunch.visible = !inPocket;
    this.options.onChange?.(inPocket);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.fob.emissiveIntensity = hovered ? HOVER_GLOW : 0;
  }

  label(): string {
    return this.pocketed ? 'Click to leave your keys in the bowl' : 'Click to take your keys';
  }

  activate(session: SessionActions): void {
    this.setInPocket(!this.pocketed);
    session.hint(this.pocketed ? 'Keys in pocket' : 'Keys left in the bowl');
  }
}
