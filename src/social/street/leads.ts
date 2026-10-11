import { KEYS, PersistedStore } from '@/persistence';
import { oncePerDay } from '@/time/OncePerDay';

/*
 * A PASSER-BY'S LEAD (docs/social.md "Front Street and the arcade"): now and then somebody stopped in the street says
 * something worth knowing, not the street's usual news: who at the Mansions is clearing out a room, when Victor sets
 * up his suitcase, one of Félix's copies seen on a stall. Each lead is said once (by id), one a game day at most, and
 * goes in the journal (`onLead`, wired in `bootstrap/social`). The leads themselves are the builder's to gather
 * (`furnishStreet`): this only decides when one is said.
 */

/** Something worth knowing: what the passer-by says, and the journal's line for it. */
export interface Lead {
  /** Stable for what it is about (the day in it): said once. */
  id: string;
  says: string;
  note: string;
}

/** Share of the clicks on a passer-by that bring the day's lead, while there is one to give. */
const LEAD_ODDS = 0.3;

/** The most leads remembered (the oldest forgotten first: their days are long past). */
const KEEP = 60;

/** The once-a-day marker of a lead given (`time/OncePerDay`). */
const LEAD_DAY = 'streetLead';

const store = new PersistedStore<{ said: string[] }>({
  key: KEYS.streetLeads,
  version: 1,
  defaults: () => ({ said: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const o = data as { said?: unknown };
    return { said: Array.isArray(o.said) ? o.said.filter((s): s is string => typeof s === 'string').slice(-KEEP) : [] };
  },
});
const said = new Set<string>(store.load().said);
const listeners = new Set<(lead: Lead) => void>();

/**
 * The lead a passer-by says now, if any: one of `leads` not said yet, on a game day none was, by `LEAD_ODDS`
 * (`roll` in 0..1). Said, it is told to the listeners (the journal).
 */
export function passerLead(day: number, leads: readonly (Lead | null)[], roll: number): Lead | null {
  if (oncePerDay.done(LEAD_DAY, day) || roll >= LEAD_ODDS) return null;
  const lead = leads.find((l): l is Lead => l !== null && !said.has(l.id));
  if (!lead) return null;
  said.add(lead.id);
  oncePerDay.mark(LEAD_DAY, day);
  store.save({ said: [...said].slice(-KEEP) });
  for (const cb of listeners) cb(lead);
  return lead;
}

/** Hears every lead said (the journal writes it down). */
export function onLead(cb: (lead: Lead) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
