import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { KEYS, batch } from '@/persistence';
import { giveKey, hasKey } from '@/building/keys';
import { conciergeState, saveConcierge } from '@/building/conciergeState';
import { findClue, huntFound } from '@/building/hunt/BuildingHunt';
import { HUNT, type ClueId } from '@/building/hunt/huntPlan';
import { RESOLUTIONS, type ResolutionId } from '@/building/coproPlan';
import { coproChoice, decideResolution } from '@/building/coproState';
import { atticState, markAttic } from '@/world/attic/atticState';
import { AERIAL_STEPS, aerialStep, foundChannels, signalAt, turnAerial } from '@/world/roof/channels';
import { everyone } from '@/social/people';
import { giveNumber, isMet, learn, learnTrait, setStanding, tier } from '@/social/standing';
import { PROTOTYPE_ID, prototypeGame } from '@/story/prototype';
import { LOYALTY } from '@/economy/pricing';
import { PRIZES } from '@/economy/Prizes';
import { HOME_UPGRADES, type HomeUpgrade } from '@/economy/homeGoods';
import { TICKET_GAMES } from '@/world/arcade/arcadePlan';
import { editSaved, removeSaved } from './savedEdits';

/*
 * Every progression of the game the `?debug` save starts with done (docs/checks.md "Debug mode"): each says whether it
 * holds now (`on`), does it through the game's own stores (`unlock`), and undoes it (`lock`: its save entries
 * dropped or edited; the page reloads after). The debug panel lists them by `group`; a new progression is one entry.
 */

/** The stores a progression is read and written through (the services' own, by shape: the cheats never import the wiring). */
export interface DebugSubjects {
  /** Today's game day. */
  day(): number;
  collection: { owns(id: string): boolean; add(game: Game): void; remove(id: string): void };
  felix: { readonly found: boolean; find(day: number): void };
  upgrades: { count(upgrade: HomeUpgrade): number; limit(upgrade: HomeUpgrade): number; add(upgrade: HomeUpgrade): void };
  standing: { readonly reputation: { readonly next: number | null }; buysAt(platform: PlatformId): number; record(deed: 'buy' | 'openHouse', platform?: PlatformId): void };
  medals: { earned(gameId: string): readonly string[]; thresholds(gameId: string): Readonly<Record<'gold', number>>; award(gameId: string, score: number): unknown };
  prizes: { owns(id: string): boolean; add(id: string): void };
}

export interface Progression {
  id: string;
  group: 'The flat' | 'The building' | 'People' | 'The story' | 'Market and arcade';
  label: string;
  on(s: DebugSubjects): boolean;
  unlock(s: DebugSubjects): void;
  lock(s: DebugSubjects): void;
}

/** A warmth and a trust well inside the top tier (`socialPlan.TIERS`: close from 80 / 55). */
const CLOSE = { warmth: 90, trust: 70 } as const;
const CLUES = Object.keys(HUNT.clues) as ClueId[];
/** The channels the aerial can bring in, by the steps it finds them at. */
const AERIAL_FINDS = [...new Set(Array.from({ length: AERIAL_STEPS }, (_, step) => (signalAt(step).channel ? step : -1)).filter((step) => step >= 0))];
const STALLS = PLATFORM_LIST.map((p) => p.id);
const BEST_CUSTOMER = LOYALTY.tiers[LOYALTY.tiers.length - 1]!;
const SHELF_PRIZES = PRIZES.filter((p) => !p.game);

/** Every piece of the flat at its most (a piece whose room another piece lifts counted again once that one is in). */
function furnishAll(s: DebugSubjects): void {
  for (let pass = 0; pass < 2; pass++) for (const u of HOME_UPGRADES) while (s.upgrades.count(u) < s.upgrades.limit(u)) s.upgrades.add(u);
}

