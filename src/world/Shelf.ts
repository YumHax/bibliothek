import * as THREE from 'three';
import { GameBox } from './GameBox';
import { boxMesh } from './meshUtils';
import { isShared } from './materials/sharedResources';
import { QUALITY } from '@/graphics/quality';
import { seededRng } from '@/random';
import { basic, standard, timber } from '@/world/materials/palette';
import { INSET, PROUD, SEAM } from './props/joinery';
import { mergeStaticParts } from './zone/mergeStatic';
import type { BoxMotion } from './shelving/BoxMotion';
import { drawTrinket, type Trinket } from './shelving/trinkets';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';

/** A folded card standing on a board (`Shelf.setCard`): its size (m) and how far it leans back. */
const CARD_W = 0.13;
const CARD_H = 0.075;
const CARD_LEAN = 0.22;

/** Where a box would go on a bookcase (`Shelf.spotAt`). */
export interface ShelfSpot {
  row: number;
  /** Among the row's boxes, the box in hand left out. */
  index: number;
  /** Whether the row has room for the box. */
  fits: boolean;
  /** The gap it would go into: its foot, at the front of the row (local to the bookcase). */
  gap: THREE.Vector3;
  /** The box's height. */
  height: number;
  /** Aimed at the middle of another box: the box in hand takes its place, and it the one in hand's (see `ShelvingGroup.swapBoxes`). */
  swap?: GameBox;
  /** Where the box in hand would stand (its centre, local to the bookcase) and how big it is: the ghost `ShelfPlacing` shows. */
  centre: THREE.Vector3;
  size: THREE.Vector3;
  /** How far each box of the row would slide along it (m, local x) to make room: they part to show it. Empty for a swap or no room. */
  parting: readonly (readonly [box: GameBox, dx: number])[];
}

/** Aimed within this share of a box's width either side of its middle, the box in hand swaps with it rather than going beside it. */
const SWAP_SPAN = 0.25;

interface ShelfOptions {
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

const WOOD = timber(0x6b4a2b, 0.6);
/** The thin veneer strip glued over the boards' front edges: a shade lighter than the faces. */
const BANDING = timber(0x80603d, 0.5);
/** The back: a thin sheet of hardboard, pale and dull, set in behind the boards. */
const HARDBOARD = timber(0xa0845f, 0.85);
const BACK_THICKNESS = 0.004;
/** The plinth: the bottom board stands this high on a kick board set back from the front. */
export const PLINTH = 0.07;
const KICK_RECESS = 0.02;
/** How far the top board overhangs the sides and the front. */
const TOP_OVERHANG = 0.012;
/** Boxes stand this far behind the boards' front edge (m), where the light reaches their covers. */
const FRONT_SET = 0.035;
/** Out of the row, a box clears the front edge by this much before it flies to the hand (m). */
const EDGE_CLEAR = 0.02;
/** Mid-span sag of a loaded board 0.8 m long (metres); it grows with the square of the span, up to `MAX_SAG`. */
const SAG_AT_80CM = 0.0022;
const MAX_SAG = 0.005;
/** How untidily the boxes stand: a turn (radians), and how far one may be pushed back or pulled out. */
const BOX_YAW = THREE.MathUtils.degToRad(1.4);
const BOX_PUSH = 0.014;
const BOX_PULL = 0.008;
/** What stands in for the boxes in the shadow maps: a plain unit box per box, scaled, all in one instanced draw. */
const PROXY_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const PROXY_MATERIAL = basic({});
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
  /** The carcass (sides, plinth, boards, top, back, banding), merged into a draw per material. */
  private readonly carcass = new THREE.Group();
  /** Mid-span sag of each row's board, top row first (0 without `QUALITY.detailedMaterials`). */
  private readonly rowSags: number[] = [];
  private readonly shadowProxy: THREE.InstancedMesh;
  private proxyQueued = false;
  private readonly proxyMatrix = new THREE.Matrix4();
  private readonly proxyScale = new THREE.Vector3();
  /** The boxes of each row as last laid out (`placeRow`), top row first. */
  private readonly rowBoxes: GameBox[][] = [];
  /** Each row's odds and ends (`dressRow`), drawn once per row the first time it is laid out; null for none. */
  private readonly trinkets: (Trinket | null | undefined)[] = [];
  /** The card standing on a board, if any (`setCard`). */
  private card: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;

