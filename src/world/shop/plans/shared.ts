import type { RoomOptions } from '../../Room';
import type { Placement } from '../../Placement';
import type { ShopPlan } from '../shopPlan';

/*
 * What every shop's plan (`plans/<shop>.ts`) builds on: the room's shell, the way in and out, where another customer
 * comes in. Here, not in `shopPlan.ts`, so the plan files never import the module that gathers them.
 */

/** A shop room: no doorway (teleport only), every wall light-tight; its one window looks onto the street (`ShopWindow`, `outlook/`). */
export function shopRoom(width: number, depth: number, finish: RoomOptions['finish']): RoomOptions {
  return { width, depth, height: 3, opaqueWalls: ['front', 'back', 'left', 'right'], finish: { moulding: false, ...finish } };
}

export const FRONT_EXIT: Placement = { wall: 'front', along: 0, y: 0 };
/** The exit's leaf: as wide and tall as the shop's door on the street (`furnishStreet`). */
export const SHOP_DOOR = { width: 1.3, height: 2.5 };
export const arrival = (depth: number): ShopPlan['arrival'] => ({ at: [0, depth / 2 - 0.9], yaw: 0 });
/** Where another customer comes in and goes out: just inside the exit, on its latch side, clear of the arrival spot. */
export const customerDoor = (depth: number): [x: number, z: number] => [0.45, depth / 2 - 0.45];

/** The OPEN / CLOSED card hung on the inside of the exit's glass, at eye height (`common/OpenSign`). */
export const OPEN_SIGN_AT: Placement = { wall: 'front', along: 0.25, y: 1.62, offset: 0.06 };
/** The doormat just inside the exit, the arrival standing on it. */
export const DOORMAT_AT = (depth: number): Placement => ({ floor: [0, depth / 2 - 0.3] });
