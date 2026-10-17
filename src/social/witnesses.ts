import { onInteraction } from './conversation';
import { tieBetween } from './gossip';
import { findPerson, shortName } from './people';
import { presentNear } from './presence';
import { isMet, nudge } from './standing';
import type { PersonId, SocialPlace } from './types';

/*
 * Witnesses (docs/social.md "Witnesses"): what the player does in public is seen by the people around, with their
 * real bodies a few metres off (`presence`). They show it on the spot (a turn of the head, a look; one leans to a
 * neighbour to whisper) and take it by how they stand with whoever it was done to: a friend of theirs insulted cools
 * them, an enemy of theirs stood up for cools them too. Whoever whispers (a gossip, else the nearest) tells their own
 * ties, by name ("heard about it from Mrs Dubois"). In private (their flat, the player's, the phone) nobody sees.
 */

/** What the player was seen doing to someone. */
type WitnessAct = 'insult' | 'gift' | 'defend' | 'attack' | 'promise';

/** Where people see what the player does: the stairs and the town; never someone's flat or a phone call. */
const PUBLIC: ReadonlySet<SocialPlace> = new Set<SocialPlace>(['stairs', 'courtyard', 'street', 'shop', 'market', 'arcade', 'saleroom']);

/**
 * How far a deed is seen (metres), and what it moves in a witness: `base` for anyone (nobody likes seeing an insult),
 * `tie` × their tie to the one it was done to (-1..1), rounded; under a point it moves nothing.
 */
const WITNESS = {
  radius: 8,
  acts: {
    insult: { base: -3, tie: -6, why: 'saw you insult {name}' },
    gift: { base: 0, tie: 3, why: 'saw you give {name} a present' },
    defend: { base: 1, tie: 6, why: 'saw you stand up for {name}' },
    attack: { base: -1, tie: -6, why: 'saw you side against {name}' },
    promise: { base: 1, tie: 2, why: 'saw you keep your word to {name}' },
  } satisfies Record<WitnessAct, { base: number; tie: number; why: string }>,
} as const;

/** What witnesses need of the game: where the player stands now (world space), or null (no player, a cutscene). */
interface WitnessDeps {
  player(): { x: number; y: number; z: number } | null;
}

let deps: WitnessDeps | null = null;

/** Starts the witnesses: an insult or a gift in a conversation is seen by whoever is around. Call once at start-up. */
export function startWitnesses(d: WitnessDeps): void {
  deps = d;
  onInteraction((id, interaction, outcome, ctx) => {
    if (interaction === 'insult') witnessed(id, 'insult', ctx.place, ctx.day);
    else if ((interaction === 'giveGift' || interaction === 'giveGame') && outcome.ok) witnessed(id, 'gift', ctx.place, ctx.day);
  });
}

/**
 * The player did `act` to `subject` at `place` on `day`: in public, whoever is around sees it, shows it, takes it by
 * their tie to `subject`, and the one who whispers tells their own ties. Returns who saw it.
 */
export function witnessed(subject: PersonId, act: WitnessAct, place: SocialPlace, day: number): PersonId[] {
  const at = deps?.player();
  if (!at || !PUBLIC.has(place)) return [];
  const seen = presentNear(at, WITNESS.radius).filter((w) => w.id !== subject && isMet(w.id) && findPerson(w.id));
  if (!seen.length) return [];
  const rule = WITNESS.acts[act];
  // A gossip whispers first; else the nearest does.
  const whisperer = seen.find((w) => findPerson(w.id)?.traits.includes('gossip'))?.id ?? seen[0]!.id;
  for (const w of seen) {
    const whisper = w.id === whisperer;
    w.body.notice?.(at, whisper);
    const warmth = Math.round(rule.base + rule.tie * tieBetween(w.id, subject));
    if (Math.abs(warmth) < 1) continue;
    nudge(w.id, { warmth, why: rule.why.replace('{name}', shortName(subject)), day, reason: `saw:${act}:${subject}`, gossip: whisper });
  }
  return seen.map((w) => w.id);
}
