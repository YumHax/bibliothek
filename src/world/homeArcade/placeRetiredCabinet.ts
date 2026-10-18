import type { Zone } from '../zone/Zone';
import type { ArcadeContext, BuildContext } from '../buildContext';
import type { Placement } from '../Placement';
import { RETIRED_CABINETS } from '@/economy/Prizes';
import { ArcadeCabinet } from '../arcade/ArcadeCabinet';
import { ARCADE_GAMES, type ArcadeGameId } from '../arcade/games';
import { ARCADE_PLAN } from '../arcade/arcadePlan';

/** What the retired cabinet reads of the context: the keys, the camera, the prizes taken (which game it runs) and the home table. */
type RetiredCabinetBuild = Pick<BuildContext, 'input' | 'listener'> & { arcade: Pick<ArcadeContext, 'homeScores' | 'prizes'> };

/** The prize that brings it home (`Prizes`, the counter's back room). */
const PRIZE = 'hallCabinet';

/**
 * The hall's retired cabinet, bought back from the prize counter's back room (docs/economy.md "Prizes"): the very
 * upright from the hall, in its own paint and wear, running its one game, played for fun at home like the 7-in-1
 * (`atHome`: no coin, no ticket, its scores on the home table). It stands only once the prize is owned, and turns up
 * there the moment it is (no light of its own: nothing to recompile); bought again another week, the new one takes
 * its corner. Not movable (it is no shop's furniture).
 */
export function placeRetiredCabinet(zone: Zone, ctx: RetiredCabinetBuild, at: Placement): void {
  const prizes = ctx.arcade.prizes;
  if (!prizes) return;
  let placed: { id: ArcadeGameId; cabinet: ArcadeCabinet } | null = null;
  const place = (): void => {
    if (!prizes.owns(PRIZE)) return;
    // The game it was last bought with (another week's swaps the one in the corner; a save without one: the first that can stand at home).
    const id = (prizes.gamesOf(PRIZE).at(-1) ?? RETIRED_CABINETS[0]) as ArcadeGameId;
    if (placed?.id === id) return;
    if (placed) {
      zone.remove(placed.cabinet);
      placed.cabinet.dispose();
    }
    const paint = ARCADE_PLAN.cabinets.find((c) => c.game === id);
    const scores = ctx.arcade.homeScores;
    const cabinet = new ArcadeCabinet(ARCADE_GAMES[id]({ remoteScreen: null }), ctx.input, {
      color: paint?.color ?? 0x2f4f8f,
      glow: paint?.glow ?? 0x9ad6ff,
      scores,
      nextPlayCost: () => 0,
      pointsPerTicket: 0,
      listener: ctx.listener,
      glowLight: false,
      wear: paint?.wear ?? 0.6,
      payout: 'none',
    });
    zone.placeAt(cabinet, at);
    placed = { id, cabinet };
  };
  place();
  zone.onUnload(prizes.subscribe(place));
}
