import * as THREE from 'three';
import { createCanvas, toTexture, seededRandom } from '@/covers/generated/canvasUtils';
import type { DisplaySlot, StallLike } from './stallTypes';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import { Crate } from '../props/Crate';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface MarketStallOptions {
  /** Text on the sign hung from the awning (a platform's name). */
  sign: string;
  /** Colour of the cloth over the table and of the awning's stripes. */
  cloth?: number;
  /** Accent for the sign. */
  accent?: number;
  width?: number;
  /** A striped awning on four poles over the table. Default true. */
  awning?: boolean;
  /** Boxes of stock under the table. Default true. */
  clutter?: boolean;
  /** Varies the clutter. */
  seed?: number;
}

export type { DisplaySlot } from './stallTypes';

const DEFAULT_WIDTH = 1.6;
const DEPTH = 0.65;
const TOP_HEIGHT = 0.78;
const TOP_THICKNESS = 0.03;
/** Gap between two boxes on display. */
const BOX_GAP = 0.05;
/** Room kept free at either end of the table. */
const END_MARGIN = 0.08;
const CRATE_DEPTH = 0.2;
const CRATE_H = 0.22;
const CRATE_Z = -DEPTH / 2 + 0.12;
/** The plane the boxes lean against. */
const CRATE_FRONT = CRATE_Z + CRATE_DEPTH / 2;
/** Centre line of the row of boxes lying flat, clear of the leaning row's tags and of the table's front edge. */
const FLAT_Z = 0.15;
/** How far a lying box may be turned off square. */
const FLAT_YAW = 0.07;
/** The awning: poles this far outside the table's edges, the back pair taller so the canopy sheds towards the aisle, the canopy overhanging all round. */
const POLE_R = 0.02;
const POLE_OUT = 0.08;
const BACK_POLE_H = 2.5;
const FRONT_POLE_H = 2.3;
const OVERHANG = 0.22;
const VALANCE_H = 0.26;
/** Width of one awning stripe. */
const STRIPE_W = 0.18;
const CREAM = '#f1e8d6';
/** The sign is painted at this scale, one text size, and grows with its text (never narrower than `SIGN_MIN_PX`). */
const SIGN_PX_PER_M = 1000;
const SIGN_H_PX = 200;
const SIGN_FONT_PX = 84;
const SIGN_PAD_PX = 50;
const SIGN_MIN_PX = 620;

const WOOD = woodMaterial(0x8b6a44, 0.6);
const IRON = matte(0x2a2623, 0.6);
const CARD = matte(0xd9c9a8, 0.85);

/**
 * A flea-market stall: a trestle table under a checked cloth hanging down the front, a row of
 * crates at the back for boxes to lean on, and over it all a striped awning on four poles with a
 * scalloped valance the sign hangs from; boxes of stock wait under the table. `layout()` says where
 * the boxes go (stall-local): a row leaning on the crates, then a second row lying face up in front
 * of it. Local +z faces the aisle. Collides (the table and the poles).
 */
export class MarketStall extends THREE.Group implements StallLike {
  readonly width: number;
  readonly topHeight = TOP_HEIGHT;
  /** Behind the table, clear of the awning's back poles. */
  readonly vendorAt: [number, number] = [0, -0.75];
  /** The top of the aisle-side left pole. */
  readonly pennantAt: THREE.Vector3;
  private readonly seed: number;

  /** Boxes `boxWidth` wide that fit in one row of a table `width` long. */
  static perRow(boxWidth: number, width = DEFAULT_WIDTH): number {
    return Math.max(0, Math.floor((width - 2 * END_MARGIN + BOX_GAP) / (boxWidth + BOX_GAP)));
  }

  /** Boxes `boxWidth` wide a stall shows at most: both rows full. */
  static capacity(boxWidth: number, width = DEFAULT_WIDTH): number {
    return 2 * MarketStall.perRow(boxWidth, width);
  }

