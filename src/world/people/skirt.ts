import * as THREE from 'three';
import { ramp } from '@/math/scalar';
import { PELVIS_Y, trunkSection } from './body';
import type { PersonLook } from './looks';
import { paintCloth } from './clothTexture';
import { fabric } from '../materials/finishes';
import type { SkirtSkin } from './motion/skirtSkin';
import { weldNormals } from './geometry';

/*
 * What hangs from the waist over the legs: a skirt (or a dress's skirt) to just above the knee, or a
 * long coat's skirts to mid-thigh. One surface in the pelvis's frame, hugging the trunk over the
 * hips and flaring below the seat into an A-line wide enough for the legs to swing inside it; it
 * follows the thighs in its shader (`SkirtSkin`), the hem most, the waistband not at all.
 */

/** The cloth's shape below the seat: its hem's height over the floor and its half-width, depth in front and behind there (reference metres, before the build). */
interface Cut {
  top: number;
  hem: number;
  halfWidth: number;
  front: number;
  back: number;
}

/** Where the hips stop and the flare begins. */
const SEAT_Y = 0.85;
/** Ease over the trunk at the waist and the seat. */
const EASE = 0.007;
/** Superellipse exponent of the rings (a little squarer than an ellipse, as the trunk's). */
const RING = 2.3;
/** How far the hem follows the thigh (the rest it trails). */
const HEM_FOLLOW = 0.85;

const SKIRT: Cut = { top: 0.955, hem: 0.5, halfWidth: 0.215, front: 0.15, back: 0.17 };
const COAT: Cut = { top: 0.95, hem: 0.6, halfWidth: 0.205, front: 0.13, back: 0.15 };

/** The skirt and the coat's skirts `look` wears (none, one or both), each a mesh for the pelvis. */
export function lowerGarments(look: PersonLook, skin: SkirtSkin): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  if (look.skirt && look.skirtColor !== undefined) out.push(garment(look, SKIRT, look.skirtColor, skin, 0));
  // Over a skirt, the coat flares a little wider so the two never meet.
  if (look.coat) out.push(garment(look, COAT, look.topColor, skin, look.skirt ? 0.02 : 0));
  return out;
}

function garment(look: PersonLook, cut: Cut, color: number, skin: SkirtSkin, extra: number): THREE.Mesh {
  const material = skin.patch(
    fabric({ map: paintCloth(color, color, 'plain'), roughness: 0.88, side: THREE.DoubleSide, sheenTint: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35) }),
  );
  const mesh = new THREE.Mesh(geometry(look, cut, extra), material);
  const shadows = skin.shadowMaterials();
  mesh.customDepthMaterial = shadows.depth;
  mesh.customDistanceMaterial = shadows.distance;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Rings from the waistband to the hem (the pelvis's frame), with each vertex's share of the thigh's turn (`skirtFollow`). */
function geometry(look: PersonLook, cut: Cut, extra: number): THREE.BufferGeometry {
  const rows = 16;
  const cols = 40;
  const positions: number[] = [];
  const uvs: number[] = [];
  const follow: number[] = [];
  const seat = trunkSection(SEAT_Y, look);
  const hem = { halfWidth: cut.halfWidth * look.build + extra, front: cut.front * (0.8 + 0.2 * look.build) + extra, back: cut.back * (0.8 + 0.2 * look.build) + extra };
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = THREE.MathUtils.lerp(cut.top, cut.hem, t);
    let halfWidth: number;
    let front: number;
    let back: number;
    if (y >= SEAT_Y) {
      const s = trunkSection(y, look);
      halfWidth = s.halfWidth + EASE;
      front = s.front + EASE;
      back = s.back + EASE;
    } else {
      // Below the seat the cloth falls away from the body: eased into the flare, straighter to the hem.
      const k = Math.pow((SEAT_Y - y) / (SEAT_Y - cut.hem), 0.8);
      halfWidth = THREE.MathUtils.lerp(seat.halfWidth + EASE, hem.halfWidth, k);
      front = THREE.MathUtils.lerp(seat.front + EASE, hem.front, k);
      back = THREE.MathUtils.lerp(seat.back + EASE, hem.back, k);
    }
    // Soft folds near the hem.
    const folds = 1 + 0.03 * ramp(y, SEAT_Y - 0.05, cut.hem);
    const share = HEM_FOLLOW * Math.pow(THREE.MathUtils.clamp((cut.top - 0.03 - y) / (cut.top - 0.03 - cut.hem), 0, 1), 1.2);
    for (let j = 0; j <= cols; j++) {
      const theta = -Math.PI + (j / cols) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const wave = 1 + (folds - 1) * Math.sin(theta * 9);
      const x = halfWidth * wave * Math.sign(sin) * Math.abs(sin) ** (2 / RING);
      const z = (cos >= 0 ? front : back) * wave * Math.sign(cos) * Math.abs(cos) ** (2 / RING);
      positions.push(x, y - PELVIS_Y, z);
      uvs.push(j / cols, 1 - t);
      follow.push(share);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('skirtFollow', new THREE.Float32BufferAttribute(follow, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}
