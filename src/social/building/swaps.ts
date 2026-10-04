import { personAtDoor } from '../people';
import { has } from '../perks';
import { BUILDING_PERKS } from './buildingPerksPlan';

/**
 * How much more a resident gives in a swap than they ask of the player (`economy/NeighbourTrades`): Mrs Haddad,
 * Friendly, offers a game worth more than the one she wants (`betterSwaps`); everyone else, 1.
 */
export function swapGenerosity(door: string): number {
  const id = personAtDoor(door);
  return id && has(id, 'betterSwaps') ? BUILDING_PERKS.haddad.swapGenerosity : 1;
}
