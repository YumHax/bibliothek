import type { Game } from '@/catalog/types';
import { SEED_GAMES, canonicalGameId } from '@/catalog';
import { dayStream } from '@/time/daily';

/*
 * FÉLIX'S LOTS (docs/grandma.md "What the memories leave behind"): the games of his that went under the hammer at the
 * sale of his flat, lot 1 to 412, Crane in the front row. The catalogue Mémé kept lists them; his copies (his round
 * F.A. sticker on the back, `Game.felixLot`) turn up now and then on a stall, at the saleroom, in a small ad or in
 * Crane's suitcase, only ever for a game the player does not own yet. Bought back, a lot is home: nothing to count,
 * the catalogue's pencil tick is the collection itself (`lotsHome`).
 */

/** One lot of his in the catalogue. */
export interface FelixLot {
  /** Its number at the sale. */
  lot: number;
  /** The game (a built-in list's id, old or canonical). */
  id: string;
  /** Mémé's pencil in the margin of the catalogue. */
  note: string;
  /** What she says when told it is home. */
  told: string;
}

/** How often his copies turn up, each where it can: a market day's stalls, a sale day's lots, Crane's suitcase days. */
export const FELIX_TURNS_UP = {
  /** Share of market days one of his copies is on its platform's stall. */
  stall: 0.3,
  /** Share of sale days one of his copies is among the saleroom's lots. */
  saleroom: 0.5,
  /** Share of Crane's Front Street days one of his copies is in the suitcase. */
  crane: 0.5,
  /** Game days after the catalogue is in the player's hands that the house-clearance ad goes in the paper. */
  adAfter: 2,
  /** Lots in that ad. */
  adGames: 3,
} as const;

/** His lots in the catalogue's order (the Christmas Game Boy is not among them: it went to Crane in a lot of its own). */
export const FELIX_LOTS: readonly FelixLot[] = [
  { lot: 3, id: 'nes-legend-of-zelda', note: 'the gold one', told: 'Lot three, the gold box! He mapped that on squared paper at my kitchen table.' },
  { lot: 17, id: 'nes-metroid', note: 'he played it in the dark', told: 'Seventeen. I remember the music through the wall. Horrible music.' },
  { lot: 29, id: 'nes-mega-man-2', note: 'Bernard’s?', told: 'That one! He fought with Bernard over it for a whole summer.' },
  { lot: 41, id: 'nes-castlevania', note: '', told: 'Forty-one. The one with the bats. He did the voices.' },
  { lot: 52, id: 'nes-super-mario-bros-3', note: 'Christmas 90', told: 'Christmas 1990. He played it till the box gave up. And now it’s yours.' },
  { lot: 74, id: 'nes-punch-out', note: 'paid nothing', told: 'Lot seventy-four! He paid nothing for that one. A boy at school swapped it for a bike pump.' },
  { lot: 88, id: 'nes-kirbys-adventure', note: 'the pink one', told: 'The little pink one. He said it was for you. It was for him.' },
  { lot: 103, id: 'nes-ducktales', note: 'yours, really', told: 'Oh, that was yours really. You hummed the moon tune for a week.' },
  { lot: 121, id: 'nes-tetris', note: '', told: 'Tetris! He played that on the phone to me. I could hear the blocks.' },
  { lot: 146, id: 'snes-zelda-link-to-the-past', note: '', told: 'Lot one hundred and forty-six. He made me look at the map once. I nodded.' },
  { lot: 158, id: 'snes-super-mario-world', note: 'the green dinosaur', told: 'The green dinosaur! He named a cactus after it.' },
  { lot: 167, id: 'snes-chrono-trigger', note: 'from London', told: 'From London, that one. He came back with it and no umbrella.' },
  { lot: 189, id: 'snes-donkey-kong-country', note: '', told: 'The monkey! Gaspard said it looked expensive. It did, didn’t it.' },
  { lot: 204, id: 'snes-super-metroid', note: 'lights off', told: 'Lights off, sound up. He never let anyone watch that one.' },
  { lot: 216, id: 'megadrive-sonic-the-hedgehog-2', note: '', told: 'The blue hedgehog. Your mother thought it was a mouse.' },
  { lot: 233, id: 'megadrive-gunstar-heroes', note: 'Saturdays', told: 'Saturday mornings, with the neighbours’ boy. He let him win, you know.' },
  { lot: 251, id: 'megadrive-streets-of-rage-2', note: '', told: 'Two hundred and fifty-one. All that punching. He was gentle as a lamb.' },
  { lot: 268, id: 'gb-tetris', note: 'the train', told: 'He played that one on the train to see me. I heard it beeping from the platform.' },
  { lot: 279, id: 'gb-zelda-links-awakening', note: 'tape on the back', told: 'Is the tape still on the battery cover? It is! Oh, Félix.' },
  { lot: 294, id: 'gb-super-mario-land', note: '', told: 'The little grey cartridge. He kept it in his coat pocket.' },
  { lot: 318, id: 'n64-super-mario-64', note: '', told: 'Three hundred and eighteen. He rang me to say Mario could swim now. I said good for him.' },
  { lot: 337, id: 'n64-zelda-ocarina-of-time', note: 'the rain', told: 'Third in the queue, in the rain. He came here after to dry his socks.' },
  { lot: 361, id: 'ps1-castlevania-sotn', note: 'the library', told: 'The upside-down castle. He dreamt of a library, he said. Funny boy.' },
  { lot: 389, id: 'ps1-final-fantasy-7', note: 'three discs!', told: 'Three discs! He said it was a long story. He wasn’t wrong.' },
];

const BY_ID: ReadonlyMap<string, FelixLot> = new Map(FELIX_LOTS.map((lot) => [canonicalGameId(lot.id), lot]));
const SEED_BY_ID: ReadonlyMap<string, Game> = new Map(SEED_GAMES.map((game) => [game.id, game]));

/** His lot for game `id`, or null when it was not one of his in the catalogue. */
export function felixLotFor(id: string): FelixLot | null {
  return BY_ID.get(canonicalGameId(id)) ?? null;
}

/** Lot `lot`'s game, as the built-in list has it (its art and ids), or null. */
export function felixLotGame(lot: FelixLot): Game | null {
  return SEED_BY_ID.get(canonicalGameId(lot.id)) ?? null;
}

/** His copy of `lot`: complete (he kept every box), his sticker on the back, nothing a dealer would add. */
export function felixCopy(lot: FelixLot): Game | null {
  const game = felixLotGame(lot);
  if (!game) return null;
  const copy: Game = { ...game, condition: 'complete', felixLot: lot.lot };
  delete copy.variant;
  delete copy.variantNote;
  return copy;
}

/** The lots home: his copies in `games` (owned, lent or on display; not a wish). */
export function lotsHome(games: readonly Game[]): Set<number> {
  return new Set(games.filter((g) => g.felixLot !== undefined && g.status !== 'wishlist').map((g) => g.felixLot!));
}

/**
 * Which of his lots turns up at `where` on `day` (null: none today), drawn from the day alone so a reload shows the
 * same, among the lots whose game `owns` says the player has not got (theirs or his).
 */
export function felixLotOn(day: number, where: 'stall' | 'saleroom' | 'crane', owns: (id: string) => boolean): FelixLot | null {
  const rng = dayStream(`${day}:felix:${where}`);
  if (rng() >= FELIX_TURNS_UP[where]) return null;
  const free = FELIX_LOTS.filter((lot) => !owns(canonicalGameId(lot.id)) && felixLotGame(lot));
  return free[Math.floor(rng() * free.length)] ?? null;
}
