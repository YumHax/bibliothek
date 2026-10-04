import { audioBus, startedAudioContext } from './audioContext';
import { crackleNoise } from './noise';

/**
 * The notices' sounds (src/notices), on the `ui` bus, so a message is heard as well as seen:
 * a low double buzz for a refusal, a rising arpeggio for a reward (a fuller one for a big reward),
 * a soft two-note chime for a new tip, a paper rustle for a card to read. Silent until a gesture
 * started the audio.
 */
type NoticeSound = 'deny' | 'reward' | 'fanfare' | 'tip' | 'page';

interface Note {
  /** Hz. */
  f: number;
  /** Start, seconds after now. */
  at: number;
  ms: number;
  level: number;
  type: OscillatorType;
}

const NOTES: Record<Exclude<NoticeSound, 'page'>, Note[]> = {
  deny: [
    { f: 160, at: 0, ms: 90, level: 0.07, type: 'square' },
    { f: 130, at: 0.11, ms: 120, level: 0.07, type: 'square' },
  ],
  reward: [
    { f: 784, at: 0, ms: 90, level: 0.05, type: 'triangle' },
    { f: 988, at: 0.08, ms: 90, level: 0.05, type: 'triangle' },
    { f: 1175, at: 0.16, ms: 220, level: 0.055, type: 'triangle' },
  ],
  fanfare: [
    { f: 523, at: 0, ms: 110, level: 0.05, type: 'square' },
    { f: 659, at: 0.1, ms: 110, level: 0.05, type: 'square' },
    { f: 784, at: 0.2, ms: 110, level: 0.05, type: 'square' },
    { f: 1047, at: 0.3, ms: 420, level: 0.06, type: 'square' },
    { f: 1319, at: 0.3, ms: 420, level: 0.03, type: 'triangle' },
  ],
  tip: [
    { f: 1047, at: 0, ms: 140, level: 0.035, type: 'sine' },
    { f: 1568, at: 0.09, ms: 260, level: 0.03, type: 'sine' },
  ],
};

/** Not twice within this long (a burst of refusals must not turn into a drone). */
const REPEAT_MS = 120;
const last = new Map<NoticeSound, number>();

export function playNoticeSound(kind: NoticeSound): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = performance.now();
  if (now - (last.get(kind) ?? -Infinity) < REPEAT_MS) return;
  last.set(kind, now);
  if (kind === 'page') {
    rustle(ctx);
    return;
  }
  const out = audioBus(ctx, 'ui');
  for (const note of NOTES[kind]) {
    const t = ctx.currentTime + note.at;
    const end = t + note.ms / 1000;
    const osc = ctx.createOscillator();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.f, t);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(note.level, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(end + 0.02);
  }
}

/** A sheet of paper turned: a short burst of band-passed noise. */
function rustle(ctx: AudioContext): void {
  const source = ctx.createBufferSource();
  source.buffer = crackleNoise(ctx, 0.22);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  source.connect(filter).connect(gain).connect(audioBus(ctx, 'ui'));
  source.start();
}
