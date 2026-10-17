import type * as THREE from 'three';
import type { SpeechOptions } from './SpeechLayer';

/** Where the people's `SpeechBubble`s send their lines. */
interface SpeechSink {
  speak(anchor: THREE.Object3D, text: string, options?: SpeechOptions): void;
  /** While on, a line said to the player replaces the one the speaker is saying instead of waiting behind it. */
  converse(on: boolean): void;
  /** `anchor`'s lines draw no bubble (their mouth and voice still go): the conversation draws its own (null: none muted). */
  mute(anchor: THREE.Object3D | null): void;
}

let sink: SpeechSink | null = null;

/** Who hears a line as it shows (the street's people's voices, `street/audio/PeopleSounds`): its anchor and its text. */
type LineListener = (anchor: THREE.Object3D, text: string) => void;
const listeners = new Set<LineListener>();

/**
 * The one speech layer, bound once at start-up (`bootstrap/ui.ts`): a person is made deep inside a
 * zone builder that knows nothing of the HUD, and speaks through this. Lines said before the
 * binding (none in practice: the HUD is made before the world) are dropped. Each line, as it
 * shows, is also told to the `onLineShown` listeners.
 */
export function bindSpeech(next: SpeechSink): void {
  sink = {
    speak: (anchor, text, options) =>
      next.speak(anchor, text, {
        ...options,
        onShow: () => {
          options?.onShow?.();
          for (const listener of listeners) listener(anchor, text);
        },
      }),
    converse: (on) => next.converse(on),
    mute: (anchor) => next.mute(anchor),
  };
}

/** While a conversation draws the speaker's balloon itself, the speech layer draws none for `anchor` (null: back to normal). */
export function muteSpeech(anchor: THREE.Object3D | null): void {
  sink?.mute(anchor);
}

/** Hears every line as it shows over someone's head (a voice for it); returns the way to stop listening. */
export function onLineShown(listener: LineListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function speechSink(): SpeechSink | null {
  return sink;
}

/**
 * A conversation is going on (the conversation panel, from opening to closing): each answer shows at once over the
 * speaker's head, replacing the one before, instead of queueing behind it (a quick player would read stale lines).
 * The page says so too (`body.conversing`): a bubble over a head loses its name tag (the panel names them) and a
 * reward banner comes in higher, clear of the answer over their head.
 */
export function conversing(on: boolean): void {
  sink?.converse(on);
  document.body.classList.toggle('conversing', on);
  const was = talking;
  talking = on;
  if (was && !on) for (const listener of [...ends]) listener();
}

let talking = false;
const ends = new Set<() => void>();

/** Whether a conversation is open now (`conversing`): banners and cards raised meanwhile wait for its end (`Notices`). */
export function isConversing(): boolean {
  return talking;
}

/** Hears each conversation's end. Returns the unsubscribe. */
export function onConversingEnd(listener: () => void): () => void {
  ends.add(listener);
  return () => ends.delete(listener);
}
