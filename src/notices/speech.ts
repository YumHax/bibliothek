import type * as THREE from 'three';
import type { SpeechOptions } from './SpeechLayer';

/** Where the people's `SpeechBubble`s send their lines. */
export interface SpeechSink {
  speak(anchor: THREE.Object3D, text: string, options?: SpeechOptions): void;
}

let sink: SpeechSink | null = null;

/**
 * The one speech layer, bound once at start-up (`bootstrap/ui.ts`): a person is made deep inside a
 * zone builder that knows nothing of the HUD, and speaks through this. Lines said before the
 * binding (none in practice: the HUD is made before the world) are dropped.
 */
export function bindSpeech(next: SpeechSink): void {
  sink = next;
}

export function speechSink(): SpeechSink | null {
  return sink;
}
