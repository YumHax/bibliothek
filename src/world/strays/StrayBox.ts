import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import { GameBox } from '../GameBox';
import { invisibleHitbox } from '../meshUtils';
import type { StrayGames } from './StrayGames';
import { gameDayRandom } from '@/time/daily';
import { capitalise } from '@/text/strings';
import { playBoxClack } from '@/audio/boxClack';

/** How far a stray box lies off square (radians) and off its spot (metres), unless its spot says less. */
const MAX_YAW = THREE.MathUtils.degToRad(20);
const MAX_OFFSET = 0.03;
/** How many boxes a spot takes, one on another (an armful set down there: `game/Stacking`). */
const PILE = 5;
/** The air between two boxes of a pile (m): their faces never share a plane. */
const PILE_GAP = 0.002;

interface StrayBoxOptions {
  strays: StrayGames;
  /** The slot's name, unique in the flat: with the day it seeds which game lies here. */
  slot: string;
  covers: BoxArtLoader;
  /** How untidily it may lie here: at most this turn (radians) and this slide off the spot (m); a small top wants less. */
  jitter?: { yaw: number; offset: number };
  /** What the spot is on, as the caption names it ("the kitchen table"): where a box in hand can be set down. */
  where?: string;
}

/** The click target covers the largest box lying flat (a PC big box would overhang it a little); a pile raises it. */
const HIT = { width: 0.24, height: 0.06, depth: 0.3 };

/** A box of the pile, and the claim it lies under (`StrayGames`: the spot's own name for the bottom one). */
interface Lying {
  box: GameBox;
  slot: string;
  /** Set down squarer than one left lying (the player put it there). */
  setDown: boolean;
}

/**
 * A game from the collection left lying on a surface (the kitchen table, a nightstand): a real
 * `GameBox`, cover up, placed where the builder puts this spot (origin on the surface, the box's
 * long side along local z). Each new day an empty spot takes one of the owned games (`setDay`);
 * clicking it picks the game up like any shelf box, and the one in hand is then its shelf's own
 * box, so putting it down sends it home and the spot stays empty until tomorrow. A box in hand (or
 * an armful) set down there lies on what is there already, a pile of up to `PILE`, taken back one
 * at a time from the top. Collides with nothing.
 */
