import type { Sfx } from '@/audio/ChipSpeaker';
import { type ArcadeControls, drawText } from './games/ArcadeGame';
import { type ArcadeKey, KeyEdges } from './games/KeyEdges';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Held up / down repeats after this, then this often. */
const REPEAT_DELAY = 0.35;
const REPEAT_EVERY = 0.09;
/** An entry nobody finishes signs itself after this long. */
const TIMEOUT = 25;

/**
 * The high-score initials screen every arcade game had: three letters, up / down to change the
 * one under the cursor, left / right to move, fire to accept it and go on (fire on the last one
 * signs). Starts from the initials the player used last. Pure logic plus a painter for any canvas
 * (a cabinet's glass, a pinball's backglass, the alley's display).
 */
export class InitialsEntry {
  private readonly letters: number[];
  private cursor = 0;
  /** The fire press that ended the play counts as held, so it does not accept the first letter. */
  private readonly keys = new KeyEdges({ fire: true });
  private repeat = 0;
  private clock = 0;
  done = false;

  constructor(initials: string, readonly rank: number, readonly score: number) {
    this.letters = [...initials.padEnd(3, 'A').slice(0, 3)].map((c) => Math.max(0, ALPHABET.indexOf(c)));
  }

  get value(): string {
    return this.letters.map((i) => ALPHABET[i]).join('');
  }

  /** Reads this frame's keys; returns the sound to make, if any. */
  update(dt: number, controls: ArcadeControls): Sfx | null {
    if (this.done) return null;
    this.clock += dt;
    if (this.clock > TIMEOUT) {
      this.done = true;
      return 'confirm';
    }
    let sfx: Sfx | null = null;
    const pressed = (key: ArcadeKey): boolean => this.keys.pressed(controls, key);
    const vertical = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);
    const upEdge = pressed('up');
    const downEdge = pressed('down');
    if (upEdge || downEdge) {
      this.repeat = REPEAT_DELAY;
      this.spin(upEdge ? 1 : -1);
      sfx = 'letter';
    } else if (vertical !== 0) {
      this.repeat -= dt;
      if (this.repeat <= 0) {
        this.repeat = REPEAT_EVERY;
        this.spin(vertical);
        sfx = 'letter';
      }
    }
    if (pressed('left') && this.cursor > 0) {
      this.cursor -= 1;
      sfx = 'letter';
    }
    if (pressed('right') && this.cursor < 2) {
      this.cursor += 1;
      sfx = 'letter';
    }
    if (pressed('fire')) {
      if (this.cursor < 2) {
        this.cursor += 1;
        sfx = 'letter';
      } else {
        this.done = true;
        sfx = 'confirm';
      }
    }
    return sfx;
  }

  /** The panel: the rank and score, the three letters with the current one blinking, how to sign. */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale = 1): void {
    const w = 260 * scale;
    const h = 150 * scale;
    ctx.fillStyle = 'rgba(5,5,12,0.92)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 2 * scale;
    ctx.strokeRect(cx - w / 2 + 3 * scale, cy - h / 2 + 3 * scale, w - 6 * scale, h - 6 * scale);
    drawText(ctx, `${ordinal(this.rank + 1)} PLACE!`, cx, cy - 50 * scale, 12 * scale, '#7ee787');
    drawText(ctx, `${this.score.toLocaleString('en-US')}`, cx, cy - 30 * scale, 9 * scale, '#fff2a8');
    drawText(ctx, 'ENTER YOUR INITIALS', cx, cy - 12 * scale, 7 * scale, '#c9c4ff');
    const blink = Math.floor(this.clock * 4) % 2 === 0;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 34 * scale;
      const current = i === this.cursor;
      drawText(ctx, ALPHABET[this.letters[i]!]!, x, cy + 16 * scale, 22 * scale, current ? (blink ? '#ffffff' : '#ffd23a') : '#ffd23a');
      ctx.fillStyle = current ? '#ffffff' : '#555570';
      ctx.fillRect(x - 11 * scale, cy + 31 * scale, 22 * scale, 2 * scale);
    }
    drawText(ctx, 'UP/DOWN LETTER · FIRE NEXT', cx, cy + 52 * scale, 6 * scale, '#7a7a90');
  }

  private spin(by: number): void {
    const i = this.letters[this.cursor]!;
    this.letters[this.cursor] = (i + by + ALPHABET.length) % ALPHABET.length;
  }
}

export function ordinal(n: number): string {
  return n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`;
}
