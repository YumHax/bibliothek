import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { GameSource } from '@/collection/GameSource';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { GameBox } from '../GameBox';
import type { BoxPool } from '../shelving/BoxPool';
import { BoxMotion } from '../shelving/BoxMotion';
import type { Zone } from '../zone/Zone';
import { fitsSlot, restInSlot, type ShowcaseStand } from './stand';

/** How far out of its slot a box comes before it flies to the hand (m). */
const SLIDE_OUT = 0.06;
/** Aimed further than this from every slot of a display (m), the box in hand goes in none. */
const SLOT_REACH = 0.3;

interface Saved {
  /** Per display (`<zone id>/<key>`), the game id in each slot (null: empty). */
  stands: Record<string, (string | null)[]>;
}

interface Placed {
  stand: ShowcaseStand;
  zone: Zone;
  pool: BoxPool;
  motion: BoxMotion;
  /** Whether it stands in the flat (bought): only then are boxes shown in it and put in it. */
  owned: () => boolean;
}

/** Where a slot is, saved: its display's key and its index. */
interface SlotRef {
  key: string;
  slot: number;
}

/** A slot of a display aimed at with a box in hand (`spotAt`): the ghost's pose (world) and what is there now. */
export interface ShowcaseTarget extends SlotRef {
  stand: ShowcaseStand;
  /** Whether the box in hand goes in (not too big). */
  fits: boolean;
  /** The box in the slot now: it trades places with the one in hand. */
  swap?: GameBox;
  centre: THREE.Vector3;
  quaternion: THREE.Quaternion;
  size: THREE.Vector3;
  distance: number;
}

/** A display a friend comes to look at (`stops`): where to stand (world floor point), facing, and what is in it. */
export interface ShowcaseStop {
  at: THREE.Vector3;
  yaw: number;
  look: THREE.Vector3;
  name: string;
  games: readonly Game[];
}

/**
 * The flat's displays (docs/furnishing.md "Displays"): the display case and the pedestal bought at SECOND HOME, each a
 * `ShowcaseStand` of slots the player fills with any box of the collection, face out. A filter over what the shelves
 * show, like `StrayGames`: a game on display is off its shelf (its box stands in the display), and back on it when
 * taken out (its place in the player's arrangement kept). Saved (`KEYS.showcases`): which game is in which slot.
 *
 * The boxes are the flat's own (`BoxPool`): taken from the shelves into a display keeps the box, so the hand carries
 * the same one there. A game that leaves the collection, or is no longer simply owned (the editor made it a wish),
 * leaves its slot. On display, a game is neither lent nor left lying about (both read the shelves).
 */
