import * as THREE from 'three';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { markShared } from '../materials/sharedResources';
import { WALL, onSurface } from '../surface/layers';
import type { Shelf } from '../Shelf';
import { PX_PER_M, TAPE_COLOURS, TAPE_HEIGHT, TAPE_PX, labelText, paintTape, tapeWidthPx, type TapeColour } from './labelTape';

/** The atlas: one canvas for every label (one texture, one material), cells of `CELL_W` x `TAPE_PX` px. */
const ATLAS_W = 1024;
const ATLAS_H = 1024;
const CELL_W = 512;
const COLUMNS = ATLAS_W / CELL_W;
const ROWS = Math.floor(ATLAS_H / TAPE_PX);
/** The most labels the flat's shelves can wear. */
export const MAX_LABELS = COLUMNS * ROWS;
/** Two labels on one edge keep this far apart (m). */
const APART = 0.006;

/** A label as saved: where it is stuck (shelving, bookcase slot, the row whose board edge it is on, along it), what it says. */
export interface ShelfLabel {
  id: number;
  shelving: string;
  bookcase: number;
  row: number;
  /** Along the edge from the bookcase's middle (m), the label's centre. */
  x: number;
  text: string;
  tape: TapeColour;
}

/** Where a label goes: a bookcase's board edge, aimed at (`aim`). */
export interface LabelSpot {
  shelving: string;
  bookcase: number;
  row: number;
  x: number;
  /** The label already stuck there, if any (K then offers to peel it off or print it again). */
  existing: ShelfLabel | null;
  /** Where the crosshair met the bookcase (world), when aimed. */
  point?: THREE.Vector3;
}

interface Saved {
  labels: ShelfLabel[];
}

interface Stuck {
  label: ShelfLabel;
  mesh: THREE.Mesh;
  cell: number;
}

/**
 * The labels printed with the label maker (SECOND HOME sells it) and stuck along the shelves' front edges
 * (docs/furnishing.md "Shelf labels"): what the player types, embossed on coloured tape. Saved (`KEYS.shelfLabels`) by
 * the bookcase's slot and row, so they stay where they were stuck whatever the boxes do (a sort, a box moved) and ride
 * a bookcase the player moves; a rebuild puts them on the new boards (`attach`, from the shelving's `onBookcase`).
 *
 * Every label is a cell of one canvas atlas, so they all share one texture and one material, whatever their number.
 */
export class ShelfLabels {
  private state: Saved;
  private readonly store: PersistedStore<Saved>;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.MeshStandardMaterial;
  /** The bookcases standing now, by `shelving#slot`. */
  private readonly shelves = new Map<string, Shelf>();
  private readonly stuck = new Map<number, Stuck>();
  /** Which atlas cell each label paints in. */
  private readonly cells = new Map<number, number>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly listeners = new Set<() => void>();

