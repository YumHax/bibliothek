import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import { METAL } from '../../materials/palette';
import { boxMesh, invisibleHitbox } from '../../meshUtils';
import { HoverGlint } from '../../props/hoverGlint';

/** The plate on the plinth's face: width, height, thickness (m); its middle this high over the lawn. */
const PLATE = { width: 0.42, height: 0.24, depth: 0.012, y: 0.32 };
/** What it says, and what one notices on a second and a third look. */
const READINGS = [
  'BANDSTAND. Raised by public subscription, 1903. Brass on Sundays, May to September.',
  'Under it, smaller: Restored 1987 by the Friends of the Park. The boards are roped off again now.',
  'Someone has scratched a tiny pair of headphones into the corner, a long time ago.',
];

/**
 * The bronze plate on the bandstand's plinth (`STREET_PLACES.park.bandstand.plaque`), facing the lane that leads to
 * it: read with a click, a little more each look. Origin on the plinth's face, local +z out of it.
 */
export class BandstandPlaque extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;
  private looked = 0;

  constructor() {
    super();
    this.name = 'BandstandPlaque';
    const plate = boxMesh(PLATE.width, PLATE.height, PLATE.depth, METAL.agedBrass(), { y: PLATE.y, z: PLATE.depth / 2 });
    this.add(plate);
    this.glint = HoverGlint.of(plate);
    const hitbox = invisibleHitbox(PLATE.width + 0.2, PLATE.height + 0.2, 0.2, { y: PLATE.y, z: 0.1 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'Bandstand plaque · read';
  }

  activate(session: SessionActions): void {
    session.react(READINGS[Math.min(this.looked, READINGS.length - 1)]!);
    this.looked++;
  }
}
