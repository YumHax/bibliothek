import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { Prop, part } from './Prop';
import { HoverGlint } from './hoverGlint';
import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Updatable } from '@/core/Engine';
import { playBoxClack } from '@/audio/boxClack';
import { playSoftThud } from '@/audio/furnitureSounds';
import type { CatPerch } from '../cat/spots';

/** What the parcel shows: the games waiting in it (`Deliveries` fits). */
export interface ParcelContents {
  readonly count: number;
  /** What waits in it, before it is unpacked. */
  readonly pending: readonly { readonly platform: PlatformId }[];
  unpack(): readonly Game[];
  subscribe(cb: () => void): () => void;
}

interface ParcelOptions {
  /** Whether the shelves hold no game of `platform` yet (asked before unpacking): its first one is an occasion. */
  firstOf?: (platform: PlatformId) => boolean;
  /** A game's front as a small picture, for the first-of-a-console banner (`covers/coverPicture`). */
  cover?: (game: Game) => Promise<HTMLCanvasElement | null>;
}

/** Games lifted out one at a time, each with its own moment; the rest of a big parcel goes on the shelves in one line. */
const ONE_BY_ONE = 3;
/** The unpacking seen: the flaps open, a box or two rises out of the carton one after another, then the empty carton goes (s). */
const UNPACK = { flaps: 0.25, rise: 0.45, between: 0.22, after: 0.35, boxes: 4, lift: 0.3 };
/** Unpacked, the open carton stands empty this long (game seconds: most of a day) before it goes to the recycling; a cat naps in it meanwhile. */
const EMPTY_STAYS_S = 240;

const WIDTH = 0.46;
const HEIGHT = 0.24;
const DEPTH = 0.22;
/** The lid's flaps: the card's thickness, the top of the box under them. */
const FLAP = 0.004;

const CARDBOARD = paint(0xb88a58, 0.9);
const TAPE = paint(0xd9b27a, 0.35);
const LABEL = paint(0xf6f3ea, 0.8);
const INK = paint(0x2b2b30, 0.8);
const FRAGILE = paint(0xc0392b, 0.7);

/**
 * The parcel the games bought while out are delivered in: a taped cardboard box with a shipping
 * label, left in the hallway (under the hall console). It is only there while something waits in
 * it; clicking it unpacks everything onto the shelves. Floor-standing, origin on the floor at the
 * back of the box (+z towards the room). Decoration: it never blocks the player.
 */
export class Parcel extends Prop implements Interactable, Updatable, CatPerch {
  readonly hitboxes: THREE.Object3D[];
  /** The two top flaps, hinged on the long edges: they swing open as it is unpacked. */
  private readonly flaps: THREE.Group[] = [];
  /** What sits across the shut flaps (the tape, the label): gone once they open. */
  private lid: THREE.Object3D[] = [];
  /** Unpacking under way: how long since it began (s), and the boxes rising out of it. */
  private unpacking: { t: number; boxes: THREE.Object3D[]; clacked: number } | null = null;
  /** Unpacked and empty, the open carton stands this many more seconds (`EMPTY_STAYS_S`): the cat's box to nap in. */
  private emptyLeft = 0;
  private readonly unsubscribe: () => void;
  /** Its hover cue: the tape catches the light, like every other thing to click. */
  private readonly glint: HoverGlint;

  constructor(private readonly contents: ParcelContents, private readonly options: ParcelOptions = {}) {
    super();
    this.name = 'Parcel';
    const z = DEPTH / 2;
    part(this, WIDTH, HEIGHT - FLAP, DEPTH, CARDBOARD, { y: (HEIGHT - FLAP) / 2, z });
    // The lid's two flaps, each hinged on its long edge (they meet under the tape).
    for (const side of [-1, 1]) {
      const flap = new THREE.Group();
      flap.position.set(0, HEIGHT - FLAP, side < 0 ? 0 : DEPTH);
      part(flap, WIDTH, FLAP, DEPTH / 2, CARDBOARD, { y: FLAP / 2, z: (-side * DEPTH) / 4 });
      this.add(flap);
      this.flaps.push(flap);
    }
    // Tape along the flaps and down the front, the label on the lid, a red FRAGILE stripe on the side.
    const lidTape = part(this, 0.06, 0.004, DEPTH + 0.002, TAPE, { y: HEIGHT + 0.002, z });
    this.lid = [lidTape];
    const frontTape = part(this, 0.06, HEIGHT * 0.5, 0.004, TAPE, { y: HEIGHT * 0.75, z: DEPTH + 0.002 });
    lidTape.castShadow = false;
    frontTape.castShadow = false;
    this.glint = HoverGlint.of(lidTape, frontTape);
    const label = part(this, 0.14, 0.003, 0.1, LABEL, { x: WIDTH * 0.25, y: HEIGHT + 0.002, z: z + 0.02 });
    label.castShadow = false;
    this.lid.push(label);
    for (let i = 0; i < 3; i++) {
      const line = part(this, 0.1 - i * 0.02, 0.004, 0.008, INK, { x: WIDTH * 0.25 - i * 0.01, y: HEIGHT + 0.004, z: z + 0.045 - i * 0.02 });
      line.castShadow = false;
      this.lid.push(line);
    }
    part(this, 0.004, 0.05, 0.14, FRAGILE, { x: WIDTH / 2 + 0.002, y: HEIGHT * 0.6, z }).castShadow = false;
    const hitbox = invisibleHitbox(WIDTH + 0.04, HEIGHT + 0.04, DEPTH + 0.04, { y: HEIGHT / 2, z });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.unsubscribe = contents.subscribe(() => this.refresh());
    this.refresh();
  }