export class Showcases implements GameSource {
  private state: Saved;
  private readonly store: PersistedStore<Saved>;
  private readonly placed = new Map<string, Placed>();
  /** The boxes on show now, by game id. */
  private readonly onShow = new Map<string, GameBox>();
  private readonly listeners = new Set<() => void>();
  private shown: readonly Game[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(private readonly source: GameSource, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<Saved>({ key: KEYS.showcases, version: 1, storage, defaults: () => ({ stands: {} }), read: readSaved });
    this.state = this.store.load();
    this.recompute();
    source.subscribe(() => this.sourceChanged());
  }

  // --- GameSource: what the shelves show ---------------------------------------------------------

  get games(): readonly Game[] {
    return this.shown;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // --- the displays ------------------------------------------------------------------------------

  /**
   * `stand`, placed (or staged till bought) in `zone` under `key` by its builder, shows the games saved in its slots
   * once `owned()` (re-checked by `refresh`, which the builder calls on the purchase). Returns the unregister.
   */
  register(zone: Zone, key: string, stand: ShowcaseStand, pool: BoxPool, owned: () => boolean = () => true): () => void {
    const id = `${zone.id}/${key}`;
    const motion = zone.place(new BoxMotion(), new THREE.Vector3());
    this.placed.set(id, { stand, zone, pool, motion, owned });
    this.fill(id);
    return () => {
      const placed = this.placed.get(id);
      if (!placed) return;
      for (const gameId of this.slotsOf(id)) {
        const box = gameId ? this.onShow.get(gameId) : undefined;
        if (!box || !gameId) continue;
        this.onShow.delete(gameId);
        box.restless = null;
        placed.pool.letGo(this, gameId);
      }
      this.placed.delete(id);
    };
  }

  /** A display was bought (or its zone came back): its boxes are put in. */
  refresh(): void {
    for (const id of this.placed.keys()) this.fill(id);
  }

  /** Whether `box` stands in a display (or is in hand from one). */
  holds(box: GameBox): boolean {
    return this.onShow.get(box.game.id) === box;
  }

  findBox(gameId: string): GameBox | undefined {
    return this.onShow.get(gameId);
  }

  /** Every box on show. */
  boxes(): readonly GameBox[] {
    return [...this.onShow.values()];
  }

  /** The games on display, display by display, slot by slot. */
  showcased(): Game[] {
    const games: Game[] = [];
    for (const box of this.onShow.values()) games.push(box.game);
    return games;
  }

  /** Whether `gameId` is on display. */
  isShown(gameId: string): boolean {
    return this.onShow.has(gameId);
  }

  /** What the display `gameId` stands in is called ("display case"), or null when it is on none. */
  standOf(gameId: string): string | null {
    const ref = this.slotRefOf(gameId);
    return ref ? (this.placed.get(ref.key)?.stand.standName ?? null) : null;
  }

  /** The displays with something in them, for a visiting friend's round: where to stand, what to look at. */
  stops(): ShowcaseStop[] {
    const stops: ShowcaseStop[] = [];
    for (const [id, placed] of this.placed) {
      if (!placed.owned()) continue;
      const games = this.slotsOf(id).flatMap((gameId) => (gameId && this.onShow.has(gameId) ? [this.onShow.get(gameId)!.game] : []));
      if (!games.length) continue;
      const { stand } = placed;
      stand.updateWorldMatrix(true, false);
      const at = stand.localToWorld(stand.viewpoint.clone()).setY(0);
      const look = stand.localToWorld(new THREE.Vector3(0, 0, 0)).setY(stand.slots.length > 1 ? 1.0 : 1.1);
      const yaw = Math.atan2(look.x - at.x, look.z - at.z);
      stops.push({ at, yaw, look, name: stand.standName, games });
    }
    return stops;
  }

  /**
   * The slot of a display (bought) where `ray` meets it within `far` m for `held`, with the ghost's pose; null when
   * the ray meets none. What stands between (a wall) is the caller's to check.
   */
  spotAt(ray: THREE.Ray, held: GameBox, far: number): ShowcaseTarget | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    let best: ShowcaseTarget | null = null;
    for (const [key, placed] of this.placed) {
      if (!placed.owned()) continue;
      const { stand } = placed;
      const hit = this.raycaster.intersectObject(stand, true).find((h) => !isPartOf(h.object, held));
      if (!hit || (best && hit.distance >= best.distance)) continue;
      // The slot whose box (as it would stand) is nearest the point aimed at.
      let slot = -1;
      let nearest = SLOT_REACH;
      stand.slots.forEach((s, i) => {
        restInSlot(s, held.dimensions, this.tmp, this.tmpQ);
        s.holder.updateWorldMatrix(true, false);
        const d = s.holder.localToWorld(this.tmp).distanceTo(hit.point);
        if (d < nearest) {
          nearest = d;
          slot = i;
        }
      });
      if (slot < 0) continue;
      const s = stand.slots[slot]!;
      const occupantId = this.slotsOf(key)[slot] ?? null;
      const occupant = occupantId && occupantId !== held.game.id ? this.onShow.get(occupantId) : undefined;
      const centre = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      restInSlot(s, held.dimensions, centre, quaternion);
      s.holder.localToWorld(centre);
      quaternion.premultiply(s.holder.getWorldQuaternion(this.tmpQ));
      const { width, height, depth } = held.dimensions;
      best = {
        key, slot, stand,
        // Trading places: the other box goes where the one in hand came from (its slot, which takes it, or the shelves).
        fits: fitsSlot(s, held.dimensions) && (!occupant || !this.slotRefOf(held.game.id) || this.fitsRef(this.slotRefOf(held.game.id)!, occupant)),
        ...(occupant ? { swap: occupant } : {}),
        centre, quaternion, size: new THREE.Vector3(width, height, depth).addScalar(0.004), distance: hit.distance,
      };
    }
    return best;
  }

  /**
   * Puts `held` (in hand: from the shelves or another slot) in `target`'s slot. What stood there trades places with
   * it: into the slot `held` came from, or back on the shelves (to its place in the player's arrangement). The caller
   * then lets the box go: it flies to the slot.
   */
  put(held: GameBox, target: ShowcaseTarget): void {
    const to = this.placed.get(target.key);
    if (!to) return;
    const id = held.game.id;
    const from = this.slotRefOf(id);
    const slots = this.slotsOf(target.key);
    const occupantId = slots[target.slot] ?? null;
    if (occupantId === id) return;
    const occupant = occupantId ? this.onShow.get(occupantId) : undefined;
    // Taken from the pool first: when the shelves let it go in their rebuild, the box survives the hand-over.
    if (!from) to.pool.take(this, held.game);
    this.setSlot(target, id);
    this.onShow.set(id, held);
    if (from) {
      this.setSlot(from, occupantId);
      if (occupant && occupantId) this.stand(from, occupant, false);
    } else if (occupant && occupantId) {
      // Back to the shelves: off the display first (a box parented elsewhere than a shelf counts as carried there).
      this.onShow.delete(occupantId);
      occupant.restless = null;
      to.motion.untrack(occupant);
      occupant.stopSettling();
      occupant.removeFromParent();
      to.zone.boxesChanged([], [], [occupant]);
    }
    this.save();
    this.changed();
    if (!from && occupant && occupantId) to.pool.letGo(this, occupantId);
    this.stand(target, held, true);
  }

  /**
   * `held` (in hand, from a display) goes back on the shelves: off its slot, then `place` puts it where the player aimed
   * (`ShelvingGroup.moveBox`: the shelves stand with it by then). `swapWith` (a box on the shelves where it goes) takes
   * its slot.
   */
  toShelves(held: GameBox, place: () => void, swapWith?: GameBox): void {
    const id = held.game.id;
    const from = this.slotRefOf(id);
    const placed = from ? this.placed.get(from.key) : undefined;
    if (!from || !placed) return;
    if (swapWith) placed.pool.take(this, swapWith.game);
    this.setSlot(from, swapWith ? swapWith.game.id : null);
    this.onShow.delete(id);
    if (swapWith) this.onShow.set(swapWith.game.id, swapWith);
    held.restless = null;
    placed.motion.untrack(held);
    placed.zone.boxesChanged([], [], [held]);
    this.save();
    this.changed();
    place();
    placed.pool.letGo(this, id);
    if (swapWith) this.stand(from, swapWith, false);
  }

  // --- inside ------------------------------------------------------------------------------------

  /** Stands `box` in slot `ref` (its rest pose, its home there); `inHand`: only its home changes, the hand brings it. */
  private stand(ref: SlotRef, box: GameBox, inHand: boolean): void {
    const placed = this.placed.get(ref.key);
    const slot = placed?.stand.slots[ref.slot];
    if (!placed || !slot) return;
    restInSlot(slot, box.dimensions, box.restPosition, box.restQuaternion);
    box.slideOut = SLIDE_OUT;
    box.home = slot.holder;
    box.restless = (b) => placed.motion.track(b);
    if (!inHand) {
      box.stopSettling();
      slot.holder.add(box);
      box.position.copy(box.restPosition);
      box.quaternion.copy(box.restQuaternion);
    }
    placed.zone.boxesChanged([box], []);
  }

  /** Puts the saved games in display `id`'s slots (those not in yet), once it stands. */
  private fill(id: string): void {
    const placed = this.placed.get(id);
    if (!placed || !placed.owned()) return;
    const byId = new Map(this.source.games.map((g) => [g.id, g]));
    this.slotsOf(id).forEach((gameId, slot) => {
      const game = gameId ? byId.get(gameId) : undefined;
      if (!game || !gameId) return;
      const current = this.onShow.get(gameId);
      const box = placed.pool.take(this, game);
      if (current === box && box.parent) return;
      // A new box (the game's art-relevant data changed: the pool made another): the old one is gone with it.
      if (current && current !== box) placed.zone.boxesChanged([], [current]);
      this.onShow.set(gameId, box);
      box.setStatusStyle(game.status);
      this.stand({ key: id, slot }, box, false);
    });
  }

  private sourceChanged(): void {
    const byId = new Map(this.source.games.map((g) => [g.id, g]));
    let dropped = false;
    for (const [key, slots] of Object.entries(this.state.stands)) {
      slots.forEach((gameId, slot) => {
        if (!gameId || eligible(byId.get(gameId))) return;
        // Gone from the collection, or no longer simply owned: out of the display.
        slots[slot] = null;
        dropped = true;
        const box = this.onShow.get(gameId);
        const placed = this.placed.get(key);
        this.onShow.delete(gameId);
        if (box && placed) {
          box.restless = null;
          placed.motion.untrack(box);
          if (box.parent === placed.stand.slots[slot]?.holder) box.removeFromParent();
          placed.zone.boxesChanged([], [box]);
          placed.pool.letGo(this, gameId);
        }
      });
    }
    if (dropped) this.save();
    this.changed();
    // A box the pool rebuilt (new data) goes back in its slot.
    for (const id of this.placed.keys()) this.fill(id);
  }

  private changed(): void {
    this.recompute();
    for (const cb of [...this.listeners]) cb();
  }

  private recompute(): void {
    const out = new Set<string>();
    for (const slots of Object.values(this.state.stands)) for (const id of slots) if (id) out.add(id);
    this.shown = out.size ? this.source.games.filter((g) => !out.has(g.id) || !eligible(g)) : this.source.games;
  }

  private slotsOf(key: string): (string | null)[] {
    return (this.state.stands[key] ??= []);
  }

  private setSlot(ref: SlotRef, gameId: string | null): void {
    const slots = this.slotsOf(ref.key);
    while (slots.length <= ref.slot) slots.push(null);
    slots[ref.slot] = gameId;
  }

  private slotRefOf(gameId: string): SlotRef | null {
    for (const [key, slots] of Object.entries(this.state.stands)) {
      const slot = slots.indexOf(gameId);
      if (slot >= 0) return { key, slot };
    }
    return null;
  }

  /** Whether `box` goes in the slot `ref`. */
  private fitsRef(ref: SlotRef, box: GameBox): boolean {
    const slot = this.placed.get(ref.key)?.stand.slots[ref.slot];
    return slot ? fitsSlot(slot, box.dimensions) : false;
  }

  private save(): void {
    this.store.save(this.state);
  }
}

/** Only a copy at home, plainly the player's, stands on display (not a wish, not one lent out). */
function eligible(game: Game | undefined): boolean {
  return game !== undefined && (game.status ?? 'owned') === 'owned';
}

function isPartOf(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === root) return true;
  return false;
}

function readSaved(data: unknown): Saved | null {
  if (typeof data !== 'object' || data === null) return null;
  const { stands } = data as { stands?: unknown };
  const clean: Saved = { stands: {} };
  if (typeof stands !== 'object' || stands === null) return clean;
  for (const [key, slots] of Object.entries(stands)) {
    if (!Array.isArray(slots)) continue;
    clean.stands[key] = slots.map((id: unknown) => (typeof id === 'string' ? id : null));
  }
  // One game in one slot: a duplicate (a hand-edited save) keeps its first.
  const seen = new Set<string>();
  for (const slots of Object.values(clean.stands)) {
    slots.forEach((id, i) => {
      if (!id) return;
      if (seen.has(id)) slots[i] = null;
      else seen.add(id);
    });
  }
  return clean;
}
