import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { FridgeHum } from '@/audio/ambient';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { paint, METAL } from '../../materials/palette';
import { PooledLight } from '../../lighting/LightPool';
import { RENDER_ORDER } from '../../surface/layers';
import { Glows } from '../common/fitting';
import type { PropVoice, ShopVoiced } from '../common/fitting';
import { LeafBatch, LEAF_GREENS, addBunch, headGeometry } from './greenery';
import { lcg, pick } from '@/random';

export interface FlowerChillerOptions {
  /** Outer size. Default 1.3 wide, 2.0 high, 0.62 deep. */
  width?: number;
  height?: number;
  depth?: number;
  seed?: number;
}

/** The bunches' colours in the cold: roses, lilies, ranunculus, orchids, gerberas. */
const COLD_BLOOMS: readonly (readonly number[])[] = [[0xc8203a], [0xf4f0f4], [0xf0a0b8], [0xf08a30], [0x9a5ad0], [0xe8d040], [0xf4f0f4, 0xd87ab8]];
const BODY = paint(0xeeeeea, 0.35);
const INSIDE = paint(0xdfe4e6, 0.5);
const PLINTH = paint(0x2a2c2e, 0.6);
const GRILLE = paint(0x1c1e20, 0.7);
const ZINC = (): THREE.MeshStandardMaterial => METAL.satinSteel();
/** The cold white of the chiller's tube behind its header, and what it throws out of the glass. */
const COLD = 0xe4f0ff;

/** The cabinet's measures: its outer size, the thickness of its walls, its plinth and header, and the clear space inside. */
interface Cabinet {
  W: number;
  H: number;
  D: number;
  wall: number;
  plinth: number;
  header: number;
  inner: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
}

/**
 * The florist's glass-door chiller, the shop's centrepiece: a white enamelled cabinet against the wall, two glass
 * doors in steel frames with long bar handles, a lit header along its top and a cold white glow from its lit back
 * panel, zinc buckets of roses, lilies and orchids on two wire shelves and on its floor, a grille in its plinth where
 * the compressor hums (`FridgeHum`, `ShopVoiced`). Always on: the shop's switch leaves it alone. Its light on the
 * room is one `PooledLight` in front of the glass (no shadow). Wall-hung with `y: 0`: origin on the floor at the wall,
 * +z into the shop. Collides as its box.
 */
export class FlowerChiller extends THREE.Group implements Furniture, ShopVoiced {
  readonly footprint: THREE.Box3;
  private readonly glows = new Glows();
  private readonly size: { width: number; height: number; depth: number };