  dispose(): void {
    this.unsubscribe();
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string | null {
    const n = this.contents.count;
    if (this.unpacking) return null;
    if (!n) return this.emptyLeft > 0 ? 'Empty carton · flatten it for the recycling' : null;
    return `Parcel for you · unpack ${n === 1 ? 'the game' : `the ${n} games`}`;
  }

  /**
   * Unpacks: each game is lifted out in turn, a moment of its own (the first game of a console a big one), then onto
   * the shelves; past `ONE_BY_ONE` the rest go up together.
   */
  activate(session: SessionActions): void {
    if (!this.contents.count && this.emptyLeft > 0) {
      this.emptyLeft = 0;
      playSoftThud(0.05);
      session.react('Flattened, by the door for the recycling.');
      this.refresh();
      return;
    }
    const firstOf = this.options.firstOf;
    // Asked before unpacking: once on the shelves, every console has one.
    const fresh = new Set(this.contents.pending.map((g) => g.platform).filter((platform) => firstOf?.(platform) ?? false));
    const games = this.contents.unpack();
    if (!games.length) return;
    this.startUnpacking(games);
    const shown = games.slice(0, ONE_BY_ONE);
    shown.forEach((game, i) => {
      if (fresh.delete(game.platform)) {
        // Its cover over the title: the banner waits for it a moment (never more than `coverPicture`'s wait).
        const banner = { title: `Your first ${getPlatform(game.platform).name} game`, detail: `${game.title}, out of the parcel.`, big: true };
        const cover = this.options.cover?.(game);
        if (cover) cover.then((picture) => session.reward(picture ? { ...banner, picture, pictureBox: true } : banner), () => session.reward(banner));
        else session.reward(banner);
      }
      else session.reward({ title: game.title, detail: i === 0 ? 'Out of the parcel.' : 'And out of the parcel.' });
    });
    const rest = games.length - shown.length;
    if (rest > 0) session.slip({ title: 'Unpacked', detail: `And ${rest === 1 ? 'one more game' : `${rest} more games`} out of the parcel.` });
  }

  /** The flaps open and a box or two in their platforms' colours rise out of the carton, one after another. */
  private startUnpacking(games: readonly { readonly platform: PlatformId }[]): void {
    this.finishUnpacking();
    const boxes = games.slice(0, UNPACK.boxes).map((game, i) => {
      const box = part(this, 0.13, 0.18, 0.025, paint(getPlatform(game.platform).accentColor, 0.7), { x: (i - 1.5) * 0.06, y: HEIGHT * 0.4, z: DEPTH / 2 });
      box.visible = false;
      return box;
    });
    this.unpacking = { t: 0, boxes, clacked: 0 };
    for (const piece of this.lid) piece.visible = false;
    this.visible = true;
    playSoftThud(0.06);
  }

  private finishUnpacking(): void {
    const unpacking = this.unpacking;
    if (!unpacking) return;
    this.unpacking = null;
    for (const box of unpacking.boxes) this.remove(box);
    // The carton stays, open and empty, a while (a cat finds it; a click flattens it).
    this.emptyLeft = EMPTY_STAYS_S;
    this.refresh();
  }

  // --- CatPerch: the empty carton -------------------------------------------------------------

  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, HEIGHT - FLAP + 0.02, DEPTH / 2));
  }

  approachPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, 0, DEPTH + 0.35)).setY(0);
  }

  /** Only the empty carton: a parcel still full is no bed. */
  available(): boolean {
    return this.emptyLeft > 0 && !this.contents.count && !this.unpacking;
  }

  /** A cardboard box: the best seat in the flat, by day especially. */
  catWeight(night: boolean): number {
    return night ? 4 : 6;
  }

  update(dt: number): void {
    if (this.emptyLeft > 0 && !this.unpacking) {
      this.emptyLeft = Math.max(0, this.emptyLeft - dt);
      if (this.emptyLeft === 0) this.refresh();
    }
    const unpacking = this.unpacking;
    if (!unpacking) return;
    unpacking.t += dt;
    const t = unpacking.t;
    const open = Math.min(1, t / UNPACK.flaps);
    this.flaps.forEach((flap, i) => (flap.rotation.x = (i === 0 ? -1 : 1) * open * 1.9));
    unpacking.boxes.forEach((box, i) => {
      const k = (t - UNPACK.flaps - i * UNPACK.between) / UNPACK.rise;
      box.visible = k > 0 && k < 1.6;
      if (k <= 0) return;
      if (i >= unpacking.clacked) {
        unpacking.clacked = i + 1;
        playBoxClack(false, 0.06);
      }
      const eased = Math.min(1, k) * (2 - Math.min(1, k));
      box.position.y = HEIGHT * 0.4 + eased * UNPACK.lift;
    });
    const end = UNPACK.flaps + (unpacking.boxes.length - 1) * UNPACK.between + UNPACK.rise + UNPACK.after;
    if (t >= end) this.finishUnpacking();
  }

  /** There only while it holds something; the hitbox shrinks away with it (the ray does not care about `visible`). */
  private refresh(): void {
    if (this.unpacking) return; // the carton stays until its boxes are out
    const full = this.contents.count > 0;
    // A new delivery into the standing carton: shut and taped again.
    if (full) this.emptyLeft = 0;
    const empty = !full && this.emptyLeft > 0;
    for (const flap of this.flaps) flap.rotation.x = 0;
    if (empty) this.flaps.forEach((flap, i) => (flap.rotation.x = (i === 0 ? -1 : 1) * 1.9));
    for (const piece of this.lid) piece.visible = !empty;
    this.visible = full || empty;
    this.hitboxes[0]?.scale.setScalar(full || empty ? 1 : 1e-4);
  }
}
