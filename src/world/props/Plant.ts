import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { Prop, matte } from './Prop';

/**
 * `yucca`: a trunk with a rosette of long sword leaves; `fig`: a leaning trunk with big oval leaves;
 * `small`: a desk-top rosette; `hanging`: a macramé planter with trailing vines, hung from its origin;
 * `monstera`: a tall statement plant with big split leaves on thick stems.
 */
export type PlantKind = 'yucca' | 'fig' | 'small' | 'hanging' | 'monstera';

export interface PlantOptions {
  kind?: PlantKind;
  /** White ceramic or terracotta pot. */
  pot?: 'ceramic' | 'terracotta';
  /** Seed for the leaf arrangement so every plant looks a little different. */
  seed?: number;
  /** Floor plants block the player at their pot; a plant on a shelf or sill does not. Hanging plants never do. */
  collides?: boolean;
  /** Uniform scale of the whole plant (footprint included); 1 = the sizes documented per kind. */
  scale?: number;
}

interface LeafShape {
  length: number;
  width: number;
  /** How far the leaf sags towards its tip (0 = straight, 1 = strong arch). */
  droop: number;
  /** Where the leaf is widest: < 1 near the base (sword), > 1 towards the tip (oval). */
  bias: number;
  /** Downward curl of the edges around the midrib. */
  fold: number;
}

interface LeafExtras {
  /** Short stalk before the blade. */
  petiole?: number;
  /** Rows of quads along the blade (more for long or big leaves). */
  rows?: number;
  /** Row indices pinched to a fraction of their width: the splits of a monstera leaf. */
  notches?: readonly number[];
}

const LEAF_ROWS = 10;
const POT_SEGMENTS = 24;
/** Rim of the hanging pot below its hook, and the pot's size. */
const HANGING_DROP = 0.55;
const HANGING_POT = { r: 0.11, h: 0.14 };
// Pots are open at the top, so their inside wall must render too.
const CERAMIC = new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.45, side: THREE.DoubleSide });
const TERRACOTTA = new THREE.MeshStandardMaterial({ color: 0xb8643a, roughness: 0.9, side: THREE.DoubleSide });
const SOIL = matte(0x2e2119, 1);
const TRUNK = matte(0x6b4a2b, 0.85);
const STEM = matte(0x4f6a3a, 0.7);
const CORD = matte(0xd9cbb0, 0.95);

function greens(colors: number[], roughness: number): THREE.MeshStandardMaterial[] {
  return colors.map((color) => new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide }));
}
// One material per colour, shared by every leaf of every plant of that kind.
const CLASSIC_GREENS = greens([0x3f7a3a, 0x4d8b3f, 0x336b33, 0x5a9a48], 0.65);
const LIME_GREENS = greens([0x5f9a3c, 0x6fa844, 0x7db04a, 0x559036], 0.6);
const DEEP_GREENS = greens([0x2f5e2c, 0x27512a, 0x386b33, 0x1f4622], 0.45);
const PALETTES: Record<PlantKind, THREE.MeshStandardMaterial[]> = {
  yucca: CLASSIC_GREENS,
  fig: CLASSIC_GREENS,
  small: LIME_GREENS,
  hanging: LIME_GREENS,
  monstera: DEEP_GREENS,
};
const POT_SIZES: Record<PlantKind, { r: number; h: number }> = {
  yucca: { r: 0.15, h: 0.3 },
  fig: { r: 0.17, h: 0.36 },
  small: { r: 0.055, h: 0.085 },
  hanging: HANGING_POT,
  monstera: { r: 0.19, h: 0.4 },
};

/**
 * A potted plant built from a handful of bent leaf strips: pot, soil, trunk and leaves in a
 * rosette or spiralled up the stem. Sways very slightly so the room does not feel frozen.
 * Local +y is up. Floor and desk kinds sit their pot on the local origin; the `hanging` kind
 * hangs *from* the local origin (the ceiling hook), pot and vines below it.
 */
