import * as THREE from 'three';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { World } from '../World';
import type { Television } from '../Television';
import { wallMount } from './wallMount';
import { DayNight } from './DayNight';
import { RoomWindow } from './Window';
import { Outdoors } from './outdoors/Outdoors';
import { Poster } from './Poster';
import { Rug } from './Rug';
import { ConsoleStand } from './ConsoleStand';
import { Console, type PlatformSelectHandler } from './Console';
import { Plant } from './Plant';
import { PendantLamp } from './PendantLamp';
import { FloorLamp } from './FloorLamp';
import { ShelfLamp } from './ShelfLamp';
import { Curtains } from './Curtains';
import { PictureFrame } from './PictureFrame';
import { SideTable } from './SideTable';
import { Cushion } from './Cushion';
import { WallClock } from './WallClock';
import { Door } from './Door';

export type { SkyState } from './DayNight';
export { DayNight, Outdoors, RoomWindow, Curtains, Poster, Rug, ConsoleStand, Console, Plant, PendantLamp, FloorLamp, ShelfLamp, PictureFrame, SideTable, Cushion, WallClock, Door };

export interface PropsOptions {
  /** The television already placed in the room; it is stood on the console stand. */
  tv: Television;
  /** Platforms present in the collection: one console each on the stand. */
  platforms: PlatformId[];
  /** Number of games, for the collection poster. */
  gameCount?: number;
  /** Clicking a console reports its platform here (filtering / highlighting is the caller's business). */
  onSelectPlatform?: PlatformSelectHandler;
  /** Initial time of day (hours). Default 8, a sunny morning. */
  hours?: number;
  /** Real seconds one full day/night cycle takes; 0 freezes the clock. Default 600 (ten minutes). */
  dayLength?: number;
}

export interface PropsHandle {
  /** The day/night clock (runs on its own; the session's night key jumps it). */
  dayNight: DayNight;
  /** Replaces the consoles on the stand (and the platform poster) when the collection changes. */
  setPlatforms(ids: PlatformId[]): void;
  /** The four loft windows (the cat looks out of them and naps in their sun patch). */
  windows: RoomWindow[];
}

/**
 * Gives the room life: the room's door in its doorway (opening onto the flat's hallway), floor-to-ceiling loft windows with a ten-minute day/night cycle and
 * clickable curtains on the front (+z) and left (-x) walls, posters, a rug under the TV corner, a console stand under the TV with one console per platform,
 * the switchable pendant fixture of the room's ceiling lamp, plants in the free corners and on the window sill.
 * Everything goes through `world.place()`; decoration has an empty footprint so only the stand, the door opening and the lamp bases collide.
 */
