import type * as THREE from 'three';
import type { Look } from '@/graphics';
import type { MemoryScoreName } from '@/audio/introScore';
import type { WeatherKind } from '@/world/weather/Weather';
import type { Furniture } from '@/world/Furniture';
import type { Placement } from '@/world/Placement';
import type { Zone } from '@/world/zone/Zone';
import type { ZoneId } from '@/world/zoneIds';

/*
 * A MEMORY, as data the director (`MemoryFilm`) plays (docs/story.md "Mémé", "Adding a memory"): one or more scenes,
 * each filmed in a zone (Mémé's flat, Félix's, the arcade, the saleroom…) with its own staging, light and shots, cut
 * through black from one to the next; the narration over them; the grade and the music; where the player stands once
 * it is over. Coordinates are the scene's zone's own (zone-local metres): the director turns them into the world's.
 */

type Vec3 = readonly [x: number, y: number, z: number];

/** A camera move: from `from` to `to` (eased over the shot), looking from `lookFrom` to `lookTo`, zone-local. */
export interface MemoryShot {
  /** When it starts and ends on the film's clock (s). */
  from: number;
  to: number;
  camera: { from: Vec3; to: Vec3; lookFrom: Vec3; lookTo: Vec3 };
  /** Vertical field of view (degrees). */
  fov: number;
  /** Depth of field: the distance in focus (m; pulled to `focusTo` over the shot when given) and the blur beyond it (pixels). */
  lens: { focus: number; focusTo?: number; blur: number };
}

/** A line of the narration: when it shows on the film's clock (s) and for how long. */
export interface MemoryLine {
  at: number;
  seconds: number;
  text: string;
}

/**
 * The past's light in the scene's zone, set under the black before it and put back under the black after it: the
 * curtains drawn (an evening, a winter afternoon) or open, every switchable lamp of the zone on or off, the weather
 * outside the windows. The game's clock is never touched (a jump would count a market day).
 */
export interface PastLight {
  curtains?: 'drawn' | 'open';
  lamps?: 'on' | 'off';
  weather?: WeatherKind;
}

/** What a scene is handed as it is staged: its zone, and helpers whose work the strike undoes by itself. */
export interface MemorySet {
  readonly zone: Zone;
  /** Who the people of the past look at (the camera). */
  readonly viewer: THREE.Object3D;
  /** A zone-local point in world metres (a gaze target, a hand's aim). */
  world(x: number, y: number, z: number): THREE.Vector3;
  /** Places `item` at a zone-local floor point; taken away and disposed at the strike. */
  place<F extends Furniture>(item: F, at: THREE.Vector3, yaw?: number): F;
  /** `place` at a plan `Placement`. */
  placeAt<F extends Furniture>(item: F, at: Placement): F;
  /** Hidden while the scene plays (something of the present), shown again at the strike. */
  hide(...objects: THREE.Object3D[]): void;
  /**
   * Félix's flat as he had it (the opening's `DreamFlat`: every piece shown, every bookcase full of boxes), for a scene
   * filmed in the flat; put away at the strike. False when it cannot be shown (the flat not built).
   */
  dream(): boolean;
}

/** One scene of a memory: a zone, what stands there in the past, its shots. */
export interface MemoryScene {
  /** The zone it is filmed in. Scenes elsewhere than where the album is are built and compiled before the film starts. */
  zone: ZoneId;
  /** In order, on the film's clock: the first scene's first starts after the opening black, the next scene's where the last one ends. */
  shots: readonly MemoryShot[];
  light?: PastLight;
  /** Under the black before it: the people and things of the past laid out (`set.place`, `set.hide`). */
  stage(set: MemorySet): void;
  /** Every frame it is on, on the film's clock (s): the people's beats. */
  beat?(t: number): void;
  /** Under the black after it, for what `stage` did beyond the set's helpers (those are undone already). */
  strike?(): void;
}

export interface MemoryReel {
  /** The memory's id (`MEMORIES`): its still in the album is kept under it. */
  id: string;
  /** Its title on the last card, and the line under it. */
  title: string;
  tagline: string;
  /** The button that ends it, back in the room. */
  back: string;
  scenes: readonly MemoryScene[];
  lines: readonly MemoryLine[];
  /** The grade (default `MEMORY_LOOK`) and the music (default the opening's waltz, `waltz`). */
  look?: Look;
  score?: MemoryScoreName;
  /** Where the player stands once it is over (zone-local floor [x, z] of `zone`), and which way they look. */
  after: { zone: ZoneId; at: readonly [x: number, z: number]; yaw: number };
  /** Under the last black, the past struck and the player back: the present picks up (Mémé in her chair, her line). */
  returned?(): void;
}
