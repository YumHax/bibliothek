import { Sheet, type Rng, type Fill, SCENE_HEIGHT, azimuthX, heightY, outline, sizePx, worldPoint } from './Sheet';
import { between, integer, pick, shade } from './paint';
import { CAR_LINE, FRONTAGE, KERB, LAMP_LINE, STREET_TREE_LINE, frontage } from './plan';
import { TREE_STYLES, paintTree } from './Tree';
import { CAR_COLORS, CAR_LENGTH, CAR_WIDTH, type CarFrame, paintCar } from './Car';
import type { Storefront } from './Shopfront';
import {
  paintAdColumn,
  paintBench,
  paintBikeRack,
  paintBin,
  paintBoard,
  paintBollard,
  paintBuckets,
  paintBusShelter,
  paintCrates,
  paintLamp,
  paintManhole,
  paintMoped,
  paintTerrace,
  paintTrafficLight,
  paintTreeGrate,
} from './StreetFurniture';

const ASPHALT = '#4a4c50';
const PAVEMENT = '#a39e93';
/** Azimuth width of the strips the ground is painted in (each with its own distance for the haze). */
const STRIP = Math.PI / 18;
/** Road markings, metres from the eye: the line between the two directions, the parking lane's edge, the cycle lane's. */
const CENTRE_LINE = 13.75;
const PARKING_EDGE = KERB - 2.3;
const CYCLE_EDGE = 6.3;
/** The zebra crossings: Front Street's (x from, x to) and Park Street's (z from, z to). */
const FRONT_CROSSING: [number, number] = [12, 16];
const PARK_CROSSING: [number, number] = [-6, -2];
/** The bus stop on Front Street's far pavement. */
const BUS_STOP_X = 42;

/** A quad on the ground plane or standing on it: two world points, bottom and top heights. */
function quad(x0: number, z0: number, x1: number, z1: number, hB: number, hT: number, farDx = 0, farDz = 0): Path2D {
  return outline([worldPoint(x0, z0, hB), worldPoint(x1, z1, hB), worldPoint(x1 + farDx, z1 + farDz, hT), worldPoint(x0 + farDx, z0 + farDz, hT)]);
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

/** A line painted on the ground `offset` metres out along both streets, `width` metres wide, dashed `dash` on / `gap` off (solid when gap is 0). */
function paintGroundLine(sheet: Sheet, offset: number, width: number, style: string, dash = 1, gap = 0): void {
  const ctx = sheet.color;
  ctx.strokeStyle = style;
  for (let a = -Math.PI; a < Math.PI; ) {
    const d = frontage(a, offset);
    const run = gap > 0 ? dash : 1;
    const a1 = a + run / d;
    // Seen from above the line's width runs away from the eye, foreshortened like the ground.
    ctx.lineWidth = Math.max(0.7, width * (heightY(0, d) - heightY(0, d + 1)));
    // A few points per run so a dash follows the ground's curve in the panorama.
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const ak = a + ((a1 - a) * k) / 4;
      ctx.lineTo(azimuthX(ak), heightY(0, frontage(ak, offset)));
    }
    ctx.stroke();
    a = a1 + gap / d;
  }
}

