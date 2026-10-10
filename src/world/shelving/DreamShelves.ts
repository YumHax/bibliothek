import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxDimensions } from '@/catalog/types';
import { seededRng } from '@/random';
import type { Shelf } from '../Shelf';

/** An atlas rectangle in UV space: left, bottom, right, top. */
export type AtlasRect = readonly [u0: number, v0: number, u1: number, v1: number];

/** The fronts the dream's boxes wear: one texture holding many covers, and a plain patch for their sides. */
export interface DreamFronts {
  readonly texture: THREE.Texture;
  /** The covers in the atlas, each with the box it is the front of. */
  readonly fronts: readonly { readonly rect: AtlasRect; readonly dims: BoxDimensions }[];
  /** The patch the spines, tops and backs are mapped to. */
  readonly side: AtlasRect;
}

/** One row of dream boxes: its own mesh and material, so the rows fade one at a time. */
interface DreamRow {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** The bookcase it stands in. */
  readonly shelf: Shelf;
  /** The row's centre in world space (the sale empties the rows in an order of the caller's). */
  readonly centre: THREE.Vector3;
}

/** A hair between the dream's boxes, a little looser than a real row: the eye reads them as a shelf of games. */
const GAP = 0.004;
/** A box clears the row above by this much at least (m). */
const HEAD_ROOM = 0.012;
/** How untidily they stand: a turn (radians) and a push back (m), like `Shelf.placeRow`'s. */
const YAW = THREE.MathUtils.degToRad(1.6);
const PUSH = 0.012;
/** BoxGeometry's faces, in order: +x, -x, +y, -y, +z (the front), -z. Four vertices each. */
const FRONT_FACE = 4;

/**
 * THE DREAM'S SHELVES (the opening, `src/intro`): every row of `shelves` filled from where its real boxes end to its
 * right edge with boxes that are not games, wearing covers from `fronts`. One merged mesh per row, its own material
 * (a fade), parented to its bookcase so it stands wherever the bookcase does. Not clickable, no collider, no shadow:
 * scenery for a minute of film, gone with `dispose`.
 */
export class DreamShelves {
  readonly rows: DreamRow[] = [];

  constructor(shelves: readonly Shelf[], fronts: DreamFronts, seed = 'dream') {
    const random = seededRng(seed);
    let next = Math.floor(random() * fronts.fronts.length);
    shelves.forEach((shelf) => {
      shelf.updateWorldMatrix(true, false);
      for (let r = 0; r < shelf.rowCount; r++) {
        const room = shelf.rowRoom(r);
        const parts: THREE.BufferGeometry[] = [];
        let x = room.from;
        // Boxes that fit the row's clearance, drawn in turn; a run of one platform now and then, like a sorted shelf.
        const fitting = fronts.fronts.filter((f) => f.dims.height + HEAD_ROOM <= room.height);
        if (fitting.length === 0) continue;
        for (;;) {
          if (random() < 0.12) next = Math.floor(random() * fitting.length);
          const front = fitting[next % fitting.length]!;
          next++;
          const { width, height, depth } = front.dims;
          if (x + width > room.to) break;
          parts.push(boxPart(front.rect, fronts.side, front.dims, new THREE.Vector3(x + width / 2, room.floor + height / 2, room.front - depth / 2 - random() * PUSH), (random() - 0.5) * 2 * YAW));
          x += width + GAP;
        }
        if (parts.length === 0) continue;
        const geometry = mergeGeometries(parts);
        for (const part of parts) part.dispose();
        if (!geometry) continue;
        // Transparent from the start (at full opacity): the fade then changes no program, it only lowers a uniform.
        const material = new THREE.MeshStandardMaterial({ map: fronts.texture, roughness: 0.55, metalness: 0, transparent: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'DreamRow';
        mesh.receiveShadow = true;
        shelf.add(mesh);
        geometry.computeBoundingBox();
        const centre = geometry.boundingBox!.getCenter(new THREE.Vector3());
        this.rows.push({ mesh, shelf, centre: shelf.localToWorld(centre) });
      }
    });
  }

  /** Fades row `index` (1 = there, 0 = gone: hidden). */
  setOpacity(index: number, opacity: number): void {
    const row = this.rows[index];
    if (!row) return;
    row.mesh.material.opacity = opacity;
    row.mesh.visible = opacity > 0.002;
  }

  /** Takes every row off its bookcase and frees it (the atlas is the caller's). */
  dispose(): void {
    for (const { mesh } of this.rows.splice(0)) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

/** One box at `at` (its centre, in the bookcase's frame) turned by `yaw`: its front mapped to `front`, every other face to `side`. */
function boxPart(front: AtlasRect, side: AtlasRect, dims: BoxDimensions, at: THREE.Vector3, yaw: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(dims.width, dims.height, dims.depth);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const [u0, v0, u1, v1] = Math.floor(i / 4) === FRONT_FACE ? front : side;
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  geometry.rotateY(yaw);
  geometry.translate(at.x, at.y, at.z);
  return geometry;
}
