import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { fabric } from '../materials/finishes';
import { METAL, shared, timber } from '../materials/palette';
import { INSET, PROUD } from '../props/joinery';
import { FLOOR, WALL, onSurface } from '../surface/layers';
import { CLEAR_GLASS, EDGE_LIGHT, SHELF_GLASS, WARM_STRIP, asGlass, bakedGlow, poolTexture, washTexture } from './glow';
import type { ShowcaseStand, StandSlot } from './stand';

/** Narrow enough for the gap between the living room's door and its first bookcase (`ROOM_PLAN.showcase`). */
const WIDTH = 0.34;
const DEPTH = 0.33;
const HEIGHT = 1.76;
/** Off the wall, clear of the skirting board. */
const OFF_WALL = 0.015;
const POST = 0.022;
const PLINTH_H = 0.075;
/** The bottom board on the plinth: the lowest tier's floor. */
const BOTTOM_T = 0.018;
const TOP_T = 0.03;
const BACK_T = 0.016;
const LINING_T = 0.004;
const GLASS_T = 0.006;
const SHELF_T = 0.008;
/** The four glass shelves' tops, bottom up; with the bottom board, five tiers of one box each. */
const SHELVES = [0.43, 0.77, 1.11, 1.45] as const;
const INNER_W = WIDTH - 2 * POST;
/** How far each box leans back against the velvet (radians). */
const LEAN = THREE.MathUtils.degToRad(9);
/** The lowest tier's light, then each tier up: the strip at the top lights the top tiers most. */
const WASH = { color: 0xffd9a0, velvet: 0.42, pools: [0.1, 0.13, 0.16, 0.2, 0.26] as const };

const WALNUT = timber(0x3b2416, 0.42);
const PLINTH_WOOD = timber(0x24160e, 0.55);
const BRASS = METAL.agedBrass();

/**
 * A narrow glass display case for the collection's showpieces (SECOND HOME sells it): walnut, glass sides, an open
 * front, a velvet back and four edge-lit glass shelves, so five tiers of one box each, every box leaning back on the
 * velvet face out. A warm strip under the top lights them (no light of its own: its glow is painted on the velvet and
 * the tiers). The player puts any box of the collection in a tier (`Showcases`, docs/furnishing.md "Displays").
 * Against a wall with `y: 0`: origin on the floor at the wall, +z into the room. Collides.
 */
export class DisplayColumn extends THREE.Group implements Furniture, ShowcaseStand {
  readonly standName = 'display case';
  readonly slots: readonly StandSlot[];
  readonly viewpoint = new THREE.Vector3(0, 0, 0.85);