  constructor(options: MarketStallOptions) {
    super();
    this.name = 'MarketStall';
    this.width = options.width ?? DEFAULT_WIDTH;
    this.seed = options.seed ?? 1;
    this.pennantAt = new THREE.Vector3(-this.width / 2 - POLE_OUT, options.awning === false ? 1.75 : FRONT_POLE_H, options.awning === false ? -DEPTH / 2 + 0.05 : DEPTH / 2 + POLE_OUT);
    const clothColor = new THREE.Color(options.cloth ?? 0x6b2f2a);
    const w = this.width;
    const random = seededRandom(this.seed * 48271);

    // Trestles: two A-frames, simplified to slanted legs under a beam.
    for (const x of [-w / 2 + 0.18, w / 2 - 0.18]) {
      for (const [sz, tilt] of [[-1, 0.18], [1, -0.18]] as const) {
        const leg = boxMesh(0.035, TOP_HEIGHT - 0.06, 0.035, WOOD, { x, y: (TOP_HEIGHT - 0.06) / 2, z: sz * 0.22 });
        leg.rotation.x = tilt;
        this.add(leg);
      }
      this.add(boxMesh(0.04, 0.04, DEPTH * 0.9, WOOD, { x, y: TOP_HEIGHT - 0.05 }));
    }
    this.add(boxMesh(w, TOP_THICKNESS, DEPTH, WOOD, { y: TOP_HEIGHT - TOP_THICKNESS / 2 }));
    // Cloth: the top and the flap hanging down the front, a checked weave in the stall's colour.
    const check = paintCheck(clothColor);
    const clothTop = boxMesh(w + 0.04, 0.01, DEPTH + 0.02, tiled(check, (w + 0.04) / 0.5, (DEPTH + 0.02) / 0.5), { y: TOP_HEIGHT + 0.005 });
    clothTop.castShadow = false;
    const flapH = TOP_HEIGHT * 0.7;
    const flap = boxMesh(w + 0.04, flapH, 0.01, tiled(check, (w + 0.04) / 0.5, flapH / 0.5), { y: TOP_HEIGHT - flapH / 2, z: DEPTH / 2 + 0.012 });
    flap.castShadow = false;
    this.add(clothTop, flap);
    // Crates at the back the boxes lean against.
    for (let x = -w / 2 + 0.2; x <= w / 2 - 0.2; x += 0.4) {
      this.add(boxMesh(0.36, CRATE_H, CRATE_DEPTH, CARD, { x, y: TOP_HEIGHT + 0.01 + CRATE_H / 2, z: CRATE_Z }));
    }

    if (options.clutter !== false) {
      // Stock in waiting under the table, seen from the sides and the back.
      const seed = Math.floor(random() * 1000);
      const boxes = new Crate({ style: 'cardboard', width: 0.4, height: 0.3, depth: 0.32, seed });
      boxes.position.set(-w / 4, 0, 0.04);
      boxes.rotation.y = (random() - 0.5) * 0.4;
      const crate = new Crate({ style: 'wood', width: 0.44, height: 0.26, depth: 0.34, seed: seed + 1 });
      crate.position.set(w / 4, 0, -0.02);
      crate.rotation.y = (random() - 0.5) * 0.4;
      this.add(boxes, crate);
    }

    const painted = paintSign(options.sign, options.accent ?? clothColor.getHex());
    const signMat = new THREE.MeshStandardMaterial({ map: painted.map, roughness: 0.8 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(painted.width, SIGN_H_PX / SIGN_PX_PER_M), signMat);
    sign.castShadow = false;
    if (options.awning !== false) {
      this.buildAwning(clothColor);
      // The sign hangs on the valance, read from the aisle.
      sign.position.set(0, FRONT_POLE_H - VALANCE_H / 2 - 0.03, DEPTH / 2 + POLE_OUT + OVERHANG + 0.018);
    } else {
      const post = cylinderMesh(0.015, 1.75, IRON, { x: -w / 2 + 0.1, y: 1.75 / 2, z: -DEPTH / 2 + 0.05 }, { segments: 8 });
      this.add(post);
      sign.position.set(-w / 2 + 0.1 + 0.32, 1.75 - 0.14, -DEPTH / 2 + 0.06);
    }
    this.add(sign);

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }

  get footprint(): THREE.Box3 {
    const hx = this.width / 2 + POLE_OUT + POLE_R;
    const hz = DEPTH / 2 + POLE_OUT + POLE_R;
    return new THREE.Box3(new THREE.Vector3(-hx, 0, -hz), new THREE.Vector3(hx, TOP_HEIGHT + 0.3, hz));
  }

  capacityFor(boxWidth: number): number {
    return MarketStall.capacity(boxWidth, this.width);
  }

  /**
   * Where `count` boxes `boxWidth` wide go (one stall holds one platform, so one size), stall-local.
   * The leaning row fills first, centre outwards (the first box, the showpiece, stands in the
   * middle), then the lying row, centred. Never more than `capacity()` slots: the stock is drawn to fit.
   */
  layout(boxWidth: number, count: number): DisplaySlot[] {
    const perRow = MarketStall.perRow(boxWidth, this.width);
    const lean = Math.min(count, perRow);
    const flat = Math.min(count - lean, perRow);
    const row = (n: number): number[] => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (boxWidth + BOX_GAP));
    // Centre outwards: middle first, then alternately left and right.
    const leanXs = row(lean).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const random = seededRandom(this.seed * 7919);
    return [
      ...leanXs.map((x) => ({ position: new THREE.Vector3(x, TOP_HEIGHT + 0.012, CRATE_FRONT), pose: 'lean' as const, yaw: 0 })),
      ...row(flat).map((x) => ({ position: new THREE.Vector3(x, TOP_HEIGHT + 0.012, FLAT_Z), pose: 'flat' as const, yaw: (random() - 0.5) * 2 * FLAT_YAW })),
    ];
  }

