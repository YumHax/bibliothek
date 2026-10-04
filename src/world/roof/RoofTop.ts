import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCanvas, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../props/Prop';
import { ROOF_PLAN as plan } from './roofPlan';
import { paintOnce } from '../materials/paintedTiles';
import { lcg } from '@/random';

type Finish = 'zinc' | 'iron' | 'brick' | 'pot' | 'boards' | 'gable';

/**
 * The top of our building: the zinc of the mansard's flat top with its standing seams, an iron
 * railing just inside its edges (the colliders keep the player within it), the chimney stacks and
 * their terracotta pots, the duckboards from the hatch along the roof, and our gable wall going down
 * to the lower roof next door. One merged mesh per finish. Zone-local, origin on the zinc at its middle.
 */
export class RoofTop extends Prop {
  readonly colliders: THREE.Box3[] = [];
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();

  constructor() {
    super();
    this.name = 'RoofTop';
    const { half, rail, chimneys, walk } = plan;
    // The zinc, a few centimetres thick.
    this.box('zinc', -half.x, -0.04, -half.z, half.x, 0, half.z);
    // The railing round it, posts and two rails.
    const x0 = -half.x + rail.inset;
    const x1 = half.x - rail.inset;
    const z0 = -half.z + rail.inset;
    const z1 = half.z - rail.inset;
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]] as const) {
      const length = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(length / rail.post));
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const z = az + ((bz - az) * i) / n;
        this.box('iron', x - 0.02, 0, z - 0.02, x + 0.02, rail.height, z + 0.02);
      }
      for (const y of [rail.height - 0.03, rail.height * 0.5]) this.box('iron', Math.min(ax, bx) - 0.02, y, Math.min(az, bz) - 0.02, Math.max(ax, bx) + 0.02, y + 0.03, Math.max(az, bz) + 0.02);
    }
    const T = 0.1;
    this.colliders.push(
      new THREE.Box3(new THREE.Vector3(x0 - T, 0, z0 - T), new THREE.Vector3(x1 + T, 2, z0)),
      new THREE.Box3(new THREE.Vector3(x0 - T, 0, z1), new THREE.Vector3(x1 + T, 2, z1 + T)),
      new THREE.Box3(new THREE.Vector3(x0 - T, 0, z0), new THREE.Vector3(x0, 2, z1)),
      new THREE.Box3(new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1 + T, 2, z1)),
    );
    // The chimney stacks: brick, a stone cap, the pots.
    const random = lcg(5);
    for (const c of chimneys) {
      const [cx, cz] = c.at;
      const [sx, sz] = c.size;
      this.box('brick', cx - sx / 2, 0, cz - sz / 2, cx + sx / 2, c.height, cz + sz / 2);
      this.box('gable', cx - sx / 2 - 0.04, c.height, cz - sz / 2 - 0.04, cx + sx / 2 + 0.04, c.height + 0.06, cz + sz / 2 + 0.04);
      for (let i = 0; i < c.pots; i++) {
        const px = cx - sx / 2 + ((i + 0.5) * sx) / c.pots;
        const h = 0.3 + random() * 0.15;
        const pot = new THREE.CylinderGeometry(0.07, 0.09, h, 10, 1, true).translate(px, c.height + 0.06 + h / 2, cz).toNonIndexed();
        this.put('pot', pot);
      }
      this.colliders.push(new THREE.Box3(new THREE.Vector3(cx - sx / 2, 0, cz - sz / 2), new THREE.Vector3(cx + sx / 2, c.height, cz + sz / 2)));
    }
    // The duckboards: planks across a pair of bearers, along the roof from the hatch.
    for (let x = walk.x0; x < walk.x1; x += 0.16) this.box('boards', x, 0.03, walk.z - walk.width / 2, x + 0.13, 0.055, walk.z + walk.width / 2);
    for (const dz of [-walk.width / 2 + 0.08, walk.width / 2 - 0.08]) this.box('boards', walk.x0, 0, walk.z + dz - 0.03, walk.x1, 0.03, walk.z + dz + 0.03);
    // Our gable wall on the east, down to the lower building next door (one storey lower: the arcade's).
    this.box('gable', half.x, -6.4, -half.z, half.x + 0.3, 0, half.z);
    this.build();
  }

  private build(): void {
    const materials: Record<Finish, THREE.Material> = {
      zinc: new THREE.MeshStandardMaterial({ map: paintOnce('roof:zinc', () => [zincTexture()] as const)[0], color: 0xb8bcc0, roughness: 0.55, metalness: 0.35 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5 }),
      brick: new THREE.MeshStandardMaterial({ map: paintOnce('roof:brick', () => [brickTexture()] as const)[0], roughness: 0.9 }),
      pot: new THREE.MeshStandardMaterial({ color: 0xa8583a, roughness: 0.85, side: THREE.DoubleSide }),
      boards: new THREE.MeshStandardMaterial({ color: 0x7a6a56, roughness: 0.9 }),
      gable: new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.92 }),
    };
    for (const [finish, geometries] of this.parts) {
      const merged = mergeGeometries(geometries);
      for (const g of geometries) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[finish]);
      mesh.castShadow = finish !== 'zinc' && finish !== 'gable';
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    for (const [finish, material] of Object.entries(materials)) if (!this.parts.has(finish as Finish)) material.dispose();
  }

  /** A box from (x0, y0, z0) to (x1, y1, z1), uvs in metres on each face. */
  private box(finish: Finish, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const normal = g.getAttribute('normal') as THREE.BufferAttribute;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(normal.getX(i));
      const ny = Math.abs(normal.getY(i));
      const x = pos.getX(i) + x0 + w / 2;
      const y = pos.getY(i) + y0 + h / 2;
      const z = pos.getZ(i) + z0 + d / 2;
      if (ny > 0.5) uv.setXY(i, x, z);
      else if (nx > 0.5) uv.setXY(i, z, y);
      else uv.setXY(i, x, y);
    }
    g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    this.put(finish, g);
  }

  private put(finish: Finish, g: THREE.BufferGeometry): void {
    let list = this.parts.get(finish);
    if (!list) this.parts.set(finish, (list = []));
    list.push(g);
  }
}

