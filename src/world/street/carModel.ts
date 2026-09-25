import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A small hatchback at real scale, nose to +x, wheels on y = 0, centred. */
export const CAR = { length: 4.2, width: 1.74, height: 1.46, wheelRadius: 0.32 } as const;

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
  saloon: { length: 4.65, width: 1.8, height: 1.44 },
  van: { length: 4.9, width: 1.95, height: 2.3 },
};

/** The parts of the car, one geometry per material so every car on the street shares each draw call. */
export interface CarGeometries {
  /** Painted body and roof (tinted per car). */
  body: THREE.BufferGeometry;
  /** The glasshouse. */
  glass: THREE.BufferGeometry;
  /** Tyres and the dark underbody. */
  wheels: THREE.BufferGeometry;
  /** Headlamps (white) and tail lamps (red), as vertex colours. */
  lamps: THREE.BufferGeometry;
}

function prism(points: [number, number][], width: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.clearGroups();
  return g;
}

function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  out.clearGroups();
  return out;
}

/** A box, uv-less and non-indexed, centred at (x, y, z). */
function block(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return plain(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}

/** Four (or more) tyres at `axles` (x), `track` apart, and the dark underbody between them. */
function tyres(axles: readonly number[], track: number, radius: number, length: number, width: number, tyreWidth = 0.22): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of axles) {
    for (const z of [-1, 1]) {
      parts.push(plain(new THREE.CylinderGeometry(radius, radius, tyreWidth, 12).rotateX(Math.PI / 2).translate(x, radius, (z * track) / 2)));
    }
  }
  parts.push(block(length - 0.5, 0.16, width - 0.3, 0, radius - 0.02, 0));
  return mergeGeometries(parts)!;
}

const WHITE = new THREE.Color(1, 0.95, 0.85);
const RED = new THREE.Color(0.9, 0.05, 0.04);
const AMBER = new THREE.Color(1, 0.55, 0.05);

/** Lamp faces (quads facing ±x) with their colour as vertex colours, merged. */
class LampSet {
  private readonly parts: THREE.BufferGeometry[] = [];

