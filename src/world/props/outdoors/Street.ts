import { Sheet, type Rng, type Fill, type Surface, SCENE_HEIGHT, azimuthX, heightY, outline, sizePx, worldPoint } from './Sheet';
import { shade } from './paint';
import { BUS_SHELTER, CYCLE_NEAR, FAR_LANE, FRONTAGE, FRONT_END, KERB, LAMPS, LAMP_LINE, NEAR_KERB, NEAR_LANE, OUR_LINE, PARK_END, PARK_NEAR_KERB, PARK_OUR_LINE, ROAD, frontage, ground, streetEnd } from './plan';
import { BENCHES, BIKE_RACKS, BUS_STOP, CROSSINGS, KIOSK, LAMP_HEIGHT, PARK_SECTION, SIGNAL_POSTS, STOP_LINE, STREET_BINS, STREET_DETAILS, TERRACES, inFlatFrame, roadworks } from '@/world/city/frontage';
import { STREET_TREES, TREE_FORM, treeHeight } from '@/world/city/trees';
import { PARKED_CARS, type ParkedShape } from '@/world/city/parkedCars';
import { STREET_PLAN } from '@/world/street/streetPlan'; // imports-ok: the painted view of the street draws what the walkable one lays out; one model for both is the last wave
import { FRONT, STREET_ENDS } from '@/world/measures/street';
import { LAMP_DESIGNS } from '@/world/street/StreetLamps';
import { TREE_STYLES, paintTree } from './Tree';
import { holidayStreetItems, paintTreeLights } from './Holiday';
import { CAR_BODY, SALOON_BODY, VAN_BODY, type CarFrame, type VehicleBody, paintCar } from './Car';
import type { Storefront } from './Shopfront';
import { PAVEMENT } from './palette';
import {
  paintAdColumn,
  paintBarriers,
  paintBench,
  paintBikeRack,
  paintBin,
  paintBollard,
  paintBusShelter,
  paintCone,
  paintHoarding,
  paintHydrant,
  paintNewsstand,
  paintLamp,
  paintManhole,
  paintTerrace,
  paintTrafficLight,
  paintTreeGrate,
} from './paintedFurniture';
import { between, integer, pick } from '@/random';

const ASPHALT = '#4a4c50';
/** How the ground takes the weather: the road puddles most, the flags a little less; snow settles on both. */
const ROAD_SURFACE: Surface = { wet: 1, snow: 0.9 };
const PAVEMENT_SURFACE: Surface = { wet: 0.6, snow: 1 };
/** How far out each street's furniture and parked cars go: short of the building across its end. */
const FRONT_REACH = FRONT_END - 4;
const PARK_REACH = PARK_END - 4;
/** Azimuth width of the strips the ground is painted in (each with its own distance for the haze). */
const STRIP = Math.PI / 18;
/** Road markings, metres from the eye (the walkable street's): the line between the two directions, the far parking lane's edge. */
const CENTRE_LINE = ROAD.centre;
const PARKING_EDGE = ROAD.farParking;
/** The middle of each traffic lane, from our kerb out: outer and inner each way. */
const LANES = [(ROAD.nearParking + ROAD.nearDash) / 2, (ROAD.nearDash + ROAD.centre) / 2, (ROAD.centre + ROAD.farDash) / 2, (ROAD.farDash + ROAD.farParking) / 2];
/** Front Street's crossing with lights (x from, x to). */
const FRONT_CROSSING: [number, number] = (() => {
  const lit = CROSSINGS.find((c) => c.signals)!;
  return [lit.from, lit.to];
})();
/** Where Front Street's lines start (at Park Street's junction) and, in Park Street, its centre line's x and how far it runs. */
const FRONT_LINES_FROM = PARK_SECTION.nearKerb - 0.5;
const PARK_CENTRE = (PARK_SECTION.nearKerb + PARK_SECTION.farKerb) / 2;
const PARK_LINE_Z: [number, number] = [inFlatFrame([0, STREET_ENDS.south])[1], inFlatFrame([0, FRONT.nearKerb - 1])[1]];
/** The way something standing on the pavement lines up when its front (the side it faces, yaw 0 = +z) is its footprint's -across. */
const facing = (yaw: number): [number, number] => [-Math.cos(yaw), Math.sin(yaw)];

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
    sheet.begin(far(mid) * 1.02, glass, { ...surface, flat: true });
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

