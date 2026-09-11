import { Sheet, type Rng, type Fill, SCENE_HEIGHT, azimuthOf, azimuthX, groundSquash, heightY, sizePx } from './Sheet';
import { between, pick, shade } from './paint';
import { CAR_LINE, FRONTAGE, KERB, LAMP_LINE, STREET_TREE_LINE, frontage } from './plan';
import { TREE_STYLES, paintTree } from './Tree';
import { CAR_COLORS, CAR_LENGTH, CAR_WIDTH, type CarFrame, paintCar } from './Car';

const ASPHALT = '#4a4c50';
const PAVEMENT = '#a39e93';
/** Azimuth width of the strips the ground is painted in (each with its own distance for the haze). */
const STRIP = Math.PI / 18;

/** Texture point of the world point (x, z) at `height` above the street. */
function point(x: number, z: number, height: number): [number, number] {
  return [azimuthX(azimuthOf(x, z)), heightY(height, Math.hypot(x, z))];
}

/** A quad on the ground plane or standing on it: two world points, bottom and top heights. */
function quad(x0: number, z0: number, x1: number, z1: number, hB: number, hT: number, farDx = 0, farDz = 0): Path2D {
  const p = new Path2D();
  const [ax, ay] = point(x0, z0, hB);
  const [bx, by] = point(x1, z1, hB);
  const [cx, cy] = point(x1 + farDx, z1 + farDz, hT);
  const [dx, dy] = point(x0 + farDx, z0 + farDz, hT);
  p.moveTo(ax, ay);
  p.lineTo(bx, by);
  p.lineTo(cx, cy);
  p.lineTo(dx, dy);
  p.closePath();
  return p;
}

/**
 * Fills the ground between two distance lines over the whole turn, strip by strip so the haze
 * follows the distance: `far(a)` is the line at the top, `near(a)` the one at the bottom (or the
 * bottom of the texture when null).
 */
export function paintGroundBand(sheet: Sheet, far: (a: number) => number, near: ((a: number) => number) | null, fill: (a: number) => Fill, from = -Math.PI, to = Math.PI, glass = 0): void {
  const steps = 8;
  for (let a0 = from; a0 < to; a0 += STRIP) {
    const a1 = Math.min(a0 + STRIP, to);
    const mid = (a0 + a1) / 2;
    // Stamped with the far line's distance: whatever moves on this ground is nearer than it.
    sheet.begin(far(mid) * 1.02, glass);
    const p = new Path2D();
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const y = heightY(0, far(a));
      if (i === 0) p.moveTo(azimuthX(a) - 0.5, y);
      else p.lineTo(azimuthX(a) + (i === steps ? 0.5 : 0), y);
    }
    for (let i = steps; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / steps;
      p.lineTo(azimuthX(a) + (i === steps ? 0.5 : i === 0 ? -0.5 : 0), near ? heightY(0, near(a)) + 0.5 : SCENE_HEIGHT + 4);
    }
    p.closePath();
    sheet.path(p, fill(mid));
  }
}

/** A lamp post with a head that glows warm at night and pools its light on the ground `reach` metres around. */
export function paintLamp(sheet: Sheet, x: number, z: number, height: number, reach: number): void {
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const baseY = heightY(0, d);
  const headY = heightY(height, d);
  const postW = Math.max(1, sizePx(0.16, d));
  const headW = Math.max(1.5, sizePx(0.55, d));
  const headH = Math.max(1.5, sizePx(0.4, d));
  const rx = sizePx(reach, d);
  sheet.begin(d);
  sheet.wrapped(cx - rx, cx + rx, () => {
    sheet.glow(cx, baseY, rx, rx * groundSquash(d), 0.5);
    sheet.glow(cx, headY, rx * 0.4, rx * 0.4, 0.3);
    sheet.rect(cx - postW / 2, headY, postW, baseY - headY, '#2a2a2c');
    sheet.rect(cx - headW / 2, headY - headH / 2, headW, headH, '#d8d4c8');
    sheet.litRect(cx - headW / 2, headY - headH / 2, headW, headH, 'warm', 1);
  });
}

/** A parked car on the scenery, painted with the shared box model, its faces stamped with its distance. */
function paintParkedCar(sheet: Sheet, random: Rng, frame: CarFrame): void {
  const cx = frame.x + (frame.along[0] * CAR_LENGTH + frame.across[0] * CAR_WIDTH) / 2;
  const cz = frame.z + (frame.along[1] * CAR_LENGTH + frame.across[1] * CAR_WIDTH) / 2;
  const d = Math.hypot(cx, cz);
  const [xa] = point(frame.x, frame.z, 0);
  const [xb] = point(frame.x + frame.along[0] * CAR_LENGTH, frame.z + frame.along[1] * CAR_LENGTH, 0);
  sheet.wrapped(Math.min(xa, xb) - 20, Math.max(xa, xb) + 20, () => {
    paintCar(
      {
        point,
        fill: (p, fill, glass) => {
          sheet.begin(d, glass);
          sheet.path(p, fill);
        },
        detail: (p, fill) => {
          sheet.color.fillStyle = fill;
          sheet.color.fill(p);
        },
        wheelRadius: sizePx(0.33, d),
      },
      frame,
      pick(random, CAR_COLORS),
    );
  });
}