export function furnishProps(world: World, options: PropsOptions): PropsHandle {
  const { room } = world;
  const { width, depth, height } = room.options;
  const { tv } = options;

  // 0. The front door, hung in each doorway the room shell left open (one, on the back wall).
  for (const doorway of room.options.doorways ?? []) {
    const mount = wallMount(room.options, doorway.wall, doorway.along, 0);
    world.place(new Door(doorway), mount.position, mount.rotationY);
  }

  // 1. Windows and daylight. Two loft windows rising from the floor on the front wall, two on the
  //    left wall (either side of the TV); the primary front window ticks the clock. Every window
  //    throws the sun (one shadow map each); a wall only gets it while the sun is on its side.
  //    All panes show the same `Outdoors` panorama; the room's ambient follows the sky in brightness and hue.
  const dayNight = new DayNight({ hours: options.hours, dayLength: options.dayLength });
  const windowSize = { width: 1.2, height: 2.4 };
  const mountY = RoomWindow.mountY(windowSize.height);
  const mounts = [
    { mount: wallMount(room.options, 'front', 0.3, mountY), options: { drivesClock: true } },
    { mount: wallMount(room.options, 'front', 2.0, mountY), options: {} },
    { mount: wallMount(room.options, 'left', -1.8, mountY), options: {} },
    { mount: wallMount(room.options, 'left', 1.8, mountY), options: {} },
  ];
  const outdoors = new Outdoors(dayNight, { primaryRotationY: mounts[0].mount.rotationY });
  // Clicking a window draws its curtains; the skylight follows how many are open.
  const windows: RoomWindow[] = [];
  const onCurtainsChange = (): void => room.setSkylight(windows.reduce((sum, w) => sum + w.curtainOpenness, 0) / windows.length);
  for (const { mount, options: o } of mounts) {
    windows.push(world.place(new RoomWindow(outdoors, { ...windowSize, ...o, onCurtainsChange }), mount.position, mount.rotationY));
  }
  dayNight.onChange((sky) => room.setDaylight(sky.daylight, sky.ambient));

  // 2. Posters on the front wall, left of the window.
  const platforms = uniquePlatforms(options.platforms);
  const collectionPoster = new Poster(0.5, 0.7, Poster.bibliothek(options.gameCount ?? 0, platforms.map(getPlatform)));
  const collectionMount = wallMount(room.options, 'front', -2.0, 1.65);
  world.place(collectionPoster, collectionMount.position, collectionMount.rotationY);
  let platformPoster: Poster | null = null;
  if (platforms.length) {
    platformPoster = new Poster(0.5, 0.7, Poster.platform(getPlatform(platforms[0])));
    const mount = wallMount(room.options, 'front', -1.25, 1.65);
    world.place(platformPoster, mount.position, mount.rotationY);
  }

  // 3. Rug between the TV and the armchair (TV against the left wall at z = 0, chair 1.6 m in front).
  const facing = tv.getWorldDirection(new THREE.Vector3()); // the screen's normal
  world.place(new Rug({ width: 2.4, depth: 1.8 }), tv.position.clone().setY(0).addScaledVector(facing, 1.15), tv.rotation.y);

  // 4. Console stand under the TV, consoles in its slots.
  const stand = world.place(new ConsoleStand(), tv.position.clone(), tv.rotation.y);
  tv.mountOn(stand.topHeight);
  const consoles = stand.slotAnchors().map((anchor) =>
    world.place(new Console(stand.slotWidth, options.onSelectPlatform), stand.localToWorld(anchor), tv.rotation.y),
  );

  const setPlatforms = (ids: PlatformId[]): void => {
    const unique = uniquePlatforms(ids);
    if (unique.length > consoles.length) console.warn(`[props] ${unique.length - consoles.length} console(s) do not fit on the stand`);
    consoles.forEach((slot, i) => slot.setPlatform(i < unique.length ? getPlatform(unique[i]) : null));
    collectionPoster.repaint(Poster.bibliothek(options.gameCount ?? 0, unique.map(getPlatform)));
    if (platformPoster && unique.length) platformPoster.repaint(Poster.platform(getPlatform(unique[0])));
  };
  setPlatforms(platforms);

  // 5. Plants: floor plants in the shelf-free corners and beside the TV, trailing plants hung from the
  //    ceiling in the front corners, small pots on the floor at the foot of two windows.
  const corner = 0.45;
  world.place(new Plant({ kind: 'fig', pot: 'ceramic', seed: 3 }), new THREE.Vector3(-width / 2 + corner, 0, -depth / 2 + corner));
  world.place(new Plant({ kind: 'yucca', pot: 'terracotta', seed: 5 }), new THREE.Vector3(-width / 2 + corner, 0, depth / 2 - corner));
  world.place(new Plant({ kind: 'monstera', pot: 'ceramic', seed: 11 }), new THREE.Vector3(-width / 2 + 0.5, 0, -1.3));
  world.place(new Plant({ kind: 'hanging', seed: 13, scale: 0.8 }), new THREE.Vector3(width / 2 - 0.5, height, depth / 2 - 0.5));
  world.place(new Plant({ kind: 'hanging', seed: 17, scale: 0.75 }), new THREE.Vector3(-1.1, height, 0.95));
  const atFoot = (w: RoomWindow, along: number, seed: number): void => {
    w.updateMatrixWorld(true);
    // Just inside the curtains' travel (they hang 0.15 m off the wall).
    const spot = w.localToWorld(new THREE.Vector3(w.options.width * along, w.floorY, 0.32));
    world.place(new Plant({ kind: 'small', pot: 'ceramic', seed, collides: false }), spot);
  };
  atFoot(windows[0], 0.36, 8);
  atFoot(windows[2], -0.3, 9);

  // A row of three small framed pictures on the left wall above the TV, between its two windows.
  (['mountains', 'sunset', 'abstract'] as const).forEach((motif, i) => {
    const mount = wallMount(room.options, 'left', -0.5 + i * 0.5, 1.8);
    world.place(new PictureFrame({ motif, seed: i + 1 }), mount.position, mount.rotationY);
  });
  // A wall clock over the front door, reading the room's time; clicking it toggles night.
  const door = room.options.doorways?.[0];
  const clockMount = door ? wallMount(room.options, door.wall, door.along, door.height + 0.41) : wallMount(room.options, 'back', -1.85, 2.32);
  world.place(new WallClock(dayNight), clockMount.position, clockMount.rotationY);

  // 6. Pendant fixture around the room's ceiling light (the light itself lives in Room); clicking
  //    the shade switches both.
  world.place(new PendantLamp({ onSwitch: (on) => room.setLampOn(on) }), new THREE.Vector3(0, height, 0));

  return { dayNight, setPlatforms, windows };
}

function uniquePlatforms(ids: PlatformId[]): PlatformId[] {
  return [...new Set(ids)];
}
