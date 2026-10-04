import type { BoxCondition, CopyPast, CopyPastKind, CopyVariant, Game, PlatformId } from '@/catalog/types';
import { BOOTLEGS, bootlegsOf } from '@/catalog/bootlegs';
import { caseOf, mediaOf } from '@/catalog/media';
import { PAST_ODDS, VARIANT } from './pricing';

/*
 * What makes one second-hand copy itself (docs/economy.md "Copies"): a variant (sealed, a misprint, a crushed box) and
 * a past (what a previous owner left on or in it). Every seller of second-hand games dresses its copies here, from a
 * seed of the copy's own, so the same copy is the same on every load. A variant moves the price everywhere alike
 * (`pricing.variantFactor`); a past moves nothing and is found on opening the box (`game/CopyOpening`).
 */

/** Where a copy turns up: an `ordinary` stall find, a `collector`'s piece (a showpiece: sealed more often), the `bin`. */
type DressKind = 'ordinary' | 'collector' | 'bin';

interface DressOptions {
  /** The copy's state (absent: complete): a sealed copy is complete, pencil notes need the manual. */
  condition?: BoxCondition;
  /** A reproduction is never sealed (the tell is inside, and a sealed box is never opened at a stall). */
  repro?: boolean;
  kind?: DressKind;
}

/**
 * `game` as one particular second-hand copy: maybe a variant, maybe a past. `rng` is the copy's own seeded stream
 * (`seeded(...)`); exactly `DRAWS` values are taken whatever comes out, so a retune moves nothing else drawn after.
 */
export function dressCopy(rng: () => number, game: Game, options: DressOptions = {}): Game {
  const rolls = Array.from({ length: DRAWS }, () => rng());
  const [variantRoll, noteRoll, pastRoll, kindRoll, a, b, c, d] = rolls as [number, number, number, number, number, number, number, number];
  const condition = options.condition ?? 'complete';
  const kind = options.kind ?? 'ordinary';
  const variant = drawVariant(variantRoll, condition, kind, options.repro === true);
  const dressed: Game = { ...game };
  delete dressed.variant;
  delete dressed.variantNote;
  delete dressed.past;
  if (variant) dressed.variant = variant;
  if (variant === 'misprint') dressed.variantNote = pick(mediaOf(game).shape === 'disc' ? MISPRINTS.slice(1) : MISPRINTS, noteRoll);
  // A sealed copy was never opened: nobody left anything in it.
  if (variant !== 'sealed' && pastRoll < PAST_ODDS) dressed.past = drawPast(game, condition, kindRoll, [a, b, c, d]);
  return dressed;
}

/** One of the bootlegs (of `platform` when given and it has any), dressed as a second-hand copy; null when none. */
export function drawBootleg(rng: () => number, platform?: PlatformId, options: DressOptions = {}): Game | null {
  const pool = platform ? bootlegsOf(platform) : BOOTLEGS;
  const at = rng();
  const game = pool.length ? pool[Math.floor(at * pool.length)]! : null;
  return game ? dressCopy(rng, game, options) : null;
}

/** How the copy's variant reads on a tag ('' for none): SEALED, MISPRINT, CRUSHED BOX / CRACKED CASE. */
export function variantTag(game: Pick<Game, 'variant' | 'platform' | 'region' | 'externalIds'>): string {
  switch (game.variant) {
    case 'sealed': return 'SEALED';
    case 'misprint': return 'MISPRINT';
    case 'crushed': return caseOf(game).kind === 'cardboard' ? 'CRUSHED BOX' : 'CRACKED CASE';
    default: return '';
  }
}

/** The copy's variant in a panel's words (undefined for none). */
export function describeVariant(game: Pick<Game, 'variant' | 'variantNote' | 'platform' | 'region' | 'externalIds'>): string | undefined {
  switch (game.variant) {
    case 'sealed': return 'Factory sealed, still in its shrink-wrap (worth far more unopened)';
    case 'misprint': return `A misprint: ${game.variantNote ?? 'a printing error'} (collectors pay for that)`;
    case 'crushed': return caseOf(game).kind === 'cardboard' ? 'A crushed corner: the box has been sat on' : 'A cracked case';
    default: return undefined;
  }
}

/** How a copy's past reads as a card's title. */
export function pastTitle(past: Pick<CopyPast, 'kind'>): string {
  switch (past.kind) {
    case 'name': return 'Someone’s name on it';
    case 'save': return 'A save still on it';
    case 'notes': return 'Pencil in the manual';
    case 'receipt': return 'An old receipt';
    default: return 'Something left inside';
  }
}

/** Values taken from the copy's stream by `dressCopy`. */
const DRAWS = 8;

