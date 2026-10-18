import { MEMORIES } from '@/grandma/memories';
import type { GrandmaVisits } from '@/grandma/GrandmaVisits';
import type { AlbumFinds } from '@/grandma/AlbumFinds';
import { EPILOGUE_PRINT, PRINT_ROOM, type AlbumPrint, type AlbumPrints } from '@/grandma/albumPrints';
import { FAMILY_SNAPS, MEMORY_NOTES, MEMORY_PENCIL, PRINT_WORDS, SNAPSHOTS } from '@/grandma/snapshots';
import { weekdayOf } from '@/time/wakefulness';
import type { AlbumSlot } from '@/ui/memories/AlbumPanel';
import { familyStill, isFamilyPhoto, snapshotStill } from './albumStills';

/*
 * MÉMÉ'S ALBUM, PAGE BY PAGE (docs/grandma.md "The album's other photos"): Félix's years first, every print in the order
 * of its year (the family's prints always there, the memories and the snapshots in their corners until they turn up),
 * filled out to a whole spread; then the present's spread, the player's prints glued in after his and, in its very last
 * slot, the epilogue's photo once there is one. A slot keeps its place for good: only what is in it changes.
 */

/** Slots on a spread (`AlbumPanel`: two pages of four). */
const PER_SPREAD = 8;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** What the pages read. */
interface SpreadSources {
  visits: GrandmaVisits;
  finds: AlbumFinds | null;
  prints: AlbumPrints | null;
  /** The still a memory left (`MemoryProjector.still`: this session's, else the one kept from an earlier one), or null. */
  still(id: string): string | null;
}

/** An entry of Félix's years with its year, to sort. */
type Dated = { year: number; order: number; slot: () => AlbumSlot };

const blank = (i: number): AlbumSlot => ({ id: `blank-${i}`, kind: 'blank', title: '', state: 'empty', still: null, back: null, lines: [] });

/** Every page of the album now, a whole number of spreads. */
export function albumSlots(src: SpreadSources): AlbumSlot[] {
  const { visits, finds } = src;
  const seen = new Set(visits.seen.map((memory) => memory.id));
  const due = visits.due?.id;
  const dated: Dated[] = [];
  for (const photo of FAMILY_SNAPS) {
    dated.push({
      year: photo.year,
      order: 0,
      slot: () => ({ id: photo.id, kind: 'photo', title: photo.caption, state: 'seen', still: isFamilyPhoto(photo.id) ? familyStill(photo.id) : null, back: photo.back, lines: photo.lines }),
    });
  }
  for (const memory of MEMORIES) {
    const note = MEMORY_NOTES[memory.id];
    dated.push({
      year: note?.year ?? 2026,
      order: 1,
      slot: () => {
        const state = seen.has(memory.id) ? 'seen' : memory.id === due ? 'new' : 'empty';
        if (state === 'empty') return { id: memory.id, kind: 'memory', title: MEMORY_PENCIL[memory.id] ?? '', state, still: null, back: null, lines: [] };
        return { id: memory.id, kind: 'memory', title: memory.title, state, still: src.still(memory.id), back: note?.back ?? null, lines: [memory.againAfter] };
      },
    });
  }
  for (const snap of SNAPSHOTS) {
    dated.push({
      year: snap.year,
      order: 2,
      slot: () => {
        if (!finds?.has(snap.id)) return { id: snap.id, kind: 'photo', title: '', state: 'empty', still: null, back: null, lines: [] };
        return { id: snap.id, kind: 'photo', title: snap.caption, state: finds.isFresh(snap.id) ? 'new' : 'seen', still: snapshotStill(snap.id), back: snap.back, lines: snap.lines };
      },
    });
  }
  dated.sort((a, b) => a.year - b.year || a.order - b.order);
  const slots = dated.map((d) => d.slot());
  while (slots.length % PER_SPREAD) slots.push(blank(slots.length));

  // The present: the player's prints after his, the epilogue's slot last.
  const prints = src.prints?.list() ?? [];
  const players = prints.filter((p) => p.id !== EPILOGUE_PRINT).slice(-PRINT_ROOM);
  const epilogue = prints.find((p) => p.id === EPILOGUE_PRINT);
  for (let i = 0; i < PRINT_ROOM; i++) {
    const print = players[i];
    slots.push(print ? printSlot(print, 'From you', PRINT_WORDS.back) : blank(slots.length));
  }
  slots.push(epilogue ? printSlot(epilogue, 'Your flat', 'The two of us, in his flat. In yours.') : blank(slots.length));
  return slots;
}

/** One of the player's prints (or the epilogue's) as its slot. */
function printSlot(print: AlbumPrint, place: string, line: string): AlbumSlot {
  return {
    id: print.id,
    kind: 'photo',
    title: print.caption,
    state: 'seen',
    still: print.image,
    back: { date: `A ${WEEKDAYS[weekdayOf(print.day)] ?? 'day'}`, place, line },
    lines: [],
  };
}
