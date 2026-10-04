import { everyone } from './people';
import { BUILDING_NAMES } from './socialPlan';
import { standing } from './standing';

/*
 * What the building thinks of the player (docs/social.md "The building's opinion"): the average warmth of the
 * residents met. The concierge's greeting, the party's toast and the board read it.
 */

/** The average warmth of the building's residents the player has met (0 when none). */
export function buildingWarmth(): number {
  const met = everyone().filter((p) => p.group === 'building' && standing(p.id).met !== null);
  if (!met.length) return 0;
  return Math.round(met.reduce((sum, p) => sum + standing(p.id).warmth, 0) / met.length);
}

/** How the building calls the player: "the nice one on the 5th", "the noisy one". */
export function buildingName(): string {
  const w = buildingWarmth();
  let name = BUILDING_NAMES[0]!.name;
  for (const b of BUILDING_NAMES) if (w >= b.from) name = b.name;
  return name;
}
