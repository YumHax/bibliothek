import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { paint } from '../materials/palette';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BulbString } from './courtyardPlan';

/** A bulb's radius, the wire's thickness. */
const BULB = 0.035;
const WIRE = 0.008;
/** Segments of wire along a string's curve. */
const SEGMENTS = 24;
/** The bulbs' colours, in turn along a string: warm white, amber, red, green, blue. */
const COLOURS = [0xfff1c8, 0xffb347, 0xff5a4a, 0x7ee07a, 0x6aa8ff];

/**
 * Party bulbs strung between the courtyard's walls (`COURTYARD_PLAN.party.strings`): a sagging wire each (a parabola
 * from wall to wall), merged into one mesh, and its bulbs as one `InstancedMesh` of unlit glass in turn-about colours.
 * No real light: `setLit` brightens or dims the glass (the party's one lamp lights the tables). Two draw calls for
 * every string. Built in the street's frame, origin at the street's (the builder offsets it).
 */
export class StringLights extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly glass: THREE.MeshBasicMaterial;

  constructor(strings: readonly BulbString[]) {
    super();
    this.name = 'StringLights';
    const wires: THREE.BufferGeometry[] = [];
    const bulbs: THREE.Vector3[] = [];
    for (const s of strings) {
      const points = Array.from({ length: SEGMENTS + 1 }, (_, i) => pointOn(s, i / SEGMENTS));
      for (let i = 0; i < SEGMENTS; i++) wires.push(segment(points[i]!, points[i + 1]!));
      for (let b = 0; b < s.bulbs; b++) bulbs.push(pointOn(s, (b + 0.5) / s.bulbs).add(new THREE.Vector3(0, -0.05, 0)));
    }
    const wire = new THREE.Mesh(mergeGeometries(wires)!, paint(0x1d1d1f, 0.6));
    for (const g of wires) g.dispose();
    this.add(wire);
    this.glass = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(BULB, 8, 6), this.glass, bulbs.length);
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    bulbs.forEach((p, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
      mesh.setColorAt(i, colour.setHex(COLOURS[i % COLOURS.length]!));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.add(mesh);
    this.traverse((obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
    });
    this.setLit(0);
  }

  /** 0 switched off (dull glass) .. 1 lit. */
  setLit(level: number): void {
    this.glass.color.setScalar(0.22 + 1.1 * level);
  }
}

/** The point at `t` (0..1) along a string: straight between its ends, sagging in a parabola. */
function pointOn(s: BulbString, t: number): THREE.Vector3 {
  const x = s.from[0] + (s.to[0] - s.from[0]) * t;
  const z = s.from[1] + (s.to[1] - s.from[1]) * t;
  return new THREE.Vector3(x, s.high - s.sag * 4 * t * (1 - t), z);
}

/** A length of wire from `a` to `b`: a thin box along the segment. */
function segment(a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  const length = a.distanceTo(b);
  const g = new THREE.BoxGeometry(WIRE, WIRE, length);
  g.lookAt(new THREE.Vector3().subVectors(b, a));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