/** Dashed centre lines of both streets (only their receding ends rise into view) and a zebra crossing on each. */
function paintMarkings(sheet: Sheet): void {
  const ctx = sheet.color;
  ctx.strokeStyle = 'rgba(214,207,168,0.75)';
  for (let a = -Math.PI; a < Math.PI; ) {
    const d = frontage(a, 12);
    ctx.lineWidth = Math.max(0.8, sizePx(0.15, d));
    ctx.beginPath();
    ctx.moveTo(azimuthX(a), heightY(0, d));
    ctx.lineTo(azimuthX(a + 3 / d), heightY(0, frontage(a + 3 / d, 12)));
    ctx.stroke();
    a += 8 / d;
  }
  ctx.fillStyle = 'rgba(225,222,210,0.8)';
  for (let x = 12; x < 16; x += 1) ctx.fill(quad(x, 4, x + 0.5, 4, 0, 0, 0, KERB - 4.3));
  for (let z = -6; z < -2; z += 1) ctx.fill(quad(-4, z, -4, z + 0.5, 0, 0, -(KERB - 4.3), 0));
}

/**
 * Both streets, once the facades stand: the pavement under them, the kerb, the road down to the
 * bottom of the picture with its markings, then the street trees, the lamp posts and the parked
 * cars along the far kerb, far to near.
 */
export function paintStreet(sheet: Sheet, random: Rng): void {
  paintGroundBand(sheet, (a) => frontage(a, FRONTAGE), (a) => frontage(a, KERB), () => PAVEMENT);
  paintGroundBand(sheet, (a) => frontage(a, KERB), null, (a) => {
    const d = frontage(a, KERB);
    const g = sheet.color.createLinearGradient(0, heightY(0, d), 0, SCENE_HEIGHT);
    g.addColorStop(0, ASPHALT);
    g.addColorStop(1, shade(ASPHALT, 0.8));
    return g;
  });
  // The kerb: a light edge and the shadow of its face.
  const ctx = sheet.color;
  for (const [offset, style, width] of [[KERB, 'rgba(225,220,208,0.8)', 1.5], [KERB - 0.25, 'rgba(0,0,0,0.35)', 1.5]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let a = -Math.PI; a <= Math.PI + 1e-6; a += Math.PI / 360) ctx.lineTo(azimuthX(a), heightY(0, frontage(a, offset)));
    ctx.stroke();
  }
  // Wear on the asphalt.
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let i = 0; i < 2500; i++) {
    const a = between(random, -Math.PI, Math.PI);
    const y = between(random, heightY(0, frontage(a, KERB)), SCENE_HEIGHT);
    ctx.fillRect(azimuthX(a), y, between(random, 1, 4), 1);
  }
  paintMarkings(sheet);

  // Street furniture, sorted far to near.
  const items: { d: number; draw: () => void }[] = [];
  const along = (place: (s: number) => [number, number], from: number, to: number, step: () => number, chance: number, make: (x: number, z: number) => void): void => {
    for (let s = from; s < to; s += step()) {
      if (random() >= chance) continue;
      const [x, z] = place(s);
      make(x, z);
    }
  };
  const add = (x: number, z: number, draw: () => void): void => {
    items.push({ d: Math.hypot(x, z), draw });
  };
  // Trees on the far pavements.
  const tree = (x: number, z: number): void =>
    add(x, z, () => paintTree(sheet, random, { x, z, height: between(random, 8, 11), radius: between(random, 2.4, 3.4), style: pick(random, TREE_STYLES.slice(0, 3)) }));
  along((s) => [s, STREET_TREE_LINE], -20, 420, () => between(random, 10, 14), 0.7, tree);
  along((s) => [-STREET_TREE_LINE, s], -420, 18, () => between(random, 10, 14), 0.7, tree);
  // Lamp posts.
  const lamp = (x: number, z: number): void => add(x, z, () => paintLamp(sheet, x, z, 7, 6));
  along((s) => [s, LAMP_LINE], -14, 420, () => 24, 1, lamp);
  along((s) => [-LAMP_LINE, s], -420, 10, () => 24, 1, lamp);
  // Parked cars, nose to tail with gaps.
  const half = CAR_LENGTH / 2;
  // Parked nose to tail facing the way their side of the street drives (right-hand traffic: +x across Front Street, +z across Park Street).
  along((s) => [s, CAR_LINE], -24, 420, () => between(random, 5.4, 7), 0.62, (x, z) => {
    add(x, z, () => paintParkedCar(sheet, random, { x: x - half, z, along: [1, 0], across: [0, 1] }));
  });
  along((s) => [-CAR_LINE, s], -420, 18, () => between(random, 5.4, 7), 0.62, (x, z) => {
    add(x, z, () => paintParkedCar(sheet, random, { x, z: z - half, along: [0, 1], across: [-1, 0] }));
  });
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();
}