/**
 * A line painted on the ground `offset` metres out along both streets (`parkOffset` on Park Street's
 * near side), `width` metres wide, dashed `dash` on / `gap` off (solid when gap is 0).
 */
function paintGroundLine(sheet: Sheet, offset: number, width: number, style: string, dash = 1, gap = 0, parkOffset = offset): void {
  const ctx = sheet.color;
  ctx.strokeStyle = style;
  for (let a = -Math.PI; a < Math.PI; ) {
    const d = frontage(a, offset, parkOffset);
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
      ctx.lineTo(azimuthX(ak), heightY(0, frontage(ak, offset, parkOffset)));
    }
    ctx.stroke();
    a = a1 + gap / d;
  }
}

/** The painted body of each shape of parked car. */
const PARKED_BODIES: Record<ParkedShape, VehicleBody> = { hatch: CAR_BODY, city: CAR_BODY, saloon: SALOON_BODY, estate: SALOON_BODY, van: VAN_BODY };

/** A parked car on the scenery, painted with the shared box model, its faces stamped with its distance. */
function paintParkedCar(sheet: Sheet, frame: CarFrame, body: VehicleBody, color: string): void {
  const cx = frame.x + (frame.along[0] * body.length + frame.across[0] * body.width) / 2;
  const cz = frame.z + (frame.along[1] * body.length + frame.across[1] * body.width) / 2;
  const d = Math.hypot(cx, cz);
  const [xa] = worldPoint(frame.x, frame.z, 0);
  const [xb] = worldPoint(frame.x + frame.along[0] * body.length, frame.z + frame.along[1] * body.length, 0);
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
        wheelRadius: sizePx(body.wheel, d),
        shadow: (p) => sheet.shadow(p, 0.5),
      },
      frame,
      color,
      body,
    );
  });
}

/**
 * A straight line painted on the ground from (x0, z0) to (x1, z1), `width` metres wide (across it),
 * dashed `dash` on / `gap` off from its start (solid when gap is 0), painted only where the ground is
 * short of the buildings closing the streets' ends.
 */
function paintGroundStripe(sheet: Sheet, x0: number, z0: number, x1: number, z1: number, width: number, style: string, dash = 0, gap = 0): void {
  const ctx = sheet.color;
  const length = Math.hypot(x1 - x0, z1 - z0);
  const [ux, uz] = [(x1 - x0) / length, (z1 - z0) / length];
  ctx.fillStyle = style;
  const run = gap > 0 ? dash : 2;
  for (let s = 0; s < length; s += run + gap) {
    const e = Math.min(length, s + run);
    const [ax, az, bx, bz] = [x0 + ux * s, z0 + uz * s, x0 + ux * e, z0 + uz * e];
    const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
    if (Math.hypot(mx, mz) > streetEnd(Math.atan2(mx, mz))) continue;
    const [nx, nz] = [-uz * (width / 2), ux * (width / 2)];
    ctx.fill(outline([worldPoint(ax + nx, az + nz, 0), worldPoint(bx + nx, bz + nz, 0), worldPoint(bx - nx, bz - nz, 0), worldPoint(ax - nx, az - nz, 0)]));
  }
}

/**
 * The road's paint, as the walkable street has it (`StreetGround.addMarkings`): on Front Street from
 * Park Street's junction, broken at the crossings, the double centre line, the lane dashes and the
 * parking lines; a zebra on each crossing, the stop lines of the one with lights, the bus stop's
 * yellow box; down Park Street, its double centre line.
 */