  /** A spot on top of the crates at the back (stall-local), for something small to stand on: the radio. */
  crateTop(x: number): THREE.Vector3 {
    return new THREE.Vector3(x, TOP_HEIGHT + 0.01 + CRATE_H, CRATE_Z);
  }

  /** Four poles, rails between their tops, a sloping striped canopy and a scalloped valance along the aisle edge. */
  private buildAwning(cloth: THREE.Color): void {
    const w = this.width;
    const px = w / 2 + POLE_OUT;
    const pz = DEPTH / 2 + POLE_OUT;
    for (const sx of [-1, 1]) {
      for (const [sz, h] of [[-1, BACK_POLE_H], [1, FRONT_POLE_H]] as const) {
        this.add(cylinderMesh(POLE_R, h, IRON, { x: sx * px, y: h / 2, z: sz * pz }, { segments: 10 }));
      }
      // Side rail from the back pole's top down to the front one's.
      const run = 2 * pz;
      const rise = BACK_POLE_H - FRONT_POLE_H;
      const rail = boxMesh(0.03, 0.03, Math.hypot(run, rise), IRON, { x: sx * px, y: (BACK_POLE_H + FRONT_POLE_H) / 2, z: 0 });
      rail.rotation.x = Math.atan2(rise, run);
      this.add(rail);
    }
    this.add(boxMesh(2 * px, 0.03, 0.03, IRON, { y: BACK_POLE_H - 0.015, z: -pz }));
    this.add(boxMesh(2 * px, 0.03, 0.03, IRON, { y: FRONT_POLE_H - 0.015, z: pz }));

    // The canopy: a slab over the rails, sloping towards the aisle, overhanging all round.
    const run = 2 * pz + 2 * OVERHANG;
    const rise = BACK_POLE_H - FRONT_POLE_H;
    const tilt = Math.atan2(BACK_POLE_H - FRONT_POLE_H, 2 * pz);
    const canopyW = 2 * px + 2 * OVERHANG;
    const stripes = paintStripes(cloth, false);
    const canopy = boxMesh(canopyW, 0.012, Math.hypot(run, rise * (run / (2 * pz))), tiled(stripes, canopyW / (2 * STRIPE_W), 1), { y: (BACK_POLE_H + FRONT_POLE_H) / 2 + 0.02 });
    canopy.rotation.x = tilt;
    canopy.castShadow = false;
    this.add(canopy);
    // The valance hanging from the front edge, its bottom cut in scallops (alpha in the texture).
    const frontEdgeY = FRONT_POLE_H + 0.02 - OVERHANG * Math.tan(tilt);
    const valanceMat = tiled(paintStripes(cloth, true), canopyW / (2 * STRIPE_W), 1);
    valanceMat.transparent = true;
    valanceMat.alphaTest = 0.5;
    valanceMat.side = THREE.DoubleSide;
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(canopyW, VALANCE_H), valanceMat);
    valance.position.set(0, frontEdgeY - VALANCE_H / 2, pz + OVERHANG + 0.006);
    valance.castShadow = false;
    valance.receiveShadow = true;
    this.add(valance);
  }
}

