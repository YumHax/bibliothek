import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A small hatchback at real scale, nose to +x, wheels on y = 0, centred. */
export const CAR = { length: 4.2, width: 1.74, height: 1.46, wheelRadius: 0.32 } as const;

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

/** Builds the car's geometries once; every car (parked or driving) instances them. */
export function carGeometries(): CarGeometries {
  const half = CAR.length / 2;
  const body = prism([[-half, 0.3], [half, 0.3], [half + 0.02, 0.7], [half - 0.18, 0.84], [0.9, 0.96], [-1.78, 1.0], [-half, 0.94]], CAR.width, 0.05);
  const roof = prism([[0.2, 1.38], [-1.14, 1.38], [-1.14, CAR.height], [0.12, CAR.height]], CAR.width - 0.24, 0.02);
  const glass = prism([[0.92, 0.95], [0.2, 1.4], [-1.12, 1.4], [-1.8, 0.98]], CAR.width - 0.18, 0);

  const tyres: THREE.BufferGeometry[] = [];
  for (const x of [-1.34, 1.36]) {
    for (const z of [-1, 1]) {
      tyres.push(plain(new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.22, 12).rotateX(Math.PI / 2).translate(x, CAR.wheelRadius, z * (CAR.width / 2 - 0.13))));
    }
  }
  tyres.push(plain(new THREE.BoxGeometry(CAR.length - 0.5, 0.16, CAR.width - 0.3).translate(0, 0.3, 0)));

  const lamps: THREE.BufferGeometry[] = [];
  const addLamp = (x: number, z: number, facing: 1 | -1, color: THREE.Color): void => {
    const g = plain(new THREE.PlaneGeometry(0.3, 0.12).rotateY((facing * Math.PI) / 2).translate(x, 0.66, z));
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    lamps.push(g);
  };
  const white = new THREE.Color(1, 0.95, 0.85);
  const red = new THREE.Color(0.9, 0.05, 0.04);
  for (const z of [-0.58, 0.58]) {
    addLamp(half + 0.035, z, 1, white);
    addLamp(-half - 0.005, z, -1, red);
  }

  const out: CarGeometries = {
    body: mergeGeometries([plain(body), plain(roof)])!,
    glass: plain(glass),
    wheels: mergeGeometries(tyres)!,
    lamps: mergeGeometries(lamps)!,
  };
  for (const g of Object.values(out)) g.computeVertexNormals();
  return out;
}
