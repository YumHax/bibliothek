import * as THREE from 'three';
import { speechSink } from '@/notices';

/**
 * The point over someone's head their words come from. Add it to the person and place it above
 * the head: the speech layer (`src/notices/SpeechLayer`) draws the bubble there, on the HUD, so it
 * reads at any distance and in any light, and follows the head while the line lasts.
 * - `say`: a word in passing ("WHOA!", "Sold!"), to nobody in particular: seen only near and in view.
 * - `speak`: a line said to the player, with the speaker's name: it waits for the line before it,
 *   stays its reading time, and goes to the subtitles while the speaker is out of view.
 * `onShow` runs when the line actually shows (a queued line: after the ones before it), so a voice
 * or a nod starts with its bubble.
 */
export class SpeechBubble extends THREE.Object3D {
  constructor() {
    super();
    this.name = 'SpeechBubble';
  }

  say(text: string, seconds = 2.2, onShow?: () => void): void {
    speechSink()?.speak(this, text, { seconds, onShow });
  }

  speak(text: string, name?: string, onShow?: () => void): void {
    speechSink()?.speak(this, text, { addressed: true, name, onShow });
  }
}
