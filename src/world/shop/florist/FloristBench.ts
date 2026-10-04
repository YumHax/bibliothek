import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { METAL, paint, timber } from '../../materials/palette';
import { LeafBatch, LEAF_GREENS, addBunch, headGeometry, stem } from './greenery';
import { lcg, pick } from '@/random';

export interface FloristBenchOptions {
  /** The table top's size the things are spread over (local x along it, z across, +z the florist's side). Default 1.15 x 0.6. */
  width?: number;
  depth?: number;
  seed?: number;
}

const KRAFT = paint(0xb89468, 0.9);
const ROLL_END = paint(0x8a6a44, 0.9);
const TWINE = paint(0xc8b080, 1);
const RIBBONS = [0x8a2a4a, 0xe8d8a0, 0x5a3f6a];
const HANDLE = paint(0xb8302a, 0.5);
const BOTTLE = paint(0x3a8a8a, 0.35);
const NOZZLE = paint(0xf0f0ea, 0.5);
/** Petals and snipped leaves on the bench. */
const PETALS = [0xe84a5a, 0xf4f0f4, 0xd87ab8, 0xf0d040];

/**
 * The florist's work table as it is mid-morning (`on` its table, `DisplayTable`): a roll of kraft paper on a wooden
 * dispenser across the back with a sheet pulled out over the top, a half-made bouquet lying on it, a cone of twine and
 * spools of ribbon, secateurs and scissors, a spray bottle, snipped stem ends, leaves and petals everywhere, a zinc
 * bucket of stems waiting their turn. Static: its parts merge. Origin on the table top under its middle, +z the
 * table's front. Decoration: never collides (the table does).
 */
