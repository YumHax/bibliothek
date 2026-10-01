import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoomOptions, Wall } from '../../Room';
import { Prop, part } from '../../props/Prop';
import { paint, scuffedPaint } from '../../materials/palette';
import { segmentsBetween, wallFrame, wallLocalX } from '../../props/TiledWainscot';

export interface PanelledDadoOptions {
  /** Height of the rail, metres. Default 0.95. */
  height?: number;
  /** The panelling's paint and the rail's. Default a deep green and a cream rail. */
  color?: number;
  rail?: number;
  /** Walls it runs along. Default all four. */
  walls?: Wall[];
  /** Panel width (the moulded frames' spacing along the wall). Default 0.62. */
  panel?: number;
  /** Just the rail (a dado rail on plain paint), no boarding under it. Default false. */
  railOnly?: boolean;
}

/** A gap in the run: where along its wall (world coordinate, as `Placement.along`), how wide, from what height to what height. */
export interface WallGap {
  wall: Wall;
  along: number;
  width: number;
  bottom: number;
  top: number;
}

const BOARD = 0.018;
const RAIL_H = 0.045;
const RAIL_D = 0.03;
const MOULD = 0.018;

/**
 * Panelled boarding round the lower walls of a shop, capped by a dado rail: painted boards with moulded frames every
 * panel's width, the old-fashioned shop look (or the rail alone on the plain wall). Runs round the walls, cut where a
 * `WallGap` reaches under the rail (the exit door; the window's glass starts higher, but its stall riser is its own).
 * Built from the room and placed at the zone's origin; each wall's run in that wall's frame. Decoration: never collides.
 */
export class PanelledDado extends Prop {
  readonly contactShadow = false;

  constructor(room: RoomOptions, gaps: readonly WallGap[], options: PanelledDadoOptions = {}) {
    super();
    this.name = 'PanelledDado';
    const height = options.height ?? 0.95;
    const board = scuffedPaint(options.color ?? 0x2f4a3e, 0.55);
    const rail = paint(options.rail ?? 0xece4d0, 0.45);
    const panel = options.panel ?? 0.62;
    for (const wall of options.walls ?? ['back', 'front', 'left', 'right']) {
      const length = wall === 'back' || wall === 'front' ? room.width : room.depth;
      const cuts = gaps.filter((g) => g.wall === wall && g.bottom < height).map((g) => ({ centre: wallLocalX(wall, g.along), width: g.width }));
      const face = new THREE.Group();
      const { position, rotationY } = wallFrame(room, wall);
      face.position.copy(position);
      face.rotation.y = rotationY;
      this.add(face);
      for (const seg of segmentsBetween(length, cuts)) {
        if (seg.length < 0.05) continue;
        part(face, seg.length, RAIL_H, RAIL_D, rail, { x: seg.centre, y: height + RAIL_H / 2, z: RAIL_D / 2 });
        if (options.railOnly) continue;
        part(face, seg.length, height, BOARD, board, { x: seg.centre, y: height / 2, z: BOARD / 2 });
        // The moulded frames: a rectangle of thin strips per panel, inset from the skirting and the rail.
        const count = Math.max(1, Math.round(seg.length / panel));
        const w = seg.length / count;
        const y0 = 0.16;
        const y1 = height - 0.08;
        for (let i = 0; i < count; i++) {
          const cx = seg.centre - seg.length / 2 + w * (i + 0.5);
          const iw = w - 0.12;
          if (iw < 0.1) continue;
          for (const y of [y0, y1]) part(face, iw, MOULD, 0.01, board, { x: cx, y, z: BOARD + 0.005 });
          for (const x of [cx - iw / 2 + MOULD / 2, cx + iw / 2 - MOULD / 2]) part(face, MOULD, y1 - y0 - MOULD, 0.01, board, { x, y: (y0 + y1) / 2, z: BOARD + 0.005 });
        }
      }
      bakeFace(face);
    }
    this.traverse((o) => (o.castShadow = false));
  }
}

/**
 * One mesh per material for a wall's run, in the wall's frame. The zone's merge (`mergeStaticParts`) leaves a patched
 * material's parts alone once turned (the scuffed paint here), which would keep every strip of the three turned walls
 * a draw of its own; the scuffs are worked out in world space, so baking them here changes nothing of their look.
 */
function bakeFace(face: THREE.Group): void {
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of face.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    const material = mesh.material as THREE.Material;
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), mesh]);
  }
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.clearGroups();
      return geometry.applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!geometry) continue;
    const baked = new THREE.Mesh(geometry, material);
    baked.receiveShadow = true;
    for (const mesh of meshes) mesh.removeFromParent();
    face.add(baked);
  }
}