/** A material carrying `map` repeated `u` x `v` times over its face (its own clone, so each face repeats differently). */
function tiled(map: THREE.Texture, u: number, v: number): THREE.MeshStandardMaterial {
  const tex = map.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(u, v);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
}

/** Gingham: the cloth colour crossed by paler bands, one tile = 0.5 m of cloth. */
function paintCheck(cloth: THREE.Color): THREE.Texture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  ctx.fillStyle = `#${cloth.getHexString()}`;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,245,225,0.22)';
  const cell = S / 8;
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(i * cell, 0, cell, S);
    ctx.fillRect(0, i * cell, S, cell);
  }
  // Weave: fine threads.
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < S; y += 3) ctx.fillRect(0, y, S, 1);
  return toTexture(canvas, 4);
}

/** Two awning stripes (cloth colour, cream) per tile; `scalloped` cuts the bottom edge into half-discs for the valance. */
function paintStripes(cloth: THREE.Color, scalloped: boolean): THREE.Texture {
  const W = 256;
  const H = scalloped ? 192 : 256;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = `#${cloth.getHexString()}`;
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = CREAM;
  ctx.fillRect(W / 2, 0, W / 2, H);
  // Sun-faded canvas: a light grain over both stripes.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  if (scalloped) {
    // A hem line, then the scallops: one half-disc per stripe, cut out of the alpha below the hem.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, H * 0.7, W, 3);
    ctx.globalCompositeOperation = 'destination-out';
    const r = W / 4;
    for (const cx of [0, W / 2, W]) {
      ctx.beginPath();
      ctx.arc(cx, H, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return toTexture(canvas, 4);
}

/** The sign, as wide as its text needs at one readable size (a long platform name gets a long sign). Returns the texture and the sign's width in metres. */
function paintSign(text: string, accent: number): { map: THREE.Texture; width: number } {
  const [measure] = createCanvas(1, 1);
  const mctx = measure.getContext('2d')!;
  mctx.font = `bold ${SIGN_FONT_PX}px Georgia, serif`;
  const W = Math.max(SIGN_MIN_PX, Math.ceil(mctx.measureText(text).width) + 2 * SIGN_PAD_PX);
  const H = SIGN_H_PX;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `#${new THREE.Color(accent).getHexString()}`;
  ctx.fillRect(0, 0, W, 16);
  ctx.fillRect(0, H - 16, W, 16);
  ctx.fillStyle = '#2a1a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${SIGN_FONT_PX}px Georgia, serif`;
  ctx.fillText(text, W / 2, H / 2);
  return { map: toTexture(canvas, 4), width: W / SIGN_PX_PER_M };
}
