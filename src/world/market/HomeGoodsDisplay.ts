import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, fitFontSize, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from '../props/Prop';
import { fabric, wood as woodMaterial } from '@/world/materials/finishes';

/** The five things a household stall sells. */
export type HomeGoodsId = 'bookcase' | 'rug' | 'lamp' | 'poster' | 'crt';

export const HOME_GOODS_IDS: readonly HomeGoodsId[] = ['bookcase', 'rug', 'lamp', 'poster', 'crt'];

export interface HomeGoodsOptions {
  /** Click on item `id`. */
  onActivate: (id: HomeGoodsId, session: SessionActions) => void;
  /** Hover caption of item `id`. */
  label: (id: HomeGoodsId) => string;
}

/** Where each item stands, relative to the table top's centre (x along the table, +z to the buyer). */
const OFFSETS: Record<HomeGoodsId, [x: number, z: number]> = {
  bookcase: [-0.58, -0.08],
  rug: [-0.3, 0.02],
  lamp: [-0.04, 0],
  poster: [0.26, 0],
  crt: [0.58, -0.02],
};
/** Added to an item's emissive while hovered. */
const HOVER_GLOW = new THREE.Color(0x1a1612);
const BLACK = new THREE.Color(0x000000);

const CARDBOARD = 0xc29a68;
const CHROME = { color: 0xc8c8c8, roughness: 0.25, metalness: 0.9 };

/**
 * One thing for sale on a household stall's table, clickable on its own: a flat-packed bookcase
 * leaning on a crate, a rolled rug tied with string, a lava lamp, a poster tube with a small
 * framed print, a portable TV. Placed one by one (the Zone only registers the interactables it is
 * handed, not their children): origin on the table top, +z to the buyer, `offset` its suggested
 * spot relative to the table top's centre. Decoration: never collides. `setAvailable(false)`
 * hides it and shrinks its hitbox out of reach, like `BookcaseKit`.
 */
export class HomeGoodsItem extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  /** Suggested position relative to the table top's centre. */
  readonly offset: THREE.Vector3;
  private readonly glowing: { material: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];

  constructor(readonly goodsId: HomeGoodsId, private readonly options: HomeGoodsOptions) {
    super();
    this.name = `HomeGoods:${goodsId}`;
    const [x, z] = OFFSETS[goodsId];
    this.offset = new THREE.Vector3(x, 0, z);
    const size = BUILDERS[goodsId](this);
    const hitbox = invisibleHitbox(size.w, size.h, size.d, { y: size.h / 2, z: size.z ?? 0 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    const seen = new Set<THREE.Material>();
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh === hitbox) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const standard = m as THREE.MeshStandardMaterial;
        if (seen.has(m) || !standard.isMeshStandardMaterial) continue;
        seen.add(m);
        this.glowing.push({ material: standard, base: standard.emissive.clone() });
      }
    });
  }

  setAvailable(available: boolean): void {
    this.visible = available;
    this.hitboxes[0]?.scale.setScalar(available ? 1 : 1e-4);
  }

  setHovered(hovered: boolean): void {
    for (const { material, base } of this.glowing) material.emissive.copy(base).add(hovered ? HOVER_GLOW : BLACK);
  }

  label(): string | null {
    return this.visible ? this.options.label(this.goodsId) : null;
  }

  activate(session: SessionActions): void {
    if (this.visible) this.options.onActivate(this.goodsId, session);
  }
}

/** The five items, each with its suggested `offset` from the table top's centre (spread along x within 1.5 m). */
export function homeGoodsItems(options: HomeGoodsOptions): HomeGoodsItem[] {
  return HOME_GOODS_IDS.map((id) => new HomeGoodsItem(id, options));
}

/**
 * The household stall's goods as a set: `items` to place one by one (each at the table top's
 * centre plus its `offset`), and `setAvailable(id, …)` to take one off sale. Not an Object3D itself.
 */
export class HomeGoodsDisplay {
  readonly items: readonly HomeGoodsItem[];

  constructor(options: HomeGoodsOptions) {
    this.items = homeGoodsItems(options);
  }

  setAvailable(id: HomeGoodsId, available: boolean): void {
    this.items.find((item) => item.goodsId === id)?.setAvailable(available);
  }
}

/** Builds an item's meshes into `g` (its own materials, so a hover lights only it) and returns its hitbox's size. */
type Builder = (g: THREE.Group) => { w: number; h: number; d: number; z?: number };

