import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playWoodKnock } from '@/audio/furnitureSounds';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { paint, standard, timber } from '../materials/palette';
import { Prop } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';

/**
 * The wardrobe shoved against the old service stair's door: a tall oak press, its doors warped
 * shut. It does not budge. Origin on the floor under its middle, +z its front (the corridor).
 */
export class ServiceWardrobe extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private tries = 0;

  constructor(private readonly caption: string, private readonly line: string) {
    super();
    this.name = 'ServiceWardrobe';
    const oak = timber(0x4e3522, 0.6);
    this.add(boxMesh(1.0, 2.05, 0.5, oak, { y: 1.025 }));
    this.add(boxMesh(1.04, 0.08, 0.54, oak, { y: 2.09 }));
    // Its two doors' panels and the gap between them.
    for (const x of [-0.25, 0.25]) this.add(boxMesh(0.4, 1.6, 0.012, timber(0x5a3e28, 0.55), { x, y: 1.05, z: 0.256 }));
    this.add(boxMesh(0.006, 1.8, 0.01, paint(0x140c06, 0.9), { y: 1.05, z: 0.252 }));
    const hitbox = invisibleHitbox(1.04, 2.13, 0.54, { y: 1.065 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.52, 0, -0.27), new THREE.Vector3(0.52, 2.13, 0.27));
  }

  setHovered(): void {}

  label(): string {
    return `${this.caption} · push`;
  }

  activate(session: SessionActions): void {
    playWoodKnock(0.14, 0.7);
    session.react(this.tries++ === 0 ? this.line : 'Still not budging. Whatever is in it is staying.');
  }
}

/**
 * The steel ladder up to the roof hatch: two rails and their rungs fixed to the wall, the hatch's
 * painted trap in the ceiling over it, its bolt drawn. Climbing it (a click) goes out onto the roof
 * (`travel`). Origin on the floor at the wall, +z into the corridor; `height` floor to ceiling.
 */
export class HatchLadder extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;

  constructor(height: number, hatch: { width: number; depth: number }, private readonly onClimb: (session: SessionActions) => void) {
    super();
    this.name = 'HatchLadder';
    const steel = standard({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 });
    const rails = new THREE.Group();
    for (const x of [-0.2, 0.2]) rails.add(boxMesh(0.03, height, 0.04, steel, { x, y: height / 2, z: 0.12 }));
    for (let y = 0.3; y < height - 0.1; y += 0.28) rails.add(boxMesh(0.4, 0.022, 0.022, steel, { y, z: 0.12 }));
    // Brackets back to the wall.
    for (const y of [0.4, height - 0.4]) for (const x of [-0.2, 0.2]) rails.add(boxMesh(0.02, 0.02, 0.12, steel, { x, y, z: 0.06 }));
    this.add(rails);
    // The trap in the ceiling, a hand's depth out from the wall line, its frame and bolt.
    const trap = boxMesh(hatch.width, 0.03, hatch.depth, paint(0x6a6e64, 0.8), { y: height - 0.016, z: 0.12 + hatch.depth / 2 - 0.1 });
    trap.castShadow = false;
    this.add(trap);
    const bolt = boxMesh(0.12, 0.02, 0.03, standard({ color: 0x8a8a84, metalness: 1, roughness: 0.4 }), { y: height - 0.04, z: 0.12 + hatch.depth - 0.16 });
    this.add(bolt);
    this.glint = HoverGlint.fittings(rails);
    const hitbox = invisibleHitbox(0.5, height, 0.3, { y: height / 2, z: 0.12 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.23, 0, 0), new THREE.Vector3(0.23, 2.4, 0.15));
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'The roof hatch · climb up';
  }

  activate(session: SessionActions): void {
    this.onClimb(session);
  }
}