  constructor() {
    super();
    this.name = 'DisplayColumn';
    const velvet = shared('fabric|2a1830|0.95', () => fabric({ color: 0x2a1830, roughness: 0.95 }));
    const z0 = OFF_WALL;
    const front = z0 + DEPTH;
    const bodyH = HEIGHT - PLINTH_H - TOP_T;
    // Plinth (set back), bottom board, back board and its velvet lining, the top board overhanging a little.
    this.add(boxMesh(WIDTH - 0.03, PLINTH_H, DEPTH - 0.03, PLINTH_WOOD, { y: PLINTH_H / 2, z: z0 + DEPTH / 2 - 0.01 }));
    this.add(boxMesh(WIDTH, BOTTOM_T, DEPTH, WALNUT, { y: PLINTH_H + BOTTOM_T / 2 - INSET, z: z0 + DEPTH / 2 }));
    // The back stands on the bottom board (buried a hair into it): side by side their side faces would z-fight.
    const backH = bodyH - BOTTOM_T + INSET;
    this.add(boxMesh(WIDTH, backH, BACK_T, WALNUT, { y: PLINTH_H + BOTTOM_T - INSET + backH / 2, z: z0 + BACK_T / 2 }));
    const backFace = z0 + BACK_T + LINING_T;
    this.add(boxMesh(INNER_W, bodyH - BOTTOM_T, LINING_T + INSET, velvet, { y: PLINTH_H + BOTTOM_T + (bodyH - BOTTOM_T) / 2, z: z0 + BACK_T + (LINING_T - INSET) / 2 }));
    this.add(boxMesh(WIDTH + 0.016, TOP_T, DEPTH + 0.012, WALNUT, { y: HEIGHT - TOP_T / 2, z: z0 + DEPTH / 2 + 0.004 }));
    this.add(boxMesh(WIDTH + 0.02, 0.008, 0.008, BRASS, { y: HEIGHT - TOP_T - 0.004, z: front + 0.01 + PROUD }));
    // The front posts, brass-shod at their foot.
    for (const sx of [-1, 1]) {
      const x = sx * (WIDTH / 2 - POST / 2);
      this.add(boxMesh(POST, bodyH - BOTTOM_T + INSET, POST, WALNUT, { x, y: PLINTH_H + BOTTOM_T + (bodyH - BOTTOM_T + INSET) / 2 - INSET, z: front - POST / 2 }));
      this.add(boxMesh(POST + 0.004, 0.012, POST + 0.004, BRASS, { x, y: PLINTH_H + BOTTOM_T + 0.006, z: front - POST / 2 }));
    }
    // The warm strip under the top, at the front.
    const strip = boxMesh(INNER_W - 0.03, 0.008, 0.016, WARM_STRIP, { y: HEIGHT - TOP_T - 0.004 - PROUD, z: front - 0.04 });
    strip.castShadow = false;
    this.add(strip);
    // Glass: the sides, from the lining to the front posts, and the four shelves, each with a lit front edge.
    const sideD = front - POST - backFace;
    for (const sx of [-1, 1]) this.add(asGlass(boxMesh(GLASS_T, bodyH - BOTTOM_T, sideD, CLEAR_GLASS, { x: sx * (WIDTH / 2 - GLASS_T / 2 - 0.004), y: PLINTH_H + BOTTOM_T + (bodyH - BOTTOM_T) / 2, z: backFace + sideD / 2 })));
    const shelfD = front - 0.006 - backFace;
    for (const top of SHELVES) {
      this.add(asGlass(boxMesh(INNER_W - 2 * GLASS_T - 0.01, SHELF_T, shelfD, SHELF_GLASS, { y: top - SHELF_T / 2, z: backFace + shelfD / 2 })));
      const edge = boxMesh(INNER_W - 2 * GLASS_T - 0.012, SHELF_T - 0.002, 0.002, EDGE_LIGHT, { y: top - SHELF_T / 2, z: backFace + shelfD + 0.001 + PROUD / 2 });
      edge.castShadow = false;
      edge.raycast = () => {};
      this.add(edge);
    }
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== CLEAR_GLASS && mesh.material !== SHELF_GLASS) mesh.receiveShadow = true;
    });
    this.bakeStripLight(backFace, shelfD);

    // One slot per tier, bottom up: the box's foot on the tier's floor, leaning on the velvet.
    const floors = [PLINTH_H + BOTTOM_T - INSET, ...SHELVES];
    const ceilings = [...SHELVES.map((top) => top - SHELF_T), HEIGHT - TOP_T - 0.012];
    this.slots = floors.map((y, i) => {
      const holder = new THREE.Group();
      holder.name = `DisplayColumnTier${i}`;
      holder.position.set(0, y, backFace);
      this.add(holder);
      return { holder, maxWidth: INNER_W - 2 * GLASS_T - 0.02, maxHeight: ceilings[i]! - y - 0.03, lean: LEAN, support: 'wall' as const };
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.01, 0, 0), new THREE.Vector3(WIDTH / 2 + 0.01, HEIGHT, OFF_WALL + DEPTH + 0.012));
  }

  /** The strip's light on the velvet, and a pool on each tier's floor (added, see `bakedGlow`). */
  private bakeStripLight(backFace: number, depth: number): void {
    const velvetH = HEIGHT - TOP_T - PLINTH_H - BOTTOM_T;
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(INNER_W - 0.004, velvetH), onSurface(bakedGlow(WASH.color, WASH.velvet, washTexture()), WALL.overlay, { depthWrite: false }));
    wash.position.set(0, PLINTH_H + BOTTOM_T + velvetH / 2, backFace + WALL.overlay.lift);
    wash.castShadow = false;
    wash.raycast = () => {};
    this.add(wash);
    const pool = poolTexture();
    [PLINTH_H + BOTTOM_T - INSET, ...SHELVES].forEach((y, i) => {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(INNER_W - 0.02, depth - 0.01).rotateX(-Math.PI / 2), onSurface(bakedGlow(WASH.color, WASH.pools[i]!, pool), FLOOR.glowPool, { depthWrite: false }));
      floor.position.set(0, y + FLOOR.glowPool.lift, backFace + depth / 2);
      floor.castShadow = false;
      floor.raycast = () => {};
      this.add(floor);
    });
  }
}
