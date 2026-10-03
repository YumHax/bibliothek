import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import { TriBuilder } from '../relief/TriBuilder';
import { snowCovered } from '../snowCover';
import type { Vec2 } from '../streetPlan';

export interface SignpostArm {
  text: string;
  /** Where it points (zone-local). */
  to: Vec2;
}

/** The post: its height and radius; the arms: from this height down, so far apart, how long and deep, the tip. */
const POST = { height: 3.05, radius: 0.045 };
const ARM = { top: 2.7, step: 0.19, length: 1.05, height: 0.15, thick: 0.028, tip: 0.12, root: 0.06 };
/** Each arm's lettering: a row of the atlas this many pixels high (both its faces, one row each). */
const ROW = 64;
const ATLAS_W = 512;
const BOARD = '#1f3a2c';
const LETTERS = '#f2ecd8';

/**
 * The fingerpost by our building's door: a dark green post with a ball on top and an arm per place
 * (`WAYFINDING.signpost`), each turned to point at it from here (zone-local, the post at `at`),
 * the highest first, lettered cream on both faces with an arrow at the tip. The lettering is one
 * atlas (a row per face), the post and the arms' edges one painted mesh. The post collides.
 */
export class Signpost extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];

  constructor(at: Vec2, arms: readonly SignpostArm[], anisotropy: number) {
    super();
    this.name = 'Signpost';
    const painted = new TriBuilder();
    const identity = new THREE.Matrix4();
    const post = new THREE.CylinderGeometry(POST.radius, POST.radius * 1.25, POST.height, 12).translate(0, POST.height / 2, 0);
    const finial = new THREE.SphereGeometry(POST.radius * 1.8, 12, 8).translate(0, POST.height + 0.05, 0);
    const foot = new THREE.CylinderGeometry(POST.radius * 2.2, POST.radius * 2.6, 0.18, 12).translate(0, 0.09, 0);
    painted.geometry(identity, post, BOARD).geometry(identity, finial, BOARD).geometry(identity, foot, BOARD);
    for (const g of [post, finial, foot]) g.dispose();

    const [canvas, ctx] = createCanvas(ATLAS_W, ROW * 2 * arms.length);
    const faces: THREE.BufferGeometry[] = [];
    arms.forEach((arm, i) => {
      const y = ARM.top - i * ARM.step;
      const yaw = Math.atan2(-(arm.to[1] - at[1]), arm.to[0] - at[0]);
      const m = new THREE.Matrix4().makeRotationY(yaw);
      const mid = ARM.root + ARM.length / 2;
      // The board's edges and its pointed tip, in the board's colour.
      painted.box(m, mid, y, 0, ARM.length, ARM.height, ARM.thick, BOARD);
      const x1 = ARM.root + ARM.length;
      const h = ARM.height / 2;
      // The tip's two faces, wound both ways (seen from either side).
      for (const z of [ARM.thick / 2, -ARM.thick / 2]) {
        painted.triangle(m, [x1, y - h, z], [x1 + ARM.tip, y, z], [x1, y + h, z], BOARD).triangle(m, [x1, y - h, z], [x1, y + h, z], [x1 + ARM.tip, y, z], BOARD);
      }
      painted.quad(m, [x1, y + h, ARM.thick / 2], [x1 + ARM.tip, y, 0], [x1 + ARM.tip, y, 0], [x1, y + h, -ARM.thick / 2], BOARD, true);
      painted.quad(m, [x1, y - h, -ARM.thick / 2], [x1 + ARM.tip, y, 0], [x1 + ARM.tip, y, 0], [x1, y - h, ARM.thick / 2], BOARD, true);
      // The lettered faces, a hair proud of the board: the front reads root to tip, the back from the tip to the root.
      for (const side of [1, -1] as const) {
        const row = i * 2 + (side > 0 ? 0 : 1);
        drawArm(ctx, arm.text, row * ROW, side < 0);
        const face = new THREE.PlaneGeometry(ARM.length - 0.02, ARM.height - 0.02);
        if (side < 0) face.rotateY(Math.PI);
        face.translate(mid, y, side * (ARM.thick / 2 + 0.002)).applyMatrix4(m);
        const uv = face.getAttribute('uv') as THREE.BufferAttribute;
        const rows = arms.length * 2;
        for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (row + 1 - uv.getY(k)) / rows);
        faces.push(face);
      }
    });
    const lettering = new THREE.Mesh(mergeFaces(faces), snowCovered(new THREE.MeshStandardMaterial({ map: toTexture(canvas, anisotropy), roughness: 0.6 })));
    lettering.castShadow = false;
    lettering.receiveShadow = true;
    const body = new THREE.Mesh(painted.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
    body.castShadow = true;
    body.receiveShadow = true;
    this.add(body, lettering);
    this.colliders = [new THREE.Box3(new THREE.Vector3(-0.12, 0, -0.12), new THREE.Vector3(0.12, 2, 0.12))];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}

/** One face of an arm into its atlas row: the name, and an arrow at the tip's end (the right of the front, the left of the back). */
function drawArm(ctx: CanvasRenderingContext2D, text: string, top: number, back: boolean): void {
  ctx.fillStyle = BOARD;
  ctx.fillRect(0, top, ATLAS_W, ROW);
  ctx.strokeStyle = LETTERS;
  ctx.lineWidth = 3;
  ctx.strokeRect(6, top + 6, ATLAS_W - 12, ROW - 12);
  ctx.fillStyle = LETTERS;
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, ATLAS_W / 2 + (back ? 18 : -18), top + ROW / 2 + 1, ATLAS_W - 90);
  // The arrow.
  const x = back ? 30 : ATLAS_W - 30;
  const d = back ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x + d * 14, top + ROW / 2);
  ctx.lineTo(x - d * 8, top + ROW / 2 - 14);
  ctx.lineTo(x - d * 8, top + ROW / 2 + 14);
  ctx.closePath();
  ctx.fill();
}

/** The faces' planes (position, normal, uv) into one geometry. */
function mergeFaces(faces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = faces.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    return out;
  });
  const count = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let offset = 0;
  for (const g of flat) {
    const n = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, offset * 2);
    offset += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