/** A parked car on the scenery, painted with the shared box model, its faces stamped with its distance. */
function paintParkedCar(sheet: Sheet, random: Rng, frame: CarFrame): void {
  const cx = frame.x + (frame.along[0] * CAR_LENGTH + frame.across[0] * CAR_WIDTH) / 2;
  const cz = frame.z + (frame.along[1] * CAR_LENGTH + frame.across[1] * CAR_WIDTH) / 2;
  const d = Math.hypot(cx, cz);
  const [xa] = worldPoint(frame.x, frame.z, 0);
  const [xb] = worldPoint(frame.x + frame.along[0] * CAR_LENGTH, frame.z + frame.along[1] * CAR_LENGTH, 0);
  sheet.wrapped(Math.min(xa, xb) - 20, Math.max(xa, xb) + 20, () => {
    paintCar(
      {
        point: worldPoint,
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

/**
 * The road's paint: the dashed line between the two directions, the parking lane's edge with its
 * bay marks, the cycle lane along our side with a bike every so often, and a zebra crossing on
 * each street with its stop lines.
 */
function paintMarkings(sheet: Sheet): void {
  const ctx = sheet.color;
  const white = 'rgba(232,230,220,0.8)';
  paintGroundLine(sheet, CENTRE_LINE, 0.15, white, 3, 5);
  paintGroundLine(sheet, PARKING_EDGE, 0.12, 'rgba(232,230,220,0.6)');
  paintGroundLine(sheet, CYCLE_EDGE, 0.15, white);
  // Bay marks across the parking lane, one per car length and a bit.
  ctx.strokeStyle = 'rgba(232,230,220,0.5)';
  for (let s = -20; s < 160; s += 5.8) {
    ctx.lineWidth = Math.max(0.7, sizePx(0.1, Math.hypot(s, KERB)));
    ctx.stroke(quad(s, PARKING_EDGE, s, KERB, 0, 0));
    ctx.stroke(quad(-PARKING_EDGE, -s, -KERB, -s, 0, 0));
  }
  // The cycle lane's bicycles, in outline.
  for (let s = -10; s < 200; s += 38) {
    for (const [x, z, along] of [[s, (4 + CYCLE_EDGE) / 2, true], [-(4 + CYCLE_EDGE) / 2, -s, false]] as const) {
      const d = Math.hypot(x, z);
      ctx.lineWidth = Math.max(0.7, sizePx(0.08, d));
      ctx.strokeStyle = 'rgba(232,230,220,0.6)';
      for (const u of [-0.5, 0.5]) {
        const pts: [number, number][] = [];
        for (let i = 0; i < 12; i++) {
          const t = (i / 12) * Math.PI * 2;
          const du = u + Math.cos(t) * 0.35;
          const dv = Math.sin(t) * 0.35;
          pts.push(along ? worldPoint(x + du, z + dv, 0) : worldPoint(x - dv, z + du, 0));
        }
        ctx.stroke(outline(pts));
      }
    }
  }
  // Zebra stripes, and a stop line either side.
  ctx.fillStyle = 'rgba(232,230,222,0.85)';
  for (let x = FRONT_CROSSING[0]; x < FRONT_CROSSING[1]; x += 1) ctx.fill(quad(x, 4.3, x + 0.5, 4.3, 0, 0, 0, KERB - 4.6));
  for (let z = PARK_CROSSING[0]; z < PARK_CROSSING[1]; z += 1) ctx.fill(quad(-4.3, z, -4.3, z + 0.5, 0, 0, -(KERB - 4.6), 0));
  ctx.fillStyle = 'rgba(232,230,222,0.7)';
  ctx.fill(quad(FRONT_CROSSING[1] + 1.5, 4.2, FRONT_CROSSING[1] + 1.9, 4.2, 0, 0, 0, CENTRE_LINE - 4.2));
  ctx.fill(quad(FRONT_CROSSING[0] - 1.9, CENTRE_LINE, FRONT_CROSSING[0] - 1.5, CENTRE_LINE, 0, 0, 0, PARKING_EDGE - CENTRE_LINE));
  ctx.fill(quad(-4.2, PARK_CROSSING[0] - 1.9, -4.2, PARK_CROSSING[0] - 1.5, 0, 0, -(CENTRE_LINE - 4.2), 0));
  ctx.fill(quad(-CENTRE_LINE, PARK_CROSSING[1] + 1.5, -CENTRE_LINE, PARK_CROSSING[1] + 1.9, 0, 0, -(PARKING_EDGE - CENTRE_LINE), 0));
}

/** Joints between the paving flags, and the dark line the kerbstones make along the edge. */
function paintPaving(sheet: Sheet): void {
  const ctx = sheet.color;
  for (const offset of [KERB + 0.35, KERB + 1.6, KERB + 2.8]) paintGroundLine(sheet, offset, 0.03, offset === KERB + 0.35 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)');
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  for (let s = -KERB; s < 140; s += 1.2) {
    ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot(s, KERB)));
    ctx.stroke(quad(s, KERB + 0.35, s, FRONTAGE, 0, 0));
    if (s < KERB) ctx.stroke(quad(-KERB - 0.35, -s, -FRONTAGE, -s, 0, 0));
  }
}

/** Wear, repairs, manholes and drains on the asphalt. */
function paintRoadWear(sheet: Sheet, random: Rng): void {
  const ctx = sheet.color;
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let i = 0; i < 2500; i++) {
    const a = between(random, -Math.PI, Math.PI);
    const y = between(random, heightY(0, frontage(a, KERB)), SCENE_HEIGHT);
    ctx.fillRect(azimuthX(a), y, between(random, 1, 4), 1);
  }
  // Oil stains down the middle of each lane, darker where the cars queue.
  for (let i = 0; i < 120; i++) {
    const front = random() < 0.6;
    const s = between(random, -20, 120);
    const lane = pick(random, [11, 16.5, 22.8]);
    const [x, z] = front ? [s, lane] : [-lane, -s];
    const r = between(random, 0.3, 0.8);
    const pts: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const t = (k / 10) * Math.PI * 2;
      pts.push(worldPoint(x + Math.cos(t) * r * 1.6, z + Math.sin(t) * r, 0));
    }
    ctx.fillStyle = 'rgba(20,20,24,0.07)';
    ctx.fill(outline(pts));
  }
  // Patches of newer, darker asphalt where the road was dug up.
  for (let i = 0; i < 7; i++) {
    const x = between(random, -10, 60);
    const z = between(random, 5, 20);
    const w = between(random, 1.5, 5);
    const h = between(random, 1, 2.5);
    ctx.fillStyle = shade(ASPHALT, 0.82);
    ctx.fill(quad(x, z, x + w, z, 0, 0, 0, h));
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke(quad(x, z, x + w, z, 0, 0, 0, h));
  }
  for (const [x, z] of [[3, 12], [22, 9.5], [48, 14], [-14, 15], [-11, -12], [-15, -34], [80, 11]] as const) paintManhole(sheet, x, z);
  // Drain grilles in the gutter.
  ctx.fillStyle = '#26282a';
  for (let s = -12; s < 120; s += 22) {
    ctx.fill(quad(s, KERB - 0.5, s + 0.9, KERB - 0.5, 0, 0, 0, 0.45));
    if (s < 20) ctx.fill(quad(-KERB + 0.5, -s, -KERB + 0.5, -s - 0.9, 0, 0, -0.45, 0));
  }
}

/**
 * Both streets, once the facades stand: the pavement under them, the kerb, the road down to the
 * bottom of the picture with its markings and wear, then everything standing on the far pavements,
 * far to near: street trees in their grilles, lamp posts, benches, bins, bike racks, mopeds, the
 * bus shelter, the advertising column on the corner, traffic lights at the crossings, what the
 * `shops` put out in front of them, and the cars parked along the kerb.
 */
export function paintStreet(sheet: Sheet, random: Rng, shops: readonly Storefront[]): void {
  paintGroundBand(sheet, (a) => frontage(a, FRONTAGE), (a) => frontage(a, KERB), () => PAVEMENT);
  paintPaving(sheet);
  paintGroundBand(sheet, (a) => frontage(a, KERB), null, (a) => {
    const d = frontage(a, KERB);
    const g = sheet.color.createLinearGradient(0, heightY(0, d), 0, SCENE_HEIGHT);
    g.addColorStop(0, ASPHALT);
    g.addColorStop(1, shade(ASPHALT, 0.8));
    return g;
  });
  // The kerb: a light edge and the shadow of its face.
  const ctx = sheet.color;
  for (const [offset, style, width] of [[KERB, 'rgba(225,220,208,0.85)', 1.8], [KERB - 0.25, 'rgba(0,0,0,0.35)', 1.5]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let a = -Math.PI; a <= Math.PI + 1e-6; a += Math.PI / 360) ctx.lineTo(azimuthX(a), heightY(0, frontage(a, offset)));
    ctx.stroke();
  }
  paintRoadWear(sheet, random);
  paintMarkings(sheet);

  // Street furniture, sorted far to near.
  const items: { d: number; draw: () => void }[] = [];
  const add = (x: number, z: number, draw: () => void): void => {
    items.push({ d: Math.hypot(x, z), draw });
  };
  const along = (place: (s: number) => [number, number], from: number, to: number, step: () => number, chance: number, make: (x: number, z: number) => void): void => {
    for (let s = from; s < to; s += step()) {
      if (random() >= chance) continue;
      const [x, z] = place(s);
      make(x, z);
    }
  };
  /** Whether Front Street's far pavement at x is kept clear (the bus stop, the crossing, a terrace, the retro games shop). */
  const busy = (x: number): boolean =>
    Math.abs(x - BUS_STOP_X) < 4 ||
    (x > FRONT_CROSSING[0] - 1 && x < FRONT_CROSSING[1] + 1) ||
    shops.some((shop) => (shop.display === 'terrace' || shop.landmark) && x > FRONTAGE * Math.tan(shop.a0) - 2 && x < FRONTAGE * Math.tan(shop.a1) + 2);

  // Trees on the far pavements, each in its grille.
  const tree = (x: number, z: number): void => {
    paintTreeGrate(sheet, x, z);
    add(x, z, () => paintTree(sheet, random, { x, z, height: between(random, 8, 11.5), radius: between(random, 2.6, 3.6), style: pick(random, TREE_STYLES.slice(0, 3)), form: random() < 0.25 ? 'oval' : 'round' }));
  };
  along((s) => [s, STREET_TREE_LINE], -20, 420, () => between(random, 10, 14), 0.7, (x, z) => {
    if (!busy(x)) tree(x, z);
  });
  along((s) => [-STREET_TREE_LINE, s], -420, 18, () => between(random, 10, 14), 0.7, tree);
  // Lamp posts.
  const lamp = (x: number, z: number): void => add(x, z, () => paintLamp(sheet, x, z, 7, 6));
  along((s) => [s, LAMP_LINE], -14, 420, () => 24, 1, lamp);
  along((s) => [-LAMP_LINE, s], -420, 10, () => 24, 1, lamp);

  // Benches, bins, bike racks and mopeds between the trees, near enough to be made out.
  for (let s = -16; s < 110; s += between(random, 7, 12)) {
    if (busy(s)) continue;
    const z = KERB + 0.9;
    const kind = random();
    if (kind < 0.25) add(s, z + 0.4, () => paintBench(sheet, { x: s, z: z + 0.4, along: [1, 0] }));
    else if (kind < 0.42) add(s, KERB + 0.5, () => paintBin(sheet, s, KERB + 0.5));
    else if (kind < 0.58) add(s, z + 0.3, () => paintBikeRack(sheet, random, { x: s, z: z + 0.3, along: [1, 0] }, integer(random, 3, 5)));
    else if (kind < 0.72) add(s, z, () => paintMoped(sheet, random, { x: s, z, along: [0.3, 0.95] }));
  }
  for (let s = -90; s < 14; s += between(random, 9, 14)) {
    const x = -(KERB + 1);
    const kind = random();
    if (kind < 0.35) add(x - 0.4, s, () => paintBench(sheet, { x: x - 0.4, z: s, along: [0, -1] }));
    else if (kind < 0.55) add(-(KERB + 0.5), s, () => paintBin(sheet, -(KERB + 0.5), s));
    else if (kind < 0.7) add(x, s, () => paintBikeRack(sheet, random, { x, z: s, along: [0, 1] }, integer(random, 3, 5)));
  }
  add(BUS_STOP_X, KERB + 1.6, () => paintBusShelter(sheet, random, { x: BUS_STOP_X, z: KERB + 1.6, along: [1, 0] }));
  add(-(KERB + 1.9), KERB + 1.9, () => paintAdColumn(sheet, random, -(KERB + 1.9), KERB + 1.9));
  // Bollards round the corner, traffic lights at both ends of each crossing.
  for (let s = -KERB + 1; s < -KERB + 7; s += 1.4) {
    add(s, KERB + 0.3, () => paintBollard(sheet, s, KERB + 0.3));
    add(-(KERB + 0.3), -s, () => paintBollard(sheet, -(KERB + 0.3), -s));
  }
  add(FRONT_CROSSING[0] - 0.8, KERB + 0.5, () => paintTrafficLight(sheet, FRONT_CROSSING[0] - 0.8, KERB + 0.5));
  add(-(KERB + 0.5), PARK_CROSSING[0] - 0.8, () => paintTrafficLight(sheet, -(KERB + 0.5), PARK_CROSSING[0] - 0.8));

  // What the shops put out.
  for (const shop of shops) {
    const x0 = FRONTAGE * Math.tan(shop.a0);
    const x1 = FRONTAGE * Math.tan(shop.a1);
    const mid = (x0 + x1) / 2;
    if (shop.display === 'terrace') add(mid, FRONTAGE - 1, () => paintTerrace(sheet, random, x0, x1, FRONTAGE));
    else if (shop.display === 'crates') add(mid, FRONTAGE - 0.7, () => paintCrates(sheet, random, x0, x1, FRONTAGE));
    else if (shop.display === 'buckets') add(mid, FRONTAGE - 0.7, () => paintBuckets(sheet, random, x0, x1, FRONTAGE));
    else if (shop.display === 'board') add(x0 + 1.2, FRONTAGE - 1.3, () => paintBoard(sheet, x0 + 1.2, FRONTAGE));
  }

  // Parked cars, nose to tail with gaps, facing the way their side of the street drives
  // (right-hand traffic: +x across Front Street, +z across Park Street); none on the crossings.
  const half = CAR_LENGTH / 2;
  along((s) => [s, CAR_LINE], -24, 420, () => between(random, 5.4, 7), 0.62, (x, z) => {
    if (x + half > FRONT_CROSSING[0] - 2 && x - half < FRONT_CROSSING[1] + 2) return;
    if (Math.abs(x - BUS_STOP_X) < 8) return;
    add(x, z, () => paintParkedCar(sheet, random, { x: x - half, z, along: [1, 0], across: [0, 1] }));
  });
  along((s) => [-CAR_LINE, s], -420, 18, () => between(random, 5.4, 7), 0.62, (x, z) => {
    if (z + half > PARK_CROSSING[0] - 2 && z - half < PARK_CROSSING[1] + 2) return;
    add(x, z, () => paintParkedCar(sheet, random, { x, z: z - half, along: [0, 1], across: [-1, 0] }));
  });
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();
}
