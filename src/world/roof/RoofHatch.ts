import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { Prop } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';

/**
 * The hatch onto the roof, from up here: a zinc-clad upstand, its trap propped open, the steel
 * ladder's top showing in the dark below. Climbing down (a click) is back in the attic at the foot
 * of the ladder (`onDown`). Origin on the zinc at its middle; `size` its side.
 */
export class RoofHatch extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;

  constructor(private readonly size: number, private readonly onDown: (session: SessionActions) => void) {
    super();
    this.name = 'RoofHatch';
    const zinc = standard({ color: 0x9a9fa4, roughness: 0.5, metalness: 0.4 });
    const h = 0.3;
    const t = 0.06;
    for (const [w, d, x, z] of [[size, t, 0, -size / 2 + t / 2], [size, t, 0, size / 2 - t / 2], [t, size, -size / 2 + t / 2, 0], [t, size, size / 2 - t / 2, 0]] as const) {
      this.add(boxMesh(w, h, d, zinc, { x, y: h / 2, z }));
    }
    // The dark below.
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(size - 2 * t, size - 2 * t), new THREE.MeshBasicMaterial({ color: 0x0c0a08 }));
    dark.rotation.x = -Math.PI / 2;
    dark.position.y = 0.02;
    this.add(dark);
    // The trap, propped open against its stay.
    const trap = boxMesh(size, 0.04, size, paint(0x6a6e64, 0.8), { y: size / 2, z: 0.02 });
    trap.position.set(0, h + size / 2 - 0.02, -size / 2 - 0.02);
    trap.rotation.x = -Math.PI / 2 + 0.25;
    this.add(trap);
    // The ladder's hoops, just showing.
    const steel = standard({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 });
    for (const x of [-0.2, 0.2]) this.add(boxMesh(0.03, 0.9, 0.04, steel, { x, y: h + 0.15, z: size / 2 - 0.12 }));
    this.glint = HoverGlint.fittings(this);
    const hitbox = invisibleHitbox(size, h + 0.6, size, { y: (h + 0.6) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  override get footprint(): THREE.Box3 {
    const s = this.size / 2;
    return new THREE.Box3(new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0.3, s));
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'The hatch · climb down to the attic';
  }

  activate(session: SessionActions): void {
    this.onDown(session);
  }
}
