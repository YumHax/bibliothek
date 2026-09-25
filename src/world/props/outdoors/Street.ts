import { Sheet, type Rng, type Fill, type Surface, SCENE_HEIGHT, azimuthX, heightY, outline, sizePx, worldPoint } from './Sheet';
import { between, integer, pick, shade } from './paint';
import { BUS_STOP_X, CAR_LINE, FRONTAGE, FRONT_END, KERB, LAMP_LINE, NEAR_KERB, PARK_END, STREET_TREE_LINE, frontage, ground, streetEnd } from './plan';
import { TREE_STYLES, paintTree } from './Tree';
import { holidayStreetItems, paintTreeLights } from './Holiday';
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
  paintNewsstand,
  paintLamp,
  paintManhole,
  paintMoped,
  paintPlanter,
  paintScooter,
  paintTerrace,
  paintTrafficLight,
  paintTreeGrate,
} from './StreetFurniture';

const ASPHALT = '#4a4c50';
const PAVEMENT = '#a39e93';
/** How the ground takes the weather: the road puddles most, the flags a little less; snow settles on both. */
const ROAD_SURFACE: Surface = { wet: 1, snow: 0.9 };
const PAVEMENT_SURFACE: Surface = { wet: 0.6, snow: 1 };
/** How far out each street's furniture and parked cars go: short of the building across its end. */
const FRONT_REACH = FRONT_END - 4;
const PARK_REACH = PARK_END - 4;
/** Azimuth width of the strips the ground is painted in (each with its own distance for the haze). */
const STRIP = Math.PI / 18;
/** Road markings, metres from the eye: the line between the two directions, the parking lane's edge, the cycle lane's. */
const CENTRE_LINE = 13.75;
const PARKING_EDGE = KERB - 2.3;
const CYCLE_EDGE = 6.3;
/** The zebra crossings: Front Street's (x from, x to) and Park Street's (z from, z to). */
const FRONT_CROSSING: [number, number] = [12, 16];
const PARK_CROSSING: [number, number] = [-6, -2];
/** The newspaper kiosk on Front Street's far pavement. */
const KIOSK_X = 60;

/** A quad on the ground plane or standing on it: two world points, bottom and top heights. */
function quad(x0: number, z0: number, x1: number, z1: number, hB: number, hT: number, farDx = 0, farDz = 0): Path2D {
  return outline([worldPoint(x0, z0, hB), worldPoint(x1, z1, hB), worldPoint(x1 + farDx, z1 + farDz, hT), worldPoint(x0 + farDx, z0 + farDz, hT)]);
}

/**
 * Fills the ground between two distance lines over the whole turn, strip by strip so the haze
 * follows the distance: `far(a)` is the line at the top, `near(a)` the one at the bottom (or the
 * bottom of the texture when null).
 */
