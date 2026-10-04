import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { Prop } from '../props/Prop';
import { instancedStandard } from '../materials/palette';
import { flightTreads } from './flights';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREYS } from '@/world/measures/building';
import { lcg } from '@/random';

/** The runner's thickness over the stone, and the brass rods' radius. */
const PILE = 0.006;
const ROD = 0.0065;
/** The runner's colours as the co-owners voted them (`coproPlan` "runner"); `none`: taken up. */
const COLOURS: Record<string, number> = { red: 0x8c1f26, green: 0x2f5a3a };

/**
 * The stair carpet: a runner up the middle of every flight, over each tread and down each riser, held at the back of
 * every tread by a brass rod. One merged mesh for the cloth (its colour the co-owners' choice), one instanced draw for
 * the rods; taken up (hidden) when they voted for bare stone. Zone-local, placed at the origin. Decoration: the feet
 * still walk on the treads (6 mm lower).
 */
export class StairRunner extends Prop {
  readonly contactShadow = false;
  private readonly cloth: THREE.MeshStandardMaterial;

  constructor(style: string) {
    super();
    this.name = 'StairRunner';
    const width = plan.coproLook.runner.width;
    const pieces: THREE.BufferGeometry[] = [];
    const rods: THREE.Matrix4[] = [];
    for (let k = 0; k < STOREYS; k++) {
      for (const which of ['A', 'B'] as const) {
        const lane = which === 'A' ? plan.flightA : plan.flightB;
        const cx = (lane.x0 + lane.x1) / 2;
        for (const t of flightTreads(k, which)) {
          // On the tread, then up its riser to the tread (or landing) above.
          pieces.push(new THREE.BoxGeometry(width, PILE, t.z1 - t.z0).translate(cx, t.top + PILE / 2, (t.z0 + t.z1) / 2));
          pieces.push(new THREE.BoxGeometry(width, t.rise, PILE).translate(cx, t.top + t.rise / 2, t.riserZ + (t.riserFacing * PILE) / 2));
          rods.push(new THREE.Matrix4().makeTranslation(cx, t.top + PILE + ROD, t.riserZ + t.riserFacing * (ROD + PILE + 0.004)));
        }
      }
    }
    this.cloth = new THREE.MeshStandardMaterial({ color: COLOURS[style] ?? COLOURS.red, map: runnerTexture(), roughness: 0.95 });
    const runner = new THREE.Mesh(mergeGeometries(pieces)!, this.cloth);
    for (const g of pieces) g.dispose();
    runner.receiveShadow = true;
    runner.castShadow = false;
    this.add(runner);
    const rod = new THREE.CylinderGeometry(ROD, ROD, width + 0.08, 8).rotateZ(Math.PI / 2);
    const brass = new THREE.InstancedMesh(rod, instancedStandard({ color: 0xc9a75b, metalness: 1, roughness: 0.32 }), rods.length);
    rods.forEach((m, i) => brass.setMatrixAt(i, m));
    brass.castShadow = false;
    brass.computeBoundingSphere();
    this.add(brass);
    this.setStyle(style);
  }

  /** The co-owners' choice: a red runner, a green one, or none (bare stone). */
  setStyle(style: string): void {
    this.visible = style !== 'none';
    const colour = COLOURS[style];
    if (colour !== undefined) this.cloth.color.setHex(colour);
  }
}

/** The runner's weave across its width (u): a darker border each side with a pale line inside it, the pile's grain along it. */
function runnerTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 128;
  const [canvas, ctx] = createCanvas(w, h);
  const random = lcg(0x5a17);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    const v = 200 + Math.floor(random() * 55);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(random() * w, random() * h, 1, 2 + random() * 3);
  }
  ctx.fillStyle = 'rgba(40,40,40,0.55)';
  ctx.fillRect(0, 0, w * 0.1, h);
  ctx.fillRect(w * 0.9, 0, w * 0.1, h);
  ctx.fillStyle = 'rgba(255,240,200,0.9)';
  ctx.fillRect(w * 0.11, 0, w * 0.025, h);
  ctx.fillRect(w * 0.865, 0, w * 0.025, h);
  const texture = toTexture(canvas, 'grazing');
  texture.wrapT = THREE.RepeatWrapping; // convention-ok: wraps one way only
  return texture;
}
