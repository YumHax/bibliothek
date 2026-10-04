import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VEHICLES } from '../city/vehicles';
import { LAMP_ROLE } from './traffic/lampMaterial';
import { standard } from '../materials/palette';
import { gapAt, onSurface, type SurfaceLayer } from '../surface/layers';

/**
 * A vehicle's glass over its body: a centimetre proud of the panels where it shows, up to 6 cm behind them where the
 * doors' tops hide its edge. One rank (`UNITS_PER_RANK` steps) holds the first at any distance and keeps the second
 * hidden out to 130 m; a deeper one would pull the hidden edge through the doors down the street.
 */
export const VEHICLE_GLASS: SurfaceLayer = { lift: 0.01, rank: 1 };

/** A vehicle's glass material (on `glass` geometry), drawn as `VEHICLE_GLASS`. */
export function vehicleGlass(color = 0x1a232b): THREE.MeshStandardMaterial {
  return onSurface(standard({ color, roughness: 0.06 }), VEHICLE_GLASS);
}

/** A small hatchback at real scale (`city/vehicles`), nose to +x, wheels on y = 0, centred. */
const CAR = VEHICLES.car;

/** The street's car shapes: the hatchback, a saloon with a boot, a small panel van (parked, and the delivery van). */
export type CarModelId = 'hatch' | 'saloon' | 'van';

/** Outer size of a vehicle, metres: nose to +x, wheels on y = 0, centred on x and z. */
export interface VehicleSize {
  length: number;
  width: number;
  height: number;
}

export const CAR_SIZES: Record<CarModelId, VehicleSize> = {
  hatch: { length: CAR.length, width: CAR.width, height: CAR.height },
  saloon: VEHICLES.saloon,
  van: VEHICLES.van,
};

/** The parts of the car, one geometry per material so every car on the street shares each draw call. */
interface CarGeometries {
  /** Painted body and roof (tinted per car). */
  body: THREE.BufferGeometry;
  /** The glasshouse. */
  glass: THREE.BufferGeometry;
  /**
   * Tyres with their spoked rims (turning about their axles: `traffic/wheelSpin`), the dark
   * underbody, the bumpers and the cabin seen through the glass, as vertex colours.
   */
  wheels: THREE.BufferGeometry;
  /** Head, tail, indicator and reversing lamps, the plates and the grille, as vertex colours with their `LAMP_ROLE` (`traffic/lampMaterial`). */
  lamps: THREE.BufferGeometry;
}

/** Steps round a body's bevel: with creased normals (`finish`) the edges read rounded, not chamfered. */
const BEVEL_SEGMENTS = 3;
/** Faces meeting at less than this share their normals (the bevels, the tyre's shoulders); sharper edges stay sharp. */
const CREASE = THREE.MathUtils.degToRad(38);
/** Round a tyre: enough that its silhouette reads round from a pavement away. */
const TYRE_SEGMENTS = 20;
/** Spokes of a wheel's rim, proud of its dark disc: what shows a wheel turning. */
const SPOKES = 5;

function prism(points: [number, number][], width: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: BEVEL_SEGMENTS, curveSegments: 1 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.clearGroups();
  return g;
}

export function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  out.clearGroups();
  return out;
}

