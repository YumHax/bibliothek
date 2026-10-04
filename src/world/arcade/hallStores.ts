import { ArcadeTournament } from '@/economy/ArcadeTournament';
import { Jackpot } from '@/economy/Jackpot';
import type { ArcadeContext } from '../buildContext';
import { ReplayStore, type ReplayShelf } from './replay/ReplayStore';
import { ARCADE_PLAN } from './arcadePlan';

/** The stores the hall keeps across its loads: the Saturday tournament, the wheel's pot, the best runs. */
interface HallStores {
  tournament: ArcadeTournament;
  jackpot: Jackpot;
  replays: ReplayShelf;
}

let ownTournament: ArcadeTournament | null = null;
let ownJackpot: Jackpot | null = null;
let ownReplays: ReplayShelf | null = null;

/**
 * The hall's long-lived stores: the context's (made once at boot, `bootstrap/services`) or, for one
 * it does not bring, the hall's own, made on the first build and kept for the page's life, so a
 * hall unloaded and built again never starts a store afresh.
 */
export function hallStores(arcade: ArcadeContext): HallStores {
  return {
    tournament: arcade.tournament ?? (ownTournament ??= new ArcadeTournament({ games: ARCADE_PLAN.tournament.games, names: ARCADE_PLAN.crowd.regulars.names })),
    jackpot: arcade.jackpot ?? (ownJackpot ??= new Jackpot()),
    replays: arcade.replays ?? (ownReplays ??= new ReplayStore()),
  };
}
