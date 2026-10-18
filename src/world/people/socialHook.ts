import type { SessionActions } from '@/game/SessionActions';
import type { Reaction as SocialReaction } from '@/social/conversation';
import { socialCaption } from '@/social/caption';
import { moodOf } from '@/social/mood';
import { findPerson } from '@/social/people';
import { isMet, standing } from '@/social/standing';
import type { SocialAnchor, SocialBody, SocialServices, TalkSession } from '@/social/talk';
import { hasWordFor } from '@/social/threads';
import { tierOf, tierRank } from '@/social/tiers';
import type { Fit, Manner, PersonId } from '@/social/types';
import { mannerOf } from '@/social/voices';
import type { FaceKey, GestureName } from './motion/gestures';
import type { SocialAct } from './motion/repertoire';
import { random } from '@/random';

/*
 * How a person in the room becomes someone to talk to (docs/social.md "Talking", "Bodies"): a `Walker` or a `Vendor`
 * given a `SocialHook` shows the social caption ("Mrs Dubois · Friend · talk") and, clicked, opens the conversation
 * instead of saying a line. Their body is the interface: aimed at, they look up with the face of how they stand with
 * the player (`mien`); passing, they greet by it; in the conversation they show what they think of a choice before it
 * is made (`anticipate`) and take what was said in their own measure (`react`). `talkHook` makes one from the builder's
 * `BuildContext.social`.
 */

/** How someone greets the player passing (`mien`), coldest first. */
export type Greeting = 'shun' | 'avoid' | 'glance' | 'nod' | 'wave' | 'waveWarm' | 'callOut';

/** How a known person looks at the player now: the face when aimed at, the greeting when passing, a word to beckon with. */
export interface Mien {
  face: FaceKey;
  /** Null: not met, nothing to greet. */
  greeting: Greeting | null;
  /** What they say greeting (their hello), when they say anything. */
  hello: string | null;
  /** They have a word or a need for the player (`threads.hasWordFor`): they beckon. */
  beckon: boolean;
  /** Their manner (`voices.mannerOf`): how big their face goes before a choice. */
  manner?: Manner | null;
}

/** What a clickable person asks of their conversation. */
export interface SocialHook {
  /** Who they are to the social layer (none: a counter's hook, the kiosk's). */
  readonly person?: PersonId;
  /** The hover caption now. */
  caption(): string;
  /** Clicked: opens the conversation; false to fall back to their line (no social layer in this build). */
  open(session: SessionActions): boolean;
  /** How they look at the player now, from their standing and mood (none: nobody the social layer knows). */
  mien?(): Mien;
}

/** A body that can show what was said to it: a gesture, a feeling on the face, a nod; a social reaction of its own. */
interface Expressive {
  gesture(name: GestureName): void;
  feel?(face: FaceKey, seconds: number): void;
  nod?(): void;
  /** Its own, temperament-aware way (`PersonModel.socialReact`), when it has one. */
  socialReact?(act: SocialAct, strength: number, manner?: Manner): void;
}

/** How each reaction is acted by a body without its own way (a fixed table, every person alike). */
const ACTED: Record<SocialReaction, { gesture?: GestureName; face: FaceKey; nod?: boolean }> = {
  delighted: { face: { smile: 1, browsUp: 0.6 }, nod: true },
  pleased: { face: { smile: 0.9, browsUp: 0.3 }, nod: true },
  laugh: { gesture: 'laugh', face: { smile: 1, squint: 0.6 } },
  thanks: { face: { smile: 1, browsUp: 0.5 }, nod: true },
  nod: { face: { smile: 0.3, smirk: 0.25 }, nod: true },
  bored: { gesture: 'glanceAway', face: { smirk: 0.3 } },
  shrug: { gesture: 'shrug', face: { browsUp: 0.4, smirk: 0.5 } },
  annoyed: { gesture: 'headShake', face: { frown: 0.8, press: 0.6 } },
  hurt: { gesture: 'facepalm', face: { frown: 0.4, sad: 0.9, squint: 0.3 } },
  restless: { gesture: 'checkWatch', face: { browsUp: 0.3, press: 0.4 } },
  bye: { gesture: 'wave', face: { smile: 0.6 } },
};

/** Acts `reaction` on `body` (`strength` 0..1): its own way when it has one, else the table. */
function actReaction(body: Expressive, reaction: SocialReaction, strength = 0.6, manner?: Manner | null): void {
  if (body.socialReact) {
    body.socialReact(reaction, strength, manner ?? undefined);
    return;
  }
  const act = ACTED[reaction];
  if (act.gesture) body.gesture(act.gesture);
  body.feel?.(act.face, 1.5 + strength);
  if (act.nod) body.nod?.();
}

/** The face of someone at `rank` (`tierRank`) in `mood`, looking at the player. */
function faceOf(rank: number, mood: 'good' | 'fine' | 'low' | 'annoyed'): FaceKey {
  const face: FaceKey =
    rank >= tierRank('friend') ? { smile: 0.7, browsUp: 0.25 }
    : rank >= tierRank('friendly') ? { smile: 0.5, browsUp: 0.1 }
    : rank >= tierRank('acquaintance') ? { smile: 0.3, smirk: 0.2 }
    : rank >= tierRank('polite') ? { smirk: 0.15 }
    : rank >= tierRank('cold') ? { press: 0.4, frown: 0.2 }
    : { frown: 0.55, press: 0.5, sneer: 0.2 };
  if (mood === 'good') face.smile = Math.min(1, (face.smile ?? 0) + 0.15);
  if (mood === 'low') [face.smile, face.sad] = [(face.smile ?? 0) * 0.6, 0.3];
  if (mood === 'annoyed') [face.smile, face.frown] = [(face.smile ?? 0) * 0.4, Math.min(1, (face.frown ?? 0) + 0.25)];
  return face;
}

