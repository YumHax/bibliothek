import type { Zone } from '../zone/Zone';
import type { ArcadeContext, BuildContext, HomeContext } from '../buildContext';
import type { Placement } from '../Placement';
import { placerFor, type Owned } from '../build/owned';
import { ArcadeCabinet } from '../arcade/ArcadeCabinet';
import { HomeArcadeGames } from './HomeArcadeGames';
import { HOME_CABINET } from './homeArcadeModel';

/** What the home cabinet reads of the context: the keys, the camera, what the flat owns, and its own table of scores. */
type HomeArcadeBuild = Pick<BuildContext, 'input' | 'listener'> & { home: Pick<HomeContext, 'upgrades' | 'furnishings'>; arcade: Pick<ArcadeContext, 'homeScores'> };

/** The home cabinet as built: the cabinet itself and its board, for a games night that hands stick two to a guest. */
export interface HomeArcade {
  cabinet: ArcadeCabinet;
  games: HomeArcadeGames;
}

/**
 * The home arcade cabinet (`homeArcade`, sold at the TV repair shop): the hall's own `ArcadeCabinet` around a 7-in-1
 * board (`HomeArcadeGames`), played for fun (`atHome`: no coin, no ticket, nothing counted at the arcade), its scores
 * on a table of its own (`HomeScores`). No light of its own (the flat's shader budget: a glow pool on the floor
 * only). Staged until bought, then movable like the other furniture. A guest takes stick two through the cabinet's
 * `partner` (a `Station` partner spot: `partner.setPartner(name)`), with `games.pick('duel')` for PADDLE WARS.
 */
export function placeHomeArcade(zone: Zone, ctx: HomeArcadeBuild, at: Placement, owned: Owned): HomeArcade {
  const scores = ctx.arcade.homeScores;
  const games = new HomeArcadeGames((id) => scores.bestOf(id));
  const cabinet = new ArcadeCabinet(games, ctx.input, {
    color: HOME_CABINET.color,
    glow: HOME_CABINET.glow,
    scores,
    nextPlayCost: () => 0,
    pointsPerTicket: 0,
    listener: ctx.listener,
    glowLight: false,
    wear: HOME_CABINET.wear,
    payout: 'none',
  });
  placerFor(zone, ctx.home.upgrades, owned).placeAt(cabinet, at);
  ctx.home.furnishings?.register(zone, cabinet, { key: 'homeArcade', at, owned, name: 'Arcade cabinet' });
  return { cabinet, games };
}