export class Plant extends Prop implements Updatable {
  readonly options: Required<PlantOptions>;
  /** Everything that swings: pot, cords and foliage. Only the hanging kind rotates it. */
  private readonly body = new THREE.Group();
  private readonly foliage = new THREE.Group();
  private readonly palette: THREE.MeshStandardMaterial[];
  private readonly potRadius: number;
  private readonly potHeight: number;
  /** Local y of the pot's bottom (negative for the hanging kind). */
  private readonly potBase: number;
  private time: number;

  constructor(options: PlantOptions = {}) {
    super();
    this.options = { kind: 'yucca', pot: 'terracotta', seed: 1, collides: true, scale: 1, ...options };
    this.name = `Plant:${this.options.kind}`;
    const random = seededRandom(this.options.seed * 7919 + 17);
    this.time = random() * 10;

    const { kind } = this.options;
    this.palette = PALETTES[kind];
    const potSize = POT_SIZES[kind];
    this.potRadius = potSize.r;
    this.potHeight = potSize.h;
    this.potBase = kind === 'hanging' ? -HANGING_DROP - potSize.h : 0;
    this.add(this.body);
    this.buildPot(potSize.r, potSize.h, this.potBase);

    this.foliage.position.y = this.potBase + potSize.h - 0.01;
    this.body.add(this.foliage);
    if (kind === 'yucca') this.buildYucca(random);
    else if (kind === 'fig') this.buildFig(random);
    else if (kind === 'small') this.buildSmall(random);
    else if (kind === 'hanging') this.buildHanging(random);
    else this.buildMonstera(random);

    this.scale.setScalar(this.options.scale);
  }

  /** Local space: `World.place()` transforms it by the plant's matrix, scale included. */
  override get footprint(): THREE.Box3 {
    if (!this.options.collides || this.options.kind === 'hanging') return new THREE.Box3();
    const r = this.potRadius;
    return new THREE.Box3(new THREE.Vector3(-r, this.potBase, -r), new THREE.Vector3(r, this.potBase + this.potHeight, r));
  }

  update(dt: number): void {
    this.time += dt;
    if (this.options.kind === 'hanging') {
      // The whole planter swings from its hook like a slow pendulum.
      this.body.rotation.z = Math.sin(this.time * 0.9) * 0.02;
      this.body.rotation.x = Math.sin(this.time * 0.67 + 1.3) * 0.015;
      return;
    }
    // A slow, almost imperceptible sway, as if a draught went through the room.
    this.foliage.rotation.z = Math.sin(this.time * 0.7) * 0.012;
    this.foliage.rotation.x = Math.sin(this.time * 0.53 + 1.3) * 0.009;
  }

