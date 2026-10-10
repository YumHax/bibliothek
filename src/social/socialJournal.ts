import { KEYS, PersistedStore } from '@/persistence';
import { findPerson, shortName } from './people';
import { DIGEST } from './socialPlan';
import { allStandings, onSocial } from './standing';
import { tierChangeLine, tierRank } from './tiers';
import type { PersonId } from './types';

/*
 * What the journal says of people (docs/social.md "The journal"): a line the day someone is met or a tier is crossed,
 * and every `DIGEST.everyDays` game days a digest of the week: who grew closer, who cooled, who was met. The
 * warmth a week ago is kept under `KEYS.socialDigest` to compare with.
 */

/** The journal as this writes to it. */
interface JournalLike {
  note(kind: string, text: string, options?: { weight?: 'headline' | 'line' | 'note'; data?: Readonly<Record<string, string | number | boolean>> }): void;
}

interface DigestSave {
  /** The game day the snapshot was taken. */
  day: number;
  /** Warmth by person then; absent: not met then. */
  warmth: Record<PersonId, number>;
}

/** Writes the social lines into `journal` from now on: meetings and tier changes as they happen, the week's digest on new game days. */
export function watchSocialJournal(journal: JournalLike, today: { readonly gameDay: number; onNewGameDay(cb: (day: number) => void): () => void }): void {
  const store = new PersistedStore<DigestSave>({
    key: KEYS.socialDigest,
    version: 1,
    defaults: () => ({ day: today.gameDay, warmth: snapshot() }),
    read: (data) => {
      const d = data as Partial<DigestSave> | null;
      return d && typeof d.day === 'number' && d.warmth && typeof d.warmth === 'object' ? { day: d.day, warmth: d.warmth } : null;
    },
  });
  let digest = store.load();
  if (!store.exists) store.save(digest);
  onSocial((change) => {
    const card = findPerson(change.id);
    if (!card) return;
    if (change.why === 'met') {
      journal.note('social', `Met ${card.name}, ${card.role}`, { weight: 'note', data: { who: card.id } });
      return;
    }
    if (change.before === change.after || change.why === 'debug') return;
    const down = tierRank(change.after) < tierRank(change.before);
    // A tier that does something (friendly and up) is set large; the small moves and the cooling are the ordinary hand.
    const weight = !down && tierRank(change.after) >= tierRank('friendly') ? 'headline' : 'line';
    journal.note('social', `${tierChangeLine(shortName(change.id), change.before, change.after)}${down && change.heard ? ' (word got round)' : ''}`, { weight, data: { who: change.id } });
  });
  const weekly = (day: number): void => {
    if (day - digest.day < DIGEST.everyDays) return;
    const text = summary(digest.warmth);
    if (text) journal.note('social', text, { weight: 'note' });
    digest = { day, warmth: snapshot() };
    store.save(digest);
  };
  weekly(today.gameDay);
  today.onNewGameDay(weekly);
}

/** Everyone met, by warmth now. */
function snapshot(): Record<PersonId, number> {
  const out: Record<PersonId, number> = {};
  for (const [id, s] of Object.entries(allStandings())) if (s.met !== null) out[id] = s.warmth;
  return out;
}

/** The week's digest, one short line: closer, cooler, newly met (first names only); empty when nothing notable happened. */
function summary(before: Record<PersonId, number>): string {
  const closer: string[] = [];
  const cooler: string[] = [];
  const met: string[] = [];
  for (const [id, s] of Object.entries(allStandings())) {
    if (s.met === null || !findPerson(id)) continue;
    const was = before[id];
    if (was === undefined) {
      met.push(shortName(id));
      continue;
    }
    const moved = s.warmth - was;
    if (moved >= DIGEST.notable) closer.push(shortName(id));
    else if (moved <= -DIGEST.notable) cooler.push(shortName(id));
  }
  const parts = [closer.length ? `closer to ${list(closer)}` : '', cooler.length ? `cooler with ${list(cooler)}` : '', met.length ? `met ${list(met)}` : ''].filter(Boolean);
  return parts.length ? `People this week: ${parts.join('; ')}` : '';
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
