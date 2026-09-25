import * as THREE from 'three';
import { GameBox } from './GameBox';
import { boxMesh } from './meshUtils';
import { QUALITY } from '@/graphics/quality';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface ShelfOptions {
  width: number;
  depth: number;
  /**
   * Board-to-board clearance of each row, top row first. The bookcase height is the sum of
   * these plus the boards.
   */
  rowHeights: number[];
  boardThickness?: number;
  /** Gap between neighbouring boxes on a row. */
  gap?: number;
}

const WOOD = woodMaterial(0x6b4a2b, 0.6);
/** Mid-span sag of a loaded board 0.8 m long (metres); it grows with the square of the span, up to `MAX_SAG`. */
const SAG_AT_80CM = 0.0022;
const MAX_SAG = 0.005;
/** How untidily the boxes stand: yaw and roll (radians), and how far one may be pushed back or pulled out. */
const BOX_YAW = THREE.MathUtils.degToRad(1.4);
const BOX_ROLL = THREE.MathUtils.degToRad(0.7);
const BOX_PUSH = 0.014;
const BOX_PULL = 0.008;
/** What stands in for the boxes in the shadow maps: a plain unit box per box, scaled, all in one instanced draw. */
const PROXY_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const PROXY_MATERIAL = new THREE.MeshBasicMaterial();
/** Narrowest box a row could hold (m): sizes the proxy's instance buffer. */
const MIN_BOX_WIDTH = 0.05;

/**
 * A bookcase whose rows can each have their own height. Boxes stand upright with the cover
 * facing +Z (out of the shelf), laid left-to-right on the row they are given.
 *
 * The boxes standing on it do not cast shadows themselves: one instanced proxy of plain boxes
 * does, on the zone's shadow layer only (the camera never draws it), kept in step with the boxes
 * put on and taken off (`GameBox.setShadowProxied`). A box in hand casts its own again.
 */
export class Shelf extends THREE.Group {
  readonly options: Required<ShelfOptions>;
  readonly height: number;
  /** Top face of each board, top row first. */
  private readonly boardTops: number[] = [];
  private readonly boards: THREE.Mesh[] = [];
  /** Mid-span sag of each row's board, top row first (0 without `QUALITY.detailedMaterials`). */
  private readonly rowSags: number[] = [];
  private readonly shadowProxy: THREE.InstancedMesh;
  private proxyQueued = false;
  private readonly proxyMatrix = new THREE.Matrix4();
  private readonly proxyScale = new THREE.Vector3();

  constructor(options: ShelfOptions) {
    super();
    this.name = 'Shelf';
    this.options = { boardThickness: 0.025, gap: 0.02, ...options };
    const { rowHeights, boardThickness, width } = this.options;
    this.height = rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length + 1) * boardThickness;
    this.build();

