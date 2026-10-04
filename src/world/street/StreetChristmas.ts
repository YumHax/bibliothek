import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { instancedBasic } from '../materials/palette';
import { BULBS } from '../props/outdoors/Holiday';
import { PARK_FIR } from '../city/park';
import { TREE_FORM, type PlantedTree } from '../city/trees';
import { nightnessOf } from './streetAir';
import { snowCovered } from './snowCover';
import { FLAT_IN_STREET } from '@/world/measures/street';
import { lcg } from '@/random';

interface StreetChristmasOptions {
  /** The street trees the bulbs are wound round (not the park's). */
  trees: readonly PlantedTree[];
}

/** Bulbs per street tree, their size, and how often some twinkle. */
const PER_TREE = 34;
const BULB = 0.05;
const TWINKLE_SECONDS = 0.4;
/** The fir's bulbs: how many turns of garland, how many bulbs. */
const FIR_TURNS = 7;
const FIR_BULBS = 140;

/**
 * Christmas on the walkable street, as the window view paints it (`props/outdoors/Holiday`): bulbs
 * wound round the street trees' crowns, and in the park beyond the hedge the tall fir (`city/park`'s
 * `PARK_FIR`, where the view has it) with garlands of bulbs spiralling up it and a star on top. The
 * bulbs are unlit spheres (no light of their own: the light count never changes), dim by day,
 * bright at night, a few twinkling. Placed only at Christmas (`furnishStreet`). Decoration: never collides.
 */
export class StreetChristmas extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly bulbs: THREE.InstancedMesh;
  private readonly colors: THREE.Color[] = [];
  private readonly scratch = new THREE.Color();
  private readonly random = lcg(2412);
  private readonly star: THREE.MeshBasicMaterial;
  private clock = TWINKLE_SECONDS;

  constructor(private readonly dayNight: DayNight, options: StreetChristmasOptions) {
    super();
    this.name = 'StreetChristmas';
    const random = lcg(1225);
    const points: THREE.Vector3[] = [];
    // Round each street tree's crown: on its surface, mostly its upper two thirds.
    for (const { at, scale } of options.trees) {
      const centre = new THREE.Vector3(at[0], (TREE_FORM.trunk + 0.6) * scale, at[1]);
      const radius = TREE_FORM.crown * scale * 0.95;
      for (let i = 0; i < PER_TREE; i++) {
        const y = -0.55 + random() * 1.45;
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y))) * radius;
        points.push(new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + y * radius * 0.85, centre.z + Math.sin(a) * r));
      }
    }
    // The park's fir, in the street's frame.
    const fx = PARK_FIR.x + FLAT_IN_STREET.x;
    const fz = PARK_FIR.z + FLAT_IN_STREET.z;
    const { height, radius } = PARK_FIR;
    // The fir: whorls of drooping sprays round a tapering trunk, wider and further apart towards the foot, one merged mesh.
    const needles = snowCovered(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, vertexColors: true }));
    const fir = new THREE.Mesh(firGeometry(height, radius, random), needles);
    fir.position.set(fx, 0, fz);
    fir.castShadow = true;
    fir.receiveShadow = true;
    this.add(fir);
    for (let i = 0; i < FIR_BULBS; i++) {
      const u = i / FIR_BULBS;
      const y = 1.4 + u * (height - 2);
      const r = radius * (1 - u) * 0.98 + 0.15;
      const a = u * FIR_TURNS * Math.PI * 2;
      points.push(new THREE.Vector3(fx + Math.cos(a) * r, y, fz + Math.sin(a) * r));
    }
    this.star = new THREE.MeshBasicMaterial({ color: 0xffe07a });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), this.star);
    star.position.set(fx, height + 0.4, fz);
    star.scale.set(1, 1.3, 0.35);
    this.add(star);

    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(BULB, 6, 5), instancedBasic({}), points.length);
    this.bulbs.castShadow = false;
    const m = new THREE.Matrix4();
    points.forEach((p, i) => {
      // The fir's bulbs are bigger (seen from across the hedge).
      const s = i >= points.length - FIR_BULBS ? 2.2 : 1;
      this.bulbs.setMatrixAt(i, m.makeScale(s, s, s).setPosition(p));
      const color = new THREE.Color(BULBS[i % BULBS.length]!);
      this.colors.push(color);
      this.bulbs.setColorAt(i, color);
    });
    this.bulbs.computeBoundingSphere();
    this.add(this.bulbs);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The fir stands in the walked gardens (`PARK_WALK`): its lowest whorl is walked round, not through. */
  get colliders(): readonly THREE.Box3[] {
    const x = PARK_FIR.x + FLAT_IN_STREET.x;
    const z = PARK_FIR.z + FLAT_IN_STREET.z;
    const r = PARK_FIR.radius * 0.6;
    return [new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, 2.2, z + r))];
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < TWINKLE_SECONDS) return;
    this.clock = 0;
    // Dim by day, bright at night; a fifth of them low at any moment.
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.15, 0.55);
    const glow = 0.35 + 1.1 * night;
    const c = this.scratch;
    for (let i = 0; i < this.colors.length; i++) this.bulbs.setColorAt(i, c.copy(this.colors[i]!).multiplyScalar(glow * (this.random() < 0.2 ? 0.35 : 1)));
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.star.color.setHex(0xffe07a).multiplyScalar(0.6 + 1.2 * night);
  }
}

/**
 * The park's fir: a tapering trunk and whorls of sprays (flattened cones reaching out and drooping
 * at the tips), each whorl turned a little from the last, the sprays' tips paler (new growth) and
 * their roots dark. Its foot at the origin; `radius` at the lowest whorl, narrowing to the leader.
 */
function firGeometry(height: number, radius: number, random: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.06, 0.28, height, 8).translate(0, height / 2, 0);
  parts.push(tinted(trunk.toNonIndexed(), 0.28, 0.2, 0.14));
  trunk.dispose();
  const whorls = 14;
  const lowest = 1.3;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = lowest + (height - 1.2 - lowest) * Math.pow(t, 0.9);
    const reach = radius * Math.pow(1 - t, 0.95) + 0.35;
    const sprays = Math.max(5, Math.round(6 + reach * 2.2));
    const turn = random() * Math.PI;
    for (let i = 0; i < sprays; i++) {
      const a = turn + (i / sprays) * Math.PI * 2 + (random() - 0.5) * 0.3;
      const length = reach * (0.85 + random() * 0.25);
      // A cone along +y, laid out along +x (its tip outwards), flattened, drooping, turned round the trunk.
      const spray = new THREE.ConeGeometry(0.22 + length * 0.2, length, 5, 1, true)
        .translate(0, length / 2, 0)
        .rotateZ(-Math.PI / 2 - 0.28 - random() * 0.12)
        .scale(1, 0.42, 1)
        .rotateY(a)
        .translate(0, y, 0);
      const g = spray.toNonIndexed();
      spray.dispose();
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        const out = Math.min(1, Math.hypot(pos.getX(k), pos.getZ(k)) / Math.max(0.01, length));
        colors.set([0.07 + 0.08 * out, 0.16 + 0.14 * out, 0.1 + 0.06 * out], k * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(g);
    }
  }
  // The leader at the top.
  const leader = new THREE.ConeGeometry(0.35, 1.6, 6, 1, true).translate(0, height - 0.6, 0);
  parts.push(tinted(leader.toNonIndexed(), 0.12, 0.24, 0.14));
  leader.dispose();
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

/** A geometry with every vertex the one colour (for merging with vertex-coloured parts). */
function tinted(g: THREE.BufferGeometry, r: number, gr: number, b: number): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) colors.set([r, gr, b], k * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