/** The greeting of a tier, coldest first. */
function greetingOf(rank: number): Greeting {
  if (rank <= tierRank('hostile')) return 'shun';
  if (rank <= tierRank('cold')) return 'avoid';
  if (rank <= tierRank('polite')) return 'glance';
  if (rank <= tierRank('acquaintance')) return 'nod';
  if (rank <= tierRank('friendly')) return 'wave';
  if (rank <= tierRank('friend')) return 'waveWarm';
  return 'callOut';
}

/** A barely-met face's word passing, by their manner (the gruff grunt, the shy hardly say it). */
const GLANCE_HELLO: Record<Manner, string> = { gruff: 'Hm.', shy: '…Hello.', proud: 'Good day.', lively: 'Hiya!', warm: 'Hello there.' };

/**
 * What a greeting says aloud, by who they are and their day: their own hello, a neighbour's, or a plain one; nothing
 * from the cold, and nothing but a look on a bad day.
 */
function helloOf(person: PersonId, greeting: Greeting, mood: 'good' | 'fine' | 'low' | 'annoyed'): string | null {
  if (greeting === 'shun' || greeting === 'avoid' || greeting === 'nod') return null;
  if (mood === 'annoyed') return null;
  const manner = mannerOf(person);
  if (greeting === 'glance') return mood === 'low' ? null : manner ? GLANCE_HELLO[manner] : 'Hello.';
  const card = findPerson(person);
  const own = card?.lines?.hello;
  if (own?.length) return own[Math.floor(random() * own.length)]!;
  return card?.group === 'building' ? 'Hello, neighbour!' : 'Hello!';
}

/** How `person` looks at the player now (`SocialHook.mien`). */
function mienOf(person: PersonId, day: number, hour: number): Mien {
  if (!isMet(person)) return { face: { smirk: 0.1 }, greeting: null, hello: null, beckon: false };
  const s = standing(person);
  const rank = tierRank(tierOf(s.warmth, s.trust));
  const { mood } = moodOf(person, day, hour);
  const greeting = greetingOf(rank);
  return { face: faceOf(rank, mood), greeting, hello: helloOf(person, greeting, mood), beckon: rank > tierRank('cold') && hasWordFor(person, day), manner: mannerOf(person) };
}

/**
 * The hook for someone the builder knows the person of: the caption from their standing and mood, the click opening
 * `talk(session)` (asked afresh on each click: what the place offers changes; the session for its extras). No `social` in the build: undefined, and
 * the person keeps their lines.
 */
export function talkHook(social: SocialServices | undefined, person: PersonId, talk: (session: SessionActions) => TalkSession, verb = 'talk'): SocialHook | undefined {
  if (!social) return undefined;
  return {
    person,
    caption: () => socialCaption(person, verb, { day: social.day(), hour: social.hour() }),
    open: (session) => {
      social.open(session, talk(session));
      return true;
    },
    mien: () => mienOf(person, social.day(), social.hour()),
  };
}

/** Someone with a voice in the room and a body that shows things: a `Walker`, or a `Vendor` through `vendorBody`. */
interface Speaking extends Expressive {
  speak(line: string): void;
  /** The point over their head their words come from. */
  readonly speechAnchor?: SocialAnchor;
  /** Their face before the click (`SocialBody.anticipate`). */
  anticipate?(fit: Fit | null): void;
  /** Kept in the conversation: they stay, eyes on the player (`SocialBody.hold`). */
  converse?(on: boolean): void;
}

/** The conversation's body for `person`: their lines over their head (`said` hears each, e.g. for the murmur), their reactions acted, their face before the click, held while it lasts. */
export function bodyOf(person: Speaking, said?: (line: string) => void): SocialBody {
  return {
    speak: (line) => {
      person.speak(line);
      said?.(line);
    },
    react: (reaction, strength, manner) => actReaction(person, reaction, strength, manner),
    anchor: person.speechAnchor,
    anticipate: (fit) => person.anticipate?.(fit),
    hold: (on) => person.converse?.(on),
  };
}

/** A `Vendor`'s body (its `gesture` is a stance: the gestures go through `gestureNow`). */
export function vendorBody(vendor: { speak(line: string): void; gestureNow(name: GestureName): void; feel(face: FaceKey, seconds: number): void; nod(): void; readonly speechAnchor: SocialAnchor; socialReact?(act: SocialAct, strength: number, manner?: Manner): void; anticipate?(fit: Fit | null): void; converse?(on: boolean): void }): SocialBody {
  return bodyOf({
    speak: (line) => vendor.speak(line),
    gesture: (name) => vendor.gestureNow(name),
    feel: (face, s) => vendor.feel(face, s),
    nod: () => vendor.nod(),
    speechAnchor: vendor.speechAnchor,
    ...(vendor.socialReact ? { socialReact: (act: SocialAct, strength: number, manner?: Manner) => vendor.socialReact!(act, strength, manner) } : {}),
    ...(vendor.anticipate ? { anticipate: (fit: Fit | null) => vendor.anticipate!(fit) } : {}),
    ...(vendor.converse ? { converse: (on: boolean) => vendor.converse!(on) } : {}),
  });
}

/** A voice with no body in view (through a door, on the phone): the subtitles, named. */
export function voiceBody(say: (line: string, speaker?: string) => void, speaker: string): SocialBody {
  return { speak: (line) => say(line, speaker) };
}

/** The name over `person`'s bubble: `name` once the player has met them, none before (a stranger's words are unsigned). */
export function metName(person: PersonId, name: string): () => string | undefined {
  return () => (isMet(person) ? name : undefined);
}