/** A box, uv-less and non-indexed, centred at (x, y, z). */
export function block(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return plain(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}

/** Colour (vertex colours, linear) and `wheelHub` (the axle a part turns about, or none) on a part of the wheels' mesh. */
export function trimPart(g: THREE.BufferGeometry, color: THREE.Color, hub: readonly [number, number] | null = null): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const hubs = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    color.toArray(colors, i * 3);
    if (hub) {
      hubs[i * 3] = hub[0];
      hubs[i * 3 + 1] = hub[1];
      hubs[i * 3 + 2] = 1;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('wheelHub', new THREE.BufferAttribute(hubs, 3));
  return g;
}

/**
 * A tyre turned on a lathe, axis along z: tread, rounded shoulders into the sidewalls, and the
 * sidewall running in to the rim, with a recessed dark wheel disc. Keeps its own smooth normals.
 */
export function tyre(radius: number, width: number): THREE.BufferGeometry {
  const half = width / 2;
  const fillet = Math.min(0.045, width * 0.22, radius * 0.18);
  const rim = radius * 0.64;
  const profile: THREE.Vector2[] = [new THREE.Vector2(rim, -half + 0.012)];
  const shoulder = (cx: number, cy: number, from: number): void => {
    for (let i = 0; i <= 4; i++) {
      const a = from + (i / 4) * (Math.PI / 2);
      profile.push(new THREE.Vector2(cx + Math.cos(a) * fillet, cy + Math.sin(a) * fillet));
    }
  };
  shoulder(radius - fillet, -half + fillet, -Math.PI / 2);
  shoulder(radius - fillet, half - fillet, 0);
  profile.push(new THREE.Vector2(rim, half - 0.012));
  // The lathe turns about y and faces outward for a profile going up the outside (+y): the tyre's axis becomes z.
  const lathe = new THREE.LatheGeometry(profile, TYRE_SEGMENTS).rotateX(Math.PI / 2);
  const disc = new THREE.CylinderGeometry(rim, rim, width - 0.05, TYRE_SEGMENTS).rotateX(Math.PI / 2);
  return mergeGeometries([plain(lathe), plain(disc)])!;
}

/** A rim's spokes and its centre cap on the disc's outer face (`side` +1: the +z face), centred on the axle. */
export function spokes(radius: number, width: number, side: 1 | -1): THREE.BufferGeometry {
  const rim = radius * 0.64;
  const z = side * ((width - 0.05) / 2 + 0.006);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    const length = rim * 0.86;
    parts.push(plain(new THREE.BoxGeometry(length, rim * 0.2, 0.014).translate(length / 2, 0, 0).rotateZ(a).translate(0, 0, z)));
  }
  parts.push(plain(new THREE.CylinderGeometry(rim * 0.24, rim * 0.24, 0.02, 10).rotateX(Math.PI / 2).translate(0, 0, z)));
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

const TYRE = new THREE.Color(0x151515);
const RIM = new THREE.Color(0x8d939a);
const UNDERBODY = new THREE.Color(0x101112);
/** Black plastic: bumpers, mirror stalks' bases. */
const PLASTIC = new THREE.Color(0x26272a);
/** The cabin seen through the glass: seats, headrests, the dashboard. */
const CABIN = new THREE.Color(0x1d1e21);

/**
 * Tyres at `axles` (x), `track` apart, each with its spoked rim on the outer face (turning about
 * its axle: `wheelHub`), the dark underbody between them, and any `trim` (bumpers, the cabin), all
 * one geometry with vertex colours: one draw call for everything dark on a vehicle.
 */
function tyres(axles: readonly number[], track: number, radius: number, length: number, width: number, tyreWidth = 0.22, trim: readonly THREE.BufferGeometry[] = []): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const one = tyre(radius, tyreWidth);
  const outer = spokes(radius, tyreWidth, 1);
  const inner = spokes(radius, tyreWidth, -1);
  for (const x of axles) {
    for (const side of [-1, 1] as const) {
      const z = (side * track) / 2;
      parts.push(trimPart(one.clone().translate(x, radius, z), TYRE, [x, radius]));
      parts.push(trimPart((side > 0 ? outer : inner).clone().translate(x, radius, z), RIM, [x, radius]));
    }
  }
  one.dispose();
  outer.dispose();
  inner.dispose();
  parts.push(trimPart(block(length - 0.5, 0.16, width - 0.3, 0, radius - 0.02, 0), UNDERBODY));
  parts.push(...trim);
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

const WHITE = new THREE.Color(1, 0.95, 0.85);
const RED = new THREE.Color(0.9, 0.05, 0.04);
const AMBER = new THREE.Color(1, 0.55, 0.05);
/** The front plate (white), the back one (yellow), their letters, the grille. */
const PLATE_FRONT = new THREE.Color(0.86, 0.86, 0.84);
const PLATE_BACK = new THREE.Color(0.9, 0.72, 0.12);
const LETTERS = new THREE.Color(0.02, 0.02, 0.025);
const GRILLE = new THREE.Color(0.012, 0.013, 0.014);

/** Lamp faces (quads facing ±x) with their colour as vertex colours and their `LAMP_ROLE`, merged. */
export class LampSet {
  private readonly parts: THREE.BufferGeometry[] = [];

  add(x: number, y: number, z: number, facing: 1 | -1, color: THREE.Color, w = 0.3, h = 0.12, role: number = facing > 0 ? LAMP_ROLE.head : LAMP_ROLE.tail): this {
    const g = plain(new THREE.PlaneGeometry(w, h).rotateY((facing * Math.PI) / 2).translate(x, y, z));
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('lampRole', new THREE.BufferAttribute(new Float32Array(count).fill(role), 1));
    this.parts.push(g);
    return this;
  }

  /** A number plate on the face at `x` (facing ±x), its seven letters printed proud of it. */
  plate(x: number, y: number, facing: 1 | -1, color: THREE.Color): this {
    this.add(x, y, 0, facing, color, 0.52, 0.11, LAMP_ROLE.plate);
    for (let i = 0; i < 7; i++) this.add(x + facing * 0.008, y, (i - 3) * 0.064 + (i > 3 ? 0.02 : 0) - 0.01, facing, LETTERS, 0.04, 0.07, LAMP_ROLE.plate);
    return this;
  }

  /**
   * The indicators at the four corners (`front` and `back` x, `y`, `z` out from the middle), on their sides: standing
   * a real gap proud of the face, as they run onto the head and tail lamps' corners (one mesh: no offset parts them).
   */
  indicators(front: number, back: number, y: number, z: number, backY = y): this {
    const proud = gapAt(40);
    for (const [side, role] of [[-1, LAMP_ROLE.left], [1, LAMP_ROLE.right]] as const) {
      this.add(front + proud, y, side * z, 1, AMBER, 0.1, 0.08, role).add(back - proud, backY, side * z, -1, AMBER, 0.1, 0.08, role);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    return mergeGeometries(this.parts)!;
  }
}

/** Smooth normals across the bevels (creased at sharp edges); the tyres keep their lathe's. */
function finish(out: CarGeometries): CarGeometries {
  const creased = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const c = toCreasedNormals(g, CREASE);
    if (c !== g) g.dispose();
    return c;
  };
  return { ...out, body: creased(out.body), glass: creased(out.glass), lamps: creased(out.lamps) };
}

/** What every car shape has round its body, by the shape's measurements. */
interface Dressing {
  length: number;
  width: number;
  /** Front and back faces (x, the bevel's outside), the bumpers' height (centre). */
  front: number;
  back: number;
  bumperY: number;
  /** The door mirrors: x (the windscreen's foot), y. */
  mirror: readonly [number, number];
  /** The seat rows' backs (x), the belt line under the glass (y) and the dashboard's x. */
  seats: readonly number[];
  belt: number;
  dash: number;
  /** The plates' heights at the front and the back. */
  plates: readonly [number, number];
}

/** Bumpers, the cabin (seats and headrests over the belt line, the dashboard), for the dark mesh. */
function trimOf(d: Dressing): THREE.BufferGeometry[] {
  const parts = [
    trimPart(block(0.12, 0.16, d.width - 0.02, d.front - 0.04, d.bumperY, 0), PLASTIC),
    trimPart(block(0.12, 0.16, d.width - 0.02, d.back + 0.04, d.bumperY + 0.04, 0), PLASTIC),
    trimPart(block(0.3, 0.1, d.width - 0.4, d.dash, d.belt + 0.04, 0), CABIN),
  ];
  // The front seats, then a bench behind; a headrest over each outer place.
  d.seats.forEach((x, row) => {
    if (row > 0) parts.push(trimPart(block(0.14, 0.42, d.width - 0.5, x, d.belt + 0.08, 0), CABIN));
    for (const z of [-0.38, 0.38]) {
      if (row === 0) parts.push(trimPart(block(0.14, 0.42, 0.46, x, d.belt + 0.08, z), CABIN));
      parts.push(trimPart(block(0.1, 0.17, 0.24, x - 0.02, d.belt + 0.35, z), CABIN));
    }
  });
  return parts;
}

/** The door mirrors, in the body's paint: a stalk out of the door and the housing. */
function mirrors(d: Dressing): THREE.BufferGeometry[] {
  const [x, y] = d.mirror;
  return [-1, 1].flatMap((side) => [block(0.06, 0.05, 0.12, x, y, side * (d.width / 2 + 0.03)), block(0.1, 0.11, 0.17, x - 0.02, y + 0.03, side * (d.width / 2 + 0.13))]);
}

/** Plates, the grille between the headlamps, the indicators and the reversing lamps, added to a shape's lamps. */
function dress(lamps: LampSet, d: Dressing, lampY: number, tailY: number, grille: readonly [number, number]): LampSet {
  const [gw, gh] = grille;
  lamps.add(d.front + 0.025, lampY - 0.04, 0, 1, GRILLE, gw, gh, LAMP_ROLE.plate);
  lamps.plate(d.front + 0.03, d.plates[0], 1, PLATE_FRONT).plate(d.back - 0.03, d.plates[1], -1, PLATE_BACK);
  lamps.indicators(d.front + 0.03, d.back - 0.01, lampY, d.width / 2 - 0.09, tailY);
  for (const z of [-0.28, 0.28]) lamps.add(d.back - 0.01, tailY - 0.02, z, -1, WHITE, 0.12, 0.08, LAMP_ROLE.reverse);
  return lamps;
}

/** Where a driver sits in each shape (left-hand drive: the -z side), for the figure seen through the glass: the seat's x, the belt line. */
export const DRIVER_SEAT: Record<CarModelId, { x: number; belt: number; z: number }> = {
  hatch: { x: -0.42, belt: 0.95, z: -0.38 },
  saloon: { x: -0.3, belt: 0.92, z: -0.38 },
  van: { x: 0.55, belt: 1.2, z: -0.38 },
};

/** Builds a car shape's geometries once; every car of that shape (parked or driving) instances them. */
export function carGeometries(model: CarModelId = 'hatch'): CarGeometries {
  if (model === 'saloon') return saloon();
  if (model === 'van') return van();
  const half = CAR.length / 2;
  const d: Dressing = { length: CAR.length, width: CAR.width, front: half + 0.05, back: -half - 0.05, bumperY: 0.4, mirror: [0.82, 1.0], seats: [DRIVER_SEAT.hatch.x, -1.25], belt: DRIVER_SEAT.hatch.belt, dash: 0.62, plates: [0.4, 0.62] };
  const body = prism([[-half, 0.3], [half, 0.3], [half + 0.02, 0.7], [half - 0.18, 0.84], [0.9, 0.96], [-1.78, 1.0], [-half, 0.94]], CAR.width, 0.05);
  const roof = prism([[0.2, 1.38], [-1.14, 1.38], [-1.14, CAR.height], [0.12, CAR.height]], CAR.width - 0.24, 0.02);
  const glass = prism([[0.92, 0.95], [0.2, 1.4], [-1.12, 1.4], [-1.8, 0.98]], CAR.width - 0.18, 0);
  const lamps = new LampSet();
  // The bevel pushes the body 5 cm out: the lamps sit about a centimetre proud of it.
  for (const z of [-0.58, 0.58]) lamps.add(half + 0.08, 0.66, z, 1, WHITE).add(-half - 0.06, 0.78, z, -1, RED);
  return finish({
    body: mergeGeometries([plain(body), plain(roof), ...mirrors(d)])!,
    glass: plain(glass),
    wheels: tyres([-1.34, 1.36], CAR.width - 0.26, CAR.wheelRadius, CAR.length, CAR.width, 0.22, trimOf(d)),
    lamps: dress(lamps, d, 0.66, 0.78, [0.5, 0.12]).build(),
  });
}

/** A four-door saloon: long bonnet, cabin in the middle, a boot. */
function saloon(): CarGeometries {
  const { length, width, height } = CAR_SIZES.saloon;
  const half = length / 2;
  const d: Dressing = { length, width, front: half + 0.05, back: -half - 0.05, bumperY: 0.4, mirror: [0.92, 0.98], seats: [DRIVER_SEAT.saloon.x, -1.1], belt: DRIVER_SEAT.saloon.belt, dash: 0.7, plates: [0.4, 0.6] };
  const body = prism([[-half, 0.3], [half, 0.3], [half + 0.02, 0.66], [half - 0.22, 0.8], [0.95, 0.9], [-1.5, 0.95], [-half + 0.08, 0.96], [-half, 0.88]], width, 0.05);
  const roof = prism([[0.4, 1.36], [-1.0, 1.36], [-1.0, height], [0.3, height]], width - 0.26, 0.02);
  const glass = prism([[1.0, 0.89], [0.35, 1.38], [-1.02, 1.38], [-1.55, 0.94]], width - 0.2, 0);
  const lamps = new LampSet();
  for (const z of [-0.6, 0.6]) lamps.add(half + 0.08, 0.64, z, 1, WHITE, 0.34, 0.1).add(-half - 0.06, 0.78, z, -1, RED, 0.36, 0.12);
  return finish({
    body: mergeGeometries([plain(body), plain(roof), ...mirrors(d)])!,
    glass: plain(glass),
    wheels: tyres([-1.45, 1.42], width - 0.28, VEHICLES.saloon.wheelRadius, length, width, 0.22, trimOf(d)),
    lamps: dress(lamps, d, 0.64, 0.78, [0.6, 0.1]).build(),
  });
}

/** A small panel van: short bonnet, tall square box, glass only up front. */
function van(): CarGeometries {
  const { length, width, height } = CAR_SIZES.van;
  const half = length / 2;
  const d: Dressing = { length, width, front: half + 0.05, back: -half - 0.05, bumperY: 0.44, mirror: [1.25, 1.45], seats: [DRIVER_SEAT.van.x], belt: DRIVER_SEAT.van.belt, dash: 1.35, plates: [0.46, 0.55] };
  const body = prism([[-half, 0.34], [half, 0.34], [half + 0.02, 0.82], [half - 0.3, 1.06], [1.55, 1.22], [1.2, height], [-half, height]], width, 0.05);
  const glass = mergeGeometries([
    plain(prism([[1.6, 1.2], [1.24, 2.02], [1.1, 2.02], [1.1, 1.2]], width - 0.12, 0)),
    // Side windows of the cab.
    block(0.62, 0.62, width + 0.02, 0.78, 1.62, 0),
  ])!;
  const lamps = new LampSet();
  for (const z of [-0.66, 0.66]) lamps.add(half + 0.08, 0.72, z, 1, WHITE, 0.3, 0.14).add(-half - 0.06, 0.9, z, -1, RED, 0.14, 0.34);
  return finish({
    body: mergeGeometries([plain(body), ...mirrors(d)])!,
    glass,
    wheels: tyres([-1.6, 1.55], width - 0.3, VEHICLES.van.wheelRadius, length, width, 0.22, trimOf(d)),
    lamps: dress(lamps, d, 0.72, 0.9, [0.62, 0.16]).build(),
  });
}

/** The city bus: size, and where its doors and destination sign are (on the +z side, the kerb's, nose to +x). */
export const BUS = {
  length: VEHICLES.bus.length,
  width: VEHICLES.bus.width,
  height: VEHICLES.bus.height,
  /** Door openings along x (centre), on the +z side. */
  doors: [4.95, 0],
  doorWidth: 1.2,
  doorHeight: 2.35,
  /** The destination board over the windscreen: centre y, width, height. */
  sign: { y: 2.86, width: 1.9, height: 0.26 },
} as const;

/** The bus's parts: body (tinted), glass, tyres, lamps (vertex colours), and the livery stripe. */
interface BusGeometries extends CarGeometries {
  stripe: THREE.BufferGeometry;
  /** Indicator lamps on the +z (kerb) side, front and back, lit only while blinking. */
  indicators: THREE.BufferGeometry;
}

export function busGeometries(): BusGeometries {
  const { length, width, height } = BUS;
  const half = length / 2;
  const body = prism([[-half, 0.36], [half, 0.36], [half + 0.03, 0.95], [half, height - 0.25], [half - 0.18, height], [-half + 0.1, height], [-half, height - 0.1]], width, 0.04);
  // A glass band down each side, and the windscreen and back window; the door openings are glass too.
  const glass = mergeGeometries([
    block(length - 0.9, 1.35, width + 0.02, -0.25, 2.0, 0),
    block(0.06, 1.9, width - 0.2, half + 0.02, 1.85, 0),
    block(0.06, 1.1, width - 0.3, -half - 0.02, 2.1, 0),
    ...BUS.doors.map((x) => block(BUS.doorWidth, BUS.doorHeight - 0.2, width + 0.03, x, 0.45 + (BUS.doorHeight - 0.2) / 2, 0)),
  ])!;
  const stripe = block(length + 0.04, 0.3, width + 0.03, 0, 0.78, 0);
  const lamps = new LampSet();
  for (const z of [-0.95, 0.95]) lamps.add(half + 0.07, 0.62, z, 1, WHITE, 0.3, 0.16).add(-half - 0.06, 0.7, z, -1, RED, 0.2, 0.4);
  const indicators = new LampSet().add(half + 0.07, 0.62, 1.12, 1, AMBER, 0.14, 0.14).add(-half - 0.06, 1.05, 1.12, -1, AMBER, 0.14, 0.16).build();
  return {
    ...finish({ body: plain(body), glass, wheels: tyres([-3.4, 3.9], width - 0.34, VEHICLES.bus.wheelRadius, length, width, 0.32), lamps: lamps.build() }),
    stripe,
    indicators,
  };
}

/** The bin lorry: a cab and the compactor body behind it, three axles, nose to +x. */
export const LORRY = VEHICLES.lorry;

interface LorryGeometries extends CarGeometries {
  /** The orange beacon on the cab's roof. */
  beacon: THREE.BufferGeometry;
}

export function lorryGeometries(): LorryGeometries {
  const { length, width, height } = LORRY;
  const half = length / 2;
  const cab = prism([[2.9, 0.5], [half, 0.5], [half + 0.02, 1.4], [half - 0.1, 2.9], [2.9, 2.95]], width, 0.04);
  const box = prism([[-half, 0.7], [2.8, 0.7], [2.8, height], [-half + 0.5, height], [-half, height - 0.6]], width - 0.05, 0.04);
  const glass = mergeGeometries([block(0.06, 0.95, width - 0.25, half + 0.03, 2.2, 0), block(0.8, 0.8, width + 0.02, 3.85, 2.25, 0)])!;
  const lamps = new LampSet();
  for (const z of [-1.0, 1.0]) lamps.add(half + 0.07, 0.8, z, 1, WHITE, 0.28, 0.16).add(-half - 0.06, 1.0, z, -1, RED, 0.2, 0.3);
  const beacon = plain(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10).translate(3.8, 3.03, 0));
  return {
    ...finish({ body: mergeGeometries([plain(cab), plain(box)])!, glass, wheels: tyres([-3.1, -1.8, 3.5], width - 0.34, VEHICLES.lorry.wheelRadius, length, width, 0.34), lamps: lamps.build() }),
    beacon,
  };
}

