import { offsetTiesOf, tieOffset } from './life/lifeStore';
import { everyone, findPerson } from './people';
import { GOSSIP, TRAITS } from './socialPlan';
import type { PersonId } from './types';

/*
 * The grapevine (docs/social.md "The web"): what the player does to one person reaches those tied to them.
 * A friend of theirs warms (or cools) with them, an enemy of theirs the other way. Pure: `standing.nudge` applies it.
 * The ties are the cards' (either card's counts) plus what the player's gatherings added (`life/lifeStore`).
 */

/** Every tie of `id`'s, -1..1: the cards' and the gatherings' together. */
function tieMap(id: PersonId): Map<PersonId, number> {
  const card = findPerson(id);
  const ties = new Map<PersonId, number>(Object.entries(card?.ties ?? {}));
  for (const other of everyone()) {
    const back = other.ties?.[id];
    if (back !== undefined && !ties.has(other.id)) ties.set(other.id, back);
  }
  for (const [other, offset] of offsetTiesOf(id)) ties.set(other, Math.max(-1, Math.min(1, (ties.get(other) ?? 0) + offset)));
  return ties;
}

/** How `a` and `b` stand with each other, -1..1 (0: they don't know each other). */
export function tieBetween(a: PersonId, b: PersonId): number {
  const card = findPerson(a)?.ties?.[b] ?? findPerson(b)?.ties?.[a] ?? 0;
  return Math.max(-1, Math.min(1, card + tieOffset(a, b)));
}

/** Who hears of a warmth change of `delta` with `id`, and by how much it moves them: one step out, no further. */
export function grapevine(id: PersonId, delta: number): { id: PersonId; warmth: number }[] {
  const card = findPerson(id);
  if (!card || delta === 0) return [];
  // A gossip tells everyone.
  const loud = Math.max(1, ...card.traits.map((t) => TRAITS[t].gossipOut ?? 1));
  const out: { id: PersonId; warmth: number }[] = [];
  for (const [other, tie] of tieMap(id)) {
    if (!findPerson(other)) continue;
    const warmth = Math.round(delta * tie * GOSSIP.share * loud);
    if (Math.abs(warmth) >= GOSSIP.min) out.push({ id: other, warmth });
  }
  return out;
}

/** Those `id` is tied to, warmest first (for the book's little web and for "gossip about…"). */
export function tiesOf(id: PersonId): { id: PersonId; tie: number }[] {
  return [...tieMap(id)].filter(([other]) => findPerson(other)).map(([other, tie]) => ({ id: other, tie })).sort((a, b) => b.tie - a.tie);
}
