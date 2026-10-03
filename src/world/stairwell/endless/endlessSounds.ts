import { audioBus, startedAudioContext } from '@/audio/audioContext';

/*
 * What the endless stairs sound like besides the creaks: a piano phrase behind the nameless door, played backwards
 * (each note swelling up out of nothing and cut off dead, the tune running down instead of up).
 */

/** The little tune of the 4th floor's piano, backwards: its notes (semitones over middle C) from the last to the first. */
const PHRASE = [12, 11, 9, 7, 5, 4, 2, 0];

/** The backwards phrase, `level` loud (0..1), muffled as if behind a door. */
export function playBackwardsPiano(level: number): void {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0) return;
  const door = ctx.createBiquadFilter();
  door.type = 'lowpass';
  door.frequency.value = 1100;
  const out = ctx.createGain();
  out.gain.value = level;
  door.connect(out).connect(audioBus(ctx, 'world'));
  const start = ctx.currentTime + 0.05;
  PHRASE.forEach((step, i) => {
    const at = start + i * 0.62;
    const length = 0.55;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 261.6 * Math.pow(2, step / 12) * 0.997;
    const gain = ctx.createGain();
    // Reversed: rises slowly, stops dead.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.5, at + length * 0.95);
    gain.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(gain).connect(door);
    osc.start(at);
    osc.stop(at + length + 0.02);
  });
}
