import { ARCADE_GAMES, type ArcadeGameId } from './games';
import { ARCADE_PLAN } from './arcadePlan';

let cabinets: readonly { id: ArcadeGameId; title: string }[] | null = null;

/**
 * The hall's cabinet games by id and title, in the plan's order (read once off each game), for the prize counter's
 * back room: the cabinet a sponsor's plate goes on, the title of the week's retired cabinet.
 */
export function hallCabinets(): readonly { id: ArcadeGameId; title: string }[] {
  cabinets ??= ARCADE_PLAN.cabinets.map((c) => ({ id: c.game, title: ARCADE_GAMES[c.game]({ remoteScreen: null }).title }));
  return cabinets;
}