export function paintGroundBand(sheet: Sheet, far: (a: number) => number, near: ((a: number) => number) | null, fill: (a: number) => Fill, from = -Math.PI, to = Math.PI, glass = 0, surface: Surface = {}): void {
  const steps = 8;
  for (let a0 = from; a0 < to; a0 += STRIP) {
    const a1 = Math.min(a0 + STRIP, to);
    const mid = (a0 + a1) / 2;
    // Stamped with the far line's distance: whatever moves on this ground is nearer than it.
    sheet.begin(far(mid) * 1.02, glass, surface);
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
    if (d > streetEnd(a)) {
      // Past the building across the street's end: nothing to paint on.
      a = a1 + gap / d;
      continue;
    }
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
        shadow: (p) => sheet.shadow(p, 0.5),
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
  // Lane arrows ahead of the crossings, pointing the way each lane drives.
  ctx.fillStyle = 'rgba(232,230,222,0.75)';
  for (const [x, z, dx, dz] of [[27, 11, -1, 0], [5, 16.5, 1, 0], [-11, -13, 0, -1], [-16.5, -15, 0, 1], [60, 11, -1, 0], [-11, -48, 0, -1]] as const) ctx.fill(laneArrow(x, z, dx, dz));
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

/** A straight-ahead arrow painted on the road at (x, z), pointing along (dx, dz). */
function laneArrow(x: number, z: number, dx: number, dz: number): Path2D {
  const P = (u: number, v: number): [number, number] => worldPoint(x + dx * u - dz * v, z + dz * u + dx * v, 0);
  return outline([P(-2.5, -0.08), P(0.4, -0.08), P(0.4, -0.35), P(1.5, 0), P(0.4, 0.35), P(0.4, 0.08), P(-2.5, 0.08)]);
}

/** Joints between the paving flags, and the dark line the kerbstones make along the edge, on both pavements. */
function paintPaving(sheet: Sheet): void {
  const ctx = sheet.color;
  for (const offset of [KERB + 0.35, KERB + 1.6, KERB + 2.8]) paintGroundLine(sheet, offset, 0.03, offset === KERB + 0.35 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)');
  for (const offset of [NEAR_KERB - 0.35, 1.3, 2.6]) paintGroundLine(sheet, offset, 0.03, offset === NEAR_KERB - 0.35 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)');
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  for (let s = -KERB; s < 140; s += 1.2) {
    ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot(s, KERB)));
    ctx.stroke(quad(s, KERB + 0.35, s, FRONTAGE, 0, 0));
    if (s < KERB) ctx.stroke(quad(-KERB - 0.35, -s, -FRONTAGE, -s, 0, 0));
  }
  // Our own pavement, right under the windows: its flags are big from up here.
  for (let s = -NEAR_KERB; s < 90; s += 1.2) {
    ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot(s, 2)));
    ctx.stroke(quad(s, 0, s, NEAR_KERB - 0.35, 0, 0));
    if (s < 60) ctx.stroke(quad(-(NEAR_KERB - 0.35), -s, 0, -s, 0, 0));
  }
}

/** A ground point on either street: `s` metres along it from the corner, `v` out from our building line. */
function streetPoint(front: boolean, s: number, v: number): [number, number] {
  return front ? [s, v] : [-v, -s];
}