  constructor(options: FlowerChillerOptions = {}) {
    super();
    this.name = 'FlowerChiller';
    const W = options.width ?? 1.3;
    const H = options.height ?? 2.0;
    const D = options.depth ?? 0.62;
    this.size = { width: W, height: H, depth: D };
    const random = lcg(options.seed ?? 31);
    const wall = 0.04;
    const plinth = 0.16;
    const header = 0.2;
    const cabinet: Cabinet = { W, H, D, wall, plinth, header, inner: { x0: -W / 2 + wall, x1: W / 2 - wall, y0: plinth, y1: H - header, z0: wall, z1: D - 0.05 } };
    this.carcass(cabinet);
    this.stock(cabinet, random);
    this.doors(cabinet);
    // A drip tray in front of the plinth, a puddle of condensation never wiped.
    part(this, W * 0.5, 0.012, 0.05, paint(0x9aa0a4, 0.3), { y: 0.006, z: D + 0.02 });

    // The cold light it throws on the floor and the counter in front.
    const light = new PooledLight(COLD, 0.55, 2.6, 2);
    light.position.set(0, 1.2, D + 0.35);
    this.add(light);

    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, H, D + 0.03));
  }

  /** The carcass: sides, top, the back, the plinth with its grille, the header over the doors, the lit strip and the glowing back panel. */
  private carcass({ W, H, D, wall, plinth, header, inner }: Cabinet): void {
    for (const x of [-1, 1]) part(this, wall, H, D, BODY, { x: (x * (W - wall)) / 2, y: H / 2, z: D / 2 });
    part(this, W, wall, D, BODY, { y: H - wall / 2, z: D / 2 });
    // The back and the plinth fit between the sides and under the top (run through them, their faces would lie in theirs).
    part(this, W - 2 * wall, H - wall, wall, INSIDE, { y: (H - wall) / 2, z: wall / 2 });
    // The plinth from the back panel's face forward (from the wall, its back would lie in the panel's).
    part(this, W - 2 * wall, plinth, D - 0.04 - wall, PLINTH, { y: plinth / 2, z: wall + (D - 0.04 - wall) / 2 });
    for (let i = 0; i < 9; i++) part(this, W * 0.6, 0.008, 0.004, GRILLE, { y: 0.035 + i * 0.011, z: D - 0.038 });
    part(this, W - 2 * wall, header, 0.03, BODY, { y: H - header / 2, z: D - 0.015 });
    const strip = this.glows.add({ color: 0xf6fbff, emissive: COLD, strength: 1.4, roughness: 0.3 });
    part(this, W - 0.2, 0.05, 0.006, strip, { y: H - header / 2, z: D + 0.001 });
    const back = this.glows.add({ color: 0xe8f0f4, emissive: COLD, strength: 0.55, roughness: 0.5 });
    // Standing on the cabinet's floor (from the plinth, its foot would lie in the floor's underside).
    const backFoot = inner.y0 + 0.02;
    part(this, inner.x1 - inner.x0, inner.y1 - backFoot, 0.006, back, { y: (backFoot + inner.y1) / 2, z: wall + 0.004 });
    this.glows.set(1);
  }

  /** The cabinet's floor and two wire shelves (a frame and bars), zinc buckets of bunches on each, eucalyptus with the roses now and then. */
  private stock({ inner }: Cabinet, random: () => number): void {
    const steel = METAL.steel();
    const zinc = ZINC();
    const leaves = new LeafBatch();
    const head = headGeometry();
    const levels = [inner.y0 + 0.02, inner.y0 + 0.62, inner.y0 + 1.1];
    part(this, inner.x1 - inner.x0, 0.02, inner.z1 - inner.z0, INSIDE, { y: inner.y0 + 0.01, z: (inner.z0 + inner.z1) / 2 });
    for (const [i, y] of levels.entries()) {
      if (i > 0) {
        for (const z of [inner.z0 + 0.03, inner.z1 - 0.03]) part(this, inner.x1 - inner.x0, 0.008, 0.008, steel, { y, z });
        for (let x = inner.x0 + 0.05; x < inner.x1; x += 0.07) part(this, 0.005, 0.005, inner.z1 - inner.z0 - 0.06, steel, { x, y: y + 0.004, z: (inner.z0 + inner.z1) / 2 });
      }
      const buckets = i === 0 ? 4 : 5;
      const step = (inner.x1 - inner.x0) / buckets;
      for (let b = 0; b < buckets; b++) {
        const r = i === 0 ? 0.1 : 0.075;
        const h = i === 0 ? 0.2 : 0.14;
        const x = inner.x0 + step * (b + 0.5) + (random() - 0.5) * 0.02;
        const z = (inner.z0 + inner.z1) / 2 + (random() - 0.5) * 0.06;
        this.add(cylinderMesh(r, h, zinc, { x, y: y + (i === 0 ? 0 : 0.008) + h / 2, z }, { radiusBottom: r * 0.8, segments: 14 }));
        addBunch(this, leaves, head, new THREE.Vector3(x, y + h, z), { colors: pick(random, COLD_BLOOMS), stems: i === 0 ? 12 : 8, height: i === 0 ? 0.3 : 0.24, spread: r * 0.9, head: i === 0 ? 0.03 : 0.025, green: pick(random, LEAF_GREENS.classic) }, random);
        if (random() < 0.35) addBunch(this, leaves, head, new THREE.Vector3(x, y + h, z), { colors: [LEAF_GREENS.sage[0]], stems: 3, height: i === 0 ? 0.28 : 0.22, spread: r, head: 0.012, green: LEAF_GREENS.sage[1] }, random);
      }
    }
    leaves.addTo(this);
  }

  /** The doors: glass in steel frames, a bar handle on each at the meeting stiles. */
  private doors({ W, D, wall, inner }: Cabinet): void {
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfeaf0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false });
    const frame = paint(0xc8ccd0, 0.35);
    const doorW = (W - 2 * wall) / 2;
    const doorH = inner.y1 - inner.y0;
    const zDoor = D - 0.02;
    for (const side of [-1, 1]) {
      const cx = (side * doorW) / 2;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.06, doorH - 0.06), glass);
      pane.position.set(cx, inner.y0 + doorH / 2, zDoor);
      pane.renderOrder = RENDER_ORDER.glass;
      this.add(pane);
      for (const y of [inner.y0 + 0.02, inner.y1 - 0.02]) part(this, doorW, 0.04, 0.03, frame, { x: cx, y, z: zDoor });
      for (const x of [cx - doorW / 2 + 0.02, cx + doorW / 2 - 0.02]) part(this, 0.04, doorH, 0.03, frame, { x, y: inner.y0 + doorH / 2, z: zDoor });
      const hx = cx - side * (doorW / 2 - 0.07);
      part(this, 0.018, 0.6, 0.018, METAL.chrome(), { x: hx, y: 1.05, z: zDoor + 0.05 });
      for (const y of [0.78, 1.32]) part(this, 0.012, 0.012, 0.04, METAL.chrome(), { x: hx, y, z: zDoor + 0.03 });
    }
  }

  voices(): readonly PropVoice[] {
    return [{ voice: new FridgeHum(), at: new THREE.Vector3(0, 0.1, this.size.depth), options: { referenceDistance: 0.8, maxDistance: 7 } }];
  }
}