function paintMarkings(sheet: Sheet): void {
  const ctx = sheet.color;
  const white = 'rgba(232,230,220,0.8)';
  const [laneDash, parkingLine] = [ROAD.farDash - CENTRE_LINE, PARKING_EDGE - CENTRE_LINE];
  const cuts = [...CROSSINGS].sort((a, b) => a.from - b.from);
  const spans: [number, number][] = [];
  let from = FRONT_LINES_FROM;
  for (const c of cuts) {
    if (c.from - STOP_LINE - 0.5 > from) spans.push([from, c.from - STOP_LINE - 0.5]);
    from = Math.max(from, c.to + STOP_LINE + 0.5);
  }
  spans.push([from, FRONT_REACH]);
  for (const [x0, x1] of spans) {
    for (const side of [-1, 1]) {
      paintGroundStripe(sheet, x0, CENTRE_LINE + side * parkingLine, x1, CENTRE_LINE + side * parkingLine, 0.12, 'rgba(232,230,220,0.6)');
      paintGroundStripe(sheet, x0, CENTRE_LINE + side * 0.12, x1, CENTRE_LINE + side * 0.12, 0.1, white);
      paintGroundStripe(sheet, x0 + 1, CENTRE_LINE + side * laneDash, x1, CENTRE_LINE + side * laneDash, 0.12, white, 3, 6);
    }
  }
  for (const side of [-1, 1]) paintGroundStripe(sheet, PARK_CENTRE + side * 0.12, PARK_LINE_Z[0], PARK_CENTRE + side * 0.12, PARK_LINE_Z[1], 0.1, white);
  // Zebras: bars along the traffic, one a metre across the road.
  ctx.fillStyle = 'rgba(232,230,222,0.85)';
  for (let v = NEAR_KERB + 0.6; v < KERB - 0.4; v += 1) {
    for (const c of CROSSINGS) ctx.fill(quad(c.from, v, c.to, v, 0, 0, 0, 0.5));
  }
  // Stop lines before the crossing with lights, across the lanes coming up to it.
  ctx.fillStyle = 'rgba(232,230,222,0.7)';
  ctx.fill(quad(FRONT_CROSSING[1] + STOP_LINE, ROAD.nearParking, FRONT_CROSSING[1] + STOP_LINE + 0.3, ROAD.nearParking, 0, 0, 0, CENTRE_LINE - 0.2 - ROAD.nearParking));
  ctx.fill(quad(FRONT_CROSSING[0] - STOP_LINE - 0.3, CENTRE_LINE + 0.2, FRONT_CROSSING[0] - STOP_LINE, CENTRE_LINE + 0.2, 0, 0, 0, PARKING_EDGE - CENTRE_LINE - 0.2));
  // The bus stop: a yellow box in the far parking lane, a dashed bar down it.
  const yellow = 'rgba(232,192,48,0.85)';
  const bx = BUS_STOP.stop[0];
  const [z0, z1] = [PARKING_EDGE + 0.1, KERB - 0.15];
  for (const z of [z0 + 0.06, z1 - 0.06]) paintGroundStripe(sheet, bx - 6, z, bx + 6, z, 0.12, yellow);
  for (const x of [bx - 5.94, bx + 5.94]) paintGroundStripe(sheet, x, z0, x, z1, 0.12, yellow);
  paintGroundStripe(sheet, bx - 5.2, (z0 + z1) / 2, bx + 5.2, (z0 + z1) / 2, 0.1, yellow, 0.4, 0.4);
}