    const perRow = Math.ceil((width - 2 * boardThickness) / MIN_BOX_WIDTH);
    this.shadowProxy = new THREE.InstancedMesh(PROXY_GEOMETRY, PROXY_MATERIAL, Math.max(1, perRow * rowHeights.length));
    this.shadowProxy.name = 'ShelfShadowProxy';
    this.shadowProxy.count = 0;
    this.shadowProxy.castShadow = false;
    // Shadow maps only: placing the shelf adds the zone's shadow layer (`Zone.adopt`); the camera's layer 0 never.
    this.shadowProxy.layers.disableAll();
    this.add(this.shadowProxy); // before the zone places the shelf, so its culling hides the proxy with the boards
    this.addEventListener('childadded', ({ child }) => this.boxMoved(child, true));
    this.addEventListener('childremoved', ({ child }) => this.boxMoved(child, false));
  }

  /** Redraws the shadow proxy before the next frame (a box changed status: a wishlist ghost casts none). */
  updateShadowProxy(): void {
    if (this.proxyQueued) return;
    this.proxyQueued = true;
    queueMicrotask(() => {
      this.proxyQueued = false;
      this.fillShadowProxy();
    });
  }

  /** Bounding box in local space, used to register a collider. */
  get footprint(): THREE.Box3 {
    const { width, depth } = this.options;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, this.height, depth / 2));
  }

  get rowCount(): number {
    return this.boardTops.length;
  }

  /**
   * Lays `boxes` left-to-right on row `row` (0 = top). A box that is currently away from any
   * shelf (carried by the player) only gets its rest pose updated, so the Inspector can bring
   * it back to the right spot without this method yanking it out of the player's hand.
   */
  placeRow(row: number, boxes: readonly GameBox[]): void {
    const { width, depth, gap, boardThickness } = this.options;
    const top = this.boardTops[row];
    if (top === undefined) throw new Error(`[shelf] row ${row} does not exist`);

    let cursorX = -(width / 2 - boardThickness);
    for (const box of boxes) {
      const { width: bw, height: bh, depth: bd } = box.dimensions;
      const carried = box.parent !== null && !(box.parent instanceof Shelf);
      // Real shelves are not tidy: each box a touch askew, some pushed back or pulled out, all
      // following the board's sag. Seeded by the game, so a box always stands the same way.
      const x = cursorX + bw / 2;
      const [yaw, roll, push] = untidiness(box.game.id);
      box.restPosition.set(x, top + bh / 2 - this.sagAt(row, x), -depth / 2 + bd / 2 + 0.03 + push);
      box.restQuaternion.setFromEuler(new THREE.Euler(0, yaw, roll));
      if (!carried) {
        this.add(box);
        box.position.copy(box.restPosition);
        box.quaternion.copy(box.restQuaternion);
      }
      cursorX += bw + gap;
    }
  }

  /**
   * Removes and frees the boards, leaving an empty group. Idempotent. Boxes should have been
   * taken off the shelf first; the shared wood material is kept for the next bookcase.
   */
  dispose(): void {
    for (const board of this.boards) {
      this.remove(board);
      board.geometry.dispose();
    }
    this.boards.length = 0;
    this.shadowProxy.count = 0;
    this.shadowProxy.castShadow = false;
    this.shadowProxy.dispose(); // its instance buffer; refilled if a carried box comes back to this emptied shelf
  }

  private boxMoved(child: THREE.Object3D, onShelf: boolean): void {
    if (!(child instanceof GameBox)) return;
    child.setShadowProxied(onShelf);
    this.updateShadowProxy();
  }

  /** One instance per box standing here (at its rest pose), ghosts left out. */
  private fillShadowProxy(): void {
    const proxy = this.shadowProxy;
    const capacity = proxy.instanceMatrix.count;
    let n = 0;
    for (const child of this.children) {
      if (!(child instanceof GameBox) || !child.castsShadow || n >= capacity) continue;
      const { width, height, depth } = child.dimensions;
      this.proxyMatrix.compose(child.restPosition, child.restQuaternion, this.proxyScale.set(width, height, depth));
      proxy.setMatrixAt(n++, this.proxyMatrix);
    }
    proxy.count = n;
    proxy.castShadow = n > 0;
    proxy.instanceMatrix.needsUpdate = true;
    proxy.computeBoundingSphere();
  }

  /** How far row `row`'s board has sagged at local `x`. */
  private sagAt(row: number, x: number): number {
    const sag = this.rowSags[row] ?? 0;
    const half = this.options.width / 2 - this.options.boardThickness;
    const t = THREE.MathUtils.clamp(x / half, -1, 1);
    return sag * (1 - t * t);
  }

  private build(): void {
    const { width, depth, rowHeights, boardThickness } = this.options;
    const h = this.height;

    this.boards.push(
      boxMesh(boardThickness, h, depth, WOOD, { x: -width / 2 + boardThickness / 2, y: h / 2 }),
      boxMesh(boardThickness, h, depth, WOOD, { x: width / 2 - boardThickness / 2, y: h / 2 }),
      // The back fits between the sides and under the top board: run past them, its ends and top would z-fight with theirs.
      boxMesh(width - 2 * boardThickness, h - boardThickness, boardThickness / 2, WOOD, { y: (h - boardThickness) / 2, z: -depth / 2 + boardThickness / 4 }),
    );

    // Boards from the floor up; the top board closes the bookcase. The bottom one rests on the
    // plinth; the others bow a little under the boxes (the top one carries nothing).
    let y = boardThickness / 2;
    const tops: number[] = [];
    const sags: number[] = [];
    const span = width - 2 * boardThickness;
    const sag = QUALITY.detailedMaterials ? Math.min(MAX_SAG, SAG_AT_80CM * (span / 0.8) ** 2) : 0;
    for (let i = rowHeights.length - 1; i >= -1; i--) {
      const bottom = i === rowHeights.length - 1;
      const loaded = i >= 0 && !bottom ? sag : 0;
      const board = boxMesh(span, boardThickness, depth, WOOD, { y });
      if (loaded > 0) bow(board.geometry, span, loaded);
      this.boards.push(board);
      if (i >= 0) {
        tops.push(y + boardThickness / 2);
        sags.push(loaded);
        y += boardThickness + rowHeights[i];
      }
    }
    this.boardTops.push(...tops.reverse()); // top row first
    this.rowSags.push(...sags.reverse());
    this.add(...this.boards);
  }
}

/** Bends a board's geometry down in a parabola along x: `sag` at mid-span, none at the ends. */
function bow(geometry: THREE.BufferGeometry, span: number, sag: number): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp((2 * position.getX(i)) / span, -1, 1);
    position.setY(i, position.getY(i) - sag * (1 - t * t));
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** Yaw, roll and depth offset of a box on the shelf, from its game id (the same every time). */
function untidiness(id: string): [yaw: number, roll: number, push: number] {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  const next = (): number => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
  if (!QUALITY.detailedMaterials) return [0, 0, 0];
  const yaw = (next() * 2 - 1) * BOX_YAW;
  const roll = next() < 0.3 ? (next() * 2 - 1) * BOX_ROLL : 0;
  const r = next();
  const push = r < 0.18 ? -next() * BOX_PUSH : r > 0.9 ? next() * BOX_PULL : 0;
  return [yaw, roll, push];
}