  /** `motion` ticks the boxes while they move (a hover, a slide after a sort); without it they jump. */
  constructor(
    options: ShelfOptions,
    private readonly motion: BoxMotion | null = null,
  ) {
    super();
    this.name = 'Shelf';
    this.options = { boardThickness: 0.025, gap: 0.02, ...options };
    const { rowHeights, boardThickness, width } = this.options;
    this.height = PLINTH + rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length + 1) * boardThickness;
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
   * shelf (carried by the player) only gets its rest pose updated, and this shelf as its `home`, so
   * the Inspector brings it back to the right spot without this method yanking it out of the hand.
   * `slide`, when given, eases each box it returns a delay for from where it stands now (on this shelf
   * or another) to its new spot, after that delay (a sort, staggered); a box it returns null for, or
   * every box without it, jumps there.
   */
  placeRow(row: number, boxes: readonly GameBox[], slide?: (box: GameBox) => number | null): void {
    const { width, depth, gap, boardThickness } = this.options;
    const top = this.boardTops[row];
    if (top === undefined) throw new Error(`[shelf] row ${row} does not exist`);
    this.rowBoxes[row] = [...boxes];

    const inner = width / 2 - boardThickness;
    let cursorX = -inner;
    boxes.forEach((box) => {
      const { width: bw, height: bh, depth: bd } = box.dimensions;
      const carried = box.parent !== null && !(box.parent instanceof Shelf);
      // Real shelves are not tidy: each box a touch turned, some pushed back or pulled out, all
      // following the board's sag, but every one stands flat on its bottom (a box balanced on a
      // corner looks wrong). Seeded by the game, so a box always stands the same way.
      const x = cursorX + bw / 2;
      const [yaw, push] = untidiness(box.game.id);
      const z = depth / 2 - bd / 2 - FRONT_SET + push;
      box.slideOut = depth / 2 - (z + bd / 2) + EDGE_CLEAR;
      box.restPosition.set(x, top + bh / 2 - this.sagAt(row, x), z);
      box.restQuaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
      box.home = this;
      if (!carried) {
        // Already standing on its (new) spot here: nothing to slide (a box moved by hand shifts only its neighbours).
        const unmoved = box.parent === this && box.position.distanceToSquared(box.restPosition) < 1e-10;
        const delay = unmoved ? null : (slide?.(box) ?? null);
        if (delay !== null && box.parent && box.parent !== this) this.attach(box); // keeps where it stands, in this shelf's frame
        else if (box.parent !== this) this.add(box);
        if (delay !== null) box.slideToRest(delay);
        else {
          box.stopSettling();
          box.position.copy(box.restPosition);
          box.quaternion.copy(box.restQuaternion);
        }
      }
      cursorX += bw + gap;
    });
    this.dressRow(row);
  }

  /**
   * The row's trinket (`shelving/trinkets`), drawn by the bookcase's spot and the row: at the far right of the row, or
   * a bookend right against its last box, shown only while the boxes leave it room (they come first).
   */
  private dressRow(row: number): void {
    if (this.trinkets[row] === undefined) {
      const seed = `${Math.round(this.position.x * 100)}|${Math.round(this.position.z * 100)}|${this.rotation.y.toFixed(2)}|${row}`;
      const trinket = drawTrinket(seededRng(`trinket|${seed}`));
      this.trinkets[row] = trinket;
      if (trinket) this.add(trinket.object);
    }
    const trinket = this.trinkets[row];
    if (!trinket) return;
    const { width, depth, gap, boardThickness } = this.options;
    const inner = width / 2 - boardThickness;
    const boxes = this.rowBoxes[row] ?? [];
    const used = boxes.reduce((sum, box) => sum + box.dimensions.width + gap, 0);
    const fits = (!trinket.leans || boxes.length > 0) && inner - (-inner + used) >= trinket.width + 0.02;
    trinket.object.visible = fits;
    if (!fits) return;
    const x = trinket.leans ? -inner + used - gap + SEAM : inner - trinket.width / 2 - 0.01;
    trinket.object.position.set(x, this.boardTops[row]! - this.sagAt(row, x), trinket.leans ? depth / 2 - FRONT_SET - 0.06 : depth / 2 - FRONT_SET - 0.08);
  }

  /**
   * Where row `row` (0 = top) has room left: its board's top (local y) and the local x its laid boxes end at (the
   * row's inner left edge when it is empty), the inner right edge, the z the boxes' fronts stand at and the row's
   * clearance. The opening's dream fills the rest (`DreamShelves`).
   */
  rowRoom(row: number): { floor: number; from: number; to: number; front: number; height: number } {
    const { width, depth, gap, boardThickness, rowHeights } = this.options;
    const inner = width / 2 - boardThickness;
    const used = (this.rowBoxes[row] ?? []).reduce((sum, box) => sum + box.dimensions.width + gap, 0);
    // A trinket at the row's end keeps its spot (a bookend by the boxes takes its width from the start).
    const trinket = this.trinkets[row];
    const kept = trinket?.object.visible ? trinket.width + 0.02 : 0;
    const from = -inner + used + (trinket?.leans ? kept : 0);
    const to = inner - (trinket && !trinket.leans ? kept : 0);
    return { floor: this.boardTops[row] ?? 0, from, to, front: depth / 2 - FRONT_SET, height: rowHeights[row] ?? 0 };
  }

