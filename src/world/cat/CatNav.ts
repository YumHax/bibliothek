import * as THREE from 'three';
import type { Collisions } from '@/core/Collider';

/** Grid cell size (metres). */
const CELL = 0.15;
/** The cat keeps this far from the walls. */
const WALL_MARGIN = 0.15;
/** Probe used to decide whether a cell is blocked: a cat-sized sphere just above the floor. */
const PROBE_Y = 0.12;
const PROBE_RADIUS = 0.12;
/** The blocked grid is recomputed at most this often (the shelving may be rebuilt). */
const REFRESH_S = 10;
/** Step of the straight-segment test used by the path smoothing. */
const SAMPLE_STEP = 0.1;
/** How far (in cells) to look for a free cell around a blocked goal. */
const NEAREST_RINGS = 8;
const SQRT2 = Math.SQRT2;

/**
 * Walking without walking through furniture: a coarse occupancy grid over the room, refreshed
 * lazily from the collision world, A* between cells (8 neighbours, no corner cutting) and
 * string-pulling to turn the cell chain into a few straight legs. Given `areas` (the rooms of the
 * flat), the grid spans all of them and only their cells are probed: the walls between them are
 * colliders, so the cat goes from room to room through the doorways, and a shut door (its leaf is a
 * collider too) keeps it in.
 */
export class CatNav {
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  /** Seconds since the grid was last computed; starts stale so the first plan computes it. */
  private age = Infinity;

  private readonly gCost: Float32Array;
  private readonly fCost: Float32Array;
  private readonly parent: Int32Array;
  private readonly closed: Uint8Array;
  private readonly probe = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2d = new THREE.Vector2();
  /** 1 where a cell lies inside one of the `areas` (all cells without areas). */
  private readonly inside: Uint8Array;

  constructor(
    private readonly collisions: Collisions,
    bounds: THREE.Box2,
    areas?: readonly THREE.Box2[],
  ) {
    this.minX = bounds.min.x + WALL_MARGIN;
    this.minZ = bounds.min.y + WALL_MARGIN;
    this.cols = Math.max(1, Math.floor((bounds.max.x - WALL_MARGIN - this.minX) / CELL));
    this.rows = Math.max(1, Math.floor((bounds.max.y - WALL_MARGIN - this.minZ) / CELL));
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.gCost = new Float32Array(n);
    this.fCost = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.inside = new Uint8Array(n).fill(1);
    if (areas?.length) {
      for (let cell = 0; cell < n; cell++) {
        this.cellCentre(cell, this.tmp);
        this.tmp2d.set(this.tmp.x, this.tmp.z);
        this.inside[cell] = areas.some((a) => a.containsPoint(this.tmp2d)) ? 1 : 0;
      }
    }
  }

  /** Ages the grid; it is recomputed on the next plan once older than ~10 s. */
  tick(dt: number): void {
    this.age += dt;
  }

  /** Forces a recompute of the blocked cells on the next query. */
  invalidate(): void {
    this.age = Infinity;
  }

  /** True when the floor point is inside the walkable area and its cell is not blocked. */
  isFree(point: THREE.Vector3): boolean {
    this.refresh();
    const cell = this.cellOf(point);
    return cell !== -1 && this.blocked[cell] === 0;
  }

  /** Pulls a floor point back inside the walkable area (walls shrunk by the margin). */
  clampInside(point: THREE.Vector3): THREE.Vector3 {
    point.x = THREE.MathUtils.clamp(point.x, this.minX, this.minX + this.cols * CELL);
    point.z = THREE.MathUtils.clamp(point.z, this.minZ, this.minZ + this.rows * CELL);
    return point;
  }

