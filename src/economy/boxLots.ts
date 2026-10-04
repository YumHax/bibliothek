import type { Game } from '@/catalog/types';
import { SEED_GAMES } from '@/catalog';
import { readGame } from '@/catalog/validate';
import { seeded } from './seeded';
import { isGrail } from './grails';
import { drawCondition } from './stockDraws';
import { dressCopy, drawBootleg } from './copyTraits';
import { SEALED_LOT } from './pricing';

/*
 * SEALED BOX LOTS: a taped carton bought blind (the flea market's corner by the job lot, the saleroom's hammer),
 * carried home and unpacked there one thing at a time (`SealedLots`, the hallway's `CartonAtHome`). What is in it is
 * drawn from its seed when it is made and kept with it; nothing of it shows before it is opened but what a carton
 * shows: its label, how heavy it is, whether it rattles. Mostly odds and ends and ordinary games, now and then a gem.
 */

/** One thing out of a carton. */
export type CartonItem =
  | { kind: 'game'; game: Game; gem?: boolean }
  /** Odds and ends: what it is, a word on it, and the loose coins found with it (mostly none). */
  | { kind: 'junk'; name: string; line: string; coins: number };

/** A sealed carton: its label and what can be told from outside, its price by weight, and what is inside. */
export interface SealedLot {
  id: string;
  label: string;
  /** What it gives away from outside: "heavy, it rattles". */
  hint: string;
  /** What it costs by weight (`SEALED_LOT.perItem` a thing). */
  price: number;
  items: CartonItem[];
}

const LABELS = ['ATTIC CLEAR-OUT', 'HOUSE CLEARANCE · BOX 3', 'LOFT FIND', 'MIXED · NO RETURNS', 'SCHOOL FÊTE LEFTOVERS', 'GARAGE · DO NOT OPEN', 'MUM’S CUPBOARD', 'BEDROOM, 1996'];

const JUNK: readonly { name: string; line: string }[] = [
  { name: 'A tangle of cables', line: 'Aerial leads, a SCART, something that fits nothing you own.' },
  { name: 'A games magazine', line: 'An issue from 1994, the poster still folded inside. The cheats page is dog-eared.' },
  { name: 'A lone joypad', line: 'The D-pad sticks. Someone loved it hard.' },
  { name: 'An empty jewel case', line: 'Cracked hinge, no disc, no inlay. The eternal disappointment.' },
  { name: 'A strategy guide', line: 'The world map has been torn out. Of course it has.' },
  { name: 'A bag of manuals', line: 'Manuals for games nobody has ever heard of. You read two anyway.' },
  { name: 'A cartridge with no label', line: 'Bare plastic, a bit of tape that says "MIKE". It plays nothing you can tell.' },
  { name: 'A memory card', line: '15 blocks, all full: someone’s whole childhood of save files.' },
  { name: 'A broken console', line: 'A Mega Drive with no lid and a smell of burnt dust. Not today.' },
  { name: 'A jar of buttons', line: 'Shirt buttons. Hundreds. Why are they in a box of games?' },
  { name: 'A Christmas catalogue', line: 'Every console of 1993 at its 1993 price. Painful reading.' },
  { name: 'A shoebox of tokens', line: 'Arcade tokens from a hall that closed long ago. They will not work at yours.' },
];

/** The well-known titles a carton may hide (the built-in list, no grail). */
function gems(): Game[] {
  return SEED_GAMES.filter((g) => g.externalIds?.libretroName && !isGrail(g.id));
}

/**
 * A sealed carton drawn from `seed`: `SEALED_LOT.items` things, each a game (from `pool`, ordinary finds) with
 * `gameOdds`, else junk; with `gemOdds` one game is a well-known title instead. `owns` keeps out what the player has
 * (when there are enough others). Priced by weight.
 */
