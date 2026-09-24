import { Sheet, type Rng, azimuthOf, azimuthX, groundSquash, heightY, sizePx } from './Sheet';
import { between, mixHex } from './paint';

export interface TreeStyle {
  base: string;
  light: string;
  dark: string;
  trunk: string;
}

/** Summer foliage: limes and planes, oaks, a yellow-green, a blue-green and a copper beech. */
export const TREE_STYLES: readonly TreeStyle[] = [
  { base: '#4d8a3c', light: '#8dbb5a', dark: '#2b5a27', trunk: '#4a3a2a' },
  { base: '#3f7a41', light: '#6fa25a', dark: '#22482a', trunk: '#3e3229' },
  { base: '#5e9040', light: '#a3c463', dark: '#345e2a', trunk: '#5a4632' },
  { base: '#3a6f52', light: '#5f9a70', dark: '#1f4034', trunk: '#3a2f27' },
  { base: '#6b5a3a', light: '#9a8455', dark: '#3d3222', trunk: '#3a2d22' },
];
/** Pines and cedars, blue-black in the shade. */
export const CONIFER_STYLE: TreeStyle = { base: '#2f5a44', light: '#58806a', dark: '#16302a', trunk: '#4a3528' };
/** A weeping willow's pale, yellowish leaves. */
export const WILLOW_STYLE: TreeStyle = { base: '#7fa550', light: '#b7cf7a', dark: '#4d6e35', trunk: '#5a4a38' };

/**
 * The silhouettes a tree can have: a round broadleaf crown, a taller oval one, a columnar poplar,
 * a layered conifer and a weeping willow whose curtain of twigs hangs almost to the ground.
 */
export type TreeForm = 'round' | 'oval' | 'poplar' | 'conifer' | 'willow';

export interface TreeShape {
  /** Foot of the trunk, in metres from the eye. */
  x: number;
  z: number;
  /** Top of the canopy above the ground, and the canopy's half-width. */
  height: number;
  radius: number;
  style: TreeStyle;
  form?: TreeForm;
}

/** Vertical over horizontal radius of each form's crown. */
const TALLNESS: Record<TreeForm, number> = { round: 0.92, oval: 1.25, poplar: 2.8, conifer: 1, willow: 0.8 };

/**
 * A tree: a soft shadow on the ground, the trunk, then the crown. Broadleaf crowns are a lumpy
 * silhouette in the shade colour with shaded clumps over it (the lower ones darker and painted
 * first, so the sunlit crown lies on top) and a sprinkle of single leaves catching the light;
 * conifers are stacked tiers, willows a dome over a curtain of hanging twigs.
 */
export function paintTree(sheet: Sheet, random: Rng, tree: TreeShape): void {
  const { x, z, style } = tree;
  const form = tree.form ?? 'round';
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const groundY = heightY(0, d);
  const radius = Math.min(tree.radius, tree.height / (2 * TALLNESS[form]) - 0.3);
  const r = sizePx(radius, d);
  const ry = r * TALLNESS[form];
  const cy = heightY(tree.height, d) + ry;
  sheet.begin(d);
  sheet.wrapped(cx - r * 1.8, cx + r * 1.8, () => {
    const squash = groundSquash(d);
    const ctx = sheet.color;
    const sx = cx + r * 0.5;
    const sy = groundY - r * squash * 0.15;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.15);
    g.addColorStop(0, 'rgba(14,30,16,0.34)');
    g.addColorStop(0.7, 'rgba(14,30,16,0.22)');
    g.addColorStop(1, 'rgba(14,30,16,0)');
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, Math.max(0.05, squash * 0.85));
    ctx.translate(-sx, -sy);
    ctx.fillStyle = g;
    ctx.fillRect(sx - r * 1.2, sy - r * 1.2, r * 2.4, r * 2.4);
    ctx.restore();

    // The trunk, its right side in shade, a little wider at the foot.
    const trunkW = Math.max(1, sizePx(Math.max(0.22, radius * 0.1), d));
    const trunkTop = form === 'conifer' ? cy - ry * 0.5 : cy;
    const trunk = new Path2D();
    trunk.moveTo(cx - trunkW * 0.7, groundY);
    trunk.lineTo(cx + trunkW * 0.7, groundY);
    trunk.lineTo(cx + trunkW * 0.45, trunkTop);
    trunk.lineTo(cx - trunkW * 0.45, trunkTop);
    trunk.closePath();
    sheet.path(trunk, style.trunk);
    if (trunkW >= 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(cx, trunkTop, trunkW * 0.55, groundY - trunkTop);
    }

    if (form === 'conifer') paintConifer(sheet, random, style, cx, cy, r, ry);
    else if (form === 'willow') paintWillow(sheet, random, style, cx, cy, r, ry, groundY);
    else paintCrown(sheet, random, style, cx, cy, r, ry);
  });
}

