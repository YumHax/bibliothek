import { random } from '@/random';

/*
 * MÉMÉ'S CARDS in the evening (docs/grandma.md "Things to do with her"): crazy eights with a 52-card pack, five cards
 * each. A card goes on the pile when it matches its suit or its rank; an eight goes on anything and names the suit;
 * nothing to play, one card is drawn and the turn passes. First with an empty hand wins. Her side plays itself
 * (`herTurn`), and now and then she slips down a card that does not match and owns up to it (`cheat`).
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

export interface Card {
  suit: Suit;
  /** 1 (ace) to 13 (king). */
  rank: number;
}

/** Cards dealt to each. */
const HAND = 5;
/** Her chance, on a turn she has nothing to play, of slipping down a card that does not match (once a game at most). */
const CHEAT_CHANCE = 0.35;

export interface CardsGame {
  you: Card[];
  her: Card[];
  stock: Card[];
  /** The pile's top card, and the suit asked for (an eight's, else the top card's). */
  top: Card;
  suit: Suit;
  /** Whose turn it is, or who won. */
  turn: 'you' | 'her';
  winner: 'you' | 'her' | null;
  /** She has cheated this game already. */
  cheated: boolean;
}

/** What her turn did, for her words. */
export type HerMove = { kind: 'play'; card: Card; suit: Suit } | { kind: 'cheat'; card: Card } | { kind: 'draw' } | { kind: 'stuck' };

/** A shuffled pack, dealt: five each, the first card that is not an eight turned up. */
export function deal(): CardsGame {
  const pack: Card[] = SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1 })));
  for (let i = pack.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pack[i], pack[j]] = [pack[j]!, pack[i]!];
  }
  const you = pack.splice(0, HAND);
  const her = pack.splice(0, HAND);
  const at = pack.findIndex((card) => card.rank !== 8);
  const top = pack.splice(at, 1)[0]!;
  return { you, her, stock: pack, top, suit: top.suit, turn: 'you', winner: null, cheated: false };
}

/** Whether `card` may go on the pile now. */
export function playable(game: CardsGame, card: Card): boolean {
  return card.rank === 8 || card.suit === game.suit || card.rank === game.top.rank;
}

/** The player puts down their card at `index` (an eight names `suit`); false if it may not go. */
export function playYours(game: CardsGame, index: number, suit?: Suit): boolean {
  const card = game.you[index];
  if (!card || game.turn !== 'you' || game.winner || !playable(game, card)) return false;
  game.you.splice(index, 1);
  lay(game, card, card.rank === 8 ? (suit ?? card.suit) : card.suit);
  if (!game.you.length) game.winner = 'you';
  else game.turn = 'her';
  return true;
}

/** The player draws a card (nothing to play, or by choice); the turn passes. */
export function drawYours(game: CardsGame): void {
  if (game.turn !== 'you' || game.winner) return;
  const card = draw(game);
  if (card) game.you.push(card);
  game.turn = 'her';
}

/** Her turn: the first card that goes (an eight last, naming the suit she holds most of), else a cheat now and then, else a draw. */
export function herTurn(game: CardsGame): HerMove {
  if (game.turn !== 'her' || game.winner) return { kind: 'stuck' };
  const plain = game.her.findIndex((card) => card.rank !== 8 && playable(game, card));
  const index = plain >= 0 ? plain : game.her.findIndex((card) => card.rank === 8);
  let move: HerMove;
  if (index >= 0) {
    const card = game.her.splice(index, 1)[0]!;
    const suit = card.rank === 8 ? mostHeld(game.her) : card.suit;
    lay(game, card, suit);
    move = { kind: 'play', card, suit };
  } else if (!game.cheated && game.her.length > 1 && random() < CHEAT_CHANCE) {
    // She slips one down, then owns up: it goes back in her hand and she draws as she should have.
    game.cheated = true;
    const card = game.her[Math.floor(random() * game.her.length)]!;
    const drawn = draw(game);
    if (drawn) game.her.push(drawn);
    move = { kind: 'cheat', card };
  } else {
    const drawn = draw(game);
    if (drawn) game.her.push(drawn);
    move = drawn ? { kind: 'draw' } : { kind: 'stuck' };
  }
  if (!game.her.length) game.winner = 'her';
  else game.turn = 'you';
  // Nobody can play nor draw: whoever holds fewer cards goes out.
  if (!game.winner && !game.stock.length && !game.you.some((card) => playable(game, card)) && !game.her.some((card) => playable(game, card))) {
    game.winner = game.you.length <= game.her.length ? 'you' : 'her';
  }
  return move;
}

/** A card's name as she says it: "the eight of hearts", "the queen of spades". */
export function cardName(card: Card): string {
  return `the ${RANK_NAMES[card.rank - 1]} of ${card.suit}`;
}

/** A card's corner: its rank's letter or number. */
export function rankMark(card: Card): string {
  return RANK_MARKS[card.rank - 1] ?? String(card.rank);
}

const RANK_NAMES = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
const RANK_MARKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function lay(game: CardsGame, card: Card, suit: Suit): void {
  game.top = card;
  game.suit = suit;
}

/** The stock's next card (when it is out, the pile is not shuffled back: the game ends soon enough). */
function draw(game: CardsGame): Card | null {
  return game.stock.shift() ?? null;
}

function mostHeld(hand: readonly Card[]): Suit {
  let best: Suit = 'hearts';
  let most = -1;
  for (const suit of SUITS) {
    const n = hand.filter((card) => card.suit === suit).length;
    if (n > most) [best, most] = [suit, n];
  }
  return best;
}
