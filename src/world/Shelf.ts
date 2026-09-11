import * as THREE from 'three';
import type { GameBox } from './GameBox';
import { boxMesh } from './meshUtils';

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

const WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.6 });

/**
 * A bookcase whose rows can each have their own height. Boxes stand upright with the cover
 * facing +Z (out of the shelf), laid left-to-right on the row they are given.
 */
export class Shelf extends THREE.Group {
  readonly options: Required<ShelfOptions>;
  readonly height: number;
  /** Top face of each board, top row first. */
  private readonly boardTops: number[] = [];
  private readonly boards: THREE.Mesh[] = [];

  constructor(options: ShelfOptions) {
    super();
    this.name = 'Shelf';
    this.options = { boardThickness: 0.025, gap: 0.02, ...options };
    const { rowHeights, boardThickness } = this.options;
    this.height = rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length + 1) * boardThickness;
    this.build();
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
      box.restPosition.set(cursorX + bw / 2, top + bh / 2, -depth / 2 + bd / 2 + 0.03);
      box.restQuaternion.identity();
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
  }

  private build(): void {
    const { width, depth, rowHeights, boardThickness } = this.options;
    const h = this.height;

    this.boards.push(
      boxMesh(boardThickness, h, depth, WOOD, { x: -width / 2 + boardThickness / 2, y: h / 2 }),
      boxMesh(boardThickness, h, depth, WOOD, { x: width / 2 - boardThickness / 2, y: h / 2 }),
      boxMesh(width, h, boardThickness / 2, WOOD, { y: h / 2, z: -depth / 2 + boardThickness / 4 }),
    );

    // Boards from the floor up; the top board closes the bookcase.
    let y = boardThickness / 2;
    const tops: number[] = [];
    for (let i = rowHeights.length - 1; i >= -1; i--) {
      this.boards.push(boxMesh(width - 2 * boardThickness, boardThickness, depth, WOOD, { y }));
      if (i >= 0) {
        tops.push(y + boardThickness / 2);
        y += boardThickness + rowHeights[i];
      }
    }
    this.boardTops.push(...tops.reverse()); // top row first
    this.add(...this.boards);
  }
}