/** A bicycle, nose to +x, wheels on y = 0: frame and bars (metal) and the two wheels, as one geometry. */
export const BIKE = { length: 1.75, wheelBase: 1.04, wheelRadius: 0.34, crank: { x: 0, y: 0.3, radius: 0.17 }, hip: { x: -0.14, y: 0.95 }, bars: { x: 0.44, y: 1.03 } } as const;

/** A thin tube between two points of the bike's plane (x, y) at depth z. */
export function tube(a: readonly [number, number], b: readonly [number, number], radius: number, z = 0): THREE.BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(radius * 2, length, radius * 2);
  g.rotateZ(Math.atan2(dy, dx) - Math.PI / 2);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
  return plain(g);
}

export function bikeGeometry(): THREE.BufferGeometry {
  const r = BIKE.wheelRadius;
  const rear: [number, number] = [-BIKE.wheelBase / 2, r];
  const front: [number, number] = [BIKE.wheelBase / 2, r];
  const crank: [number, number] = [BIKE.crank.x, BIKE.crank.y];
  const seat: [number, number] = [-0.14, 0.86];
  const head: [number, number] = [0.4, 0.92];
  const parts = [
    tube(rear, crank, 0.014), tube(crank, seat, 0.016), tube(seat, rear, 0.012), tube(seat, head, 0.016), tube(crank, head, 0.018),
    tube(head, front, 0.014), tube(head, [BIKE.bars.x, BIKE.bars.y], 0.014),
    block(0.03, 0.03, 0.5, BIKE.bars.x, BIKE.bars.y, 0),
    block(0.22, 0.05, 0.1, seat[0] - 0.02, seat[1] + 0.03, 0),
  ];
  for (const [x, y] of [rear, front]) {
    parts.push(plain(new THREE.TorusGeometry(r - 0.02, 0.022, 6, 20).translate(x, y, 0)));
    parts.push(plain(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6).rotateX(Math.PI / 2).translate(x, y, 0)));
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}
