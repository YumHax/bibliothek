import type { Game } from '@/catalog/types';
import { canonicalGameId } from '@/catalog';
import type { ScriptedAd } from '@/classifieds/ads';
import { FELIX_LOTS, FELIX_TURNS_UP, felixCopy, felixLotOn } from '@/economy/felixLots';
import { rivalOnFrontStreet } from '@/economy/rivalCollector';

/** The house-clearance ad: Lenny, the saleroom's dealer, selling what he bought at Félix's sale. */
const CLEARANCE_AD = {
  id: 'felix-clearance',
  kind: 'mover',
  name: 'Lenny',
  platform: null,
  text: 'CLEARING THE LOCK-UP. A box of old games from a flat sale two years back, never unpacked. All boxed, little round stickers on the back. Cash only, no time-wasters.',
  greeting: 'You’re here about the box? Bought it at a sale in the spring. The old man’s stickers are still on them. Take your pick.',
} as const;

interface FelixLotsDeps {
  today: { readonly gameDay: number; onNewGameDay(cb: (day: number) => void): () => void };
  collection: { readonly games: readonly Game[]; owns(id: string): boolean; subscribe(cb: () => void): () => void };
  /** Crane's suitcase: what he keeps there for his Front Street days. */
  rival: { keep(day: number, taken: { game: Game; price: number }): void; haulOn(day: number): readonly { game: Game }[] };
  classifieds: { inject(spec: ScriptedAd): void };
  /** Whether Mémé has given the sale's catalogue (`Keepsakes`), and hearing her give it. */
  catalogue: { given(): boolean; subscribe(cb: () => void): () => void };
  /** A copy of his home counts as one of his games home for her album (memory 6). */
  grandma: { felixGameHome(): void };
  /** What a complete copy fetches in the shops (Crane's price is his markup on it). */
  price(game: Game): Promise<number>;
}

/**
 * FÉLIX'S COPIES COMING BACK (docs/grandma.md "What the memories leave behind") beyond the stalls and the saleroom
 * (whose draws pick theirs, `economy/felixLots`): one in Crane's suitcase some of his Front Street days, and, once
 * Mémé has given the catalogue, a dealer's house-clearance ad with three of them. A copy of his bought back is one of
 * his games home for her album (`GrandmaVisits.felixGameHome`: memory 6).
 */
export function followFelixLots(deps: FelixLotsDeps): void {
  const { today, collection, rival, classifieds, catalogue, grandma } = deps;

  const homeCheck = (): void => {
    if (collection.games.some((g) => g.felixLot !== undefined && g.status !== 'wishlist')) grandma.felixGameHome();
  };

  const craneDay = (day: number): void => {
    if (!rivalOnFrontStreet(day)) return;
    const lot = felixLotOn(day, 'crane', (id) => collection.owns(id));
    const copy = lot && felixCopy(lot);
    if (!copy || rival.haulOn(day).some((h) => h.game.id === copy.id)) return;
    void deps.price(copy).then((price) => rival.keep(day, { game: copy, price }), () => undefined);
  };

  const advertise = (): void => {
    if (!catalogue.given()) return;
    const games = FELIX_LOTS.map((lot) => canonicalGameId(lot.id)).filter((id) => !collection.owns(id)).slice(0, FELIX_TURNS_UP.adGames);
    if (games.length) classifieds.inject({ ...CLEARANCE_AD, fromDay: today.gameDay + FELIX_TURNS_UP.adAfter, games, felix: true });
  };

  homeCheck();
  craneDay(today.gameDay);
  advertise();
  collection.subscribe(homeCheck);
  today.onNewGameDay(craneDay);
  catalogue.subscribe(advertise);
}
