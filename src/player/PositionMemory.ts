import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';

export const POSITION_STORAGE_KEY = KEYS.position;

/** Where the player last stood: the zone, the world floor point, the way they looked. */
export interface SavedPosition {
  zone: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** What is read and moved of the player (the `FirstPersonController`). */
export interface Positionable {
  readonly isSeated: boolean;
  getLook(): { yaw: number; pitch: number };
  setPosition(x: number, z: number): void;
  setLook(yaw: number, pitch: number): void;
}

export interface PositionMemoryOptions {
  /** The camera: where the player is. */
  camera: THREE.Object3D;
  player: Positionable;
  /** The zone the player is in now. */
  currentZone: () => string;
  /** A zone's floor (world x, z), or null for a zone that does not exist (any more). */
  floorOf: (zone: string) => THREE.Box2 | null;
  /** True while the player is not standing somewhere of their own accord (a travel, a sleep): nothing is saved then. */
  busy?: () => boolean;
  storage?: Storage | null;
}

/** Seconds between two saves while the player moves or looks about. */
const SAVE_EVERY = 2;
/** Kept this far inside a zone's floor when restoring (walls, doorways). */
const MARGIN = 0.35;

/**
 * Remembers where the player was, across reloads: the zone, the floor point and the look, saved
 * (`KEYS.position`) every couple of seconds while they move (and when the page is hidden or left),
 * never while seated (an armchair, the bed, an arcade machine) or `busy` (mid-travel, asleep): the
 * last spot they stood on is kept. `restore()` puts the player back there at start, facing the same
 * way, so the `ZoneManager` loads that zone on the first frame; a zone that no longer exists, or a
 * `?fresh` in the URL, keeps the default spawn. A new game (`eraseProgress`) wipes it with the rest:
 * once a spot it wrote has gone from storage, it stops writing (the page is reloading), so the
 * unload save never puts the old spot back.
 */
export class PositionMemory implements Updatable {
  private readonly storage: Storage | null;
  private readonly store: PersistedStore<SavedPosition>;
  private clock = 0;
  private readonly here = new THREE.Vector3();
  private last: SavedPosition | null = null;
  /** Set once the saved spot vanished from under us (a new game wiped the progress): never written again this page. */
  private wiped = false;

  constructor(private readonly options: PositionMemoryOptions) {
    this.storage = options.storage === undefined ? safeStorage() : options.storage;
    // Version 1: `{ zone, x, z, yaw, pitch }` (bare JSON before versions were kept).
    this.store = new PersistedStore<SavedPosition>({ key: POSITION_STORAGE_KEY, version: 1, storage: this.storage, defaults: () => ({ zone: '', x: 0, z: 0, yaw: 0, pitch: 0 }), read: readPosition });
    const flush = (): void => this.save();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  /** Puts the player where they were last time; false (nothing moved) when there is nothing valid to go back to. */
  restore(): boolean {
    if (new URLSearchParams(location.search).has('fresh')) return false;
    const saved = this.load();
    if (!saved) return false;
    const floor = this.options.floorOf(saved.zone);
    if (!floor) return false;
    const x = THREE.MathUtils.clamp(saved.x, floor.min.x + MARGIN, floor.max.x - MARGIN);
    const z = THREE.MathUtils.clamp(saved.z, floor.min.y + MARGIN, floor.max.y - MARGIN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.options.player.setPosition(x, z);
    this.options.player.setLook(saved.yaw, saved.pitch);
    this.last = { ...saved, x, z };
    return true;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < SAVE_EVERY) return;
    this.clock = 0;
    this.save();
  }

  /** Writes the current spot, if the player stands somewhere of their own accord and it changed. */
  save(): void {
    const { player, camera, busy } = this.options;
    if (this.wiped || player.isSeated || busy?.()) return;
    // Written before and gone now: "New game" erased the progress and is reloading; writing it back would undo that.
    if (this.last && this.storage && this.isGone()) {
      this.wiped = true;
      return;
    }
    camera.getWorldPosition(this.here);
    const zone = this.options.currentZone();
    const floor = this.options.floorOf(zone);
    // Between zones (a doorway's threshold, the gap between two walls): wait for a clear spot.
    if (!floor || !floor.containsPoint(new THREE.Vector2(this.here.x, this.here.z))) return;
    const { yaw, pitch } = player.getLook();
    const next: SavedPosition = { zone, x: round(this.here.x), z: round(this.here.z), yaw: round(yaw), pitch: round(pitch) };
    const last = this.last;
    if (last && last.zone === next.zone && last.x === next.x && last.z === next.z && last.yaw === next.yaw && last.pitch === next.pitch) return;
    this.last = next;
    // Storage full or blocked: the spot is only lost on reload (`onWriteFailure` hears of it).
    this.store.save(next);
  }

  private isGone(): boolean {
    return !this.store.exists;
  }

  private load(): SavedPosition | null {
    return this.store.tryLoad();
  }
}

function readPosition(data: unknown): SavedPosition | null {
  if (typeof data !== 'object' || data === null) return null;
  const { zone, x, z, yaw, pitch } = data as Partial<SavedPosition>;
  if (typeof zone !== 'string' || ![x, z, yaw, pitch].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { zone, x: x!, z: z!, yaw: yaw!, pitch: pitch! };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
