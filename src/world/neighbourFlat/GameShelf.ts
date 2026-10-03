import * as THREE from 'three';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import type { Furniture } from '../Furniture';
import { boxMesh } from '../meshUtils';
import { ShelfCopy } from './ShelfCopy';
import { paint, timber } from '../materials/palette';

/** Where the shelf's boxes go: the zone (they must be placed to be clickable). */
export interface ShelfHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toLocal(point: THREE.Vector3): THREE.Vector3;
}

export interface GameShelfOptions {
  host: ShelfHost;
  covers: BoxArtLoader;
  /** Whose shelf: the captions' "<who>'s copy". */
  who: string;
  /** Whether their standing swap offers `id` (the caption says so: the swap is how one of theirs comes home). */
  offered: (id: string) => boolean;
  /** A copy clicked: they tell its story (`first`: the shelf's first print). */
  onLook: (game: Game, first: boolean) => void;
}

const WIDTH = 1.2;
const DEPTH = 0.3;
const HEIGHT = 1.8;
const BOARD = 0.022;
/** The boards' heights (their tops): the bottom one holds books and clutter, the two above the games. */
const SHELVES = [0.06, 0.62, 1.12, 1.62];
/** How many boxes stand on each of the game shelves (the middle two). */
const PER_SHELF = 4;
/** Lean of a box against the back panel. */
const LEAN = 0.2;
const SPINES = [0x6a2a24, 0x2a3a5a, 0x3a5a3a, 0x8a6a3a, 0x4a3a5a, 0x7a7a72];

/**
 * A neighbour's open bookcase against the wall: four boards on two sides and a back panel, old books on the bottom
 * board, and on the two middle ones their own games (`ShelfCopy`, leaning on the back: theirs, never for sale, no
 * tag; clicked, they tell its story; one of theirs comes home only through their swap). Origin on the floor at the
 * middle of its back, +z into the room. `fill` lays the copies; `setShown` takes them off and puts them back (the
 * flat dressed for someone else, then for them again).
 */
export class GameShelf extends THREE.Group implements Furniture {
  private boxes: ShelfCopy[] = [];
  private readonly spots = new Map<ShelfCopy, THREE.Vector3>();
  private filled: Promise<void> | null = null;
  private shown = true;
  private disposed = false;

  constructor(private readonly options: GameShelfOptions) {
    super();
    this.name = 'GameShelf';
    const wood = timber(0x6a4a30, 0.55);
    const back = paint(0x5a3e28, 0.7);
    for (const x of [-WIDTH / 2 + BOARD / 2, WIDTH / 2 - BOARD / 2]) this.add(boxMesh(BOARD, HEIGHT, DEPTH, wood, { x, y: HEIGHT / 2, z: DEPTH / 2 }));
    this.add(boxMesh(WIDTH - 2 * BOARD, HEIGHT, 0.012, back, { y: HEIGHT / 2, z: 0.006 }));
    this.add(boxMesh(WIDTH, BOARD, DEPTH + 0.01, wood, { y: HEIGHT + BOARD / 2, z: DEPTH / 2 }));
    for (const y of SHELVES) this.add(boxMesh(WIDTH - 2 * BOARD, BOARD, DEPTH - 0.015, wood, { y: y - BOARD / 2, z: DEPTH / 2 + 0.003 }));
    // Old books along the bottom board, and a few lying on the top.
    let x = -WIDTH / 2 + BOARD + 0.02;
    for (let i = 0; x < WIDTH / 2 - BOARD - 0.06; i++) {
      const w = 0.025 + ((i * 37) % 5) * 0.008;
      const h = 0.2 + ((i * 53) % 7) * 0.025;
      this.add(boxMesh(w, h, 0.17 + ((i * 29) % 3) * 0.02, paint(SPINES[i % SPINES.length]!, 0.8), { x: x + w / 2, y: SHELVES[0]! + h / 2, z: 0.12 }));
      x += w + 0.004;
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, 0), new THREE.Vector3(WIDTH / 2, HEIGHT, DEPTH));
  }

  /** Lays `games` on the shelf; the first `firstPrints` of them first prints (a story, not a price). Once only. */
  fill(games: readonly Game[], firstPrints = 1): Promise<void> {
    this.filled ??= this.lay(games, firstPrints);
    return this.filled;
  }

  private async lay(games: readonly Game[], firstPrints: number): Promise<void> {
    const { host, covers, who, offered, onLook } = this.options;
    const slots = games.slice(0, PER_SHELF * 2);
    slots.forEach((game, i) => {
      if (this.disposed) return;
      const first = i < firstPrints;
      const box = new ShelfCopy(game, {
        covers,
        lean: LEAN,
        caption: () => `${game.title} · ${who}’s copy${offered(game.id) ? ' (in their swap)' : ''}`,
        onLook: () => onLook(game, first),
      });
      const row = Math.floor(i / PER_SHELF);
      const spacing = (WIDTH - 2 * BOARD) / PER_SHELF;
      const local = new THREE.Vector3(-WIDTH / 2 + BOARD + spacing * ((i % PER_SHELF) + 0.5), SHELVES[2 - row]!, 0.02);
      const at = host.toLocal(this.localToWorld(local));
      this.spots.set(box, at);
      this.boxes.push(box);
      if (this.shown) host.place(box, at, this.rotation.y);
    });
  }

  /** Puts the boxes on the shelf (the flat dressed for its owner) or takes them off (dressed for someone else). */
  setShown(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    const { host } = this.options;
    for (const box of this.boxes) {
      if (shown) host.place(box, this.spots.get(box)!, this.rotation.y);
      else host.remove(box);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const box of this.boxes) box.dispose();
    this.boxes = [];
  }
}
