import * as THREE from 'three';
import type { CssLayer } from '@/core/CssLayer';
import type { GameSource } from '@/collection/GameSource';
import type { PlatformId } from '@/catalog/types';
import type { World } from './World';
import { Television } from './Television';
import { Projector } from './Projector';
import { Seat } from './Seat';
import { furnishProps, type PropsHandle, Cushion, SideTable, FloorLamp } from './props';

export interface LayoutOptions {
  cssLayer: CssLayer;
  /** Object whose distance to the TV drives the volume (the camera). */
  listener: THREE.Object3D;
  /** The collection; the shelving and the console stand follow it live. */
  games: GameSource;
  /** Clicking a console on the TV stand reports its platform. */
  onSelectPlatform?: (id: PlatformId) => void;
}

/** Width of the projector picture on the right wall and the height of its centre (metres). */
const PICTURE_WIDTH = 2.2;
const PICTURE_CENTRE_Y = 1.45;
/** Bare wall kept on each side of the picture. */
const PICTURE_MARGIN = 0.1;

/**
 * The default room: shelving along the back wall (spilling onto the right wall when the
 * collection needs it) with the front door in the shelf-free stretch at its left end, TV on a console stand against the left wall with its screen facing +x,
 * an armchair 1.6 m in front of it with a side table and a floor lamp, windows with day/night on the
 * front and left walls, posters and a rug. Every lamp (the two floor lamps, the pendant) is a switch:
 * click it to turn it on or off.
 * A ceiling projector throws onto the right wall, opposite the TV, with a second armchair facing
 * it; the right-wall shelving skips that stretch of wall. The left third of the room stays shelf-free.
 */
/** What the layout placed that other features (the cat) need to know about. */
export interface RoomHandle extends PropsHandle {
  tv: Television;
  seats: Seat[];
}

export function furnishRoom(world: World, { cssLayer, listener, games, onSelectPlatform }: LayoutOptions): RoomHandle {
  const { width, height } = world.room.options;
  const pictureHalf = PICTURE_WIDTH / 2 + PICTURE_MARGIN;
  world.addShelving(games, {
    backWallMinX: -width / 2 + width / 3,
    sort: 'platform',
    rightWallKeepClear: { minZ: -pictureHalf, maxZ: pictureHalf },
  });
  const tv = world.place(new Television(cssLayer, listener), new THREE.Vector3(-width / 2 + 0.3, 0, 0), Math.PI / 2);
  const tvSeat = new Seat();
  tvSeat.mountCushion(new Cushion({ color: 0x8fa383, tilt: 0.25 }));
  world.place(tvSeat, new THREE.Vector3(-width / 2 + 1.9, 0, 0), -Math.PI / 2);
  // Side table by the right armrest, floor lamp by the left one.
  world.place(new SideTable(), new THREE.Vector3(-width / 2 + 1.9, 0, 0.72));
  world.place(new FloorLamp(), new THREE.Vector3(-width / 2 + 1.9, 0, -0.76));

  // Projector: hung from the ceiling a metre left of centre, throwing +x onto the right wall.
  const projector = world.place(new Projector(cssLayer, { pictureWidth: PICTURE_WIDTH, listener }), new THREE.Vector3(-1, height, 0), Math.PI / 2);
  projector.aimAt(projector.worldToLocal(new THREE.Vector3(width / 2 - 0.005, PICTURE_CENTRE_Y, 0)));
  const projectorSeat = new Seat();
  projectorSeat.mountCushion(new Cushion({ color: 0xc8785a, tilt: 0.2 }));
  world.place(projectorSeat, new THREE.Vector3(0.5, 0, 0), Math.PI / 2);
  world.place(new FloorLamp({ intensity: 5 }), new THREE.Vector3(0.5, 0, -0.76));

  const platformsOf = (): PlatformId[] => [...new Set(games.games.map((g) => g.platform))];
  const props = furnishProps(world, { tv, platforms: platformsOf(), gameCount: games.games.length, onSelectPlatform });
  games.subscribe(() => props.setPlatforms(platformsOf()));
  return { ...props, tv, seats: [tvSeat, projectorSeat] };
}