export const PROGRESSIONS: readonly Progression[] = [
  {
    id: 'flat',
    group: 'The flat',
    label: 'Everything bought: the furniture, the screens, the cat, Mrs Roux’s rooms',
    on: (s) => HOME_UPGRADES.every((u) => s.upgrades.count(u) >= s.upgrades.limit(u)),
    unlock: furnishAll,
    lock: () => {
      removeSaved(KEYS.home);
      removeSaved(KEYS.furniture);
    },
  },
  {
    id: 'concierge',
    group: 'The building',
    label: 'The concierge met, her errand done, the cellar key given',
    on: () => hasKey('cellar'),
    unlock: () => {
      const state = conciergeState();
      state.met = true;
      state.errand = 'done';
      saveConcierge();
      giveKey('cellar');
    },
    lock: () => {
      editSaved(KEYS.buildingKeys, (keys) => (Array.isArray(keys) ? keys.filter((k) => k !== 'cellar') : undefined));
      removeSaved(KEYS.concierge);
    },
  },
  ...(['found', 'prize', 'chest'] as const).map((flag): Progression => ({
    id: `attic.${flag}`,
    group: 'The building',
    label: { found: 'The attic: the lift’s code found', prize: 'The attic: the collector’s cabinet beaten', chest: 'The attic: his chest opened' }[flag],
    on: () => atticState()[flag],
    unlock: () => markAttic(flag),
    lock: () => editSaved(KEYS.attic, (state) => (state && typeof state === 'object' ? { ...state, [flag]: false } : undefined)),
  })),
  {
    id: 'aerial',
    group: 'The building',
    label: 'The roof’s aerial: every old channel found',
    on: () => foundChannels().filter((c) => c.step !== null).length >= AERIAL_FINDS.length,
    unlock: () => {
      const back = aerialStep();
      for (const step of AERIAL_FINDS) turnAerial(step);
      turnAerial(back);
    },
    lock: () => removeSaved(KEYS.aerial),
  },
  {
    id: 'hunt',
    group: 'The building',
    label: 'The treasure hunt: every clue, the chest found',
    on: () => CLUES.every(huntFound),
    // A clue opens once what it needs is found: as many rounds as the longest chain.
    unlock: () => {
      for (let round = 0; round < CLUES.length; round++) if (!CLUES.map((clue) => findClue(clue, 'never')).some(Boolean)) break;
    },
    lock: () => removeSaved(KEYS.buildingHunt),
  },
  {
    id: 'social',
    group: 'People',
    label: 'Everyone met, a close friend, every number, fact and trait known',
    on: () => everyone().every((p) => isMet(p.id) && tier(p.id) === 'close'),
    unlock: (s) => {
      for (const person of everyone()) {
        setStanding(person.id, CLOSE.warmth, CLOSE.trust, s.day(), true);
        if (person.phone) giveNumber(person.id);
        for (const fact of person.facts ?? []) learn(person.id, fact.id);
        for (const trait of person.traits) learnTrait(person.id, trait);
      }
    },
    lock: () => removeSaved(KEYS.social),
  },
  {
    id: 'prototype',
    group: 'The story',
    label: 'The lost prototype found: the grey cart home',
    on: (s) => s.collection.owns(PROTOTYPE_ID),
    unlock: (s) => s.collection.add(prototypeGame(s.day(), 'the debug panel')),
    lock: (s) => {
      s.collection.remove(PROTOTYPE_ID);
      removeSaved(KEYS.prototypeStory);
    },
  },
  {
    id: 'felix',
    group: 'The story',
    label: 'Uncle Félix’s notebook found',
    on: (s) => s.felix.found,
    unlock: (s) => s.felix.find(s.day()),
    lock: () => removeSaved(KEYS.felixNotebook),
  },
  {
    id: 'reputation',
    group: 'Market and arcade',
    label: 'The flea market: a legend, the best customer at every stall',
    on: (s) => s.standing.reputation.next === null && STALLS.every((p) => s.standing.buysAt(p) >= BEST_CUSTOMER),
    unlock: (s) =>
      batch(() => {
        for (const p of STALLS) while (s.standing.buysAt(p) < BEST_CUSTOMER) s.standing.record('buy', p);
        while (s.standing.reputation.next !== null) s.standing.record('openHouse');
      }),
    lock: () => removeSaved(KEYS.standing),
  },
  {
    id: 'medals',
    group: 'Market and arcade',
    label: 'The arcade: gold on every machine',
    on: (s) => TICKET_GAMES.every((id) => s.medals.earned(id).includes('gold')),
    unlock: (s) => {
      for (const id of TICKET_GAMES) s.medals.award(id, s.medals.thresholds(id).gold);
    },
    lock: () => removeSaved(KEYS.arcadeMedals),
  },
  {
    id: 'prizes',
    group: 'Market and arcade',
    label: 'The prize counter: every prize taken home',
    on: (s) => SHELF_PRIZES.every((p) => s.prizes.owns(p.id)),
    unlock: (s) => {
      for (const p of SHELF_PRIZES) if (!s.prizes.owns(p.id)) s.prizes.add(p.id);
    },
    lock: () => removeSaved(KEYS.prizes),
  },
];

/** A choice the building made rather than a step taken: the co-owners' votes, set outright (no meeting's minutes). */
interface DebugChoice {
  id: ResolutionId;
  label: string;
  options: readonly { id: string; label: string }[];
  current(): string;
  choose(option: string): void;
}

export const CHOICES: readonly DebugChoice[] = RESOLUTIONS.map((r) => ({
  id: r.id,
  label: r.title,
  options: r.options,
  current: () => coproChoice(r.id),
  choose: (option) => decideResolution(r.id, option),
}));
