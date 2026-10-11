import type { RitualEvent } from '@/grandma/GrandmaRituals';
import type { FavourId } from '@/grandma/favours';
import type { Upcoming } from '@/journal';
import { MEME_ID } from './people/family';
import { nudge } from './standing';

/*
 * MÉMÉ'S WAYS IN THE SOCIAL LAYER (docs/grandma.md "Sunday lunch, recipes and favours"): what lunch at her table, a
 * favour done, a dish of her recipe brought back and the occasions kept do to her standing (heard from
 * `GrandmaRituals.subscribe`, each kind once a game day), and the journal's lines about them.
 */

const DEEDS = {
  lunch: { warmth: 4, trust: 2, why: 'loved having you at her table', memory: 'lunch at her table, the blanquette' },
  favour: { warmth: 5, trust: 3, why: 'grateful for the help', memory: 'you helped her with something she couldn’t do' },
  dish: { warmth: 6, trust: 2, why: 'touched you cooked her recipe', memory: 'you cooked her recipe and brought her some' },
  birthday: { warmth: 8, trust: 2, why: 'touched you came on her birthday', memory: 'you came on her birthday' },
  christmas: { warmth: 6, trust: 2, why: 'happy to have you for Christmas', memory: 'Christmas together' },
  allSaints: { warmth: 4, trust: 2, why: 'glad of the company that day', memory: 'you came by on All Saints' },
} as const;

/** Hears her ways and warms her to the player. */
export function watchGrandmaRituals(rituals: { subscribe(listener: (event: RitualEvent) => void): () => void }, day: () => number): () => void {
  return rituals.subscribe((event) => {
    const today = day();
    if (event.kind === 'recipe') return;
    const deed = event.kind === 'occasion' ? DEEDS[event.occasion] : DEEDS[event.kind];
    const reason = event.kind === 'occasion' ? `occasion-${event.occasion}` : `ritual-${event.kind}`;
    nudge(MEME_ID, { warmth: deed.warmth, trust: deed.trust, why: deed.why, reason, day: today, memory: deed.memory });
  });
}

/** The journal's words for the favour she asked. */
const FAVOUR_LINES: Readonly<Record<FavourId, string>> = {
  set: 'Mémé’s set rolls: a thump would do it',
  clock: 'Mémé’s clock has stopped',
  croissant: 'A croissant for Mémé',
  console: 'Félix’s console, to mend for Mémé',
};

/**
 * The journal's lines: the favour she asked while it is open, and Christmas lunch at hers in the days before it (real
 * date, like the street's lights) until it is eaten.
 */
export function upcomingGrandmaRituals(at: { date: Date; favour: FavourId | null; ateToday: boolean }): Upcoming[] {
  const lines: Upcoming[] = [];
  if (at.favour) lines.push({ kind: 'social', text: FAVOUR_LINES[at.favour] });
  const { date } = at;
  if (date.getMonth() === 11 && date.getDate() >= 20 && date.getDate() <= 25) {
    const toEve = Math.max(0, 24 - date.getDate());
    if (!(toEve === 0 && at.ateToday)) lines.push({ kind: 'social', text: 'Christmas lunch at Mémé’s', inDays: toEve });
  }
  return lines;
}
