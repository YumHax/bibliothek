import * as THREE from 'three';

/** The player's body (`FirstPersonController`'s default radius): a way through is this far clear each side of its middle. */
const BODY_RADIUS = 0.3;
/** Grid cell (m). */
const CELL = 0.05;
/** Floor cut off smaller than this (m²) is forgiven: a sliver tucked behind the piece. */
const FORGIVEN = 0.15;
/** Only what stands lower than this over the floor bars the way: the body is probed at the knees and the waist. */
const BODY_TOP = 1.3;
/** What barely rises off the floor (a mat's edge) bars nothing. */
const BODY_BOTTOM = 0.05;

/**
 * The way through a room on foot, on a grid: which floor the player can reach from its doorways past what stands
 * there (`blocks`), and whether one more piece would cut part of it off (a cabinet set across the gap between a
 * wardrobe and the wall: the door still opens, the room behind is shut away). Made lazily, once, per `Fit`.
 */
export class WayThrough {
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly floorY: number;
  /** 1 where the body cannot stand: too near a wall or something standing there. */
  private readonly blocked: Uint8Array;
  /** 1 where the body can walk to from the doorways now, `start` the cell the walk begins from. */
  private readonly reached: Uint8Array;
  private readonly start: number;
  private readonly answers = new Map<string, THREE.Box3 | null>();

  constructor(room: THREE.Box3, blocks: readonly THREE.Box3[], doorways: readonly THREE.Box3[]) {
    this.minX = room.min.x;
    this.minZ = room.min.z;
    this.floorY = room.min.y;
    this.cols = Math.max(1, Math.ceil((room.max.x - room.min.x) / CELL));
    this.rows = Math.max(1, Math.ceil((room.max.z - room.min.z) / CELL));
    this.blocked = new Uint8Array(this.cols * this.rows);
    const margin = Math.ceil(BODY_RADIUS / CELL);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) if (c < margin || r < margin || c >= this.cols - margin || r >= this.rows - margin) this.blocked[r * this.cols + c] = 1;
    for (const box of blocks) if (this.bars(box)) this.mark(this.blocked, box);
    // The walk starts in the opening of the doorway that reaches the most floor (one walk, so a room split in two, each
    // half with a door of its own, still reads as cut; and a doorway shut off behind the piece loses all the room).
    let best: { start: number; reached: Uint8Array; count: number } | null = null;
    for (const doorway of doorways) {
      const start = this.firstFree(doorway, this.blocked);
      if (start < 0) continue;
      const reached = this.walk(start, this.blocked);
      const count = reached.reduce((n, v) => n + v, 0);
      if (!best || count > best.count) best = { start, reached, count };
    }
    this.start = best?.start ?? -1;
    this.reached = best?.reached ?? new Uint8Array(this.cols * this.rows);
  }

  /**
   * The floor a piece whose bounds are `box` (world) would shut away from the doorways, as a world box round it, or
   * null when the way stays open. The floor under and round the piece itself is its own, not counted.
   */
  cutOff(box: THREE.Box3): THREE.Box3 | null {
    if (this.start < 0 || !this.bars(box)) return null;
    const key = `${box.min.x.toFixed(3)},${box.min.z.toFixed(3)},${box.max.x.toFixed(3)},${box.max.z.toFixed(3)}`;
    const known = this.answers.get(key);
    if (known !== undefined) return known;
    const own = new Uint8Array(this.cols * this.rows);
    this.mark(own, box);
    const blocked = this.blocked.slice();
    for (let i = 0; i < own.length; i++) if (own[i]) blocked[i] = 1;
    let answer: THREE.Box3 | null = null;
    // Standing on the walk's first cell: the doorway rule says so already.
    if (!own[this.start]) {
      const reached = this.walk(this.start, blocked);
      let lost = 0;
      const area = new THREE.Box3();
      for (let i = 0; i < reached.length; i++) {
        if (!this.reached[i] || reached[i] || own[i]) continue;
        lost++;
        const c = i % this.cols;
        const r = (i - c) / this.cols;
        area.expandByPoint(new THREE.Vector3(this.minX + c * CELL, this.floorY, this.minZ + r * CELL));
        area.expandByPoint(new THREE.Vector3(this.minX + (c + 1) * CELL, this.floorY + BODY_TOP, this.minZ + (r + 1) * CELL));
      }
      if (lost * CELL * CELL > FORGIVEN) answer = area;
    }
    this.answers.set(key, answer);
    return answer;
  }

  /** Whether `box` stands where the body is (between the knees and the waist), not over it or flat on the floor. */
  private bars(box: THREE.Box3): boolean {
    return box.min.y - this.floorY < BODY_TOP && box.max.y - this.floorY > BODY_BOTTOM;
  }

  /** Marks in `grid` every cell whose middle is within the body's radius of `box` (seen from above). */
  private mark(grid: Uint8Array, box: THREE.Box3): void {
    const c0 = Math.max(0, Math.floor((box.min.x - BODY_RADIUS - this.minX) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((box.max.x + BODY_RADIUS - this.minX) / CELL));
    const r0 = Math.max(0, Math.floor((box.min.z - BODY_RADIUS - this.minZ) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((box.max.z + BODY_RADIUS - this.minZ) / CELL));
    for (let r = r0; r <= r1; r++) {
      const z = this.minZ + (r + 0.5) * CELL;
      const dz = Math.max(box.min.z - z, 0, z - box.max.z);
      for (let c = c0; c <= c1; c++) {
        const x = this.minX + (c + 0.5) * CELL;
        const dx = Math.max(box.min.x - x, 0, x - box.max.x);
        if (dx * dx + dz * dz < BODY_RADIUS * BODY_RADIUS) grid[r * this.cols + c] = 1;
      }
    }
  }

  /** The cell inside `box` (a doorway's clearance) the body can stand on nearest the wall, i.e. the opening; or -1. */
  private firstFree(box: THREE.Box3, blocked: Uint8Array): number {
    let best = -1;
    let bestDepth = Infinity;
    for (let r = 0; r < this.rows; r++) {
      const z = this.minZ + (r + 0.5) * CELL;
      if (z < box.min.z || z > box.max.z) continue;
      for (let c = 0; c < this.cols; c++) {
        const x = this.minX + (c + 0.5) * CELL;
        if (x < box.min.x || x > box.max.x || blocked[r * this.cols + c]) continue;
        // How far into the room: the distance to the nearest wall.
        const depth = Math.min(c, r, this.cols - 1 - c, this.rows - 1 - r);
        if (depth < bestDepth) {
          best = r * this.cols + c;
          bestDepth = depth;
        }
      }
    }
    return best;
  }

  /** Every cell the body walks to from `start` (four ways round, never through a blocked cell). */
  private walk(start: number, blocked: Uint8Array): Uint8Array {
    const reached = new Uint8Array(this.cols * this.rows);
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0;
    let tail = 0;
    reached[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++] ?? 0;
      const c = cell % this.cols;
      for (const next of [c > 0 ? cell - 1 : -1, c < this.cols - 1 ? cell + 1 : -1, cell - this.cols, cell + this.cols]) {
        if (next < 0 || next >= reached.length || reached[next] || blocked[next]) continue;
        reached[next] = 1;
        queue[tail++] = next;
      }
    }
    return reached;
  }
}