/** Joints between the paving flags, and the dark line the kerbstones make along the edge, on both pavements. */
function paintPaving(sheet: Sheet): void {
  const ctx = sheet.color;
  for (const offset of [KERB + 0.35, KERB + 1.6, KERB + 2.8]) paintGroundLine(sheet, offset, 0.03, offset === KERB + 0.35 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)');
  for (const [offset, park] of [[NEAR_KERB - 0.35, PARK_NEAR_KERB - 0.35], [OUR_LINE + 1.3, PARK_OUR_LINE + 1.3], [OUR_LINE + 2.6, PARK_OUR_LINE + 2.6]] as const) {
    paintGroundLine(sheet, offset, 0.03, offset === NEAR_KERB - 0.35 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)', 1, 0, park);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  for (let s = -KERB; s < 140; s += 1.2) {
    ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot(s, KERB)));
    ctx.stroke(quad(s, KERB + 0.35, s, FRONTAGE, 0, 0));
    if (s < KERB) ctx.stroke(quad(-KERB - 0.35, -s, -FRONTAGE, -s, 0, 0));
  }
  // Our own pavement, right under the windows: its flags are big from up here.
  for (let s = -PARK_NEAR_KERB; s < 90; s += 1.2) {
    ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot(s, (OUR_LINE + NEAR_KERB) / 2)));
    ctx.stroke(quad(s, OUR_LINE, s, NEAR_KERB - 0.35, 0, 0));
  }
  for (let s = -NEAR_KERB; s < 60; s += 1.2) {
    ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot((PARK_OUR_LINE + PARK_NEAR_KERB) / 2, s)));
    ctx.stroke(quad(-(PARK_NEAR_KERB - 0.35), -s, -PARK_OUR_LINE, -s, 0, 0));
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
    const y = between(random, heightY(0, ground(a, KERB)), heightY(0, frontage(a, NEAR_KERB, PARK_NEAR_KERB)));
    ctx.fillRect(azimuthX(a), y, between(random, 1, 4), 1);
  }
  // The dark drip line down the middle of each lane, where engines stand and wheels do not roll.
  for (const lane of LANES) {
    for (const front of [true, false]) {
      for (let s = -8; s < 110; s += between(random, 2, 6)) {
        const len = between(random, 3, 9);
        const [x0, z0] = streetPoint(front, s, lane - 0.14);
        const [x1, z1] = streetPoint(front, s + len, lane - 0.14);
        const [dx, dz] = front ? [0, 0.28] : [-0.28, 0];
        ctx.fillStyle = `rgba(18,18,22,${between(random, 0.04, 0.09)})`;
        // Drawn either way (the same draws), painted only short of the building across the street's end.
        if (s + len < (front ? FRONT_REACH : PARK_REACH)) ctx.fill(quad(x0, z0, x1, z1, 0, 0, dx, dz));
        s += len;
      }
    }
  }
  // Patches of newer, darker asphalt where the road was dug up: ragged edges, a sealed seam round them.
  for (let i = 0; i < 12; i++) {
    const front = random() < 0.65;
    const [cx, cz] = streetPoint(front, between(random, -4, 70), between(random, front ? ROAD.nearParking : PARK_NEAR_KERB + 1, PARKING_EDGE));
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
    const shown = s + 8 < (front ? FRONT_REACH : PARK_REACH);
    let v = pick(random, [CYCLE_NEAR, NEAR_LANE - 0.75, NEAR_LANE + 0.75, FAR_LANE - 0.75, FAR_LANE + 0.75, ROAD.farCycle]) + between(random, -0.3, 0.3);
    ctx.strokeStyle = random() < 0.5 ? 'rgba(10,10,12,0.5)' : 'rgba(10,10,12,0.25)';
    ctx.lineWidth = Math.max(0.6, sizePx(0.04, Math.hypot(s, v)));
    ctx.beginPath();
    ctx.moveTo(...worldPoint(...streetPoint(front, s, v), 0));
    for (let k = integer(random, 3, 7); k > 0; k--) {
      s += between(random, 0.3, 1.2);
      v += between(random, -0.25, 0.25);
      ctx.lineTo(...worldPoint(...streetPoint(front, s, v), 0));
    }
    if (shown) ctx.stroke();
  }
  // The manhole covers where the walkable street has them.
  for (const [x, z] of STREET_DETAILS.manholes) paintManhole(sheet, x, z, 0.34);
  // Drain grilles in the gutters, both sides.
  ctx.fillStyle = '#26282a';
  for (let s = -12; s < 120; s += 22) {
    ctx.fill(quad(s, KERB - 0.5, s + 0.9, KERB - 0.5, 0, 0, 0, 0.45));
    if (s < 20) ctx.fill(quad(-KERB + 0.5, -s, -KERB + 0.5, -s - 0.9, 0, 0, -0.45, 0));
    ctx.fill(quad(s + 9, NEAR_KERB + 0.05, s + 9.9, NEAR_KERB + 0.05, 0, 0, 0, 0.45));
    if (s < 60) ctx.fill(quad(-(PARK_NEAR_KERB + 0.05), -s - 9, -(PARK_NEAR_KERB + 0.05), -s - 9.9, 0, 0, -0.45, 0));
  }
}

