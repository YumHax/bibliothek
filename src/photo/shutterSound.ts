import { foregroundInput, startedAudioContext } from '@/audio/audioContext';
import { decayingNoise } from '@/audio/noise';

/**
 * The shutter: a dry mechanical click (a burst of filtered noise, then the mirror's lower slap), in the
 * foreground: the player's own doing, heard over the room's duck at the world's volume. Silent until a gesture started the audio (a photo is always taken with one).
 */
export function playShutter(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const out = foregroundInput(ctx);
  const t = ctx.currentTime;
  const burst = (at: number, ms: number, hz: number, level: number) => {
    const source = ctx.createBufferSource();
    source.buffer = decayingNoise(ctx, ms / 1000, 2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(out);
    source.start(t + at);
  };
  burst(0, 18, 3800, 0.22);
  burst(0.055, 30, 1400, 0.16);
}