const BUILDERS: Record<HomeGoodsId, Builder> = {
  /** A mini flat-pack box leaning back on a little crate, a bookcase drawn on it, two straps. */
  bookcase: (g) => {
    const W = 0.3;
    const H = 0.45;
    const T = 0.05;
    const lean = 0.18;
    part(g, 0.26, 0.1, 0.14, woodMaterial(0xa8804f, 0.8), { y: 0.05, z: -0.09 });
    const box = new THREE.Group();
    // Its back face rests on the crate's top front edge.
    box.position.z = T;
    box.rotation.x = -lean;
    g.add(box);
    const front = new THREE.MeshStandardMaterial({ map: paintFlatPack(), roughness: 0.9 });
    const card = matte(CARDBOARD, 0.9);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [card, card, card, card, front, card]);
    slab.position.set(0, H / 2, -T / 2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    box.add(slab);
    const strap = matte(0xe8e2d4, 0.5);
    for (const y of [0.1, 0.34]) part(box, W + 0.004, 0.018, T + 0.004, strap, { y, z: -T / 2 }).castShadow = false;
    return { w: W + 0.04, h: H + 0.02, d: 0.24, z: -0.04 };
  },
  /** A rug rolled up along z, a stripe pattern on the roll, a spiral on its ends, two string ties. */
  rug: (g) => {
    const R = 0.055;
    const L = 0.5;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 20), [
      fabric({ map: paintRugRoll(), roughness: 1 }),
      fabric({ map: paintRugEnd(), roughness: 1 }),
      fabric({ map: paintRugEnd(), roughness: 1 }),
    ]);
    roll.rotation.x = Math.PI / 2;
    roll.position.y = R;
    roll.castShadow = true;
    roll.receiveShadow = true;
    g.add(roll);
    const string = matte(0xd8c8a0, 0.9);
    for (const z of [-L * 0.3, L * 0.3]) {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(R + 0.002, 0.003, 6, 20), string);
      tie.position.set(0, R, z);
      tie.castShadow = false;
      g.add(tie);
    }
    return { w: 2 * R + 0.04, h: 2 * R + 0.03, d: L + 0.02 };
  },
  /** A lava lamp: a chrome cone base, a tapered orange glass with glowing blobs inside, a chrome cap. */
  lamp: (g) => {
    const chrome = new THREE.MeshStandardMaterial(CHROME);
    g.add(cylinderMesh(0.028, 0.1, chrome, { y: 0.05 }, { radiusBottom: 0.06, segments: 20 }));
    const glassH = 0.2;
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.036, glassH, 20),
      new THREE.MeshStandardMaterial({ color: 0xff9a4a, emissive: 0xff5a1a, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    glass.position.y = 0.1 + glassH / 2;
    glass.castShadow = false;
    const blob = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5010, emissiveIntensity: 1.6, roughness: 0.4 });
    for (const [y, r, x] of [[0.13, 0.022, 0.004], [0.2, 0.014, -0.004], [0.26, 0.011, 0.003]] as const) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), blob);
      b.position.set(x, y, 0);
      b.scale.y = 1.3;
      b.castShadow = false;
      g.add(b);
    }
    g.add(glass);
    g.add(cylinderMesh(0.012, 0.05, chrome, { y: 0.1 + glassH + 0.025 }, { radiusBottom: 0.021, segments: 16 }));
    return { w: 0.14, h: 0.36, d: 0.14 };
  },
  /** A cardboard poster tube lying along z, and a small framed print leaning on a kickstand beside it. */
  poster: (g) => {
    const tube = cylinderMesh(0.035, 0.45, matte(0xb89060, 0.85), { x: -0.06, y: 0.035 }, { segments: 16 });
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
    const cap = matte(0x2a2a2a, 0.5);
    for (const z of [-0.23, 0.23]) {
      const c = cylinderMesh(0.037, 0.02, cap, { x: -0.06, y: 0.035, z }, { segments: 16 });
      c.rotation.x = Math.PI / 2;
      g.add(c);
    }
    const W = 0.18;
    const H = 0.24;
    const frameGroup = new THREE.Group();
    frameGroup.position.set(0.07, 0, 0.02);
    frameGroup.rotation.x = -0.2;
    const frame = matte(0x1e1c1a, 0.5);
    const print = new THREE.MeshStandardMaterial({ map: paintPrint(), roughness: 0.4 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.015), [frame, frame, frame, frame, print, frame]);
    board.position.y = H / 2;
    board.castShadow = true;
    board.receiveShadow = true;
    frameGroup.add(board);
    g.add(frameGroup);
    const kick = part(g, 0.02, H * 0.8, 0.008, frame, { x: 0.07, y: H * 0.38, z: -0.04 });
    kick.rotation.x = 0.35;
    return { w: 0.3, h: H + 0.02, d: 0.47 };
  },
  /** A small portable TV: a grey case, a dark screen, two knobs, a handle, an aerial. */
  crt: (g) => {
    const W = 0.24;
    const H = 0.2;
    const D = 0.22;
    const plastic = matte(0x5a5a5e, 0.5);
    const dark = matte(0x151515, 0.6);
    part(g, W, H, D * 0.7, plastic, { y: H / 2, z: D / 2 - D * 0.35 });
    part(g, W * 0.7, H * 0.75, D * 0.3, plastic, { y: H * 0.42, z: -D / 2 + D * 0.15 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, H * 0.62), new THREE.MeshStandardMaterial({ color: 0x1e2a26, roughness: 0.15, metalness: 0.1 }));
    screen.position.set(-W * 0.1, H * 0.54, D / 2 + 0.002);
    g.add(screen);
    for (const y of [H * 0.7, H * 0.45]) {
      const knob = cylinderMesh(0.011, 0.012, dark, { x: W * 0.36, y, z: D / 2 + 0.006 }, { segments: 10 });
      knob.rotation.x = Math.PI / 2;
      g.add(knob);
    }
    part(g, W * 0.55, 0.012, 0.018, dark, { y: H + 0.025 });
    for (const x of [-W * 0.27, W * 0.27]) part(g, 0.014, 0.026, 0.018, dark, { x, y: H + 0.013 });
    const mast = new THREE.Group();
    mast.position.set(W / 2 - 0.03, H, -0.04);
    mast.rotation.z = -0.5;
    mast.add(cylinderMesh(0.0025, 0.26, new THREE.MeshStandardMaterial(CHROME), { y: 0.13 }, { segments: 6 }));
    g.add(mast);
    return { w: W + 0.04, h: H + 0.06, d: D + 0.04 };
  },
};

