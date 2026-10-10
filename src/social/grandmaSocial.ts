import type { GrandmaEvent } from '@/grandma/GrandmaVisits';
import type { Upcoming } from '@/journal';
import { isAuctionDay } from '@/economy/AuctionHouse';
import { random } from '@/random';
import { inHours } from '@/time/clock';
import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';
import { MEME_ID } from './people/family';
import { phoneRefusal } from './phoneHours';
import { countedToday, nudge } from './standing';

/*
 * MÉMÉ IN THE SOCIAL LAYER (docs/social.md "Mémé"): what her visits, Sunday lunches, the gifts brought and the album's
 * memories do to her standing (heard from `GrandmaVisits.subscribe`), what she says when the phone rings at her end,
 * and the journal's lines about her. Family: only ever warmer (`PersonCard.family`).
 */

/** What each thing done for her is worth: warmth, trust, the chip's words, what she remembers (null: nothing kept). */
const DEEDS = {
  visit: { warmth: 4, trust: 1, why: 'glad you came', memory: null },
  sunday: { warmth: 5, trust: 3, why: 'loved having you for lunch', memory: 'Sunday lunch together' },
  cake: { warmth: 6, trust: 1, why: 'loved the cake', memory: 'you brought her a cake' },
  flowers: { warmth: 6, trust: 1, why: 'loved the flowers', memory: 'you brought her flowers' },
  game: { warmth: 5, trust: 2, why: 'touched you thought of her', memory: 'you showed her one of your games' },
  memory: { warmth: 6, trust: 4, why: 'went through the album with you', memory: null },
  call: { warmth: 2, trust: 1, why: 'happy you rang', memory: null },
  scarf: { warmth: 3, trust: 0, why: 'beamed at her scarf on you', memory: null },
} as const;

/** When she still picks up after her bedtime, in her nightie (game hours; an early bird's own end at 21:00, `phoneHours`). */
const NIGHTIE: [number, number] = [21, 23];

/** What she says when she picks up, by moment. */
const CALL = {
  photos: 'Is that you? I found more photos in the cupboard. Come and look, they’re on the table.',
  saturday: 'Come for lunch tomorrow, I’m doing a blanquette. Noon, not one minute after.',
  sunday: 'It’s Sunday, I’ve laid your place. Don’t make me eat alone.',
  nightie: 'Mémé picks up on the fifth ring: “It’s late, dear, I’m in my nightie. Ring me tomorrow.”',
  smallTalk: [
    'Hello? Oh, it’s you! I was just watching my programme.',
    'You rang! Nobody rings any more. Gaspard sends messages.',
    'Hello, hello! Are you eating properly?',
    'There you are. The bus driver asked after you, you know.',
  ],
} as const;

/**
 * Hears her visits, gifts and memories and warms her to the player, each kind once a game day (a memory once for
 * good). `title(id)` names a memory for what she keeps of it; `scarf()` says whether the player wears the scarf she
 * knitted (`household/outfits` memeScarf), which she beams at once a day.
 */
export function watchGrandma(grandma: { subscribe(listener: (event: GrandmaEvent) => void): () => void }, at: { day: () => number; title: (id: string) => string | null; scarf: () => boolean }): () => void {
  const { day, title } = at;
  return grandma.subscribe((event) => {
    const today = day();
    if (event.kind === 'visit') {
      const deed = event.sunday ? DEEDS.sunday : DEEDS.visit;
      nudge(MEME_ID, { warmth: deed.warmth, trust: deed.trust, why: deed.why, reason: event.sunday ? 'sundayLunch' : 'visit', day: today, ...(deed.memory ? { memory: deed.memory } : {}) });
      if (at.scarf()) nudge(MEME_ID, { warmth: DEEDS.scarf.warmth, why: DEEDS.scarf.why, reason: 'scarf', day: today });
    } else if (event.kind === 'gift') {
      const deed = DEEDS[event.gift];
      nudge(MEME_ID, { warmth: deed.warmth, trust: deed.trust, why: deed.why, reason: `gift-${event.gift}`, day: today, memory: deed.memory });
    } else {
      const named = title(event.id);
      const deed = DEEDS.memory;
      nudge(MEME_ID, { warmth: deed.warmth, trust: deed.trust, why: deed.why, reason: `memory-${event.id}`, day: today, ...(named ? { memory: `you looked at “${named}” in her album together`, memoryWeight: 12 } : {}) });
    }
  });
}

/** What a ring at hers does now: `refused` (the phone's line, she does not come on) or her first words, the call counted. */
export function callGrandma(at: { day: number; hour: number; photos: boolean }): { refused: string } | { opening: string } {
  const refusal = phoneRefusal(MEME_ID, at.hour);
  if (refusal !== null) return { refused: inHours(at.hour, NIGHTIE) ? CALL.nightie : refusal };
  const deed = DEEDS.call;
  nudge(MEME_ID, { warmth: deed.warmth, trust: deed.trust, why: deed.why, reason: 'call', day: at.day });
  const weekday = weekdayOf(at.day);
  if (at.photos) return { opening: CALL.photos };
  if (weekday === SUNDAY_WEEKDAY && at.hour < 15) return { opening: CALL.sunday };
  if (weekday === (SUNDAY_WEEKDAY + 6) % 7) return { opening: CALL.saturday };
  return { opening: CALL.smallTalk[Math.floor(random() * CALL.smallTalk.length)] ?? CALL.smallTalk[0] };
}

/**
 * The journal's lines about her: Sunday lunch from the Friday before until it is eaten (paired with the saleroom's
 * sale, the same Sunday: the bus back drops the player by the market), and the album when she has photos to show.
 */
export function upcomingGrandma(at: { day: number; photos: boolean }): Upcoming[] {
  const lines: Upcoming[] = [];
  const toSunday = (SUNDAY_WEEKDAY - weekdayOf(at.day) + 7) % 7;
  const sunday = at.day + toSunday;
  const lunchDone = toSunday === 0 && countedToday(MEME_ID, 'sundayLunch', at.day);
  if (toSunday <= 2 && !lunchDone) lines.push({ kind: 'social', text: isAuctionDay(sunday) ? 'Sunday lunch at Mémé’s, then the sale' : 'Sunday lunch at Mémé’s', inDays: toSunday });
  if (at.photos) lines.push({ kind: 'social', text: 'Mémé found more photos' });
  return lines;
}