/** Wear, repairs, cracks, manholes and drains on the asphalt. */
function paintRoadWear(sheet: Sheet, random: Rng): void {
  const ctx = sheet.color;
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let i = 0; i < 3200; i++) {
    const a = between(random, -Math.PI, Math.PI);
    const y = between(random, heightY(0, ground(a, KERB)), heightY(0, frontage(a, NEAR_KERB)));
    ctx.fillRect(azimuthX(a), y, between(random, 1, 4), 1);
  }
  // The dark drip line down the middle of each lane, where engines stand and wheels do not roll.
  for (const lane of [8.2, 11, 16.5, 19.5]) {
    for (const front of [true, false]) {
      for (let s = -8; s < 110; s += between(random, 2, 6)) {
        const len = between(random, 3, 9);
        const [x0, z0] = streetPoint(front, s, lane - 0.14);
        const [x1, z1] = streetPoint(front, s + len, lane - 0.14);
        const [dx, dz] = front ? [0, 0.28] : [-0.28, 0];
        ctx.fillStyle = `rgba(18,18,22,${between(random, 0.04, 0.09)})`;
        ctx.fill(quad(x0, z0, x1, z1, 0, 0, dx, dz));
        s += len;
      }
    }
  }
  // Patches of newer, darker asphalt where the road was dug up: ragged edges, a sealed seam round them.
  for (let i = 0; i < 12; i++) {
    const front = random() < 0.65;
    const [cx, cz] = streetPoint(front, between(random, -4, 70), between(random, 6, 21));
    const w = between(random, 1.2, 4);
    const h = between(random, 0.8, 2.2);
    const pts: [number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const t = (k / 9) * Math.PI * 2;
      const wobble = between(random, 0.8, 1.15);
      pts.push(worldPoint(cx + Math.cos(t) * w * wobble * 0.5, cz + Math.sin(t) * h * wobble * 0.5, 0));
    }
    ctx.fillStyle = shade(ASPHALT, between(random, 0.78, 0.9));
    ctx.fill(outline(pts));
    ctx.strokeStyle = 'rgba(12,12,14,0.45)';
    ctx.lineWidth = Math.max(0.7, sizePx(0.05, Math.hypot(cx, cz)));
    ctx.stroke(outline(pts));
  }
  // Cracks, some sealed with tar: short jagged lines, mostly along the wheel tracks.
  for (let i = 0; i < 60; i++) {
    const front = random() < 0.6;
    let s = between(random, -4, 90);
    let v = pick(random, [7.4, 9.9, 12.2, 15.5, 17.7, 20.4]) + between(random, -0.3, 0.3);
    ctx.strokeStyle = random() < 0.5 ? 'rgba(10,10,12,0.5)' : 'rgba(10,10,12,0.25)';
    ctx.lineWidth = Math.max(0.6, sizePx(0.04, Math.hypot(s, v)));
    ctx.beginPath();
    ctx.moveTo(...worldPoint(...streetPoint(front, s, v), 0));
    for (let k = integer(random, 3, 7); k > 0; k--) {
      s += between(random, 0.3, 1.2);
      v += between(random, -0.25, 0.25);
      ctx.lineTo(...worldPoint(...streetPoint(front, s, v), 0));
    }
    ctx.stroke();
  }
  for (const [x, z] of [[3, 12], [22, 9.5], [48, 14], [-14, 15], [-11, -12], [-15, -34], [80, 11]] as const) paintManhole(sheet, x, z);
  // Drain grilles in the gutters, both sides.
  ctx.fillStyle = '#26282a';
  for (let s = -12; s < 120; s += 22) {
    ctx.fill(quad(s, KERB - 0.5, s + 0.9, KERB - 0.5, 0, 0, 0, 0.45));
    if (s < 20) ctx.fill(quad(-KERB + 0.5, -s, -KERB + 0.5, -s - 0.9, 0, 0, -0.45, 0));
    ctx.fill(quad(s + 9, NEAR_KERB + 0.05, s + 9.9, NEAR_KERB + 0.05, 0, 0, 0, 0.45));
    if (s < 60) ctx.fill(quad(-(NEAR_KERB + 0.05), -s - 9, -(NEAR_KERB + 0.05), -s - 9.9, 0, 0, -0.45, 0));
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
  paintGroundBand(sheet, (a) => ground(a, FRONTAGE), (a) => ground(a, KERB), () => PAVEMENT, -Math.PI, Math.PI, 0, PAVEMENT_SURFACE);
  paintGroundBand(sheet, (a) => ground(a, KERB), null, (a) => {
    const d = ground(a, KERB);
    const g = sheet.color.createLinearGradient(0, heightY(0, d), 0, heightY(0, frontage(a, NEAR_KERB)));
    g.addColorStop(0, ASPHALT);
    g.addColorStop(1, shade(ASPHALT, 0.85));
    return g;
  }, -Math.PI, Math.PI, 0, ROAD_SURFACE);
  // Our own pavement, under the windows, down to the foot of the building.
  paintGroundBand(sheet, (a) => ground(a, NEAR_KERB), null, () => shade(PAVEMENT, 0.97), -Math.PI, Math.PI, 0, PAVEMENT_SURFACE);
  paintPaving(sheet);
  // The kerbs: a light edge and the shadow of the face, which is on the road side of each.
  const ctx = sheet.color;
  const kerbs = [[KERB, 'rgba(225,220,208,0.85)', 1.8], [KERB - 0.25, 'rgba(0,0,0,0.35)', 1.5], [NEAR_KERB, 'rgba(225,220,208,0.85)', 2.6], [NEAR_KERB + 0.2, 'rgba(0,0,0,0.3)', 2.2]] as const;
  for (const [offset, style, width] of kerbs) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let a = -Math.PI; a <= Math.PI + 1e-6; a += Math.PI / 360) {
      const d = frontage(a, offset);
      if (d > streetEnd(a)) ctx.moveTo(azimuthX(a), heightY(0, d));
      else ctx.lineTo(azimuthX(a), heightY(0, d));
    }
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

  // Trees on the far pavements, each in its grille: a proper avenue, gaps only where something needs the room.
  const tree = (x: number, z: number): void => {
    paintTreeGrate(sheet, x, z);
    add(x, z, () => {
      const shape = { x, z, height: between(random, 8, 11.5), radius: between(random, 2.6, 3.6), style: pick(random, TREE_STYLES.slice(0, 3)), form: random() < 0.25 ? ('oval' as const) : ('round' as const) };
      paintTree(sheet, random, shape);
      paintTreeLights(sheet, x, z, shape.radius, 3, shape.height);
    });
  };
  along((s) => [s, STREET_TREE_LINE], -20, FRONT_REACH, () => between(random, 9, 11.5), 0.94, (x, z) => {
    if (!busy(x) && Math.abs(x - KIOSK_X) > 4) tree(x, z);
  });
  along((s) => [-STREET_TREE_LINE, s], -PARK_REACH, 18, () => between(random, 9, 11.5), 0.9, tree);
  // Lamp posts on both pavements; the far ones wash the facade behind them.
  const lamp = (x: number, z: number, wall: number): void => add(x, z, () => paintLamp(sheet, x, z, 7, 4.5, wall));
  along((s) => [s, LAMP_LINE], -14, FRONT_REACH, () => 24, 1, (x, z) => lamp(x, z, FRONTAGE - LAMP_LINE));
  along((s) => [-LAMP_LINE, s], -PARK_REACH, 10, () => 24, 1, (x, z) => lamp(x, z, FRONTAGE - LAMP_LINE));
  for (const s of [10, 34, 58, 82]) lamp(s, NEAR_KERB - 0.6, 0);
  for (const s of [-10, -34, -58]) lamp(-(NEAR_KERB - 0.6), s, 0);

  // Benches, bins, planters, bike racks, mopeds and hire scooters between the trees, near enough to be made out.
  for (let s = -16; s < 110; s += between(random, 6, 10)) {
    if (busy(s) || Math.abs(s - KIOSK_X) < 4) continue;
    const z = KERB + 0.9;
    const kind = random();
    if (kind < 0.2) add(s, z + 0.4, () => paintBench(sheet, { x: s, z: z + 0.4, along: [1, 0] }));
    else if (kind < 0.34) add(s, KERB + 0.5, () => paintBin(sheet, s, KERB + 0.5));
    else if (kind < 0.48) add(s, z + 0.3, () => paintBikeRack(sheet, random, { x: s, z: z + 0.3, along: [1, 0] }, integer(random, 3, 5)));
    else if (kind < 0.6) add(s, z, () => paintMoped(sheet, random, { x: s, z, along: [0.3, 0.95] }));
    else if (kind < 0.74) add(s, z + 0.2, () => paintPlanter(sheet, random, { x: s, z: z + 0.2, along: [1, 0] }));
    else if (kind < 0.86) add(s, z, () => paintScooter(sheet, random, s, z));
  }
  for (let s = -90; s < 14; s += between(random, 8, 12)) {
    const x = -(KERB + 1);
    const kind = random();
    if (kind < 0.3) add(x - 0.4, s, () => paintBench(sheet, { x: x - 0.4, z: s, along: [0, -1] }));
    else if (kind < 0.48) add(-(KERB + 0.5), s, () => paintBin(sheet, -(KERB + 0.5), s));
    else if (kind < 0.62) add(x, s, () => paintBikeRack(sheet, random, { x, z: s, along: [0, 1] }, integer(random, 3, 5)));
    else if (kind < 0.76) add(x, s, () => paintPlanter(sheet, random, { x, z: s, along: [0, 1] }));
  }
  add(BUS_STOP_X, KERB + 1.6, () => paintBusShelter(sheet, random, { x: BUS_STOP_X, z: KERB + 1.6, along: [1, 0] }));
  add(KIOSK_X, KERB + 1.8, () => paintNewsstand(sheet, random, { x: KIOSK_X, z: KERB + 1.8, along: [1, 0] }));
  add(-(KERB + 1.9), KERB + 1.9, () => paintAdColumn(sheet, random, -(KERB + 1.9), KERB + 1.9));
  // Bollards round both corners, traffic lights at both ends of each crossing.
  for (let s = -KERB + 1; s < -KERB + 7; s += 1.4) {
    add(s, KERB + 0.3, () => paintBollard(sheet, s, KERB + 0.3));
    add(-(KERB + 0.3), -s, () => paintBollard(sheet, -(KERB + 0.3), -s));
  }
  for (let s = -NEAR_KERB + 0.6; s < 6; s += 1.4) {
    add(s, NEAR_KERB - 0.3, () => paintBollard(sheet, s, NEAR_KERB - 0.3));
    add(-(NEAR_KERB - 0.3), -s, () => paintBollard(sheet, -(NEAR_KERB - 0.3), -s));
  }
  add(FRONT_CROSSING[0] - 0.8, KERB + 0.5, () => paintTrafficLight(sheet, FRONT_CROSSING[0] - 0.8, KERB + 0.5));
  add(-(KERB + 0.5), PARK_CROSSING[0] - 0.8, () => paintTrafficLight(sheet, -(KERB + 0.5), PARK_CROSSING[0] - 0.8));
  add(FRONT_CROSSING[1] + 0.8, NEAR_KERB - 0.5, () => paintTrafficLight(sheet, FRONT_CROSSING[1] + 0.8, NEAR_KERB - 0.5));
  add(-(NEAR_KERB - 0.5), PARK_CROSSING[1] + 0.8, () => paintTrafficLight(sheet, -(NEAR_KERB - 0.5), PARK_CROSSING[1] + 0.8));
  // Under our windows: a bin, a bike stand, scooters left on the flags.
  add(22, NEAR_KERB - 0.5, () => paintBin(sheet, 22, NEAR_KERB - 0.5));
  add(30, NEAR_KERB - 1, () => paintBikeRack(sheet, random, { x: 30, z: NEAR_KERB - 1, along: [1, 0] }, 4));
  add(40, NEAR_KERB - 0.8, () => paintScooter(sheet, random, 40, NEAR_KERB - 0.8));
  add(-(NEAR_KERB - 0.8), -22, () => paintScooter(sheet, random, -(NEAR_KERB - 0.8), -22));

  // What the shops put out, and the light their windows spill on the pavement until they close.
  for (const shop of shops) {
    const x0 = FRONTAGE * Math.tan(shop.a0);
    const x1 = FRONTAGE * Math.tan(shop.a1);
    const mid = (x0 + x1) / 2;
    const spill = FRONTAGE - 1.6;
    const [sx, sy] = worldPoint(mid, spill, 0);
    const d = Math.hypot(mid, spill);
    const rx = sizePx((x1 - x0) * 0.55, d);
    sheet.glow(sx, sy, rx, Math.max(1, sizePx(2, d) * 0.7), shop.light === 'cool' ? 0.18 : 0.24, shop.closing);
    if (shop.display === 'terrace') add(mid, FRONTAGE - 1, () => paintTerrace(sheet, random, x0, x1, FRONTAGE));
    else if (shop.display === 'crates') add(mid, FRONTAGE - 0.7, () => paintCrates(sheet, random, x0, x1, FRONTAGE));
    else if (shop.display === 'buckets') add(mid, FRONTAGE - 0.7, () => paintBuckets(sheet, random, x0, x1, FRONTAGE));
    else if (shop.display === 'board') add(x0 + 1.2, FRONTAGE - 1.3, () => paintBoard(sheet, x0 + 1.2, FRONTAGE));
  }

  // Parked cars, nose to tail with gaps, facing the way their side of the street drives
  // (right-hand traffic: +x across Front Street, +z across Park Street); none on the crossings.
  const half = CAR_LENGTH / 2;
  along((s) => [s, CAR_LINE], -24, FRONT_REACH, () => between(random, 5.4, 7), 0.72, (x, z) => {
    if (x + half > FRONT_CROSSING[0] - 2 && x - half < FRONT_CROSSING[1] + 2) return;
    if (Math.abs(x - BUS_STOP_X) < 9) return;
    add(x, z, () => paintParkedCar(sheet, random, { x: x - half, z, along: [1, 0], across: [0, 1] }));
  });
  along((s) => [-CAR_LINE, s], -PARK_REACH, 18, () => between(random, 5.4, 7), 0.72, (x, z) => {
    if (z + half > PARK_CROSSING[0] - 2 && z - half < PARK_CROSSING[1] + 2) return;
    add(x, z, () => paintParkedCar(sheet, random, { x, z: z - half, along: [0, 1], across: [-1, 0] }));
  });
  // The holiday strings slung across both streets, piece by piece in the same order.
  for (const [x, z, draw] of holidayStreetItems(sheet)) add(x, z, draw);
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();
}
