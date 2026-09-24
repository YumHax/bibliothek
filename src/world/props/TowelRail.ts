import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { CHROME } from './bathroomMaterials';
import { fabric } from '@/world/materials/finishes';

export interface TowelRailOptions {
  /** Length of the rail. Default 0.36. */
  width?: number;
  /** Colours of the towels folded over it, left to right; as many towels as colours. Default sage and terracotta. */
  colors?: number[];
  /** How far the towels hang below the rail. Default 0.55. */
  drop?: number;
}

/** How far the rail stands off the wall. */
const REACH = 0.09;
const TOWEL_THICKNESS = 0.025;

/**
 * A chrome towel rail on two brackets with towels folded over it, hanging down both sides.
 * Wall-hung: origin on the wall at the rail's height, +z into the room. Decoration only (the
 * towels give way), so it never collides.
 */
export class TowelRail extends Prop {
  constructor(options: TowelRailOptions = {}) {
    super();
    this.name = 'TowelRail';
    const width = options.width ?? 0.36;
    const colors = options.colors ?? [0x9fb4a4, 0xc98a6b];
    const drop = options.drop ?? 0.55;

    for (const dx of [-width / 2 + 0.02, width / 2 - 0.02]) {
      const rose = cylinderMesh(0.02, 0.008, CHROME, { x: dx, z: 0.004 }, { segments: 14 });
      rose.rotation.x = Math.PI / 2;
      const bracket = cylinderMesh(0.009, REACH, CHROME, { x: dx, z: REACH / 2 }, { segments: 10 });
      bracket.rotation.x = Math.PI / 2;
      this.add(rose, bracket);
    }
    const rail = cylinderMesh(0.01, width, CHROME, { z: REACH }, { segments: 12 });
    rail.rotation.z = Math.PI / 2;
    this.add(rail);

    // Each towel: a fold over the rail, the long face in front, the short one behind, a hem band.
    const slot = (width - 0.04) / colors.length;
    colors.forEach((colour, i) => {
      const x = -width / 2 + 0.02 + slot * (i + 0.5);
      const w = slot - 0.03;
      const cloth = fabric({ color: colour, roughness: 0.95 });
      const fold = cylinderMesh(0.024, w, cloth, { x, y: 0.004, z: REACH }, { segments: 12 });
      fold.rotation.z = Math.PI / 2;
      this.add(fold);
      part(this, w, drop, TOWEL_THICKNESS, cloth, { x, y: -drop / 2, z: REACH + 0.016 });
      part(this, w, drop * 0.85, TOWEL_THICKNESS * 0.8, cloth, { x, y: -(drop * 0.85) / 2, z: REACH - 0.02 });
      const hem = part(this, w + 0.002, 0.03, TOWEL_THICKNESS + 0.004, matte(colour, 0.7), { x, y: -drop + 0.06, z: REACH + 0.016 });
      hem.castShadow = false;
    });
  }
}
