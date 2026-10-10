import { GRANDMA_DAY, GRANDMA_TALK } from './grandma';
import type { GrandmaGift, GrandmaVisits } from './GrandmaVisits';
import { LineBag } from './lineBag';

/** Her hello's part of the day, by the hour (game hours). */
type Moment = keyof typeof GRANDMA_TALK.hello;

/** What she says on the way in: the lines in turn, and whether she yawns. */
interface Greeting {
  lines: string[];
  yawn: boolean;
}

/** Her part of the day at `hour`. */
export function momentAt(hour: number): Moment {
  const h = ((hour % 24) + 24) % 24;
  if (h < GRANDMA_DAY.table && h >= 5) return 'morning';
  if (h >= 5 && h < GRANDMA_DAY.knit) return 'day';
  if (h >= 5 && h < GRANDMA_DAY.late) return 'evening';
  return 'late';
}

/**
 * WHAT MÉMÉ SAYS (docs/story.md "Mémé"), put together from `GRANDMA_TALK` and her visits: the hello by the hour (or the
 * news she has heard, once each), the Sunday envelope's line, the album when a memory is ready; her chat, which opens
 * up on Gaspard and the sale only once the memories that show them have been seen; her thanks for a gift. Every list is
 * drawn from a shuffled bag, never the same line twice in a row.
 */
export class GrandmaTalk {
  private readonly hellos = new Map<Moment, LineBag>();
  private readonly gifts = new Map<GrandmaGift, LineBag>();
  private readonly chatBag: LineBag;
  /** The last bus mentioned this visit. */
  private busSaid = false;

  constructor(private readonly visits: GrandmaVisits) {
    this.chatBag = new LineBag(() => this.chatLines());
  }

  /** On the way in at `hour`: the first visit's words, the Sunday's, the news or a hello, then the album if a memory waits. */
  greeting(arrival: { first: boolean; envelope: number }, hour: number): Greeting {
    this.busSaid = false;
    const moment = momentAt(hour);
    const lines: string[] = [];
    if (arrival.first) {
      lines.push(GRANDMA_TALK.first);
      if (arrival.envelope) lines.push(GRANDMA_TALK.firstSunday);
      return { lines, yawn: false };
    }
    if (arrival.envelope) lines.push(GRANDMA_TALK.sunday);
    else {
      const news = moment === 'late' ? null : this.visits.tellNews();
      lines.push(news ? GRANDMA_TALK.news[news] : this.hello(moment));
    }
    if (this.visits.due) lines.push(GRANDMA_TALK.albumReady);
    return { lines, yawn: moment === 'late' };
  }

  /** Clicked at `hour`: late, the last bus first (once a visit); else a line of her chat. */
  chat(hour: number): string {
    if (momentAt(hour) === 'late' && !this.busSaid) {
      this.busSaid = true;
      return GRANDMA_TALK.lastBus;
    }
    return this.chatBag.next();
  }

  /** Her thanks for `gift` (`title`: the game shown). */
  thanks(gift: GrandmaGift, title: string): string {
    let bag = this.gifts.get(gift);
    if (!bag) this.gifts.set(gift, (bag = new LineBag(() => GRANDMA_TALK.gift[gift])));
    return bag.next().replace('{title}', title);
  }

  private hello(moment: Moment): string {
    let bag = this.hellos.get(moment);
    if (!bag) this.hellos.set(moment, (bag = new LineBag(() => GRANDMA_TALK.hello[moment])));
    return bag.next();
  }

  /** Every day's lines, those the memories seen allow, and what she has heard of. */
  private chatLines(): string[] {
    const { chat, news } = GRANDMA_TALK;
    const lines: string[] = [...chat.always];
    if (this.visits.hasSeen('row')) lines.push(...chat.row);
    if (this.visits.hasSeen('sale')) lines.push(...chat.sale);
    if (this.visits.hasSeen('keys')) lines.push(...chat.keys);
    for (const heard of this.visits.news().slice(0, 3)) lines.push(news[heard]);
    return lines;
  }
}
