import type { ControlGroup } from '../controls';
import type { ZoneId } from '@/world/zoneIds';

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
} satisfies Record<ZoneId, string>;

export function zoneName(id: string): string {
  return NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** The Controls tab that fits a zone: the arcade's and the market's own, else home. */
export function controlsGroupOf(id: string): ControlGroup {
  return id === 'arcade' ? 'arcade' : id === 'market' ? 'market' : 'room';
}
