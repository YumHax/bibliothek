import { Sheet, type Rng, azimuthOf, azimuthX, groundSquash, heightY, sizePx } from './Sheet';
import { between, mixHex, pick } from './paint';
import { currentSeason } from './season';

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
  { base: '#6a3a38', light: '#9a5a4c', dark: '#3a2024', trunk: '#3a2d22' },
];
/** What the broadleaves turn to in autumn: birch yellow, maple orange and red, oak russet. */
const AUTUMN: readonly TreeStyle[] = [
  { base: '#c9962f', light: '#ecc862', dark: '#7a5a1e', trunk: '' },
  { base: '#d0702a', light: '#f0a050', dark: '#7a3a18', trunk: '' },
  { base: '#b0402a', light: '#d8684a', dark: '#6a2018', trunk: '' },
  { base: '#8a5a2a', light: '#b88a4a', dark: '#4a3018', trunk: '' },
];
const BLOSSOM = ['#f4c8d4', '#f8eef0', '#eaa8bc'];
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
  const { x, z } = tree;
  const form = tree.form ?? 'round';
  const { style, bare, blossom, litter } = inSeason(random, tree.style, form);
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const groundY = heightY(0, d);
  const radius = Math.min(tree.radius, tree.height / (2 * TALLNESS[form]) - 0.3);
  const r = sizePx(radius, d);
  const ry = r * TALLNESS[form];
  const cy = heightY(tree.height, d) + ry;
  // In the wind the crown sways, its top most (a few centimetres per metre of tree at full wind).
  const sway = Math.min(15, sizePx(SWAY_PER_METRE * tree.height, d));
  const phase = fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
  const crownTop = cy - ry * 1.15;
  sheet.begin(d);
  sheet.swaying(crownTop, groundY, sway, phase);
  sheet.wrapped(cx - r * 1.8, cx + r * 1.8, () => {
    // The crown's shadow, straight under it (see `Sheet.shadow`); a bare tree's is a thin one.
    const squash = groundSquash(d);
    const ctx = sheet.color;
    const sy = groundY;
    if (litter) paintLitter(sheet, random, litter, cx, sy, r, squash);
    const ground = sheet.ground;
    ground.save();
    ground.translate(cx, sy);
    ground.scale(1, Math.max(0.05, squash));
    ground.translate(-cx, -sy);
    const disc = new Path2D();
    disc.rect(cx - r * 1.2, sy - r * 1.2, r * 2.4, r * 2.4);
    sheet.shadow(disc, sheet.shadowFill(cx, sy, r * 1.1, bare ? 0.15 : 0.55));
    ground.restore();

    // The trunk, its right side in shade, a little wider at the foot.
    const trunkW = Math.max(1, sizePx(Math.max(0.22, radius * 0.1), d));
    // A bare tree's trunk stops where the crown would start; its limbs carry on from there.
    const trunkTop = form === 'conifer' ? cy - ry * 0.5 : bare ? cy + ry * (form === 'poplar' ? 0.88 : 0.55) : cy;
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

    if (bare) paintBare(sheet, random, style, form, cx, trunkTop, r, ry, trunkW, groundY);
    else if (form === 'conifer') paintConifer(sheet, random, style, cx, cy, r, ry);
    else if (form === 'willow') paintWillow(sheet, random, style, cx, cy, r, ry, groundY);
    else paintCrown(sheet, random, style, cx, cy, r, ry);
    if (blossom && !bare) paintBlossom(sheet, random, cx, cy, r, ry);
    if (sway >= 0.5) {
      const margin = new Path2D();
      margin.ellipse(cx, cy, r * 1.15 + sway + 1, ry * 1.15 + sway + 1, 0, 0, Math.PI * 2);
      sheet.swayMargin(margin, crownTop, groundY, sway, phase);
    }
  });
}

/** How far a tree's top sways at full wind, per metre of its height. */
const SWAY_PER_METRE = 0.035;

function fract(v: number): number {
  return v - Math.floor(v);
}

/**
 * A tree in the current season (see `season.ts`): fresh and sometimes in blossom in spring, turning
 * one by one through autumn (yellow, orange, red, russet, some already bare and leaves on the grass
 * under them late on), bare in winter but for the conifers.
 */
function inSeason(random: Rng, style: TreeStyle, form: TreeForm): { style: TreeStyle; bare: boolean; blossom: boolean; litter: string | null } {
  const { name, depth } = currentSeason();
  const plain = { style, bare: false, blossom: false, litter: null };
  if (form === 'conifer') return name === 'winter' ? { ...plain, style: tint(style, '#1e3a32', 0.25) } : plain;
  if (name === 'winter') return { ...plain, bare: true };
  if (name === 'spring') return { ...plain, style: tint(style, '#a8d070', 0.3), blossom: (form === 'round' || form === 'oval') && random() < 0.22 };
  if (name === 'summer') return plain;
  const turn = Math.min(1, Math.max(0, depth * 1.25 + between(random, -0.4, 0.3)));
  const autumn = pick(random, AUTUMN);
  if (turn > 0.9 && depth > 0.55) return { ...plain, bare: true, litter: autumn.base };
  return { ...plain, style: { base: mixHex(style.base, autumn.base, turn * 0.9), light: mixHex(style.light, autumn.light, turn * 0.9), dark: mixHex(style.dark, autumn.dark, turn * 0.8), trunk: style.trunk }, litter: turn > 0.5 ? autumn.base : null };
}

