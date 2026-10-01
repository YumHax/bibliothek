import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, timber, METAL } from '../../materials/palette';
import { createCanvas, seededRandom, toTexture } from '@/graphics/canvas';
import { decal, WALL } from '../../surface/layers';

export interface PegboardOptions {
  width?: number;
  height?: number;
  /** Coils of cable hung at its right end. Default 2. */
  coils?: number;
  seed?: number;
}

const PX_PER_M = 320;
/** The holes' pitch, metres (an inch). */
const PITCH = 0.025;
const HOOK = paint(0x9a9ea4, 0.35);
const CABLES: readonly number[] = [0x1a1a1a, 0xe8e2d4, 0xb02a22, 0x2a5a9a, 0x3a7a4a];
const HANDLES: readonly number[] = [0xc83a2a, 0xe8b820, 0x2a5a9a, 0x1e1e20, 0x3a7a4a];

/**
 * The tool board over the repair bench: brown hardboard punched every inch, each tool's outline painted on it where
 * it hangs (the gaps say what is out on the bench), screwdrivers in a row, pliers and cutters, a hammer, a rack of
 * hook-up wire reels along the top, and coils of cable on hooks at the end. Wall-hung: origin at its centre on the
 * wall, +z into the room. Decoration: never collides; its parts merge.
 */
export class Pegboard extends Prop {
  readonly contactShadow = false;

  constructor(options: PegboardOptions = {}) {
    super();
    this.name = 'Pegboard';
    const W = options.width ?? 1.4;
    const H = options.height ?? 0.8;
    const random = seededRandom(options.seed ?? 31);
    const batten = timber(0x8a6a48, 0.7);
    // Battens hold it off the wall, the board over them.
    for (const y of [-H / 2 + 0.05, H / 2 - 0.05]) part(this, W, 0.04, 0.018, batten, { y, z: 0.009 });
    part(this, W, H, 0.005, paint(0x7a5a3a, 0.9), { z: 0.0205 });
    const tools: { x: number; y: number; w: number; h: number; hanging: boolean }[] = [];
    const face = 0.023;
    // Screwdrivers, hung by their handles.
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 0.12 + i * 0.05;
      const long = 0.14 + (i % 3) * 0.04;
      const hanging = !(i === 2 || i === 4);
      tools.push({ x, y: 0.12 - long / 2, w: 0.03, h: long + 0.1, hanging });
      if (!hanging) continue;
      this.add(cylinderMesh(0.012, 0.09, paint(HANDLES[i % HANDLES.length]!, 0.45), { x, y: 0.12, z: face + 0.02 }, { segments: 8 }));
      this.add(cylinderMesh(0.003, long, METAL.chrome(), { x, y: 0.12 - 0.045 - long / 2, z: face + 0.02 }, { segments: 6 }));
      this.add(cylinderMesh(0.002, 0.03, HOOK, { x, y: 0.12 + 0.05, z: face + 0.015 }, { segments: 6 }).rotateX(Math.PI / 2));
    }
    // Pliers and cutters, hung jaws down: two handles in a V.
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + 0.5 + i * 0.1;
      const hanging = i !== 1;
      tools.push({ x, y: -0.08, w: 0.07, h: 0.2, hanging });
      if (!hanging) continue;
      const color = paint(i ? 0xc83a2a : 0x2a5a9a, 0.5);
      for (const s of [-1, 1]) {
        const grip = part(this, 0.014, 0.12, 0.01, color, { x: x + s * 0.016, y: -0.03, z: face + 0.012 });
        grip.rotation.z = s * 0.18;
      }
      part(this, 0.018, 0.06, 0.008, METAL.steel(), { x, y: -0.12, z: face + 0.012 });
    }
    // The hammer, on two pegs.
    const hx = W * 0.12;
    tools.push({ x: hx, y: -0.05, w: 0.12, h: 0.3, hanging: true });
    part(this, 0.024, 0.28, 0.02, timber(0xb8905a, 0.6), { x: hx, y: -0.06, z: face + 0.014 });
    part(this, 0.1, 0.028, 0.028, METAL.steel(), { x: hx, y: 0.09, z: face + 0.016 });
    // The rack of hook-up wire along the top: a rod on two brackets, reels of all colours.
    const rackY = H / 2 - 0.12;
    const rackL = W * 0.42;
    const rackX = W / 2 - rackL / 2 - 0.08;
    for (const s of [-1, 1]) part(this, 0.012, 0.012, 0.08, HOOK, { x: rackX + (s * rackL) / 2, y: rackY, z: face + 0.04 });
    const rod = cylinderMesh(0.005, rackL, HOOK, { x: rackX, y: rackY, z: face + 0.07 }, { segments: 8 });
    rod.rotation.z = Math.PI / 2;
    this.add(rod);
    const reels = Math.floor(rackL / 0.07);
    for (let i = 0; i < reels; i++) {
      const reel = cylinderMesh(0.03, 0.04, paint(CABLES[i % CABLES.length]!, 0.55), { x: rackX - rackL / 2 + 0.05 + i * 0.07, y: rackY, z: face + 0.07 }, { segments: 14 });
      reel.rotation.z = Math.PI / 2;
      this.add(reel);
    }
    // Coils of cable on big hooks at the right end.
    const coils = options.coils ?? 2;
    for (let i = 0; i < coils; i++) {
      const x = W / 2 - 0.14 - i * 0.2;
      const y = -H / 2 + 0.3;
      this.add(cylinderMesh(0.004, 0.06, HOOK, { x, y: y + 0.09, z: face + 0.03 }, { segments: 6 }).rotateX(Math.PI / 2));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075 + random() * 0.02, 0.012, 8, 24), paint(CABLES[(i + 1) % CABLES.length]!, 0.6));
      ring.position.set(x, y, face + 0.05);
      ring.rotation.set(0.25, 0, random() * 0.3);
      ring.scale.y = 1.15;
      ring.castShadow = true;
      this.add(ring);
    }
    // The painted holes and outlines, one face over the board.
    const board = decal(W, H, new THREE.MeshStandardMaterial({ map: paintBoard(W, H, tools), roughness: 0.9 }), WALL.print);
    board.position.z += face;
    this.add(board);
  }
}

function paintBoard(wM: number, hM: number, tools: readonly { x: number; y: number; w: number; h: number; hanging: boolean }[]): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(0, 0, W, H);
  const step = PITCH * PX_PER_M;
  ctx.fillStyle = '#2a1e14';
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Each tool's place, outlined in white paint: solid where it is out.
  const px = (m: number): number => (m / wM + 0.5) * W;
  const py = (m: number): number => (0.5 - m / hM) * H;
  for (const t of tools) {
    ctx.fillStyle = t.hanging ? 'rgba(240,236,224,0.25)' : 'rgba(240,236,224,0.85)';
    const w = t.w * PX_PER_M;
    const h = t.h * PX_PER_M;
    ctx.beginPath();
    ctx.roundRect(px(t.x) - w / 2, py(t.y) - h / 2, w, h, w * 0.3);
    ctx.fill();
  }
  return toTexture(canvas);
}
