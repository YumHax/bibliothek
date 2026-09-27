import * as THREE from 'three';
import { speechSink } from '@/notices';

/**
 * The point over someone's head their words come from. Add it to the person and place it above
 * the head: the speech layer (`src/notices/SpeechLayer`) draws the bubble there, on the HUD, so it
 * reads at any distance and in any light, and follows the head while the line lasts.
 * - `say`: a word in passing ("WHOA!", "Sold!"), to nobody in particular: seen only near and in view.
 * - `speak`: a line said to the player, with the speaker's name: it waits for the line before it,
 *   stays its reading time, and goes to the subtitles while the speaker is out of view.
 */
export class SpeechBubble extends THREE.Object3D {
  constructor() {
    super();
    this.name = 'SpeechBubble';
  }

  say(text: string, seconds = 2.2): void {
    speechSink()?.speak(this, text, { seconds });
  }

  speak(text: string, name?: string): void {
    speechSink()?.speak(this, text, { addressed: true, name });
  }
}
