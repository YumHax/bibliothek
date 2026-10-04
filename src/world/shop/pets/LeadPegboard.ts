import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { Prop, part } from '../../props/Prop';
import { cylinderMesh } from '../../meshUtils';
import { METAL, paint } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { POSTER, setLines } from '../common/lettering';
import { lcg } from '@/random';

export interface LeadPegboardOptions {
  /** Size of the board. Default 1.0 x 0.72. */
  width?: number;
  height?: number;
  /** The heading painted across its top. */
  heading?: string;
  seed?: number;
}

const PX_PER_M = 400;
const HOLE = 0.025;
const STRAPS: readonly number[] = [0xc83a3a, 0x2e6ab8, 0x3a8a4a, 0xe8b830, 0x8a3a8a, 0x1e1e20, 0xe86a2a, 0x2f6a6a];
const HEADING_BAND = 0.1;

/**
 * A pegboard of leads and collars behind the pet shop's counter: brown hardboard punched with holes, the heading
 * painted across its top, rows of steel hooks, on each a lead hanging doubled with its clip, or a bunch of collars in
 * all colours with their tags. The shop's stock, not the flat's. Static: its parts merge. Wall-hung: origin at its
 * centre on the wall, +z into the room. Decoration: never collides.
 */
export class LeadPegboard extends Prop {
  constructor(options: LeadPegboardOptions = {}) {
    super();
    this.name = 'LeadPegboard';
    const W = options.width ?? 1.0;
    const H = options.height ?? 0.72;
    const random = lcg(options.seed ?? 17);
    part(this, W, H, 0.006, paint(0x7a5a3a, 0.9), { z: 0.012 });
    // Battens behind it, holding it off the wall for the hooks.
    for (const s of [-1, 1]) part(this, W - 0.04, 0.03, 0.009, paint(0x5a4028, 0.8), { y: (s * (H - 0.08)) / 2, z: 0.0045 });
    const face = decal(W, H, new THREE.MeshStandardMaterial({ map: paintBoard(W, H, options.heading ?? 'LEADS · COLLARS · HARNESSES'), roughness: 0.85 }), WALL.print);
    face.position.z += 0.015;
    this.add(face);

    const steel = METAL.satinSteel();
    const rows = [H / 2 - HEADING_BAND - 0.06, H / 2 - HEADING_BAND - 0.06 - (H - HEADING_BAND) * 0.5];
    rows.forEach((y, r) => {
      const hooks = Math.max(3, Math.round(W / 0.16));
      for (let i = 0; i < hooks; i++) {
        const x = -W / 2 + (W / hooks) * (i + 0.5);
        const hook = cylinderMesh(0.003, 0.07, steel, { x, y, z: 0.015 + 0.035 }, { segments: 6 });
        hook.rotation.x = Math.PI / 2;
        this.add(hook);
        const colour = STRAPS[Math.floor(random() * STRAPS.length)]!;
        if ((i + r) % 3 === 2) this.collars(x, y, random);
        else this.lead(x, y, colour, r === 0 ? 0.26 : 0.2, random);
      }
    });
    this.traverse((o) => (o.castShadow = false));
  }

  /** A lead hanging doubled off its hook: two straps, the handle's loop over the hook, the clip at the bottom. */
  private lead(x: number, y: number, colour: number, drop: number, random: () => number): void {
    const strap = paint(colour, 0.7);
    const z = 0.04 + random() * 0.015;
    for (const s of [-1, 1]) {
      const band = part(this, 0.014, drop, 0.004, strap, { x: x + s * 0.012, y: y - drop / 2, z });
      band.rotation.z = s * 0.04;
    }
    part(this, 0.04, 0.014, 0.004, strap, { x, y: y + 0.004, z });
    part(this, 0.012, 0.03, 0.01, METAL.chrome(), { x, y: y - drop - 0.012, z });
  }

  /** A bunch of collars on a hook: rings of every colour, a round brass tag on each. */
  private collars(x: number, y: number, random: () => number): void {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 18), paint(STRAPS[Math.floor(random() * STRAPS.length)]!, 0.6));
      ring.scale.set(1, 1, 0.5);
      ring.position.set(x + (i - 1) * 0.008, y - 0.045, 0.035 + i * 0.012);
      this.add(ring);
      const tag = cylinderMesh(0.008, 0.002, METAL.brass(), { x: x + (i - 1) * 0.008, y: y - 0.092, z: 0.035 + i * 0.012 }, { segments: 10 });
      tag.rotation.x = Math.PI / 2;
      this.add(tag);
    }
  }
}

function paintBoard(wM: number, hM: number, heading: string): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(0, 0, W, H);
  // The holes.
  const step = HOLE * PX_PER_M;
  ctx.fillStyle = 'rgba(30,20,12,0.85)';
  for (let y = step / 2 + HEADING_BAND * PX_PER_M; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The heading, painted white across the top.
  const band = HEADING_BAND * PX_PER_M;
  ctx.fillStyle = '#2f6a6a';
  ctx.fillRect(0, 0, W, band);
  setLines(ctx, { lines: [heading], x: W * 0.04, y: band * 0.1, w: W * 0.92, h: band * 0.8, family: POSTER, color: '#f0ead8', weight: '400' });
  return toTexture(canvas);
}