  /**
   * A random free floor point, within `radius` of `near` when given, else inside `within` (a room)
   * or anywhere on the grid. Null when a few dozen tries found nothing.
   */
  randomFreePoint(out: THREE.Vector3, near?: THREE.Vector3, radius = 1, within?: THREE.Box2): THREE.Vector3 | null {
    this.refresh();
    for (let i = 0; i < 40; i++) {
      if (near) {
        const angle = Math.random() * Math.PI * 2;
        const r = radius * Math.sqrt(Math.random());
        out.set(near.x + Math.cos(angle) * r, 0, near.z + Math.sin(angle) * r);
      } else if (within) {
        out.set(THREE.MathUtils.lerp(within.min.x, within.max.x, Math.random()), 0, THREE.MathUtils.lerp(within.min.y, within.max.y, Math.random()));
      } else {
        out.set(this.minX + Math.random() * this.cols * CELL, 0, this.minZ + Math.random() * this.rows * CELL);
      }
      const cell = this.cellOf(out);
      if (cell !== -1 && this.blocked[cell] === 0) return out;
    }
    return null;
  }

  /**
   * Shortest walk from `from` to `to` as a short list of straight legs (the first entry is the
   * first waypoint, not `from`). A blocked goal is replaced by the nearest free cell. Null when
   * the goal is unreachable even after refreshing the grid.
   */
  planPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    this.refresh();
    let path = this.search(from, to);
    if (!path && this.age > 0.5) {
      // Furniture may have moved since the grid was computed: try again on fresh data.
      this.invalidate();
      this.refresh();
      path = this.search(from, to);
    }
    return path;
  }

  /**
   * True when `point` is inside a collider right now, whatever the grid last said: something moved
   * into the way since (a door swung shut). Only a point on a planned leg is meaningful: those lie
   * in free cells, clear of everything that stood still, so a hit can only be what moved.
   */
  blockedNow(point: THREE.Vector3): boolean {
    this.probe.set(point.x, PROBE_Y, point.z);
    return this.collisions.intersectsSphere(this.probe, 0.01);
  }

  /** True when the straight floor segment from `a` to `b` crosses no blocked cell. */
  segmentFree(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.tmp.set(a.x + dx * t, 0, a.z + dz * t);
      const cell = this.cellOf(this.tmp);
      if (cell === -1 || this.blocked[cell] !== 0) return false;
    }
    return true;
  }

  // --- internals ------------------------------------------------------------------------------

  private refresh(): void {
    if (this.age < REFRESH_S) return;
    this.age = 0;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = row * this.cols + col;
        if (!this.inside[cell]) {
          this.blocked[cell] = 1;
          continue;
        }
        this.probe.set(this.minX + (col + 0.5) * CELL, PROBE_Y, this.minZ + (row + 0.5) * CELL);
        this.blocked[cell] = this.collisions.intersectsSphere(this.probe, PROBE_RADIUS) ? 1 : 0;
      }
    }
  }

  /** Cell index of a floor point, or -1 outside the walkable area. */
  private cellOf(point: THREE.Vector3): number {
    const col = Math.floor((point.x - this.minX) / CELL);
    const row = Math.floor((point.z - this.minZ) / CELL);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  private cellCentre(cell: number, out: THREE.Vector3): THREE.Vector3 {
    const col = cell % this.cols;
    const row = (cell - col) / this.cols;
    return out.set(this.minX + (col + 0.5) * CELL, 0, this.minZ + (row + 0.5) * CELL);
  }

  /** Nearest cell to `point` that is inside the grid (clamped) and free, searching outward in rings. */
  private nearestFreeCell(point: THREE.Vector3): number {
    const col0 = THREE.MathUtils.clamp(Math.floor((point.x - this.minX) / CELL), 0, this.cols - 1);
    const row0 = THREE.MathUtils.clamp(Math.floor((point.z - this.minZ) / CELL), 0, this.rows - 1);
    if (this.blocked[row0 * this.cols + col0] === 0) return row0 * this.cols + col0;
    let best = -1;
    let bestDist = Infinity;
    for (let ring = 1; ring <= NEAREST_RINGS && best === -1; ring++) {
      for (let row = row0 - ring; row <= row0 + ring; row++) {
        if (row < 0 || row >= this.rows) continue;
        for (let col = col0 - ring; col <= col0 + ring; col++) {
          if (col < 0 || col >= this.cols) continue;
          if (Math.abs(row - row0) !== ring && Math.abs(col - col0) !== ring) continue;
          const cell = row * this.cols + col;
          if (this.blocked[cell] !== 0) continue;
          const dist = (col - col0) ** 2 + (row - row0) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            best = cell;
          }
        }
      }
    }
    return best;
  }

  private search(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const start = this.nearestFreeCell(from);
    const goal = this.nearestFreeCell(to);
    if (start === -1 || goal === -1) return null;
    const goalIsExact = this.cellOf(to) === goal;

    if (start === goal) {
      const end = goalIsExact ? to.clone().setY(0) : this.cellCentre(goal, new THREE.Vector3());
      return [end];
    }

    const { cols, rows, blocked, gCost, fCost, parent, closed } = this;
    gCost.fill(Infinity);
    closed.fill(0);
    parent.fill(-1);
    const open = new MinHeap(fCost);
    const goalCol = goal % cols;
    const goalRow = (goal - goalCol) / cols;
    const heuristic = (cell: number): number => {
      const col = cell % cols;
      const row = (cell - col) / cols;
      const dx = Math.abs(col - goalCol);
      const dz = Math.abs(row - goalRow);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    gCost[start] = 0;
    fCost[start] = heuristic(start);
    open.push(start);

    let found = false;
    while (open.size > 0) {
      const current = open.pop();
      if (current === goal) {
        found = true;
        break;
      }
      if (closed[current]) continue;
      closed[current] = 1;
      const col = current % cols;
      const row = (current - col) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        const nr = row + dr;
        if (nr < 0 || nr >= rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = col + dc;
          if (nc < 0 || nc >= cols) continue;
          const next = nr * cols + nc;
          if (blocked[next] || closed[next]) continue;
          // No corner cutting: a diagonal step needs both orthogonal neighbours free.
          if (dr !== 0 && dc !== 0 && (blocked[row * cols + nc] || blocked[nr * cols + col])) continue;
          const step = dr !== 0 && dc !== 0 ? SQRT2 : 1;
          const g = gCost[current] + step;
          if (g < gCost[next]) {
            gCost[next] = g;
            fCost[next] = g + heuristic(next);
            parent[next] = current;
            open.push(next);
          }
        }
      }
    }
    if (!found) return null;

    // Cell chain goal -> start, then reversed into world points; the exact goal replaces its cell.
    const cells: number[] = [];
    for (let cell = goal; cell !== -1; cell = parent[cell]) cells.push(cell);
    cells.reverse();
    const points: THREE.Vector3[] = [from.clone().setY(0)];
    // Standing on a blocked cell (dropped there, or furniture rebuilt around it): step out first.
    if (this.cellOf(from) !== start) points.push(this.cellCentre(start, new THREE.Vector3()));
    for (let i = 1; i < cells.length - 1; i++) points.push(this.cellCentre(cells[i], new THREE.Vector3()));
    points.push(goalIsExact ? to.clone().setY(0) : this.cellCentre(goal, new THREE.Vector3()));
    return this.smooth(points);
  }

  /** String-pulling: from each point, jump to the furthest later point reachable in a straight line. */
  private smooth(points: THREE.Vector3[]): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      while (j > i + 1 && !this.segmentFree(points[i], points[j])) j--;
      result.push(points[j]);
      i = j;
    }
    return result;
  }
}

/** Binary min-heap of cell indices ordered by an external cost array (duplicates allowed, stale entries skipped by the caller). */
class MinHeap {
  private readonly items: number[] = [];

  constructor(private readonly cost: Float32Array) {}

  get size(): number {
    return this.items.length;
  }

  push(cell: number): void {
    const items = this.items;
    items.push(cell);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[items[p]] <= this.cost[items[i]]) break;
      [items[p], items[i]] = [items[i], items[p]];
      i = p;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop() as number;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.cost[items[l]] < this.cost[items[m]]) m = l;
        if (r < items.length && this.cost[items[r]] < this.cost[items[m]]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}