function tint(style: TreeStyle, hex: string, t: number): TreeStyle {
  return { base: mixHex(style.base, hex, t), light: mixHex(style.light, hex, t), dark: mixHex(style.dark, hex, t * 0.7), trunk: style.trunk };
}

/** Fallen leaves on the ground around a tree's foot. */
function paintLitter(sheet: Sheet, random: Rng, color: string, cx: number, groundY: number, r: number, squash: number): void {
  if (r < 4) return;
  const ctx = sheet.color;
  const dot = Math.max(0.8, r / 40);
  for (let i = Math.min(260, Math.floor(r * 5)); i > 0; i--) {
    const t = random() * Math.PI * 2;
    const k = Math.sqrt(random()) * 1.3;
    ctx.fillStyle = random() < 0.6 ? color : mixHex(color, '#5a4020', 0.5);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx + Math.cos(t) * k * r, groundY + Math.sin(t) * k * r * squash, dot * 1.3, dot);
  }
  ctx.globalAlpha = 1;
}

/** Bare branches forking up from the trunk into a crown of fine twigs (drawn as a haze), for winter and late autumn. */
function paintBare(sheet: Sheet, random: Rng, style: TreeStyle, form: TreeForm, cx: number, top: number, r: number, ry: number, trunkW: number, groundY: number): void {
  const ctx = sheet.color;
  const bark = mixHex(style.trunk, '#5a5048', 0.3);
  const spread = form === 'poplar' ? 0.18 : form === 'willow' ? 0.75 : 0.5;
  const cy = top - ry * (form === 'poplar' ? 0.85 : 0.55);
  // The fine twigs: a soft haze over the whole crown.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r, ry));
  g.addColorStop(0, `${bark}99`);
  g.addColorStop(0.65, `${bark}55`);
  g.addColorStop(1, `${bark}00`);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r / Math.max(r, ry), ry / Math.max(r, ry));
  ctx.translate(-cx, -cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r, ry), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = bark;
  if (r < 2.5) {
    // Too far for branches: a few strokes fanning up from the trunk.
    ctx.lineWidth = Math.max(0.5, trunkW * 0.4);
    for (const lean of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx + lean * r, top - ry * 1.1);
      ctx.stroke();
    }
    return;
  }
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number): void => {
    const x1 = x + Math.sin(angle) * len * (r / ry);
    const y1 = y - Math.cos(angle) * len;
    ctx.lineWidth = Math.max(0.5, width);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (depth === 0 || width < 0.4) return;
    const forks = depth > 2 ? 2 : random() < 0.6 ? 2 : 3;
    for (let i = 0; i < forks; i++) {
      const a = angle + (i - (forks - 1) / 2) * spread * between(random, 0.7, 1.3) + between(random, -0.12, 0.12);
      branch(x1, y1, form === 'willow' && depth === 1 ? a + Math.sign(a) * 1.2 : a, len * between(random, 0.62, 0.78), width * 0.62, depth - 1);
    }
  };
  const limbs = form === 'poplar' ? 3 : 4;
  for (let i = 0; i < limbs; i++) branch(cx, top, (i - (limbs - 1) / 2) * spread * 0.9, ry * (form === 'poplar' ? between(random, 0.8, 0.95) : between(random, 0.55, 0.7)), trunkW * 0.6, r > 12 ? 4 : 3);
  if (form === 'willow') {
    // Its long hanging switches, bare and yellowish.
    ctx.strokeStyle = '#a89a50';
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(0.5, r / 60);
    for (let i = Math.min(90, Math.floor(r * 2)); i > 0; i--) {
      const x0 = cx + between(random, -1, 1) * r * 0.9;
      const y0 = cy - ry * between(random, 0, 0.5);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + between(random, -0.1, 0.1) * r, y0 + (groundY - y0) * between(random, 0.5, 0.8));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** Spring blossom: flecks of pink and white all over a crown. */
function paintBlossom(sheet: Sheet, random: Rng, cx: number, cy: number, r: number, ry: number): void {
  if (r < 3) return;
  const ctx = sheet.color;
  const color = pick(random, BLOSSOM);
  const dot = Math.max(0.8, r / 30);
  for (let i = Math.min(400, Math.floor(r * ry * 0.6)); i > 0; i--) {
    const t = random() * Math.PI * 2;
    const k = Math.sqrt(random()) * 0.9;
    ctx.fillStyle = random() < 0.8 ? color : '#ffffff';
    ctx.globalAlpha = 0.75;
    ctx.fillRect(cx + Math.cos(t) * k * r, cy + Math.sin(t) * k * ry, dot, dot);
  }
  ctx.globalAlpha = 1;
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
