import type { SessionActions } from '@/game/SessionActions';
import type { Reaction as SocialReaction } from '@/social/conversation';
import { socialCaption } from '@/social/caption';
import { isMet } from '@/social/standing';
import type { SocialBody, SocialServices, TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import type { FaceKey, GestureName } from './motion/gestures';

/*
 * How a person in the room becomes someone to talk to (docs/social.md "Talking"): a `Walker` or a `Vendor` given a
 * `SocialHook` shows the social caption ("Mrs Dubois · ♥ Friend · talk") and, clicked, opens the conversation
 * instead of saying a line. `talkHook` makes one from the builder's `BuildContext.social`.
 */

/** What a clickable person asks of their conversation. */
export interface SocialHook {
  /** The hover caption now. */
  caption(): string;
  /** Clicked: opens the conversation; false to fall back to their line (no social layer in this build). */
  open(session: SessionActions): boolean;
}

/** A body that can show what was said to it: a gesture, a feeling on the face, a nod. */
interface Expressive {
  gesture(name: GestureName): void;
  feel?(face: FaceKey, seconds: number): void;
  nod?(): void;
}

/** How each reaction of the conversation is acted. */
const ACTED: Record<SocialReaction, { gesture?: GestureName; face: FaceKey; nod?: boolean }> = {
  pleased: { face: { smile: 0.9, browsUp: 0.3 }, nod: true },
  laugh: { gesture: 'coverMouth', face: { smile: 1, squint: 0.6 } },
  thanks: { face: { smile: 1, browsUp: 0.5 }, nod: true },
  nod: { face: { smile: 0.4 }, nod: true },
  shrug: { gesture: 'shrug', face: { browsUp: 0.4 } },
  annoyed: { gesture: 'headShake', face: { frown: 0.9 } },
  hurt: { gesture: 'facepalm', face: { frown: 1, squint: 0.4 } },
};

/** Acts `reaction` on `body`. */
export function actReaction(body: Expressive, reaction: SocialReaction): void {
  const act = ACTED[reaction];
  if (act.gesture) body.gesture(act.gesture);
  body.feel?.(act.face, 2.5);
  if (act.nod) body.nod?.();
}

/**
 * The hook for someone the builder knows the person of: the caption from their standing, the click opening
 * `talk(session)` (asked afresh on each click: what the place offers changes; the session for its extras). No `social` in the build: undefined, and
 * the person keeps their lines.
 */
export function talkHook(social: SocialServices | undefined, person: PersonId, talk: (session: SessionActions) => TalkSession, verb = 'talk'): SocialHook | undefined {
  if (!social) return undefined;
  return {
    caption: () => socialCaption(person, verb),
    open: (session) => {
      social.open(session, talk(session));
      return true;
    },
  };
}

/** Someone with a voice in the room and a body that shows things: a `Walker`, or a `Vendor` through `vendorBody`. */
interface Speaking extends Expressive {
  speak(line: string): void;
}

/** The conversation's body for `person`: their lines over their head (`said` hears each, e.g. for the murmur), their reactions acted. */
export function bodyOf(person: Speaking, said?: (line: string) => void): SocialBody {
  return {
    speak: (line) => {
      person.speak(line);
      said?.(line);
    },
    react: (reaction) => actReaction(person, reaction),
  };
}

/** A `Vendor`'s body (its `gesture` is a stance: the gestures go through `gestureNow`). */
export function vendorBody(vendor: { speak(line: string): void; gestureNow(name: GestureName): void; feel(face: FaceKey, seconds: number): void; nod(): void }): SocialBody {
  return bodyOf({ speak: (line) => vendor.speak(line), gesture: (name) => vendor.gestureNow(name), feel: (face, s) => vendor.feel(face, s), nod: () => vendor.nod() });
}

/** A voice with no body in view (through a door, on the phone): the subtitles, named. */
export function voiceBody(say: (line: string, speaker?: string) => void, speaker: string): SocialBody {
  return { speak: (line) => say(line, speaker) };
}

/** The name over `person`'s bubble: `name` once the player has met them, none before (a stranger's words are unsigned). */
export function metName(person: PersonId, name: string): () => string | undefined {
  return () => (isMet(person) ? name : undefined);
}