/** A broadleaf crown centred on (cx, cy), radii r across and ry up, in texture pixels. */
function paintCrown(sheet: Sheet, random: Rng, style: TreeStyle, cx: number, cy: number, r: number, ry: number): void {
  const ctx = sheet.color;
  const silhouette = new Path2D();
  silhouette.ellipse(cx, cy, r * 0.84, ry * 0.84, 0, 0, Math.PI * 2);
  if (r >= 3) {
    // Lumps around the rim make the outline leafy rather than a ball.
    const lumps = Math.min(22, 7 + Math.floor(r / 3));
    for (let i = 0; i < lumps; i++) {
      const t = (i / lumps) * Math.PI * 2 + random() * 0.3;
      const lr = r * between(random, 0.2, 0.34);
      const lx = cx + Math.cos(t) * (r - lr * 0.9);
      const ly = cy + Math.sin(t) * (ry - lr * 0.9);
      silhouette.moveTo(lx + lr, ly);
      silhouette.arc(lx, ly, lr, 0, Math.PI * 2);
    }
  }
  sheet.path(silhouette, style.dark);
  if (r < 3) return;

  const count = r < 8 ? 6 : r < 20 ? 12 : 16 + Math.floor(random() * 6);
  const puffs = Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 0.66;
    return { ox: Math.cos(angle) * reach * r, oy: Math.sin(angle) * reach * ry, r: r * between(random, 0.26, 0.42) };
  }).sort((p, q) => q.oy - p.oy);
  for (const p of puffs) {
    const px = cx + p.ox;
    const py = cy + p.oy;
    const t = 0.5 - p.oy / (ry * 1.4); // 1 at the top of the crown .. 0 at the bottom
    const side = 0.5 - p.ox / (r * 3); // a little brighter on the sunny left
    const g = ctx.createRadialGradient(px - p.r * 0.3, py - p.r * 0.35, p.r * 0.05, px, py, p.r);
    g.addColorStop(0, mixHex(style.base, style.light, 0.1 + 0.5 * t + 0.2 * side));
    g.addColorStop(0.6, mixHex(style.dark, style.base, 0.4 + 0.45 * t));
    g.addColorStop(1, mixHex(style.dark, style.base, 0.25 * t));
    const puff = new Path2D();
    puff.arc(px, py, p.r, 0, Math.PI * 2);
    sheet.path(puff, g);
  }
  // Single leaves catching the light on the upper left, others in shade at the bottom.
  if (r < 7) return;
  const leaves = Math.min(220, Math.floor(r * ry * 0.25));
  const dot = Math.max(0.7, r / 45);
  for (let i = 0; i < leaves; i++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 0.92;
    const ox = Math.cos(angle) * reach;
    const oy = Math.sin(angle) * reach;
    const lit = -ox * 0.4 - oy > between(random, -0.3, 0.6);
    ctx.fillStyle = lit ? mixHex(style.light, '#e8f0c0', 0.25 * random()) : style.dark;
    ctx.globalAlpha = lit ? 0.4 : 0.3;
    ctx.fillRect(cx + ox * r, cy + oy * ry, dot * between(random, 1, 1.6), dot);
  }
  ctx.globalAlpha = 1;
}

/** A pine or cedar: tiers of drooping boughs, narrowing to a point. */
function paintConifer(sheet: Sheet, random: Rng, style: TreeStyle, cx: number, cy: number, r: number, ry: number): void {
  const top = cy - ry;
  const bottom = cy + ry;
  const tiers = Math.max(3, Math.min(7, Math.round(r / 3)));
  for (let i = 0; i < tiers; i++) {
    // From the bottom tier up, each narrower and overlapping the one under it.
    const k = i / tiers;
    const yb = bottom - (bottom - top) * k * 0.9;
    const yt = Math.max(top, yb - (bottom - top) * 0.42);
    const w = r * (1 - k * 0.8) * between(random, 0.92, 1.05);
    const tier = new Path2D();
    tier.moveTo(cx, yt);
    tier.quadraticCurveTo(cx + w * 0.55, yb - (yb - yt) * 0.35, cx + w, yb);
    tier.quadraticCurveTo(cx, yb - (yb - yt) * 0.18, cx - w, yb);
    tier.quadraticCurveTo(cx - w * 0.55, yb - (yb - yt) * 0.35, cx, yt);
    const g = sheet.color.createLinearGradient(cx - w, 0, cx + w, 0);
    g.addColorStop(0, style.light);
    g.addColorStop(0.45, style.base);
    g.addColorStop(1, style.dark);
    sheet.path(tier, g);
  }
}

/** A weeping willow: a low dome and a curtain of twigs falling from it nearly to the grass. */
function paintWillow(sheet: Sheet, random: Rng, style: TreeStyle, cx: number, cy: number, r: number, ry: number, groundY: number): void {
  const ctx = sheet.color;
  const hemY = cy + (groundY - cy) * 0.78;
  const curtain = new Path2D();
  curtain.moveTo(cx - r * 0.95, cy);
  curtain.quadraticCurveTo(cx - r * 1.12, hemY - (hemY - cy) * 0.3, cx - r * 1.05, hemY);
  curtain.lineTo(cx + r * 1.05, hemY);
  curtain.quadraticCurveTo(cx + r * 1.12, hemY - (hemY - cy) * 0.3, cx + r * 0.95, cy);
  curtain.closePath();
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, style.base);
  g.addColorStop(1, style.dark);
  sheet.path(curtain, g);
  paintCrown(sheet, random, style, cx, cy, r, ry);
  // The hanging twigs, pale where they catch the light.
  const twigs = Math.min(140, Math.floor(r * 3));
  ctx.lineWidth = Math.max(0.6, r / 40);
  for (let i = 0; i < twigs; i++) {
    const t = between(random, -1, 1);
    const x0 = cx + t * r * 0.9;
    const y0 = cy + ry * (0.1 + 0.3 * random());
    const y1 = hemY - random() * (hemY - cy) * 0.25;
    ctx.strokeStyle = random() < 0.5 - t * 0.3 ? style.light : style.dark;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + t * r * 0.18, (y0 + y1) / 2, x0 + t * r * 0.14, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