function drawVariant(u: number, condition: BoxCondition, kind: DressKind, repro: boolean): CopyVariant | undefined {
  let at = 0;
  // Sealed first: only a complete genuine copy, never in the bin.
  if (condition === 'complete' && !repro && kind !== 'bin') {
    at += VARIANT.sealed.odds * (kind === 'collector' ? VARIANT.showpieceBoost : 1);
    if (u < at) return 'sealed';
  }
  if (!repro) {
    at += VARIANT.misprint.odds;
    if (u < at) return 'misprint';
  }
  at += kind === 'bin' ? VARIANT.crushed.binOdds : VARIANT.crushed.odds;
  return u < at ? 'crushed' : undefined;
}

function drawPast(game: Game, condition: BoxCondition, kindRoll: number, [a, b, c, d]: readonly number[]): CopyPast {
  const kinds: CopyPastKind[] = ['name', 'receipt', 'note'];
  if (mediaOf(game).shape !== 'disc') kinds.push('save');
  if (condition === 'complete') kinds.push('notes');
  const kind = pick(kinds, kindRoll);
  return { kind, text: pastText(kind, game, [a!, b!, c!, d!]) };
}

function pastText(kind: CopyPastKind, game: Game, [a, b, c, d]: readonly [number, number, number, number]): string {
  const disc = mediaOf(game).shape === 'disc';
  switch (kind) {
    case 'name':
      return `“${pick(NAMES, a)}” written in marker across the ${disc ? 'disc’s printed side' : pick(['cartridge label', 'back of the cartridge', 'inside of the box'], b)}.`;
    case 'save':
      return `The battery still holds a save: ${pick(['a file at', 'one file at', 'three files, the best at'], a)} ${Math.round(5 + b * 95)}%, named “${pick(SAVE_NAMES, c)}”.`;
    case 'notes':
      return `The manual is full of pencil: ${pick(NOTES, a)}.`;
    case 'receipt': {
      const year = yearOf(game, b);
      const [shop, currency] = pick(SHOPS, a);
      const day = 1 + Math.floor(c * 28);
      const month = 1 + Math.floor(d * 12);
      return `A receipt folded under the tray: ${shop}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}, ${currency}${(29 + Math.floor(c * 30)).toString()}.99.`;
    }
    default:
      return pick(LEFT_INSIDE, a);
  }
}

/** The year the copy was likely bought new: its release year or a couple after (a 1990s year when unknown). */
function yearOf(game: Pick<Game, 'releaseDate'>, u: number): number {
  const released = Number.parseInt(game.releaseDate?.slice(0, 4) ?? '', 10);
  const base = Number.isFinite(released) ? released : 1990 + Math.floor(u * 8);
  return base + Math.floor(u * 3);
}

function pick<T>(list: readonly T[], u: number): T {
  return list[Math.min(list.length - 1, Math.floor(u * list.length))]!;
}

const NAMES = ['KEVIN', 'SARAH B.', 'PROPERTY OF DAVE', 'TOM’S — HANDS OFF', 'J. MÜLLER 4B', 'LUCAS', 'AMY + JO', 'MARK', 'NADIA', 'BEN (CLASS 6)'];
const SAVE_NAMES = ['LINK', 'ZELDA', 'AAAAA', 'MUM', 'TOM', 'KIKI', 'HERO', 'BOB', 'ASH', 'NOOB'];
const NOTES = [
  'a hand-drawn map of the last level',
  'every password written out in the back',
  'the final boss’s weak spot circled twice',
  '“DON’T TRUST THE OLD MAN” on the last page',
  'a high-score table, five names long',
  'the secret rooms ticked off one by one',
];
const SHOPS: readonly (readonly [string, string])[] = [
  ['Toy World, Leeds', '£'],
  ['Game Zone, Croydon', '£'],
  ['Woolworths, Bristol', '£'],
  ['Micromania, Lyon', 'F '],
  ['Software Plus, Bath', '£'],
  ['Karstadt, Köln', 'DM '],
  ['Toys R Us, Manchester', '£'],
  ['Virgin Megastore, Paris', 'F '],
];
const LEFT_INSIDE = [
  'A folded note in a grandmother’s hand: “Happy birthday Tom! Don’t play it all night.”',
  'A child’s note: “I BEAT IT!!! 3 hours 12 minutes.”',
  'A school photo of a boy in a cardigan, 1994 on the back.',
  'A football sticker stuck to the tray.',
  'A slip of paper: “hold B on the title screen”.',
  'A coupon cut out of a games magazine, never sent.',
];
const MISPRINTS = [
  'the cartridge label is printed upside down',
  'the title on the spine is misspelled',
  'the back cover belongs to another game',
  'the cover is misregistered, a ghost of blue beside every letter',
  'the manual inside is another game’s',
];