  /** The game ids on each row, top row first, left to right (the boxes in hand included: this is still their row). */
  rowIds(): string[][] {
    return Array.from({ length: this.rowCount }, (_, r) => (this.rowBoxes[r] ?? []).map((box) => box.game.id));
  }

  /**
   * Where `held` would go if put in at local point `at` (a point on this bookcase under the crosshair): the row
   * whose space holds it, the index among that row's boxes (`held` left out) and the gap's centre (local, on the
   * front of the row). `fits` is false when the row has no room left for it. Null outside every row.
   */
  spotAt(at: THREE.Vector3, held: GameBox): ShelfSpot | null {
    const { width, depth, gap, boardThickness: t, rowHeights } = this.options;
    const inner = width / 2 - t;
    if (Math.abs(at.x) > width / 2 + 0.01) return null;
    // A board's front edge counts for the row standing on it.
    const row = this.boardTops.findIndex((top, r) => at.y >= top - t - 0.005 && at.y <= top + rowHeights[r]!);
    if (row < 0) return null;
    const boxes = (this.rowBoxes[row] ?? []).filter((box) => box !== held);
    // The row as it is drawn: boxes parted for the box in hand stand aside, and the crosshair aims at them there.
    const shownX = (box: GameBox) => box.restPosition.x + box.parted;
    const index = boxes.filter((box) => shownX(box) < at.x).length;
    const top = this.boardTops[row]!;
    const { width: hw, height: hh, depth: hd } = held.dimensions;
    const standZ = (d: number) => depth / 2 - d / 2 - FRONT_SET;
    const swap = boxes.find((box) => Math.abs(at.x - shownX(box)) <= box.dimensions.width * SWAP_SPAN);
    if (swap) {
      // The box in hand's own row may be this one (a swap along the row always fits); the other end is the group's to check.
      const fits = (this.rowBoxes[row] ?? []).includes(held) || this.roomFor(row, swap, held);
      const { width: sw, height: sh, depth: sd } = swap.dimensions;
      const size = new THREE.Vector3(Math.max(hw, sw), Math.max(hh, sh), Math.max(hd, sd)).addScalar(0.006);
      // Wrapped round the box it would swap with, standing where that one stands (its own push and pull).
      const { x, y: sy, z } = swap.restPosition;
      const centre = new THREE.Vector3(x, sy - sh / 2 + size.y / 2 - 0.003, z);
      return { row, index: boxes.indexOf(swap), fits, gap: new THREE.Vector3(x, top - this.sagAt(row, x), depth / 2 - FRONT_SET + 0.004), height: hh, swap, centre, size, parting: [] };
    }
    const used = boxes.reduce((sum, box) => sum + box.dimensions.width, 0) + boxes.length * gap;
    const fits = used + hw <= 2 * inner + 1e-6;
    // Where the row would stand with the box in: packed from the left like `placeRow`, the box in hand at `index`.
    const parting: [GameBox, number][] = [];
    let cursor = -inner;
    let x = -inner + hw / 2;
    boxes.forEach((box, i) => {
      if (i === index) {
        x = cursor + hw / 2;
        cursor += hw + gap;
      }
      const bw = box.dimensions.width;
      if (fits) parting.push([box, cursor + bw / 2 - box.restPosition.x]);
      cursor += bw + gap;
    });
    if (index >= boxes.length) x = cursor + hw / 2;
    if (!fits) {
      // No room: nothing parts; the ghost stands in the gap as it is, overlapping its neighbours.
      const before = boxes[index - 1];
      const after = boxes[index];
      x = before ? before.restPosition.x + before.dimensions.width / 2 + gap / 2 + hw / 2 : after ? after.restPosition.x - after.dimensions.width / 2 - gap / 2 - hw / 2 : -inner + hw / 2;
    }
    x = THREE.MathUtils.clamp(x, -inner + hw / 2, inner - hw / 2);
    const centre = new THREE.Vector3(x, top - this.sagAt(row, x) + hh / 2, standZ(hd));
    return { row, index, fits, gap: new THREE.Vector3(x - hw / 2, top - this.sagAt(row, x), depth / 2 - FRONT_SET + 0.004), height: hh, centre, size: new THREE.Vector3(hw, hh, hd), parting };
  }