export class FloristBench extends Prop {
  constructor(options: FloristBenchOptions = {}) {
    super();
    this.name = 'FloristBench';
    const W = options.width ?? 1.15;
    const D = options.depth ?? 0.6;
    const random = lcg(options.seed ?? 17);
    const leaves = new LeafBatch();
    const head = headGeometry();
    const wood = timber(0x9a7048, 0.7);

    // The paper roll's dispenser along the back edge: two end brackets, the roll on its bar, the cutting edge.
    const rollW = W * 0.6;
    const rx = -W / 2 + 0.05 + rollW / 2;
    const rz = -D / 2 + 0.08;
    for (const x of [rx - rollW / 2 - 0.015, rx + rollW / 2 + 0.015]) part(this, 0.02, 0.16, 0.12, wood, { x, y: 0.08, z: rz });
    part(this, rollW + 0.07, 0.03, 0.12, wood, { x: rx, y: 0.015, z: rz });
    const roll = cylinderMesh(0.055, rollW, KRAFT, { x: rx, y: 0.11, z: rz }, { segments: 20 });
    roll.rotation.z = Math.PI / 2;
    this.add(roll);
    for (const x of [rx - rollW / 2 + 0.002, rx + rollW / 2 - 0.002]) {
      const end = cylinderMesh(0.02, 0.006, ROLL_END, { x, y: 0.11, z: rz }, { segments: 12 });
      end.rotation.z = Math.PI / 2;
      this.add(end);
    }
    part(this, rollW, 0.004, 0.02, METAL.steel(), { x: rx, y: 0.058, z: rz + 0.07 });
    // The sheet pulled out down over the cutting edge and across the top.
    const sheet = part(this, rollW - 0.02, 0.003, 0.08, KRAFT, { x: rx, y: 0.04, z: rz + 0.1 });
    sheet.rotation.x = 0.5;
    part(this, rollW - 0.02, 0.002, 0.34, KRAFT, { x: rx, y: 0.002, z: rz + 0.3 });

    // A bouquet half made, lying on the sheet: stems one way, heads the other, a band of twine round its middle.
    const bx = rx + 0.05;
    const bz = rz + 0.3;
    const stemPaint = paint(0x4a7a3a, 0.7);
    const colours = [pick(random, PETALS), pick(random, PETALS)];
    for (let i = 0; i < 11; i++) {
      const spread = (random() - 0.5) * 0.08;
      const a = new THREE.Vector3(bx + 0.18, 0.012 + random() * 0.02, bz + spread * 0.3);
      const b = new THREE.Vector3(bx - 0.16 - random() * 0.05, 0.02 + random() * 0.04, bz + spread);
      stem(this, a, b, stemPaint, 0.005);
      const bloom = new THREE.Mesh(head, paint(colours[i % 2]!, 0.6));
      bloom.position.copy(b).add(new THREE.Vector3(-0.02, 0.005, 0));
      bloom.scale.setScalar(0.024 + random() * 0.006);
      this.add(bloom);
      if (random() < 0.5) leaves.leaf(pick(random, LEAF_GREENS.classic), b.clone().lerp(a, 0.3), new THREE.Vector3(-0.6, 0.3, (random() - 0.5) * 2), 0.07, 0.025, random() * Math.PI, 0.1);
    }
    const band = cylinderMesh(0.025, 0.012, TWINE, { x: bx + 0.03, y: 0.028, z: bz }, { segments: 12 });
    band.rotation.z = Math.PI / 2;
    this.add(band);

    // Twine and ribbons at the right end, the tools in front, the spray bottle.
    const ex = W / 2 - 0.14;
    this.add(cylinderMesh(0.035, 0.1, TWINE, { x: ex, y: 0.05, z: -D / 2 + 0.1 }, { radiusBottom: 0.045, segments: 16 }));
    for (const [i, colour] of RIBBONS.entries()) {
      const spool = cylinderMesh(0.035, 0.03, paint(colour, 0.5), { x: ex - 0.02 + i * 0.075 - 0.08, y: 0.015, z: -D / 2 + 0.22 }, { segments: 16 });
      this.add(spool);
    }
    // A ribbon's end loose across the bench.
    part(this, 0.28, 0.001, 0.02, paint(RIBBONS[0]!, 0.5), { x: ex - 0.2, y: 0.0015, z: -D / 2 + 0.28 });
    // Secateurs: two red handles and a steel head; scissors lying open.
    const tools = new THREE.Group();
    tools.position.set(0.12, 0.006, D / 2 - 0.12);
    tools.rotation.y = 0.5;
    this.add(tools);
    for (const s of [-1, 1]) {
      const h = part(tools, 0.12, 0.012, 0.018, HANDLE, { x: -0.04, z: s * 0.014 });
      h.rotation.y = s * 0.12;
    }
    part(tools, 0.06, 0.008, 0.022, METAL.steel(), { x: 0.05 });
    const scissors = new THREE.Group();
    scissors.position.set(0.32, 0.004, D / 2 - 0.16);
    scissors.rotation.y = -0.7;
    this.add(scissors);
    for (const s of [-1, 1]) {
      const blade = part(scissors, 0.12, 0.004, 0.012, METAL.chrome(), { x: 0.05, z: s * 0.01 });
      blade.rotation.y = s * 0.18;
      scissors.add(cylinderMesh(0.018, 0.006, paint(0x2a2a2a, 0.5), { x: -0.035, y: 0, z: s * 0.022 }, { segments: 12 }));
    }
    const sx = W / 2 - 0.1;
    const sz = D / 2 - 0.12;
    this.add(cylinderMesh(0.03, 0.16, BOTTLE, { x: sx, y: 0.08, z: sz }, { segments: 16 }));
    this.add(cylinderMesh(0.014, 0.03, NOZZLE, { x: sx, y: 0.175, z: sz }, { segments: 12 }));
    part(this, 0.02, 0.03, 0.05, NOZZLE, { x: sx, y: 0.2, z: sz + 0.02 });

    // A zinc bucket of stems waiting, at the left end.
    const kx = -W / 2 + 0.12;
    const kz = D / 2 - 0.13;
    this.add(cylinderMesh(0.085, 0.2, METAL.satinSteel(), { x: kx, y: 0.1, z: kz }, { radiusBottom: 0.07, segments: 16 }));
    addBunch(this, leaves, head, new THREE.Vector3(kx, 0.2, kz), { colors: [pick(random, PETALS)], stems: 10, height: 0.34, spread: 0.08 }, random);

    // Snipped stem ends, leaves and petals about the top.
    const stubs = paint(0x5a8a44, 0.7);
    for (let i = 0; i < 16; i++) {
      const x = (random() - 0.5) * (W - 0.1);
      const z = (random() - 0.2) * (D - 0.2) * 0.6;
      const a = random() * Math.PI;
      const l = 0.02 + random() * 0.05;
      stem(this, new THREE.Vector3(x, 0.004, z), new THREE.Vector3(x + Math.cos(a) * l, 0.004, z + Math.sin(a) * l), stubs, 0.006);
    }
    for (let i = 0; i < 22; i++) {
      const at = new THREE.Vector3((random() - 0.5) * (W - 0.1), 0.004, (random() - 0.3) * (D - 0.15) * 0.7);
      leaves.leaf(pick(random, [...LEAF_GREENS.classic, ...PETALS]), at, new THREE.Vector3(random() - 0.5, 0.05, random() - 0.5), 0.03 + random() * 0.03, 0.02 + random() * 0.015, random() * Math.PI, 0.05);
    }
    leaves.addTo(this);
  }
}
