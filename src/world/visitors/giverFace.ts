import { tier } from '@/social/standing';
import { tierInfo } from '@/social/tiers';
import { portrait } from '@/ui/social/portrait';

/** The giver's face over a gift's banner (`RewardNotice.picture`), ringed in the colour of how the player stands with them. */
export function giverFace(id: string): { picture: HTMLCanvasElement; pictureRing: string } {
  const ring = tierInfo(tier(id)).colour;
  return { picture: portrait(id, 72, ring), pictureRing: ring };
}