/** The flat-pack's printed face: a line drawing of the bookcase, the brand, "flat-pack · easy assembly". */
function paintFlatPack(): THREE.Texture {
  const W = 300;
  const H = 450;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#c29a68';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2f3a44';
  ctx.lineWidth = 6;
  ctx.strokeRect(90, 90, 120, 280);
  ctx.lineWidth = 4;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(90, 90 + i * 56);
    ctx.lineTo(210, 90 + i * 56);
    ctx.stroke();
  }
  ctx.fillStyle = '#2f3a44';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFontSize(ctx, 'BÖKSHELF', W * 0.8, 44, 18, `Impact, "Arial Narrow", ${FONT}`, '900');
  ctx.fillText('BÖKSHELF', W / 2, 46);
  ctx.font = `20px ${FONT}`;
  ctx.fillText('flat-pack · easy assembly', W / 2, 408);
  return toTexture(canvas, 2);
}

/** The rolled rug's outside: bands of red, cream and blue with a fringe-like dash. */
function paintRugRoll(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 128);
  const bands = ['#8a2a22', '#e8dcc0', '#2f4a6a', '#e8dcc0'];
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, (i * 128) / bands.length, 256, 128 / bands.length);
  });
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < 256; x += 6) ctx.fillRect(x, 0, 2, 128);
  return toTexture(canvas, 2);
}

/** The roll's end: a spiral of the rug's layers. */
function paintRugEnd(): THREE.Texture {
  const [canvas, ctx] = createCanvas(128, 128);
  ctx.fillStyle = '#8a2a22';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 12; a += 0.1) {
    const r = 2 + a * 1.6;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  return toTexture(canvas, 2);
}

/** The framed print: a sunset over a grid, "PLAY" across it. */
function paintPrint(): THREE.Texture {
  const W = 180;
  const H = 240;
  const [canvas, ctx] = createCanvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, '#2a1a4a');
  sky.addColorStop(1, '#ff6a4a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.6);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.6, 44, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#1a0a2a';
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  ctx.strokeStyle = '#ff4ad8';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = H * 0.6 + (i * i + 1) * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 10, H * 0.6);
    ctx.lineTo(W / 2 + i * 50, H);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 40px Impact, "Arial Narrow", ${FONT}`;
  ctx.fillText('PLAY', W / 2, H * 0.22);
  // A white mount round it.
  ctx.strokeStyle = '#f4f0e6';
  ctx.lineWidth = 12;
  ctx.strokeRect(0, 0, W, H);
  return toTexture(canvas, 2);
}
