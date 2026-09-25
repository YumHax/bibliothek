import { seededRandom } from '@/covers/generated/canvasUtils';
import { themeOf } from '@/economy/marketDays';
import { ARCADE_GAMES, type ArcadeGameId } from '../arcade/games';
import type { MailPiece } from '../props/MailDrop';

/** What the flyers can advertise, read-only: today's arcade challenge, today's market stock (if drawn yet); tomorrow's market theme comes from the calendar. */
export interface MailSources {
  arcadeDaily?: { challenge(): { gameId: string; target: number; reward: number; done: boolean } };
  market?: { peekToday(): readonly { readonly game: { readonly title: string }; readonly price: number; readonly priced: boolean; readonly source: string }[] | null };
}

/** Whatever the day, one of these can come through the door. */
const EVERYDAY: MailPiece[] = [
  { title: 'PIZZA NAPOLI', lines: ['2 for 1 on Tuesdays', 'Free delivery on the block', 'Round the corner, open late'], accent: 0x2f7a3a },
  { title: 'WE BUY GAMES', lines: ['Old cartridges, boxed or loose', 'The desk at the flea market', 'Cash paid on the spot'], accent: 0x6b2f2a },
  { title: 'CAT SITTER', lines: ['Away for the weekend?', 'Feeding, cuddles, litter', 'Ask Mme Duval, 3rd floor'], accent: 0x2f6b8f },
  { title: 'RESIDENTS', lines: ['The lift is serviced on Monday', 'Bins go out Tuesday night', 'The management'], accent: 0x55565a },
];

/** Share of homecomings that find nothing, one flyer, or two, drawn per in-game day. */
const NONE = 0.3;
const ONE = 0.75;

/**
 * The flyers waiting on the mat when the player comes home on `day` (an in-game day, from the
 * market calendar): none, one or two, drawn from `day` so a day's mail is the same whenever it is
 * found. The arcade's challenge (while unbeaten) and a copy on the market's stalls come first when
 * there is one; the rest is the neighbourhood's usual paper.
 */
export function mailFor(day: number, sources: MailSources): MailPiece[] {
  const random = seededRandom(day * 7349 + 13);
  const roll = random();
  const count = roll < NONE ? 0 : roll < ONE ? 1 : 2;
  if (!count) return [];
  const topical = [challengeFlyer(sources), tomorrowFlyer(day), dealFlyer(sources, random)].filter((p): p is MailPiece => p !== null);
  const everyday = [...EVERYDAY].sort(() => random() - 0.5);
  return [...topical, ...everyday].slice(0, count).map((piece, i) => ({ ...piece, seed: day * 3 + i }));
}

function challengeFlyer({ arcadeDaily }: MailSources): MailPiece | null {
  const challenge = arcadeDaily?.challenge();
  if (!challenge || challenge.done) return null;
  const game = ARCADE_GAMES[challenge.gameId as ArcadeGameId]?.({}).title ?? challenge.gameId.toUpperCase();
  return { title: 'DAILY CHALLENGE', lines: [game, `Score ${challenge.target.toLocaleString('en')}`, `+${challenge.reward} tickets at the arcade`], accent: 0x7a2e8f };
}

/** Tomorrow's market, when it is one of the special days (the ordinary ones are not worth the paper). */
function tomorrowFlyer(day: number): MailPiece | null {
  const theme = themeOf(day + 1);
  if (theme.kind === 'ordinary') return null;
  return { title: theme.title, lines: ['Tomorrow at the flea market', theme.blurb, 'Out the front door, see you there'], accent: 0xc9a552 };
}

function dealFlyer({ market }: MailSources, random: () => number): MailPiece | null {
  const stock = market?.peekToday()?.filter((item) => item.priced && item.source !== 'bin');
  if (!stock?.length) return null;
  const item = stock[Math.floor(random() * stock.length)]!;
  return { title: 'FLEA MARKET', lines: ['Spotted on a stall today:', item.game.title, `${item.price} coins, while it lasts`], accent: 0xc8443a };
}
