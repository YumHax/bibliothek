import type { ShopDoor } from '../street/streetPlan';
import { PARK_STREET } from '@/world/measures/street';
import { walkInShops } from '@/world/city/facades';
import type { ShopZoneId } from './shopPlan';

/*
 * Where a walk-in shop stands in the street (`streetPlan`): its door, on which facade, and which street that is. Its
 * window looks out from there (`ShopWindow`, through `outlook/`): the TV repair shop on Park Street sees the park's
 * trees, PAWS & CLAWS the length of Park Street with our corner on its right, SECOND HOME and the florist the row
 * across Front Street.
 */

/** The shop's door on the street, from `walkInShops`. */
export function shopDoorOf(zone: ShopZoneId): ShopDoor | null {
  return walkInShops().find((shop) => shop.zone === zone)?.door ?? null;
}

/** The street a shop's door opens on: Park Street's building line, else Front Street. */
export function streetOf(door: ShopDoor | null): 'Front Street' | 'Park Street' {
  const { from, to } = door?.facade ?? { from: [0, 0], to: [0, 0] };
  return from[0] === PARK_STREET.line && to[0] === PARK_STREET.line ? 'Park Street' : 'Front Street';
}
