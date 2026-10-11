import { KEYS, PersistedStore } from '@/persistence';

/*
 * The claw's plush as gifts (docs/social.md "Gifts"): a bunny won at the arcade can be given to someone who loves one
 * (Nico, Nadia). The prize store keeps every prize taken home and has no way to give one away, so what was given is
 * kept here, by prize id: the plush left to give is what was won less what was given.
 */

const store = new PersistedStore<Record<string, number>>({
  key: KEYS.plushGiven,
  version: 1,
  defaults: () => ({}),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(data)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
    return out;
  },
});
let given: Record<string, number> = store.load();

/** What the prize shelf holds, as far as giving goes: every prize's id and kind, in the order taken home. */
interface PlushSource {
  readonly owned: readonly { id: string }[];
  isPlush(id: string): boolean;
}

/** The plush prize ids still to give: one entry per bunny won and not given away yet. */
function giveable(source: PlushSource): string[] {
  const left = new Map<string, number>();
  for (const p of source.owned) if (source.isPlush(p.id)) left.set(p.id, (left.get(p.id) ?? 0) + 1);
  const out: string[] = [];
  for (const [id, n] of left) for (let i = given[id] ?? 0; i < n; i++) out.push(id);
  return out;
}

/** How many of the claw's bunnies are there to give. */
export function plushToGive(source: PlushSource): number {
  return giveable(source).length;
}

/** One bunny given away (the first left); false when there is none to give. */
export function givePlush(source: PlushSource): boolean {
  const id = giveable(source)[0];
  if (!id) return false;
  given = { ...given, [id]: (given[id] ?? 0) + 1 };
  store.save(given);
  return true;
}