  /**
   * The front edge of the board row `row` stands on, at local `x`: the middle of its banding's face (local y, z) and
   * its height (m). What a shelf label is stuck on (`labels/ShelfLabels`).
   */
  edgeOf(row: number, x: number): { y: number; z: number; height: number } | null {
    const top = this.boardTops[row];
    if (top === undefined) return null;
    const t = this.options.boardThickness;
    return { y: top - t / 2 - this.sagAt(row, x), z: this.options.depth / 2 + PROUD, height: t };
  }

  /** The row whose board edge or space a local point is on (0 = top), or -1: what a label aimed there goes under. */
  rowAt(at: THREE.Vector3): number {
    const { width, boardThickness: t, rowHeights } = this.options;
    if (Math.abs(at.x) > width / 2 + 0.01) return -1;
    return this.boardTops.findIndex((top, r) => at.y >= top - t - 0.02 && at.y <= top + rowHeights[r]!);
  }

  /** How far from its middle a label may stand along row `row`'s edge (m), for a label `width` long. */
  edgeReach(width: number): number {
    return Math.max(0, this.options.width / 2 - this.options.boardThickness - width / 2 - 0.005);
  }

  /** The row `box` stands on here (in hand, the row it came from), or -1. */
  rowOf(box: GameBox): number {
    return this.rowBoxes.findIndex((boxes) => boxes?.includes(box));
  }

  /** Whether row `row` has room for `coming` once `leaving` (on it) is gone. */
  roomFor(row: number, leaving: GameBox, coming: GameBox): boolean {
    const { width, gap, boardThickness } = this.options;
    const boxes = (this.rowBoxes[row] ?? []).filter((box) => box !== leaving && box !== coming);
    const used = boxes.reduce((sum, box) => sum + box.dimensions.width, 0) + boxes.length * gap;
    return used + coming.dimensions.width <= width - 2 * boardThickness + 1e-6;
  }