  constructor(storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<Saved>({ key: KEYS.shelfLabels, version: 1, storage, defaults: () => ({ labels: [] }), read: readSaved });
    this.state = this.store.load();
    const [canvas, ctx] = createCanvas(ATLAS_W, ATLAS_H);
    this.ctx = ctx;
    this.texture = markShared(new THREE.CanvasTexture(canvas));
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    // The cut ends see-through (alpha test, no sorting); the vinyl's gloss.
    this.material = markShared(onSurface(new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.32, alphaTest: 0.5 }), WALL.print));
    this.state.labels.forEach((label) => this.paint(label));
  }

  /** Every label, as saved. */
  get labels(): readonly ShelfLabel[] {
    return this.state.labels;
  }

  /** Hears every label stuck or peeled off. */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** A bookcase of shelving `shelving` put up in slot `index` wears its labels; what it returns takes them off it. */
  attach(shelving: string, index: number, shelf: Shelf): () => void {
    const key = `${shelving}#${index}`;
    this.shelves.set(key, shelf);
    for (const label of this.state.labels) if (label.shelving === shelving && label.bookcase === index) this.stick(label);
    return () => {
      if (this.shelves.get(key) !== shelf) return;
      this.shelves.delete(key);
      for (const [id, stuck] of [...this.stuck]) {
        if (stuck.label.shelving !== shelving || stuck.label.bookcase !== index) continue;
        this.unstick(id);
      }
    };
  }

  /**
   * The board edge `ray` (world) meets within `far` m on one of `bookcases` (the flat's, `ShelvingGroup.bookcaseList`),
   * and the label there if any; null when it meets none.
   */
  aim(ray: THREE.Ray, bookcases: readonly { shelving: string; index: number; shelf: Shelf }[], far: number): LabelSpot | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    let best: (LabelSpot & { distance: number }) | null = null;
    for (const { shelving, index, shelf } of bookcases) {
      const hit = this.raycaster.intersectObject(shelf, true)[0];
      if (!hit || (best && hit.distance >= best.distance)) continue;
      const local = shelf.worldToLocal(hit.point.clone());
      const row = shelf.rowAt(local);
      if (row < 0) continue;
      const existing = this.state.labels.find((l) => l.shelving === shelving && l.bookcase === index && l.row === row && Math.abs(l.x - local.x) <= this.lengthOf(l) / 2 + 0.01) ?? null;
      best = { shelving, bookcase: index, row, x: local.x, existing, point: hit.point.clone(), distance: hit.distance };
    }
    if (!best) return null;
    const { distance: _distance, ...spot } = best;
    return spot;
  }

  /**
   * Prints `raw` on `tape` and sticks it at `spot` (centred on the point aimed at, kept on the edge), in place of label
   * `replacing` if given; the reason it cannot be when it cannot (nothing to print, no room on that edge, the label
   * maker's tape used up), else null.
   */
  add(spot: LabelSpot, raw: string, tape: TapeColour, replacing?: number): string | null {
    const text = labelText(raw);
    if (!text) return 'Type something to print first.';
    const count = this.state.labels.filter((l) => l.id !== replacing).length;
    if (count >= MAX_LABELS) return 'The label maker’s tape has run out: peel an old label off first.';
    const length = this.measure(text);
    const shelf = this.shelves.get(`${spot.shelving}#${spot.bookcase}`);
    const reach = shelf ? shelf.edgeReach(length) : 0.4;
    const old = replacing !== undefined ? this.state.labels.find((l) => l.id === replacing) : undefined;
    const x = THREE.MathUtils.clamp(old?.x ?? spot.x, -reach, reach);
    const others = this.state.labels.filter((l) => l.id !== replacing && l.shelving === spot.shelving && l.bookcase === spot.bookcase && l.row === spot.row);
    if (others.some((l) => Math.abs(l.x - x) < (this.lengthOf(l) + length) / 2 + APART)) return 'Another label is in the way on that edge.';
    // Printed over an old label: that one comes off (its cell freed for the new one).
    if (replacing !== undefined) this.remove(replacing);
    const label: ShelfLabel = { id: this.nextId(), shelving: spot.shelving, bookcase: spot.bookcase, row: spot.row, x, text, tape };
    this.state = { labels: [...this.state.labels, label] };
    this.save();
    this.paint(label);
    if (shelf) this.stick(label);
    this.changed();
    return null;
  }

  /** Peels label `id` off. */
  remove(id: number): void {
    if (!this.state.labels.some((l) => l.id === id)) return;
    this.state = { labels: this.state.labels.filter((l) => l.id !== id) };
    this.save();
    this.unstick(id);
    const cell = this.cells.get(id);
    if (cell !== undefined) {
      const [cx, cy] = cellAt(cell);
      this.ctx.clearRect(cx, cy, CELL_W, TAPE_PX);
      this.texture.needsUpdate = true;
      this.cells.delete(id);
    }
    this.changed();
  }

  /** Paints `text` on `tape` into `canvas` for a preview (the label panel), the canvas resized to fit; returns its width (m). */
  preview(canvas: HTMLCanvasElement, text: string, tape: TapeColour): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const shown = labelText(text) || ' ';
    canvas.width = Math.max(TAPE_PX, tapeWidthPx(ctx, shown));
    canvas.height = TAPE_PX;
    paintTape(ctx, 0, 0, shown, tape);
    return canvas.width / PX_PER_M;
  }

  /** How long a label of `text` is (m). */
  measure(text: string): number {
    return Math.min(CELL_W, tapeWidthPx(this.ctx, text)) / PX_PER_M;
  }

  private lengthOf(label: ShelfLabel): number {
    return this.measure(label.text);
  }

  /** Paints `label` in a free cell of the atlas. */
  private paint(label: ShelfLabel): void {
    let cell = this.cells.get(label.id);
    if (cell === undefined) {
      const used = new Set(this.cells.values());
      cell = 0;
      while (used.has(cell)) cell++;
      if (cell >= MAX_LABELS) return;
      this.cells.set(label.id, cell);
    }
    const [cx, cy] = cellAt(cell);
    paintTape(this.ctx, cx, cy, label.text, label.tape, CELL_W);
    this.texture.needsUpdate = true;
  }

  /** A mesh for `label` on its bookcase's edge: a strip of the atlas, its cell's UVs. */
  private stick(label: ShelfLabel): void {
    const shelf = this.shelves.get(`${label.shelving}#${label.bookcase}`);
    const cell = this.cells.get(label.id);
    if (!shelf || cell === undefined || this.stuck.has(label.id)) return;
    const row = Math.min(label.row, shelf.rowCount - 1);
    const lengthPx = Math.min(CELL_W, tapeWidthPx(this.ctx, label.text));
    const length = lengthPx / PX_PER_M;
    const x = THREE.MathUtils.clamp(label.x, -shelf.edgeReach(length), shelf.edgeReach(length));
    const edge = shelf.edgeOf(row, x);
    if (!edge) return;
    const geometry = new THREE.PlaneGeometry(length, Math.min(TAPE_HEIGHT, edge.height - 0.004));
    const [cx, cy] = cellAt(cell);
    const u0 = cx / ATLAS_W;
    const u1 = (cx + lengthPx) / ATLAS_W;
    const v1 = 1 - cy / ATLAS_H;
    const v0 = 1 - (cy + TAPE_PX) / ATLAS_H;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    // PlaneGeometry's corners: top left, top right, bottom left, bottom right.
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = `ShelfLabel:${label.text}`;
    mesh.position.set(x, edge.y, edge.z + WALL.print.lift);
    // A strip of tape is never perfectly level.
    mesh.rotation.z = ((label.id * 7919) % 11 - 5) * 0.0012;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    shelf.add(mesh);
    this.stuck.set(label.id, { label, mesh, cell });
  }

  private unstick(id: number): void {
    const stuck = this.stuck.get(id);
    if (!stuck) return;
    stuck.mesh.removeFromParent();
    stuck.mesh.geometry.dispose();
    this.stuck.delete(id);
  }

  private nextId(): number {
    return this.state.labels.reduce((max, l) => Math.max(max, l.id), 0) + 1;
  }

  private save(): void {
    this.store.save(this.state);
  }

  private changed(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

/** The top left of atlas cell `cell` (px). */
function cellAt(cell: number): [number, number] {
  return [(cell % COLUMNS) * CELL_W, Math.floor(cell / COLUMNS) * TAPE_PX];
}

function readSaved(data: unknown): Saved | null {
  if (typeof data !== 'object' || data === null) return null;
  const { labels } = data as { labels?: unknown };
  if (!Array.isArray(labels)) return { labels: [] };
  const clean: ShelfLabel[] = [];
  const ids = new Set<number>();
  for (const entry of labels as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const l = entry as Partial<ShelfLabel>;
    const text = typeof l.text === 'string' ? labelText(l.text) : '';
    if (typeof l.id !== 'number' || ids.has(l.id) || typeof l.shelving !== 'string' || typeof l.bookcase !== 'number' || typeof l.row !== 'number' || typeof l.x !== 'number' || !text) continue;
    const tape = TAPE_COLOURS.includes(l.tape as TapeColour) ? (l.tape as TapeColour) : 'black';
    ids.add(l.id);
    clean.push({ id: l.id, shelving: l.shelving, bookcase: Math.max(0, Math.floor(l.bookcase)), row: Math.max(0, Math.floor(l.row)), x: l.x, text, tape });
  }
  return { labels: clean.slice(0, MAX_LABELS) };
}