export function drawSealedLot(seed: string, pool: readonly Game[], owns: (id: string) => boolean = () => false): SealedLot {
  const rng = seeded(`carton:${seed}`);
  const [lo, hi] = SEALED_LOT.items;
  const count = lo + Math.floor(rng() * (hi - lo + 1));
  const items: CartonItem[] = [];
  const used = new Set<string>();
  const candidates = pool.filter((g) => !owns(g.id));
  const from = candidates.length >= count ? candidates : [...pool];
  for (let i = 0; i < count; i++) {
    const u = rng();
    const pick = from[Math.floor(rng() * from.length)];
    const condition = drawCondition(rng());
    // Every copy is dressed from a stream of its own (a variant, a past: `dressCopy`), now and then a bootleg instead.
    const copyRng = seeded(`carton:${seed}:${i}`);
    if (u < SEALED_LOT.gameOdds && rng() < SEALED_LOT.bootlegOdds) {
      const bootleg = drawBootleg(copyRng, undefined, { condition, kind: 'bin' });
      if (bootleg && !used.has(bootleg.id)) {
        used.add(bootleg.id);
        items.push({ kind: 'game', game: { ...bootleg, condition, status: 'owned' } });
        continue;
      }
    }
    if (u < SEALED_LOT.gameOdds && pick && !used.has(pick.id)) {
      used.add(pick.id);
      items.push({ kind: 'game', game: dressCopy(copyRng, { ...pick, condition, status: 'owned' }, { condition, kind: 'bin' }) });
      continue;
    }
    const junk = JUNK[Math.floor(rng() * JUNK.length)]!;
    const [c0, c1] = SEALED_LOT.coins;
    const coins = rng() < SEALED_LOT.coinsOdds ? c0 + Math.floor(rng() * (c1 - c0 + 1)) : 0;
    items.push({ kind: 'junk', name: junk.name, line: coins ? `${junk.line} And at the bottom, ${coins} loose coin${coins === 1 ? '' : 's'}.` : junk.line, coins });
  }
  // Now and then a gem: a well-known title, under everything else.
  if (rng() < SEALED_LOT.gemOdds) {
    const list = gems().filter((g) => !used.has(g.id) && !owns(g.id));
    const gem = list[Math.floor(rng() * list.length)];
    const condition = drawCondition(rng());
    if (gem) items.push({ kind: 'game', game: dressCopy(seeded(`carton:${seed}:gem`), { ...gem, condition, status: 'owned' }, { condition, kind: 'bin' }), gem: true });
  }
  const label = LABELS[Math.floor(rng() * LABELS.length)]!;
  const junkCount = items.filter((i) => i.kind === 'junk').length;
  const hint = [items.length >= 6 ? 'heavy' : items.length <= 3 ? 'light' : 'a fair weight', junkCount > items.length / 2 ? 'it rattles' : 'something slides inside'].join(', ');
  return { id: seed, label, hint, price: items.length * SEALED_LOT.perItem, items };
}

/** What each game of `lot` cost, its share of the price. */
export function shareOf(lot: Pick<SealedLot, 'price' | 'items'>): number {
  const games = lot.items.filter((i) => i.kind === 'game').length;
  return games ? Math.max(1, Math.round(lot.price / games)) : 0;
}

function readCartonItem(value: unknown): CartonItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'game') {
    const game = readGame(v.game);
    return game ? { kind: 'game', game, ...(v.gem === true ? { gem: true } : {}) } : null;
  }
  if (v.kind === 'junk' && typeof v.name === 'string' && typeof v.line === 'string') {
    return { kind: 'junk', name: v.name, line: v.line, coins: typeof v.coins === 'number' && v.coins > 0 ? Math.floor(v.coins) : 0 };
  }
  return null;
}

export function readSealedLot(value: unknown): SealedLot | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.label !== 'string' || typeof v.hint !== 'string' || typeof v.price !== 'number' || !Array.isArray(v.items)) return null;
  const items = v.items.map(readCartonItem).filter((i): i is CartonItem => i !== null);
  return { id: v.id, label: v.label, hint: v.hint, price: v.price, items };
}
