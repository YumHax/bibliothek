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

export interface TreeShape {
  /** Foot of the trunk, in metres from the eye. */
  x: number;
  z: number;
  /** Top of the canopy above the ground, and the canopy's radius (keep it under ~0.36 of the height). */
  height: number;
  radius: number;
  style: TreeStyle;
}

/**
 * A broadleaf tree: its shadow on the ground, a trunk, then a canopy built as a dark silhouette
 * with a dozen small shaded clumps over it, the lower ones darker and painted first so the sunlit
 * crown lies on top.
 */
export function paintTree(sheet: Sheet, random: Rng, tree: TreeShape): void {
  const { x, z, height, radius, style } = tree;
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const groundY = heightY(0, d);
  const cy = heightY(height - radius, d);
  const r = sizePx(radius, d);
  sheet.begin(d);
  sheet.wrapped(cx - r * 1.6, cx + r * 1.6, () => {
    const squash = groundSquash(d);
    const shadow = new Path2D();
    shadow.ellipse(cx + r * 0.45, groundY - r * squash * 0.2, r * 1.05, Math.max(0.5, r * squash * 0.9), 0, 0, Math.PI * 2);
    sheet.color.fillStyle = 'rgba(16,36,18,0.32)';
    sheet.color.fill(shadow);

    const trunkW = Math.max(1, sizePx(radius * 0.14, d));
    sheet.rect(cx - trunkW / 2, cy, trunkW, groundY - cy, style.trunk);

    // The crown's silhouette: slightly wider than tall, in the shade colour.
    const crown = new Path2D();
    crown.ellipse(cx, cy, r * 1.02, r * 0.86, 0, 0, Math.PI * 2);
    sheet.path(crown, style.dark);
    if (r < 3) return;

    const count = r < 8 ? 5 : r < 20 ? 9 : 12 + Math.floor(random() * 5);
    const puffs = Array.from({ length: count }, () => {
      const angle = random() * Math.PI * 2;
      const reach = Math.sqrt(random()) * 0.72;
      return { ox: Math.cos(angle) * reach * r, oy: Math.sin(angle) * reach * r * 0.8, r: r * between(random, 0.3, 0.46) };
    }).sort((p, q) => q.oy - p.oy);
    for (const p of puffs) {
      const px = cx + p.ox;
      const py = cy + p.oy;
      const t = 0.5 - p.oy / (r * 1.4); // 1 at the top of the crown .. 0 at the bottom
      const g = sheet.color.createRadialGradient(px - p.r * 0.3, py - p.r * 0.35, p.r * 0.05, px, py, p.r);
      g.addColorStop(0, mixHex(style.base, style.light, 0.15 + 0.55 * t));
      g.addColorStop(0.6, mixHex(style.dark, style.base, 0.45 + 0.45 * t));
      g.addColorStop(1, mixHex(style.dark, style.base, 0.3 * t));
      const puff = new Path2D();
      puff.arc(px, py, p.r, 0, Math.PI * 2);
      sheet.path(puff, g);
    }
  });
}
