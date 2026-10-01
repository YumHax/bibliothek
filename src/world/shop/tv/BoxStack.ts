import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { labelSheet, typed, type Label } from './labels';

export interface BoxStackOptions {
  /** Boxes in the stack, bottom first. Default 5. */
  count?: number;
  seed?: number;
}

const KRAFT: readonly number[] = [0xb08a5a, 0xa47e50, 0xbc9868, 0x9a7448];
const TAPE = paint(0xc8a868, 0.35);
const STENCILS: readonly string[] = ['FRAGILE', 'THIS WAY UP', 'LUMINA 14"', 'SPARES', 'VALVES', 'RETURNS', 'CHASSIS', 'DO NOT DROP'];

/**
 * Cardboard boxes stacked in a corner of the workshop, each a little skew on the one under it, packing tape across
 * their lids, a stencil or a label on the side (FRAGILE, SPARES, LUMINA 14"). Origin on the floor under the stack,
 * its labels +z. Collides as its box.
 */
export class BoxStack extends Prop implements Furniture {
  private readonly box: THREE.Box3;

  constructor(options: BoxStackOptions = {}) {
    super();
    this.name = 'BoxStack';
    const random = seededRandom(options.seed ?? 19);
    const count = options.count ?? 5;
    let y = 0;
    let wMax = 0;
    let dMax = 0;
    const faces: { box: THREE.Group; at: THREE.Vector3; kraft: number; label: Label }[] = [];
    for (let i = 0; i < count; i++) {
      const shrink = 1 - i * 0.08;
      const w = (0.45 + random() * 0.2) * shrink;
      const d = (0.35 + random() * 0.15) * shrink;
      const h = 0.22 + random() * 0.2;
      const x = (random() - 0.5) * 0.06;
      const z = (random() - 0.5) * 0.06;
      const yaw = (random() - 0.5) * 0.25;
      const box = new THREE.Group();
      box.position.set(x, y, z);
      box.rotation.y = yaw;
      const kraft = KRAFT[i % KRAFT.length]!;
      part(box, w, h, d, paint(kraft, 0.95), { y: h / 2 });
      part(box, 0.05, 0.002, d + 0.002, TAPE, { y: h + 0.001 });
      part(box, 0.05, h * 0.3, 0.002, TAPE, { y: h * 0.85, z: d / 2 + 0.001 });
      this.add(box);
      if (random() < 0.8) faces.push({ box, at: new THREE.Vector3((random() - 0.5) * w * 0.3, h * 0.45, d / 2), kraft, label: { width: Math.min(0.24, w * 0.55), height: 0.07, paint: typed(STENCILS[Math.floor(random() * STENCILS.length)]!, { paper: 'rgba(0,0,0,0)', ink: '#2a1e14', rule: false, family: 'Impact, "Arial Narrow Bold", sans-serif' }) } });
      y += h;
      wMax = Math.max(wMax, w);
      dMax = Math.max(dMax, d);
    }
    // The stencils: a painted card of kraft behind each, so the sheet stays opaque.
    const meshes = labelSheet(faces.map((f) => ({ ...f.label, paint: kraftUnder(f.kraft, f.label.paint) })), 900);
    meshes.forEach((mesh, i) => {
      const f = faces[i]!;
      mesh.position.set(f.at.x, f.at.y, f.at.z + mesh.position.z);
      f.box.add(mesh);
    });
    this.box = new THREE.Box3(new THREE.Vector3(-wMax / 2 - 0.04, 0, -dMax / 2 - 0.04), new THREE.Vector3(wMax / 2 + 0.04, y, dMax / 2 + 0.04));
  }

  override get footprint(): THREE.Box3 {
    return this.box;
  }
}

/** Paints the kraft of a box's side under a stencil. */
function kraftUnder(kraft: number, stencil: Label['paint']): Label['paint'] {
  return (ctx, w, h) => {
    ctx.fillStyle = `#${kraft.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, w, h);
    stencil(ctx, w, h);
  };
}