/**
 * Both streets, once the facades stand: the pavement under them, the kerb, the road down to the
 * bottom of the picture with its markings and wear, then everything standing on the pavements, far
 * to near, where the walkable street has it (`city/frontage`, `city/trees`): street trees in their
 * grilles, lamp posts, benches, bins, bike racks, bollards, hydrants, the newsstand, the bus
 * shelter, the Morris column, the traffic lights at the crossing, the terraces, the roadworks and
 * the parked cars; and the light the `shops` spill on the pavement until they close.
 */
export function paintStreet(sheet: Sheet, random: Rng, shops: readonly Storefront[]): void {
  paintGroundBand(sheet, (a) => ground(a, FRONTAGE), (a) => ground(a, KERB), () => PAVEMENT, -Math.PI, Math.PI, 0, PAVEMENT_SURFACE);
  paintGroundBand(sheet, (a) => ground(a, KERB), null, (a) => {
    const d = ground(a, KERB);
    const g = sheet.color.createLinearGradient(0, heightY(0, d), 0, heightY(0, frontage(a, NEAR_KERB, PARK_NEAR_KERB)));
    g.addColorStop(0, ASPHALT);
    g.addColorStop(1, shade(ASPHALT, 0.85));
    return g;
  }, -Math.PI, Math.PI, 0, ROAD_SURFACE);
  // Our own pavement, under the windows, down to the foot of the building.
  paintGroundBand(sheet, (a) => ground(a, NEAR_KERB, PARK_NEAR_KERB), null, () => shade(PAVEMENT, 0.97), -Math.PI, Math.PI, 0, PAVEMENT_SURFACE);
  paintPaving(sheet);
  // The kerbs: a light edge and the shadow of the face, which is on the road side of each.
  const ctx = sheet.color;
  const kerbs = [
    [KERB, KERB, 'rgba(225,220,208,0.85)', 1.8],
    [KERB - 0.25, KERB - 0.25, 'rgba(0,0,0,0.35)', 1.5],
    [NEAR_KERB, PARK_NEAR_KERB, 'rgba(225,220,208,0.85)', 2.6],
    [NEAR_KERB + 0.2, PARK_NEAR_KERB + 0.2, 'rgba(0,0,0,0.3)', 2.2],
  ] as const;
  for (const [offset, park, style, width] of kerbs) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let a = -Math.PI; a <= Math.PI + 1e-6; a += Math.PI / 360) {
      const d = frontage(a, offset, park);
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

  // The street trees, each in its grille, at their size.
  for (const { at, scale } of STREET_TREES) {
    const [x, z] = inFlatFrame(at);
    paintTreeGrate(sheet, x, z);
    add(x, z, () => {
      const shape = { x, z, height: treeHeight(scale), radius: TREE_FORM.crown * scale, style: pick(random, TREE_STYLES.slice(0, 3)), form: 'round' as const };
      paintTree(sheet, random, shape);
      paintTreeLights(sheet, x, z, shape.radius, 3, shape.height);
    });
  }
  // Lamp posts; the far ones wash the facade behind them.
  // Each of its kind, its lens at the walkable street's height (`LAMP_DESIGNS`).
  for (const { x, z, far, design } of LAMPS) add(x, z, () => paintLamp(sheet, x, z, LAMP_DESIGNS[design].lens ?? LAMP_HEIGHT, LAMP_DESIGNS[design].pool * 0.7, far ? FRONTAGE - LAMP_LINE : 0, design));
  for (const { at: [x, z], yaw } of BENCHES) add(x, z, () => paintBench(sheet, { x, z, along: facing(yaw) }));
  for (const [x, z] of STREET_BINS) add(x, z, () => paintBin(sheet, x, z));
  // Bikes stand across their rack, whichever pavement it is on.
  for (const { at: [x, z], yaw, bikes } of BIKE_RACKS) add(x, z, () => paintBikeRack(sheet, random, { x, z, along: Math.abs(Math.sin(yaw)) > 0.5 ? [0, 1] : [1, 0] }, bikes));
  for (const [x, z] of STREET_DETAILS.bollards) add(x, z, () => paintBollard(sheet, x, z));
  for (const [x, z] of STREET_DETAILS.hydrants) add(x, z, () => paintHydrant(sheet, x, z));
  const [kx, kz] = KIOSK.at;
  add(kx, kz, () => paintNewsstand(sheet, random, { x: kx, z: kz, along: facing(KIOSK.yaw) }));
  add(BUS_SHELTER.x, BUS_SHELTER.z, () => paintBusShelter(sheet, random, { x: BUS_SHELTER.x, z: BUS_SHELTER.z, along: facing(STREET_PLAN.shelter.yaw) }));
  const [cx, cz] = STREET_DETAILS.column.at;
  add(cx, cz, () => paintAdColumn(sheet, random, cx, cz));
  for (const [x, z] of SIGNAL_POSTS) add(x, z, () => paintTrafficLight(sheet, x, z));
  for (const terrace of TERRACES) add((terrace.from + terrace.to) / 2, terrace.z, () => paintTerrace(sheet, random, terrace.from, terrace.to, terrace.z));
  paintRoadworks(sheet, random, add);

  // The light the shop windows spill on the pavement until they close.
  for (const shop of shops) {
    const x0 = FRONTAGE * Math.tan(shop.a0);
    const x1 = FRONTAGE * Math.tan(shop.a1);
    const mid = (x0 + x1) / 2;
    const spill = FRONTAGE - 1.6;
    const [sx, sy] = worldPoint(mid, spill, 0);
    const d = Math.hypot(mid, spill);
    const rx = sizePx((x1 - x0) * 0.55, d);
    sheet.glow(sx, sy, rx, Math.max(1, sizePx(2, d) * 0.7), shop.light === 'cool' ? 0.18 : 0.24, shop.closing);
  }

  // The parked cars where the walkable street parks them, the same shape and paint (yaw 0 = nose to +x, -π/2 = to +z).
  for (const { at, yaw, shape, paint } of PARKED_CARS) {
    const [x, z] = inFlatFrame(at);
    const body = PARKED_BODIES[shape];
    const along: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
    const across: [number, number] = [-along[1], along[0]];
    const corner = { x: x - (along[0] * body.length + across[0] * body.width) / 2, z: z - (along[1] * body.length + across[1] * body.width) / 2 };
    add(x, z, () => paintParkedCar(sheet, { ...corner, along, across }, body, `#${paint.toString(16).padStart(6, '0')}`));
  }
  // The holiday strings slung across both streets, piece by piece in the same order.
  for (const [x, z, draw] of holidayStreetItems(sheet)) add(x, z, draw);
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();
}