export class StrayBox extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly hitbox: THREE.Mesh;
  /** Bottom first. */
  private pile: Lying[] = [];
  private day = -1;
  private readonly worldPos = new THREE.Vector3();
  private readonly worldQuat = new THREE.Quaternion();
  private readonly parentQuat = new THREE.Quaternion();

  constructor(private readonly options: StrayBoxOptions) {
    super();
    this.name = 'StrayBox';
    this.hitbox = invisibleHitbox(HIT.width, HIT.height, HIT.depth, { y: HIT.height / 2 });
    this.add(this.hitbox);
    this.hitboxes = [this.hitbox];
    // Empty, it still takes a box in hand set down on it (the game to play next, left out for the day).
    this.setClickable(true);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** A new day: an empty spot gets a game from the shelves (the same one all day), and what the player left there today. */
  setDay(day: number): void {
    if (day === this.day) return;
    this.day = day;
    if (this.pile.length) return;
    const { strays } = this.options;
    for (let i = 0; i < PILE; i++) {
      const slot = this.slotName(i);
      // What the player set down here today (over a reload too); the bottom place takes the day's pick from the shelves else.
      const laid = strays.laidOn(slot, day);
      const game = (laid ? strays.claim(slot, day, () => this.lose(slot), laid) : null) ?? (i === 0 ? strays.claim(slot, day, () => this.lose(slot)) : null);
      // One set down by the player lies as squarely as it was left, without the knock (it was put there before).
      if (game) this.lay(game, slot, laid !== undefined && game.id === laid, false);
    }
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.top?.box.setHovered(hovered);
  }

  /** Empty, it is only there for a box in hand: with free hands the ray goes on to the table's own things. */
  passesThrough(holding: boolean): boolean {
    return !this.pile.length && !holding;
  }

  label(player: PlayerState): string | null {
    const top = this.top?.box;
    const held = player.held;
    const many = (player.armful?.length ?? 0) > 0;
    if (!top) {
      if (!held?.playable) return null;
      return `${capitalise(this.options.where ?? 'here')} · ${many ? 'set them down here' : `set ${held.game.title} down here`}`;
    }
    const title = this.pile.length > 1 ? `${top.game.title}, on a pile left out here` : `${top.game.title}, left out here`;
    if (!held) return `${title} · pick up`;
    if (this.roomFor(1 + (player.armful?.length ?? 0))) return `${title} · ${many ? 'put them on top' : `put ${held.game.title} on top`}`;
    return many ? `${title} · no room here for them all` : `${title} · swap for the box in hand`;
  }

  /**
   * With a box in hand (and an armful), sets them down here on what lies here already, room permitting (they fly home and
   * lie here for the day); full, the box in hand is swapped for the top one. Free-handed, picks the top one up (in hand it is
   * its shelf's box, which goes home when put down).
   */
  activate(session: SessionActions): void {
    const held = session.held;
    if (held) {
      const carried = [held, ...(session.armful ?? [])];
      if (this.roomFor(carried.length)) return this.setDown(session, carried);
      if (carried.length > 1) return session.refuse('No room here for them all.');
      session.putBack();
    }
    const top = this.top;
    if (!top) return;
    const { strays } = this.options;
    const box = top.box;
    box.getWorldPosition(this.worldPos);
    box.getWorldQuaternion(this.worldQuat);
    strays.release(top.slot);
    const home = strays.homeBox?.(box.game.id);
    const shelf = home?.parent;
    if (!home || !shelf) {
      // No shelf has room for it (or none is wired): it stays a box of its own, put back here.
      strays.claim(top.slot, this.day, () => this.lose(top.slot), box.game.id);
      session.pickUp(box);
      return;
    }
    // Its shelf's box, moved to where this one lies: the hand takes it from here, and returns it to the shelf.
    shelf.updateWorldMatrix(true, false);
    home.position.copy(shelf.worldToLocal(this.worldPos.clone()));
    home.quaternion.copy(shelf.getWorldQuaternion(this.parentQuat).invert().multiply(this.worldQuat));
    home.updateMatrixWorld();
    this.remove1(top);
    session.pickUp(home);
  }

  /** The box on top of the pile, or null when the spot is empty. */
  private get top(): Lying | null {
    return this.pile[this.pile.length - 1] ?? null;
  }

  /** Whether `count` more boxes fit on the pile. */
  private roomFor(count: number): boolean {
    return this.pile.length + count <= PILE;
  }

  /** The claim name of the pile's `i`-th place (0 the bottom: the spot's own name, as before piles). */
  private slotName(i: number): string {
    return i === 0 ? this.options.slot : `${this.options.slot}+${i + 1}`;
  }

  /** Left out here for the day (the games to play next): their shelves keep the gaps, their boxes fly home and vanish there. */
  private setDown(session: SessionActions, carried: readonly GameBox[]): void {
    const { strays } = this.options;
    const taken = new Set(this.pile.map((lying) => lying.slot));
    const free = Array.from({ length: PILE }, (_, i) => this.slotName(i)).filter((slot) => !taken.has(slot));
    const laid: [Game, string][] = [];
    const refused: string[] = [];
    for (const box of carried) {
      const slot = free.shift();
      const game = slot ? strays.claim(slot, this.day, () => this.lose(slot), box.game.id) : null;
      if (!slot || !game) {
        refused.push(box.game.title);
        if (slot) free.unshift(slot);
        continue;
      }
      strays.remember(slot, this.day, game.id);
      laid.push([game, slot]);
    }
    session.putBack();
    laid.forEach(([game, slot], i) => this.lay(game, slot, true, i === 0));
    if (refused.length) session.refuse(`${refused[0]} goes back on its shelf.`);
  }

  /** Lays `game`'s box on top of the pile; `setDown` by the player: squarer than one left lying, and the soft knock of it. */
  private lay(game: Game, slot: string, setDown = false, knock = setDown): void {
    const box = new GameBox(game, this.options.covers);
    if (knock) playBoxClack(true, 0.08);
    // The zone's shadow layer (the spot was adopted when placed) and the default one.
    const mask = this.hitbox.layers.mask | 1;
    box.traverse((obj) => {
      obj.layers.mask = mask;
    });
    this.add(box);
    this.pile.push({ box, slot, setDown });
    this.restack();
    this.setClickable(true);
  }

  /**
   * Every box of the pile where it lies: on its back, cover up, the top of the cover towards local -z, each on the one
   * below; dropped there, not squared up: turned up to 20° either way and off the spot by a few centimetres (the same all
   * day for each place).
   */
  private restack(): void {
    let floor = 0.001;
    for (const lying of this.pile) {
      const { box, slot, setDown } = lying;
      const { depth } = box.dimensions;
      const random = gameDayRandom(slot, this.day);
      const jitter = setDown ? { yaw: MAX_YAW / 4, offset: MAX_OFFSET / 3 } : (this.options.jitter ?? { yaw: MAX_YAW, offset: MAX_OFFSET });
      const yaw = (random() * 2 - 1) * jitter.yaw;
      const x = (random() - 0.5) * 2 * jitter.offset;
      const z = (random() - 0.5) * 2 * jitter.offset;
      // One in hand (a box of its own, no shelf to go to) is left where the hand holds it: only its place here moves.
      if (box.parent === this) {
        box.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
        box.position.set(x, floor + depth / 2, z);
        box.saveRestPose();
      }
      floor += depth + PILE_GAP;
    }
    // The click target grows with the pile.
    const height = Math.max(HIT.height, floor);
    this.hitbox.scale.y = height / HIT.height;
    this.hitbox.position.y = height / 2;
  }

  /** The game of the pile's place `slot` left the collection (sold, lent): its box goes, the ones above come down. */
  private lose(slot: string): void {
    const lying = this.pile.find((l) => l.slot === slot);
    if (lying) this.remove1(lying);
  }

  /** Takes `lying` off the pile (picked up, or its game gone) and lays the rest again. */
  private remove1(lying: Lying): void {
    this.pile = this.pile.filter((l) => l !== lying);
    if (lying.box.parent === this) {
      this.remove(lying.box);
      lying.box.dispose();
    }
    this.restack();
  }

  private setClickable(on: boolean): void {
    if (on) this.hitbox.layers.enable(0);
    else this.hitbox.layers.disable(0);
  }
}