  /** Pot of radius `r` and height `h` standing on local `y = base`, rim at `base + h`. */
  private buildPot(r: number, h: number, base: number): void {
    const material = this.options.pot === 'ceramic' ? CERAMIC : TERRACOTTA;
    // Open-topped tapered body, a slightly wider rim ring, a closed bottom and the soil a little below the rim.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.78, h, POT_SEGMENTS, 1, true), material);
    body.position.y = h / 2;
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, h * 0.09, POT_SEGMENTS, 1, true), material);
    lip.position.y = h - h * 0.045;
    const rim = new THREE.Mesh(new THREE.RingGeometry(r, r * 1.06, POT_SEGMENTS), material);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = h;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, POT_SEGMENTS), material);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.001;
    const soilDepth = 0.02;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.95, soilDepth, POT_SEGMENTS), SOIL);
    soil.position.y = h - 0.02 - soilDepth / 2;
    for (const m of [body, lip, soil]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    const pot = new THREE.Group();
    pot.position.y = base;
    pot.add(body, lip, rim, bottom, soil);
    this.body.add(pot);
  }

  /**
   * A tapered stem rising from the soil, tilted by `lean` then spun by `azimuth`.
   * Returns the position of its top in foliage space.
   */
  private trunk(height: number, radius: number, lean = 0, azimuth = 0, material = TRUNK): THREE.Vector3 {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, height, 8), material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    const pivot = new THREE.Group();
    pivot.rotation.set(0, azimuth, lean); // 'XYZ' order: the tilt (z) is applied first, then the spin (y)
    pivot.add(mesh);
    this.foliage.add(pivot);
    return new THREE.Vector3(0, height, 0).applyEuler(pivot.rotation);
  }

  /** Rosette of long sword leaves on top of a short trunk. */
  private buildYucca(random: () => number): void {
    const trunkH = 0.45 + random() * 0.15;
    this.trunk(trunkH, 0.035);
    const crown = new THREE.Group();
    crown.position.y = trunkH - 0.02;
    this.foliage.add(crown);
    const count = 18;
    for (let i = 0; i < count; i++) {
      const azimuth = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.25;
      const elevation = THREE.MathUtils.degToRad(15 + random() * 65);
      const upright = elevation / (Math.PI / 2);
      const shape: LeafShape = { length: 0.5 + random() * 0.25, width: 0.055 + random() * 0.02, droop: 0.9 - upright * 0.6, bias: 0.65, fold: 0.5 };
      crown.add(this.leaf(shape, azimuth, elevation, random));
    }
  }

  /** Leaning trunk with big oval leaves spiralling up its top half. */
  private buildFig(random: () => number): void {
    const trunkH = 1.0 + random() * 0.2;
    const lean = (random() - 0.5) * 0.12;
    this.trunk(trunkH, 0.022, lean);
    const count = 15;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = trunkH * (0.4 + t * 0.6);
      const azimuth = i * 2.4 + random() * 0.3; // golden-angle spiral
      const elevation = THREE.MathUtils.degToRad(20 + (1 - t) * 15 + random() * 15);
      const petiole = 0.06 + random() * 0.04;
      const shape: LeafShape = { length: 0.24 + random() * 0.08, width: 0.15 + random() * 0.05, droop: 0.35, bias: 1.35, fold: 0.35 };
      const leaf = this.leaf(shape, azimuth, elevation, random, { petiole });
      leaf.position.set(Math.sin(lean) * y * -1, y, 0);
      this.foliage.add(leaf);
    }
  }

  /** A tuft of short upright leaves for a sill or a shelf. */
  private buildSmall(random: () => number): void {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const azimuth = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.4;
      const elevation = THREE.MathUtils.degToRad(35 + random() * 50);
      const shape: LeafShape = { length: 0.09 + random() * 0.05, width: 0.022 + random() * 0.01, droop: 0.4, bias: 0.8, fold: 0.6 };
      this.foliage.add(this.leaf(shape, azimuth, elevation, random));
    }
  }

  /** Three cords from the hook to the pot's rim, and a pothos spilling over it. */
  private buildHanging(random: () => number): void {
    const { r } = HANGING_POT;
    const rimY = -HANGING_DROP;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), CORD);
    knot.position.y = -0.01;
    this.body.add(knot);
    const cordGeometry = new THREE.CylinderGeometry(0.003, 0.003, 1, 5, 1, true);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.4;
      const anchor = new THREE.Vector3(Math.sin(angle) * r * 1.06, rimY + 0.005, Math.cos(angle) * r * 1.06);
      const cord = new THREE.Mesh(cordGeometry, CORD);
      cord.scale.y = anchor.length();
      cord.position.copy(anchor).multiplyScalar(0.5);
      cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.clone().normalize().negate());
      cord.castShadow = true;
      this.body.add(cord);
    }

    // Vines start near the rim, run out a little and then dive over the edge.
    const vines = 10;
    for (let i = 0; i < vines; i++) {
      const azimuth = (i / vines) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const elevation = THREE.MathUtils.degToRad(random() * 15);
      const shape: LeafShape = { length: 0.3 + random() * 0.3, width: 0.06 + random() * 0.02, droop: 1.4 + random() * 0.5, bias: 1.2, fold: 0.3 };
      const vine = this.leaf(shape, azimuth, elevation, random, { rows: 14 });
      vine.position.set(Math.sin(azimuth) * r * 0.6, 0, Math.cos(azimuth) * r * 0.6);
      this.foliage.add(vine);
      // A few heart-shaped leaflets sprouting from the vine on its way down.
      const leaflets = 2 + Math.floor(random() * 2);
      for (let k = 0; k < leaflets; k++) {
        const t = 0.3 + (k / leaflets) * 0.6 + random() * 0.1;
        const leafletShape: LeafShape = { length: 0.07 + random() * 0.03, width: 0.06 + random() * 0.02, droop: 0.6, bias: 1.3, fold: 0.3 };
        const side = k % 2 === 0 ? 1 : -1;
        const leaflet = this.leaf(leafletShape, side * (0.9 + random() * 0.5), THREE.MathUtils.degToRad(-20 - random() * 30), random, { rows: 6 });
        leaflet.position.set(0, -shape.droop * shape.length * t * t, shape.length * t);
        vine.add(leaflet);
      }
    }
    // A short upright tuft in the middle so the pot does not look empty from above.
    for (let i = 0; i < 6; i++) {
      const azimuth = (i / 6) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const elevation = THREE.MathUtils.degToRad(45 + random() * 35);
      const shape: LeafShape = { length: 0.1 + random() * 0.06, width: 0.06 + random() * 0.02, droop: 0.6, bias: 1.25, fold: 0.3 };
      this.foliage.add(this.leaf(shape, azimuth, elevation, random));
    }
  }

  /** Thick stems fanning out of a large pot, each carrying one big split leaf. */
  private buildMonstera(random: () => number): void {
    const stems = 7;
    for (let i = 0; i < stems; i++) {
      const azimuth = i * 2.4 + random() * 0.4;
      const lean = 0.08 + random() * 0.25;
      const height = 0.6 + random() * 0.4;
      const top = this.trunk(height, 0.012, lean, azimuth, STEM);
      // Tilting around z then spinning around y sends the stem towards (-cos azimuth, sin azimuth).
      const leafAzimuth = azimuth - Math.PI / 2 + (random() - 0.5) * 0.5;
      const elevation = THREE.MathUtils.degToRad(15 + random() * 20);
      const shape: LeafShape = { length: 0.35 + random() * 0.1, width: 0.3 + random() * 0.1, droop: 0.25, bias: 1.1, fold: 0.2 };
      const rows = 14;
      const notchCount = 2 + Math.floor(random() * 2);
      const notches: number[] = [];
      for (let n = 0; n < notchCount; n++) notches.push(5 + Math.round((n / notchCount) * 6 + random()));
      const leaf = this.leaf(shape, leafAzimuth, elevation, random, { rows, notches });
      leaf.position.copy(top);
      this.foliage.add(leaf);
    }
  }

  /**
   * One leaf pointing along local +z from its base, pitched up by `elevation` and turned by
   * `azimuth`; `extras.petiole` adds a short stalk before the blade.
   */
  private leaf(shape: LeafShape, azimuth: number, elevation: number, random: () => number, extras: LeafExtras = {}): THREE.Object3D {
    const { petiole = 0, rows = LEAF_ROWS, notches = [] } = extras;
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    holder.rotation.y = azimuth;
    holder.rotation.x = -elevation;
    const blade = new THREE.Mesh(leafGeometry(shape, rows, notches), this.palette[Math.floor(random() * this.palette.length)]);
    blade.castShadow = true;
    blade.receiveShadow = true;
    blade.position.z = petiole;
    blade.rotation.z = (random() - 0.5) * 0.3;
    holder.add(blade);
    if (petiole > 0) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, petiole, 5), TRUNK);
      stalk.rotation.x = Math.PI / 2;
      stalk.position.z = petiole / 2;
      holder.add(stalk);
    }
    return holder;
  }
}

/**
 * A strip of `rows` quads, three vertices wide (edge, midrib, edge), bent down towards the tip.
 * Rows listed in `notches` are pinched to a third of their width, cutting a split into each edge.
 */
function leafGeometry({ length, width, droop, bias, fold }: LeafShape, rows = LEAF_ROWS, notches: readonly number[] = []): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const pinch = notches.includes(i) ? 0.35 : 1;
    const halfWidth = (width / 2) * Math.max(0.02, Math.sin(Math.PI * Math.pow(t, bias))) * pinch;
    const z = length * t;
    const y = -droop * length * t * t;
    positions.push(-halfWidth, y - fold * halfWidth, z, 0, y, z, halfWidth, y - fold * halfWidth, z);
    if (i < rows) {
      const a = i * 3;
      const b = a + 3;
      indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
