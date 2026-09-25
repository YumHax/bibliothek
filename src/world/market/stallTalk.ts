import type { StockItem } from '@/economy/StockItem';
import type { SaleReaction } from '@/game/SessionActions';

/** What a stallholder knows when asked: their table right now, and the hour. */
export interface StallState {
  /** Platform name, as on the sign. */
  platform: string;
  /** What is still on the table (not in the player's hand). */
  items: readonly StockItem[];
  /** Copies sold off this table this visit. */
  sold: number;
  night: boolean;
  /** Whether a game is on the player's wishlist. */
  isWanted(id: string): boolean;
  /** How the stallholder knows the player: '' for a stranger, 'Regular', 'Friend'... */
  loyalty?: string;
  /** Today's market day, in capitals ("NINTENDO FAIR"), when it is a special one. */
  theme?: string;
  /** What the stallholder has heard about the days ahead (a grail coming, the Brocante, a sale): `rumours.stallRumour` lines. */
  news?: readonly string[];
}

/** Lines that fit any stall, any day; mixed in with the ones about the table. */
const GENERAL = [
  "Everything's tested. Well, most of it.",
  'The whole crate came from a house clearance.',
  'Bought half of these new in the nineties. Never finished them.',
  'Pick one up and make me an offer. H, like "haggle".',
  "Short today? R and I'll hold it for you, small deposit.",
  "Got something to swap? X, and let's see what you've brought.",
  'Always open the box before you pay. Always. You never know.',
];

/**
 * What a stallholder says in a bubble when the player handles their stock: a word or two, short
 * enough to read over their head.
 */
export const REACTIONS: Record<SaleReaction, readonly string[]> = {
  pickUp: ['Good eye!', 'Careful now!', 'Nice one, that.', 'Ooh, a classic.', 'Go on, look inside.'],
  putBack: ['No?', 'Suit yourself.', 'Next time!', 'Hmm.'],
  bought: ['Sold!', 'Cheers!', 'Enjoy it!', 'Pleasure!'],
  hold: ['Under the table!', "It's yours. Later."],
  haggleWon: ['Deal!', 'You win.', 'Robbery!'],
  haggleLost: ['Tag price!', 'No more.', 'Hmph.'],
  haggleStopped: ['Think on it.', 'Offer stands.'],
  insult: ['Cheeky!', 'Oi!', 'Really?!'],
  caught: ['Ah. Busted.', 'Not my fault!', 'Oops.'],
  locked: ['Hands off!', 'Collectors only.'],
};

/** What stallholders cry out to passers-by, one in a bubble now and then. */
export function callOuts(platform: string): string[] {
  return [`${platform}! All tested!`, 'Everything must go!', 'Bargains here!', 'Make me an offer!', `Best ${platform} in town!`, 'New crate today!'];
}

/**
 * What a stallholder says about their own table, one line per click in turn: the pride of the
 * stall and its price, the cheapest thing on it, a missing manual, a wishlist game the player has
 * been after, a sale just made, how the day is going. Pure: the builder passes the state.
 */
export function stallLines(state: StallState): string[] {
  const { items, platform } = state;
  if (!items.length) {
    return [
      state.sold ? 'Cleaned out! Pleasure doing business with you.' : 'Nothing left today, sorry.',
      "Come back tomorrow, there's a new crate every morning.",
    ];
  }
  const lines: string[] = [];
  const ordered = items.find((item) => item.source === 'ordered');
  if (ordered) lines.push(`Your ${ordered.game.title} came in! ${ordered.due} coins to settle, it's right here.`);
  const held = items.find((item) => item.deposit > 0 && item.source !== 'ordered');
  if (held) lines.push(`${held.game.title} is under the table for you. ${held.due} coins when you're ready.`);
  const upgrade = items.find((item) => item.source === 'upgrade');
  if (upgrade) lines.push(`You've got ${upgrade.game.title}, haven't you? This one's a first print. I'll take yours in part exchange.`);
  const kept = items.find((item) => item.source === 'keptAside');
  if (kept) lines.push(`I kept ${kept.game.title} aside for you. Didn't even put it out.`);
  const grail = items.find((item) => item.source === 'grail');
  if (grail) lines.push(`Yes, that's a real ${grail.game.title}. ${grail.price} coins, and I'm not budging much. You won't see another.`);
  const sale = items.find((item) => item.sale < 1);
  if (sale) lines.push(`Clearing out, everything's ${Math.round((1 - sale.sale) * 100)}% off. No haggling, the prices are already slashed.`);
  if (state.loyalty) lines.push(state.loyalty === 'Regular' ? 'Good to see you again!' : `There's my ${state.loyalty === 'Friend' ? 'friend' : 'best customer'}! What'll it be?`);
  if (state.theme) lines.push(`${state.theme.charAt(0)}${state.theme.slice(1).toLowerCase()} today. Busy, busy.`);
  if (state.news) lines.push(...state.news);
  if (state.night) lines.push("Quiet tonight. Take your time, I'm packing up slowly.");
  if (state.sold) lines.push(state.sold > 1 ? `${state.sold} gone already, you're my best customer.` : 'Good choice earlier. Anything else take your fancy?');

  const wanted = items.find((item) => state.isWanted(item.game.id));
  if (wanted) lines.push(`You've been looking for ${wanted.game.title}, haven't you? Word gets round.`);

  const priced = items.filter((item) => item.priced);
  const showpiece = items.find((item) => item.source === 'showpiece');
  const dearest = priced.reduce<StockItem | null>((best, item) => (!best || item.price > best.price ? item : best), null);
  const pride = showpiece ?? dearest;
  if (pride) lines.push(pride.priced ? `${pride.game.title}? Pride of the stall. ${pride.price} coins and worth every one.` : `${pride.game.title}? Still working out what that one's worth.`);

  const cheapest = priced.reduce<StockItem | null>((best, item) => (!best || item.price < best.price ? item : best), null);
  if (cheapest && cheapest !== pride) lines.push(`Short of coins? ${cheapest.game.title} is only ${cheapest.price}.`);

  const noManual = items.find((item) => item.condition === 'noManual');
  const worn = items.find((item) => item.condition === 'worn');
  if (noManual) lines.push(`Manual's missing on ${noManual.game.title}, hence the price.`);
  else if (!worn) lines.push('Every one of these has its manual. I check.');
  if (worn) lines.push(`${worn.game.title} has seen some life. Plays fine though.`);

  const consigned = items.find((item) => item.source === 'consigned');
  if (consigned) lines.push(`${consigned.game.title} came in from the WE BUY desk. Look familiar?`);

  lines.push(`${items.length} ${platform} game${items.length > 1 ? 's' : ''} on the table today.`);
  return [...lines, ...GENERAL];
}
