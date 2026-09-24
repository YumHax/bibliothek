import { Sheet, outline, sizePx, worldPoint } from './Sheet';
import { shade } from './paint';

/**
 * Where a small solid stands on the ground: the centre of its footprint (metres from the eye) and
 * the unit direction its length runs along (its width runs across it).
 */
export interface Footprint {
  x: number;
  z: number;
  along: [number, number];
}

/** A footprint lined up with the street at (x, z): along Front Street or along Park Street, whichever is nearer. */
export function streetFootprint(x: number, z: number): Footprint {
  return { x, z, along: z > -x ? [1, 0] : [0, 1] };
}

/** The ground point `u` metres along and `v` across a footprint's centre, at `h` above the street. */
export function footPoint(f: Footprint, u: number, v: number, h: number): [number, number] {
  return worldPoint(f.x + f.along[0] * u - f.along[1] * v, f.z + f.along[1] * u + f.along[0] * v, h);
}

/**
 * An upright box (a bench seat, a bin, a kiosk, a shelter roof): `length` along the footprint,
 * `width` across it, from `h0` to `h1` above the street, with its centre shifted `du`, `dv`. Only
 * the faces turned to the eye are painted, the top lit, the faces in shade by how they turn.
 */
export function paintBox(sheet: Sheet, f: Footprint, length: number, width: number, h0: number, h1: number, color: string, glass = 0, du = 0, dv = 0): void {
  const d = Math.hypot(f.x, f.z);
  const L = length / 2;
  const W = width / 2;
  const P = (u: number, v: number, h: number): [number, number] => footPoint(f, du + u, dv + v, h);
  sheet.begin(d, glass);
  // Each side face: two corners (u, v), its outward normal in the footprint frame.
  const faces: [[number, number], [number, number], [number, number], number][] = [
    [[-L, -W], [L, -W], [0, -1], 0.78],
    [[L, W], [-L, W], [0, 1], 0.78],
    [[-L, W], [-L, -W], [-1, 0], 0.62],
    [[L, -W], [L, W], [1, 0], 0.62],
  ];
  for (const [[u0, v0], [u1, v1], [nu, nv], k] of faces) {
    // World normal against the direction back to the eye from the face's middle.
    const nx = f.along[0] * nu - f.along[1] * nv;
    const nz = f.along[1] * nu + f.along[0] * nv;
    const cx = f.x + f.along[0] * (du + (u0 + u1) / 2) - f.along[1] * (dv + (v0 + v1) / 2);
    const cz = f.z + f.along[1] * (du + (u0 + u1) / 2) + f.along[0] * (dv + (v0 + v1) / 2);
    if (nx * -cx + nz * -cz <= 0) continue;
    sheet.path(outline([P(u0, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v0, h1)]), shade(color, k));
  }
  sheet.path(outline([P(-L, -W, h1), P(L, -W, h1), P(L, W, h1), P(-L, W, h1)]), shade(color, 1.1));
}

/** A thin upright post from `h0` to `h1` at (x, z), `width` metres across (at least a texel). */
export function paintPost(sheet: Sheet, x: number, z: number, h0: number, h1: number, width: number, color: string): void {
  const d = Math.hypot(x, z);
  const [cx, yb] = worldPoint(x, z, h0);
  const [, yt] = worldPoint(x, z, h1);
  const w = Math.max(1, sizePx(width, d));
  sheet.begin(d);
  sheet.rect(cx - w / 2, yt, w, yb - yt, color);
}

/** A soft shadow on the ground around (x, z), `rx` metres along x and `rz` along z. */
export function paintGroundShadow(sheet: Sheet, x: number, z: number, rx: number, rz: number, strength = 0.3): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    pts.push(worldPoint(x + Math.cos(t) * rx, z + Math.sin(t) * rz, 0));
  }
  sheet.color.fillStyle = `rgba(10,14,20,${strength})`;
  sheet.color.fill(outline(pts));
}