/** Zinc sheets with their standing seams every 0.6 m (along z), dulled and streaked: a metre square, tiled. */
function zincTexture(): THREE.CanvasTexture {
  const px = 256;
  const [canvas, ctx] = createCanvas(px, px);
  const random = lcg(17);
  ctx.fillStyle = '#9ea3a8';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,44,50,0.08)';
    ctx.fillRect(random() * px, random() * px, 1 + random() * 2, 6 + random() * 30);
  }
  // A seam at 0 and 0.6 of each metre... a metre being 256 px: every 0.5 m to tile cleanly.
  for (const x of [0, px / 2]) {
    ctx.fillStyle = 'rgba(230,234,238,0.55)';
    ctx.fillRect(x, 0, 3, px);
    ctx.fillStyle = 'rgba(30,34,40,0.4)';
    ctx.fillRect(x + 3, 0, 2, px);
  }
  const texture = toTexture(canvas, 'grazing');
  repeatTexture(texture);
  return texture;
}

/** Sooty old brick: a metre square, tiled. */
function brickTexture(): THREE.CanvasTexture {
  const px = 256;
  const [canvas, ctx] = createCanvas(px, px);
  const random = lcg(23);
  ctx.fillStyle = '#5a4a40';
  ctx.fillRect(0, 0, px, px);
  const bw = px / 4.5;
  const bh = px / 13;
  for (let row = 0; row * bh < px; row++) {
    for (let col = -1; col * bw < px; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const t = 0.75 + random() * 0.35;
      ctx.fillStyle = `rgb(${Math.round(150 * t)}, ${Math.round(78 * t)}, ${Math.round(58 * t)})`;
      ctx.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
    }
  }
  // Soot, thicker towards the top.
  const g = ctx.createLinearGradient(0, 0, 0, px);
  g.addColorStop(0, 'rgba(20,16,14,0.45)');
  g.addColorStop(1, 'rgba(20,16,14,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  const texture = toTexture(canvas, 'grazing');
  repeatTexture(texture);
  return texture;
}