/**
 * The roadworks closing the walkable street (`roadworks()`, where they stand today): across Front Street and across Park
 * Street, a hoarding over each pavement, barriers over the parking lanes, a line of cones past them
 * where the traffic lanes open.
 */
function paintRoadworks(sheet: Sheet, random: Rng, add: (x: number, z: number, draw: () => void) => void): void {
  const { height } = STREET_PLAN.roadworks;
  const { front, park } = roadworks();
  for (const [z0, z1] of front.pavements) add(front.x, (z0 + z1) / 2, () => paintHoarding(sheet, random, front.x, z0, front.x, z1, height));
  for (const [z0, z1] of front.parking) add(front.x, (z0 + z1) / 2, () => paintBarriers(sheet, front.x, z0, front.x, z1));
  for (const [x0, x1] of park.pavements) add((x0 + x1) / 2, park.z, () => paintHoarding(sheet, random, x0, park.z, x1, park.z, height));
  for (const [x0, x1] of park.parking) add((x0 + x1) / 2, park.z, () => paintBarriers(sheet, x0, park.z, x1, park.z));
  // Cones along the parking lanes' inner edges, past the works.
  for (const z of [front.parking[0]![1], front.parking[1]![0]]) for (let k = 1; k <= 3; k++) add(front.x + k * 2, z, () => paintCone(sheet, front.x + k * 2, z));
  for (const x of [park.parking[0]![0], park.parking[1]![1]]) for (let k = 1; k <= 3; k++) add(x, park.z - k * 2, () => paintCone(sheet, x, park.z - k * 2));
}