  /**
   * A folded card standing on row `row`'s board at local `x`, leaning back, facing out (what the bookcase
   * is for, on a nearly empty one); null takes it away.
   */
  setCard(text: { title: string; line: string } | null, row = 0, x = 0): void {
    if (this.card) {
      this.remove(this.card);
      this.card.material.map?.dispose();
      this.card.material.dispose();
      this.card.geometry.dispose();
      for (const leaf of this.card.children) (leaf as THREE.Mesh).geometry.dispose();
      this.card = null;
    }
    const top = this.boardTops[row];
    if (!text || top === undefined) return;
    const [canvas, ctx] = createCanvas(260, 150);
    ctx.fillStyle = '#f4eedc';
    ctx.fillRect(0, 0, 260, 150);
    ctx.strokeStyle = 'rgba(58,42,26,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 244, 134);
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic bold 30px Georgia, serif';
    ctx.fillText(text.title, 130, 60, 230);
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText(text.line, 130, 100, 230);
    const texture = toTexture(canvas, 'facing');
    // Its origin at its foot, on the board.
    const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H).translate(0, CARD_H / 2, 0), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }));
    card.position.set(x, top + 0.001, this.options.depth / 2 - FRONT_SET - 0.02);
    card.rotation.x = -CARD_LEAN;
    card.receiveShadow = true;
    card.castShadow = true;
    // Folded: the back leaf hangs from the top edge down behind it (a tent), so it stands seen from the side or behind.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H).translate(0, -CARD_H / 2, 0), standard({ color: 0xece4cf, roughness: 0.85, side: THREE.DoubleSide }));
    back.position.set(0, CARD_H, -0.0004);
    back.rotation.x = 2 * CARD_LEAN;
    back.castShadow = true;
    back.receiveShadow = true;
    card.add(back);
    this.card = card;
    this.add(card);
  }

  /**
   * Removes and frees the boards, leaving an empty group. Idempotent. Boxes should have been
   * taken off the shelf first; the shared wood material is kept for the next bookcase.
   */
  dispose(): void {
    this.carcass.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !isShared(mesh.geometry)) mesh.geometry.dispose();
    });
    this.remove(this.carcass);
    this.carcass.clear();
    this.setCard(null);
    for (const trinket of this.trinkets.splice(0)) {
      if (!trinket) continue;
      trinket.object.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && !isShared(mesh.geometry)) mesh.geometry.dispose();
      });
      this.remove(trinket.object);
    }
    this.shadowProxy.count = 0;
    this.shadowProxy.castShadow = false;
    this.shadowProxy.dispose(); // its instance buffer; refilled if a carried box comes back to this emptied shelf
  }

  private boxMoved(child: THREE.Object3D, onShelf: boolean): void {
    if (!(child instanceof GameBox)) return;
    child.setShadowProxied(onShelf);
    const motion = this.motion;
    if (onShelf && motion) child.restless = (box) => motion.track(box);
    else if (!onShelf) {
      child.restless = null;
      motion?.untrack(child);
      child.stopSettling();
    }
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

  /**
   * The carcass: two sides from the floor, a plinth (the bottom board raised on a kick board set
   * back from the front), the shelves between the sides, a top that overhangs them, a hardboard back
   * set in behind the boards, and veneer banding over every front edge. Merged by material at the
   * end: a bookcase is three draws, whatever its rows.
   */
  private build(): void {
    const { width, depth, rowHeights, boardThickness: t } = this.options;
    const h = this.height;
    const parts: THREE.Mesh[] = [];
    const span = width - 2 * t;
    // The boards stop at the back's face, buried a hair into it; the sides run over its edges to the wall.
    const boardDepth = depth - BACK_THICKNESS + INSET;
    const boardZ = (BACK_THICKNESS - INSET) / 2;
    const front = depth / 2;
    const band = (w: number, bandH: number, at: { x?: number; y: number; z?: number }): void => {
      parts.push(boxMesh(w, bandH, PROUD, BANDING, { x: at.x ?? 0, y: at.y, z: (at.z ?? front) + PROUD / 2 }));
    };

    // Sides, up to the top's underside, banded down their front edge.
    for (const side of [-1, 1]) {
      const x = side * (width / 2 - t / 2);
      parts.push(boxMesh(t, h - t + INSET, depth, WOOD, { x, y: (h - t + INSET) / 2 }));
      band(t, h - t + INSET, { x, y: (h - t + INSET) / 2 });
    }
    // The top, over the sides, standing out past them and the front.
    const topDepth = depth + TOP_OVERHANG;
    parts.push(boxMesh(width + 2 * TOP_OVERHANG, t, topDepth, WOOD, { y: h - t / 2, z: TOP_OVERHANG / 2 }));
    band(width + 2 * TOP_OVERHANG, t, { y: h - t / 2, z: front + TOP_OVERHANG });
    // The hardboard back, between the sides (buried in them) from the floor to the top's underside.
    parts.push(boxMesh(span + 2 * INSET, h - t + INSET, BACK_THICKNESS, HARDBOARD, { y: (h - t + INSET) / 2, z: -depth / 2 + BACK_THICKNESS / 2 }));
    // The kick board under the bottom shelf, set back in the shadow of it.
    parts.push(boxMesh(span + 2 * INSET, PLINTH + INSET, t, WOOD, { y: (PLINTH + INSET) / 2, z: front - KICK_RECESS - t / 2 }));

    // Shelves from the plinth up. The bottom one rests on the plinth; the others bow a little under
    // the boxes. The top row's ceiling is the top board itself.
    let y = PLINTH + t / 2;
    const tops: number[] = [];
    const sags: number[] = [];
    const sag = QUALITY.detailedMaterials ? Math.min(MAX_SAG, SAG_AT_80CM * (span / 0.8) ** 2) : 0;
    for (let i = rowHeights.length - 1; i >= 0; i--) {
      const loaded = i !== rowHeights.length - 1 ? sag : 0;
      const board = boxMesh(span + 2 * INSET, t, boardDepth, WOOD, { y, z: boardZ });
      const edge = boxMesh(span, t, PROUD, BANDING, { y, z: front + PROUD / 2 });
      if (loaded > 0) {
        // Their own copies: boxMesh geometries are shared.
        bow((board.geometry = board.geometry.clone()), span, loaded);
        bow((edge.geometry = edge.geometry.clone()), span, loaded);
      }
      parts.push(board, edge);
      tops.push(y + t / 2);
      sags.push(loaded);
      y += t + rowHeights[i]!;
    }
    this.boardTops.push(...tops.reverse()); // top row first
    this.rowSags.push(...sags.reverse());
    this.carcass.add(...parts);
    this.add(this.carcass);
    mergeStaticParts(this.carcass);
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

/** Yaw and depth offset of a box on the shelf, from its game id (the same every time). */
function untidiness(id: string): [yaw: number, push: number] {
  if (!QUALITY.detailedMaterials) return [0, 0];
  const next = seededRng(id);
  const yaw = (next() * 2 - 1) * BOX_YAW;
  const r = next();
  const push = r < 0.18 ? -next() * BOX_PUSH : r > 0.9 ? next() * BOX_PULL : 0;
  return [yaw, push];
}
