import type { OpeningKind } from '@/social/conversation';
import { markMood } from '@/social/mood';
import { everyone, findPerson, shortName } from '@/social/people';
import { TIERS } from '@/social/socialPlan';
import { allStandings, setStanding } from '@/social/standing';
import { onTalkEnd, talkingWith } from '@/social/talkState';
import type { PersonId } from '@/social/types';

/*
 * The social lab (`?debug`'s panel, its Social lab tab; `?social-lab` opens it at boot; docs/checks.md "Debug
 * mode"): every state of a relationship and of a conversation on demand, acting on one person (the one last talked
 * to, or picked here): their tier, their mood and its cause, the conversation opened each way and each outcome
 * played, their tier's scene, the text at its largest and the motion reduced. The conversation panel and the tier
 * scenes register what they can play (`registerLabConversation`, `registerLabScenes`): until they do, their buttons
 * say they are not wired.
 */

/** An outcome the conversation panel can play on demand, as if a choice had led to it. */
export type LabState = 'loves' | 'likes' | 'meh' | 'dislikes' | 'remembered' | 'fact' | 'promise' | 'tierUp' | 'leaving';

/** What the conversation panel lends the lab. */
interface LabConversation {
  /** Opens a conversation with `person` (wherever the player is: a voice when no body is near) as if it opened `kind`. False when it cannot. */
  open(person: PersonId, kind: OpeningKind): boolean;
  /** Plays `state` in the conversation open now (opening one with `person` first when none is). False when it cannot. */
  play(person: PersonId, state: LabState): boolean;
}

/** What the tier scenes lend the lab. */
interface LabScenes {
  /** Stages `person`'s scene of their tier now (or of `tier`). False when there is none to stage. */
  tierScene(person: PersonId): boolean;
}

let conversation: LabConversation | null = null;
let scenes: LabScenes | null = null;

/** The conversation panel's side of the lab (`ui/social/ConversationPanel`, under `?debug` only). */
export function registerLabConversation(hooks: LabConversation): void {
  conversation = hooks;
}

/** The tier scenes' side of the lab (`social/scenes`, under `?debug` only). */
export function registerLabScenes(hooks: LabScenes): void {
  scenes = hooks;
}

/** One button of the lab: what it says, what it does (its result in words for the panel's status line). */
export interface LabEvent {
  label: string;
  run(): string;
}

/** The lab's buttons, by group. */
export interface LabGroup {
  label: string;
  events: readonly LabEvent[];
}

/** What the lab needs of the game. */
interface LabDeps {
  day(): number;
  /** The text size and the motion (the player's settings). */
  settings: { readonly settings: { readonly uiScale: string; readonly reduceMotion: string }; update(patch: { uiScale?: 'normal' | 'largest'; reduceMotion?: 'system' | 'reduce' }): void };
}

const OPENINGS: readonly OpeningKind[] = ['intro', 'hello', 'twice', 'outfit', 'mood', 'memory', 'held', 'birthday', 'cold', 'hostile'];
const STATES: readonly { state: LabState; label: string }[] = [
  { state: 'loves', label: 'They love it' },
  { state: 'likes', label: 'They like it' },
  { state: 'meh', label: 'Polite, no more' },
  { state: 'dislikes', label: 'They don’t like it' },
  { state: 'remembered', label: '“They’ll remember that”' },
  { state: 'fact', label: 'A fact flies to the book' },
  { state: 'promise', label: 'A promise ticket' },
  { state: 'tierUp', label: 'A tier up in the card' },
  { state: 'leaving', label: 'They have to go' },
];

let target: PersonId | null = null;
let tracking = false;

/** Who the lab acts on: picked here, else the one being talked to, else the last talked to, else the first met. */
export function labTarget(): PersonId | null {
  if (!tracking) {
    tracking = true;
    onTalkEnd((id) => (target = id));
  }
  const now = talkingWith();
  if (now) target = now;
  if (target && findPerson(target)) return target;
  const met = Object.entries(allStandings()).find(([, s]) => s.met !== null)?.[0];
  return met ?? everyone()[0]?.id ?? null;
}

/** Picks the next (or previous) person of the cast for the lab. */
function cycle(step: 1 | -1): string {
  const cast = everyone();
  const at = cast.findIndex((p) => p.id === labTarget());
  target = cast[(at + step + cast.length) % cast.length]?.id ?? null;
  return target ? `Now acting on ${shortName(target)}` : 'Nobody in the cast';
}

/** The lab's buttons, for the person `labTarget()` names when each is pressed. */
export function socialLabGroups(deps: LabDeps): LabGroup[] {
  const on = (fn: (id: PersonId) => string): (() => string) => () => {
    const id = labTarget();
    return id ? fn(id) : 'Nobody to act on';
  };
  const unwired = (what: string): string => `${what}: not wired yet (it registers itself with cheats/socialLab)`;
  return [
    {
      label: 'Who',
      events: [
        { label: '‹ Previous person', run: () => cycle(-1) },
        { label: 'Next person ›', run: () => cycle(1) },
      ],
    },
    {
      label: 'Their tier',
      events: TIERS.map((t) => ({
        label: t.name,
        run: on((id) => {
          setStanding(id, t.from + 1, t.trust, deps.day(), true);
          return `${shortName(id)} is ${t.name} now (warmth ${t.from + 1}, trust ${t.trust})`;
        }),
      })),
    },
    {
      label: 'Their mood today',
      events: (
        [
          ['In a good mood', 1, 'the lab cheered them up'],
          ['Feeling low', -1, 'the lab got them down'],
          ['Annoyed', -2, 'the lab annoyed them'],
        ] as const
      ).map(([label, steps, why]) => ({
        label,
        run: on((id) => {
          markMood(id, deps.day(), steps, why);
          return `${shortName(id)}: ${label.toLowerCase()} (${why})`;
        }),
      })),
    },
    {
      label: 'Open the conversation',
      events: OPENINGS.map((kind) => ({ label: `Opening: ${kind}`, run: on((id) => (conversation ? (conversation.open(id, kind) ? `Talking to ${shortName(id)} (${kind})` : `Cannot open a conversation with ${shortName(id)} here`) : unwired('The conversation'))) })),
    },
    {
      label: 'In the conversation',
      events: STATES.map(({ state, label }) => ({ label, run: on((id) => (conversation ? (conversation.play(id, state) ? `${label}: played` : `${label}: nothing to play it in`) : unwired('The conversation'))) })),
    },
    {
      label: 'Their scene',
      events: [{ label: 'Their tier’s scene now', run: on((id) => (scenes ? (scenes.tierScene(id) ? `${shortName(id)}’s scene` : `${shortName(id)} has no scene at this tier`) : unwired('The tier scenes'))) }],
    },
    {
      label: 'The screen',
      events: [
        {
          label: 'Text at its largest / back',
          run: () => {
            const big = deps.settings.settings.uiScale === 'largest';
            deps.settings.update({ uiScale: big ? 'normal' : 'largest' });
            return big ? 'Text size back to normal' : 'Text at its largest';
          },
        },
        {
          label: 'Reduced motion / back',
          run: () => {
            const reduced = deps.settings.settings.reduceMotion === 'reduce';
            deps.settings.update({ reduceMotion: reduced ? 'system' : 'reduce' });
            return reduced ? 'Motion as the system says' : 'Motion reduced';
          },
        },
      ],
    },
  ];
}