  add(x: number, y: number, z: number, facing: 1 | -1, color: THREE.Color, w = 0.3, h = 0.12): this {
    const g = plain(new THREE.PlaneGeometry(w, h).rotateY((facing * Math.PI) / 2).translate(x, y, z));
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  build(): THREE.BufferGeometry {
    return mergeGeometries(this.parts)!;
  }
}

function finish(out: CarGeometries): CarGeometries {
  for (const g of Object.values(out)) g.computeVertexNormals();
  return out;
}

/** Builds a car shape's geometries once; every car of that shape (parked or driving) instances them. */
export function carGeometries(model: CarModelId = 'hatch'): CarGeometries {
  if (model === 'saloon') return saloon();
  if (model === 'van') return van();
  const half = CAR.length / 2;
  const body = prism([[-half, 0.3], [half, 0.3], [half + 0.02, 0.7], [half - 0.18, 0.84], [0.9, 0.96], [-1.78, 1.0], [-half, 0.94]], CAR.width, 0.05);
  const roof = prism([[0.2, 1.38], [-1.14, 1.38], [-1.14, CAR.height], [0.12, CAR.height]], CAR.width - 0.24, 0.02);
  const glass = prism([[0.92, 0.95], [0.2, 1.4], [-1.12, 1.4], [-1.8, 0.98]], CAR.width - 0.18, 0);
  const lamps = new LampSet();
  // The bevel pushes the body 5 cm out: the lamps sit about a centimetre proud of it.
  for (const z of [-0.58, 0.58]) lamps.add(half + 0.08, 0.66, z, 1, WHITE).add(-half - 0.06, 0.66, z, -1, RED);
  return finish({
    body: mergeGeometries([plain(body), plain(roof)])!,
    glass: plain(glass),
    wheels: tyres([-1.34, 1.36], CAR.width - 0.26, CAR.wheelRadius, CAR.length, CAR.width),
    lamps: lamps.build(),
  });
}

/** A four-door saloon: long bonnet, cabin in the middle, a boot. */
function saloon(): CarGeometries {
  const { length, width, height } = CAR_SIZES.saloon;
  const half = length / 2;
  const body = prism([[-half, 0.3], [half, 0.3], [half + 0.02, 0.66], [half - 0.22, 0.8], [0.95, 0.9], [-1.5, 0.95], [-half + 0.08, 0.96], [-half, 0.88]], width, 0.05);
  const roof = prism([[0.4, 1.36], [-1.0, 1.36], [-1.0, height], [0.3, height]], width - 0.26, 0.02);
  const glass = prism([[1.0, 0.89], [0.35, 1.38], [-1.02, 1.38], [-1.55, 0.94]], width - 0.2, 0);
  const lamps = new LampSet();
  for (const z of [-0.6, 0.6]) lamps.add(half + 0.08, 0.64, z, 1, WHITE, 0.34, 0.1).add(-half - 0.06, 0.78, z, -1, RED, 0.36, 0.12);
  return finish({
    body: mergeGeometries([plain(body), plain(roof)])!,
    glass: plain(glass),
    wheels: tyres([-1.45, 1.42], width - 0.28, 0.33, length, width),
    lamps: lamps.build(),
  });
}

/** A small panel van: short bonnet, tall square box, glass only up front. */
function van(): CarGeometries {
  const { length, width, height } = CAR_SIZES.van;
  const half = length / 2;
  const body = prism([[-half, 0.34], [half, 0.34], [half + 0.02, 0.82], [half - 0.3, 1.06], [1.55, 1.22], [1.2, height], [-half, height]], width, 0.05);
  const glass = mergeGeometries([
    plain(prism([[1.6, 1.2], [1.24, 2.02], [1.1, 2.02], [1.1, 1.2]], width - 0.12, 0)),
    // Side windows of the cab.
    block(0.62, 0.62, width + 0.02, 0.78, 1.62, 0),
  ])!;
  const lamps = new LampSet();
  for (const z of [-0.66, 0.66]) lamps.add(half + 0.08, 0.72, z, 1, WHITE, 0.3, 0.14).add(-half - 0.06, 0.9, z, -1, RED, 0.14, 0.34);
  return finish({
    body: plain(body),
    glass,
    wheels: tyres([-1.6, 1.55], width - 0.3, 0.34, length, width),
    lamps: lamps.build(),
  });
}

/** The city bus: size, and where its doors and destination sign are (on the +z side, the kerb's, nose to +x). */
export const BUS = {
  length: 12,
  width: 2.5,
  height: 3.1,
  /** Door openings along x (centre), on the +z side. */
  doors: [4.95, 0],
  doorWidth: 1.2,
  doorHeight: 2.35,
  /** The destination board over the windscreen: centre y, width, height. */
  sign: { y: 2.86, width: 1.9, height: 0.26 },
} as const;

/** The bus's parts: body (tinted), glass, tyres, lamps (vertex colours), and the livery stripe. */
export interface BusGeometries extends CarGeometries {
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
    ...finish({ body: plain(body), glass, wheels: tyres([-3.4, 3.9], width - 0.34, 0.5, length, width, 0.32), lamps: lamps.build() }),
    stripe,
    indicators,
  };
}

/** The bin lorry: a cab and the compactor body behind it, three axles, nose to +x. */
export const LORRY = { length: 9, width: 2.5, height: 3.4 } as const;

export interface LorryGeometries extends CarGeometries {
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
    ...finish({ body: mergeGeometries([plain(cab), plain(box)])!, glass, wheels: tyres([-3.1, -1.8, 3.5], width - 0.34, 0.5, length, width, 0.34), lamps: lamps.build() }),
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
