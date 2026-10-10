import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { Prop, part } from './Prop';
import { HoverGlint } from './hoverGlint';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';

/** What the parcel shows: the games waiting in it (`Deliveries` fits). */
export interface ParcelContents {
  readonly count: number;
  /** What waits in it, before it is unpacked. */
  readonly pending: readonly { readonly platform: PlatformId }[];
  unpack(): readonly { readonly title: string; readonly platform: PlatformId }[];
  subscribe(cb: () => void): () => void;
}

interface ParcelOptions {
  /** Whether the shelves hold no game of `platform` yet (asked before unpacking): its first one is an occasion. */
  firstOf?: (platform: PlatformId) => boolean;
}

/** Games lifted out one at a time, each with its own moment; the rest of a big parcel goes on the shelves in one line. */
const ONE_BY_ONE = 3;

const WIDTH = 0.46;
const HEIGHT = 0.24;
const DEPTH = 0.22;

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
export class Parcel extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly unsubscribe: () => void;
  /** Its hover cue: the tape catches the light, like every other thing to click. */
  private readonly glint: HoverGlint;

  constructor(private readonly contents: ParcelContents, private readonly options: ParcelOptions = {}) {
    super();
    this.name = 'Parcel';
    const z = DEPTH / 2;
    part(this, WIDTH, HEIGHT, DEPTH, CARDBOARD, { y: HEIGHT / 2, z });
    // Tape along the flaps and down the front, the label on the lid, a red FRAGILE stripe on the side.
    const lidTape = part(this, 0.06, 0.004, DEPTH + 0.002, TAPE, { y: HEIGHT + 0.002, z });
    const frontTape = part(this, 0.06, HEIGHT * 0.5, 0.004, TAPE, { y: HEIGHT * 0.75, z: DEPTH + 0.002 });
    lidTape.castShadow = false;
    frontTape.castShadow = false;
    this.glint = HoverGlint.of(lidTape, frontTape);
    part(this, 0.14, 0.003, 0.1, LABEL, { x: WIDTH * 0.25, y: HEIGHT + 0.002, z: z + 0.02 }).castShadow = false;
    for (let i = 0; i < 3; i++) part(this, 0.1 - i * 0.02, 0.004, 0.008, INK, { x: WIDTH * 0.25 - i * 0.01, y: HEIGHT + 0.004, z: z + 0.045 - i * 0.02 }).castShadow = false;
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
    if (!n) return null;
    return `Parcel for you · unpack ${n === 1 ? 'the game' : `the ${n} games`}`;
  }

  /**
   * Unpacks: each game is lifted out in turn, a moment of its own (the first game of a console a big one), then onto
   * the shelves; past `ONE_BY_ONE` the rest go up together.
   */
  activate(session: SessionActions): void {
    const firstOf = this.options.firstOf;
    // Asked before unpacking: once on the shelves, every console has one.
    const fresh = new Set(this.contents.pending.map((g) => g.platform).filter((platform) => firstOf?.(platform) ?? false));
    const games = this.contents.unpack();
    if (!games.length) return;
    const shown = games.slice(0, ONE_BY_ONE);
    shown.forEach((game, i) => {
      if (fresh.delete(game.platform)) session.reward({ title: `Your first ${getPlatform(game.platform).name} game`, detail: `${game.title}, out of the parcel and onto the shelves.`, big: true });
      else session.reward({ title: game.title, detail: i === 0 ? 'Out of the parcel and onto the shelves.' : 'Onto the shelves.' });
    });
    const rest = games.length - shown.length;
    if (rest > 0) session.slip({ title: 'Unpacked', detail: `And ${rest === 1 ? 'one more game' : `${rest} more games`}: on the shelves.` });
  }

  /** There only while it holds something; the hitbox shrinks away with it (the ray does not care about `visible`). */
  private refresh(): void {
    const full = this.contents.count > 0;
    this.visible = full;
    this.hitboxes[0]?.scale.setScalar(full ? 1 : 1e-4);
  }
}
