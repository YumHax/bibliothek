import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { matte } from './Prop';

export interface MirrorPillarOptions {
  /** Side of the square column, metres. Default 0.5. */
  size?: number;
  /** Floor to ceiling. Default 3. */
  height?: number;
  /** Colour of the neon band round it. Default magenta. */
  neon?: number;
}

const BASE_H = 0.12;
const FRAME = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.7, roughness: 0.3 });
const MIRROR = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, metalness: 1, roughness: 0.04 });

/**
 * A structural column dressed for an arcade: a black plinth, mirrored panels on all four faces
 * between chrome strips (they pick up the hall's neon and screens), a neon band round it above
 * head height. Floor to ceiling; origin on the floor at its centre. Collides.
 */
export class MirrorPillar extends THREE.Group implements Furniture {
  private readonly size: number;
  private readonly height: number;

  constructor(options: MirrorPillarOptions = {}) {
    super();
    this.name = 'MirrorPillar';
    this.size = options.size ?? 0.5;
    this.height = options.height ?? 3;
    const s = this.size;
    const h = this.height;
    this.add(boxMesh(s, h, s, matte(0x1a1720, 0.6), { y: h / 2 }));
    this.add(boxMesh(s + 0.03, BASE_H, s + 0.03, matte(0x0c0b10, 0.5), { y: BASE_H / 2 }));
    const neonColor = new THREE.Color(options.neon ?? 0xff2fa0);
    const neon = new THREE.MeshStandardMaterial({ color: neonColor.clone().multiplyScalar(0.3), emissive: neonColor, emissiveIntensity: 2.2, toneMapped: false });
    const band = boxMesh(s + 0.02, 0.03, s + 0.02, neon, { y: 2.25 });
    band.castShadow = false;
    this.add(band);
    // Four mirrored faces, each in a chrome frame, from the plinth to under the band.
    const panelH = 2.25 - 0.06 - BASE_H - 0.06;
    const panelY = BASE_H + 0.06 + panelH / 2;
    for (let i = 0; i < 4; i++) {
      const face = new THREE.Group();
      face.rotation.y = (i * Math.PI) / 2;
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(s - 0.08, panelH), MIRROR);
      mirror.position.set(0, panelY, s / 2 + 0.003);
      face.add(mirror);
      for (const x of [-(s / 2 - 0.02), s / 2 - 0.02]) face.add(boxMesh(0.03, panelH + 0.06, 0.012, FRAME, { x, y: panelY, z: s / 2 + 0.004 }));
      for (const y of [panelY - panelH / 2 - 0.015, panelY + panelH / 2 + 0.015]) face.add(boxMesh(s - 0.02, 0.03, 0.012, FRAME, { y, z: s / 2 + 0.004 }));
      this.add(face);
    }
  }

  get footprint(): THREE.Box3 {
    const half = this.size / 2 + 0.02;
    return new THREE.Box3(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, this.height, half));
  }
}
