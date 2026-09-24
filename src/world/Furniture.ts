import type * as THREE from 'three';

/**
 * A static object placed in the room; `footprint` (local space) is registered as a collider, and
 * so is every box of `colliders` for things that cannot be one AABB (walls round a space).
 */
export interface Furniture extends THREE.Object3D {
  readonly footprint: THREE.Box3;
  readonly colliders?: readonly THREE.Box3[];
  /** Meshes the crosshair ray cannot see through (a room's walls): anything clickable behind the nearest one is out of reach. */
  readonly occluders?: readonly THREE.Object3D[];
  /**
   * False: no contact shadow is laid under it when placed (see `zone/ContactShadows`); anything
   * that moves says so and carries its own `blobShadow()`, and so does what is not furniture on the floor.
   */
  readonly contactShadow?: boolean;
  /** Stays drawn when its zone is culled from view: a door, which the room on the other side sees too. */
  readonly seenFromNextDoor?: boolean;
  /**
   * Called when the zone holding it is unloaded: release subscriptions, audio, timers. Geometries,
   * materials and textures are freed by the zone itself (`disposeTree`), so most props need nothing.
   */
  dispose?(): void;
}

/**
 * Furniture whose per-frame cost follows whether the player is in its zone: a room's sky ambient
 * (scene-wide), a lamp's shadow map (re-rendered every frame only where the player is, now and
 * then elsewhere). The zone calls it on every change of the player's zone, and once on `place()`.
 */
export interface OccupancyAware {
  setOccupied(occupied: boolean): void;
}

export function isOccupancyAware(obj: object): obj is OccupancyAware {
  return typeof (obj as Partial<OccupancyAware>).setOccupied === 'function';
}

/**
 * Seconds between two renders of a shadow map whose light is in a zone the player is not in.
 * Every shadow-casting light re-renders its map each frame by default (six passes for a point
 * light); a room seen through a doorway only needs a few a second (a door swinging, the cat crossing).
 */
export const IDLE_SHADOW_INTERVAL = 0.5;
