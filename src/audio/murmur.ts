import { audioBus, startedAudioContext } from './audioContext';
import { whiteNoise } from './noise';
import { spatialInput, type Spatial } from './spatial';
import { random } from '@/random';

/** One syllable (s), the gap between two, and the longest a line's murmur runs (s). */
const SYLLABLE = { min: 0.07, max: 0.16, gap: 0.05 };
const LONGEST_S = 2.2;
/** Seconds of murmur per character of the line said (a short word is a blip, a sentence a mumble). */
const PER_CHAR = 0.035;
/** A voice's speech band (Hz): low for a deep voice, higher for a light one (`pitch` 0..1 between them). */
const BAND = { low: 480, high: 900, q: 3.2, second: 2.1 };
/** How far the band moves: each syllable at random (share), and over a line's last 40 % for "?" (up) or "." / "!" (down). */
const INTONATION = { syllable: 0.12, rise: 0.22, fall: 0.14 };

/**
 * Someone talking, heard but not understood: a few syllables of noise through a speech-band pair of
 * filters, each with its own little rise and fall, over as long as `text` would take to say (capped),
 * placed by `spatial` (a friend in the room, a neighbour on the stairs). `level` 0..1 at the mouth,
 * already attenuated by the caller for distance. The words themselves are in the bubble.
 */
export function playMurmur(text: string, level: number, spatial?: Spatial, pitch = 0.5): void {
  if (level < 0.002) return;
  const ctx = startedAudioContext();
  if (!ctx) return;
  try {
    const seconds = Math.min(LONGEST_S, Math.max(0.25, text.length * PER_CHAR));
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, seconds + 0.5));
    const centre = BAND.low + (BAND.high - BAND.low) * Math.max(0, Math.min(1, pitch));
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = centre;
    band.Q.value = BAND.q;
    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = centre * BAND.second;
    formant.gain.value = 6;
    band.connect(formant).connect(out);
    const noise = whiteNoise(ctx, 1);
    let t = ctx.currentTime + 0.02;
    const start = t;
    const end = t + seconds;
    // The line's tune: a question rises at the end, a statement falls; the first syllable leans in.
    const ending = text.trimEnd().slice(-1);
    const tail = ending === '?' ? INTONATION.rise : ending === '.' || ending === '!' ? -INTONATION.fall : 0;
    let first = true;
    while (t < end) {
      const length = SYLLABLE.min + random() * (SYLLABLE.max - SYLLABLE.min);
      const along = (t - start) / seconds;
      const lift = 1 + (random() * 2 - 1) * INTONATION.syllable + tail * Math.max(0, (along - 0.6) / 0.4);
      band.frequency.setValueAtTime(centre * lift, t);
      formant.frequency.setValueAtTime(centre * lift * BAND.second, t);
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const env = ctx.createGain();
      const peak = first ? 1 : 0.6 + random() * 0.4;
      first = false;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(peak, t + length * 0.3);
      env.gain.exponentialRampToValueAtTime(0.0001, t + length);
      // Each syllable a touch higher or lower: the tune of speech.
      source.playbackRate.value = 0.85 + random() * 0.3;
      source.connect(env).connect(band);
      source.start(t, random() * 0.7, length + 0.02);
      t += length + SYLLABLE.gap * (0.5 + random());
    }
    window.setTimeout(() => out.disconnect(), (seconds + 0.6) * 1000);
  } catch {
    // Quiet rather than broken.
  }
}
