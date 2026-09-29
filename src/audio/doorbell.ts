import { audioBus, startedAudioContext } from './audioContext';
import { spatialInput, type Spatial } from './spatial';

/** The two chimes of the flat's bell (Hz): a falling major third, "ding… dong". */
const CHIMES = [659.3, 523.3];
/** A struck bar's partials, as multiples of its pitch, and how loud each starts. */
const PARTIALS: readonly [number, number][] = [[1, 1], [2.76, 0.35], [5.4, 0.12]];

/**
 * The front door's bell: a two-tone "ding-dong" of struck bars, each a few decaying partials.
 * Rung by someone at the door (the postman, a friend), not by a click, so it only sounds once a
 * gesture started the audio (`startedAudioContext`); `level` is the caller's (distance, walls),
 * `spatial` where it is heard from (a side, and the walls' low-pass: rooms away, a dull ding-dong).
 * Returns false when nothing could play.
 */
export function playDoorbell(level = 0.18, spatial?: Spatial): boolean {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0.001) return false;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, 3.5));
  let t = ctx.currentTime + 0.02;
  for (const pitch of CHIMES) {
    for (const [ratio, peak] of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = pitch * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 1.6 / ratio);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 1.7);
    }
    t += 0.55;
  }
  window.setTimeout(() => out.disconnect(), (t - ctx.currentTime + 1.8) * 1000);
  return true;
}

/**
 * Knuckles on a wooden door: `count` knocks, each a short low thump under a burst of filtered
 * noise. For a visitor who does not ring. Same rules as `playDoorbell`.
 */
export function playKnock(count = 3, level = 0.3): boolean {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0.001) return false;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  let t = ctx.currentTime + 0.02;
  for (let i = 0; i < count; i++) {
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(170, t);
    thump.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.9, t);
    body.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    thump.connect(body).connect(out);
    thump.start(t);
    thump.stop(t + 0.15);
    const tap = ctx.createBufferSource();
    tap.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + Math.random() * 200;
    filter.Q.value = 1.2;
    const tapGain = ctx.createGain();
    tapGain.gain.value = 0.5;
    tap.connect(filter).connect(tapGain).connect(out);
    tap.start(t);
    t += 0.2 + Math.random() * 0.06;
  }
  window.setTimeout(() => out.disconnect(), (t - ctx.currentTime + 0.5) * 1000);
  return true;
}

/**
 * A door pulled shut: the leaf's swish and a heavy thud into the frame (a friend leaving, the door
 * shut behind them). The latch is the door's own (`Door`'s end of swing), not played twice. Same rules as `playDoorbell`.
 */
export function playDoorShut(level = 0.3, spatial?: Spatial): boolean {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0.001) return false;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, 1.5));
  const t = ctx.currentTime + 0.02;
  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.4), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  // The swish of the leaf through the air.
  const swish = ctx.createBufferSource();
  swish.buffer = noise;
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = 700;
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0, t);
  airGain.gain.linearRampToValueAtTime(0.25, t + 0.25);
  airGain.gain.linearRampToValueAtTime(0, t + 0.35);
  swish.connect(air).connect(airGain).connect(out);
  swish.start(t);
  // The thud into the frame, and the latch.
  const hit = t + 0.35;
  const thud = ctx.createOscillator();
  thud.frequency.setValueAtTime(110, hit);
  thud.frequency.exponentialRampToValueAtTime(45, hit + 0.15);
  const body = ctx.createGain();
  body.gain.setValueAtTime(1, hit);
  body.gain.exponentialRampToValueAtTime(0.001, hit + 0.25);
  thud.connect(body).connect(out);
  thud.start(hit);
  thud.stop(hit + 0.3);
  window.setTimeout(() => out.disconnect(), 1500);
  return true;
}
