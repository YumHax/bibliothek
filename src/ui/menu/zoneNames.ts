import type { ControlGroup } from '../controls';
import type { ZoneId } from '@/world/zoneIds';
import { capitalise } from '@/text/strings';

/** What the pause menu calls each zone of `WORLD_PLAN` (by id; every zone has a name); an unknown id is shown as is. */
const NAMES: Readonly<Record<string, string>> = {
  living: 'Living room',
  hallway: 'Hallway',
  bathroom: 'Bathroom',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  balcony: 'Balcony',
  stairwell: 'Stairwell',
  arcade: 'Arcade',
  market: 'Flea market',
  street: 'Street',
  furnitureShop: 'Second Home',
  tvShop: 'TV Repair',
  petShop: 'Paws & Claws',
  flowerShop: 'The florist',
  annex: 'The new room',
  annexStudy: 'The study',
  neighbourFlat: 'A neighbour’s flat',
  courtyard: 'The courtyard',
  saleroom: 'The saleroom',
  sellerFlat: 'A seller’s flat',
  cellar: 'The cellars',
  attic: 'The attic',
  roof: 'The roof',
} satisfies Record<ZoneId, string>;

export function zoneName(id: string): string {
  return NAMES[id] ?? capitalise(id);
}

/** The Controls tab that fits a zone: the arcade's and the market's own, else home. */
export function controlsGroupOf(id: string): ControlGroup {
  return id === 'arcade' ? 'arcade' : id === 'market' ? 'market' : 'room';
}
