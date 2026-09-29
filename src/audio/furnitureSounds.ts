import { audioBus, startedAudioContext } from './audioContext';
import { whiteNoise } from './noise';
import { spatialInput, type Spatial } from './spatial';

/**
 * The flat's furniture, heard: the end of a door's travel (a latch, a knock of wood), a hinge that
 * creaks, a fridge's rubber seal, a rocker switch, the rings of a curtain along its rod, a box's
 * plastic lid, the intercom's line. One-shots, synthesised like `boxClack.ts`, on the world bus.
 * Each follows a click (or its consequence, a door that swings shut on its own after one), so they
 * only sound once a gesture started the audio (`startedAudioContext`) and never create it.
 * `level` is the caller's (0..1-ish gain at the ear). Returns false when nothing could play.
 */

/** A graph for one sound: an output gain onto the world bus (placed by `spatial` when given), freed once `seconds` are over. */
function oneShot(level: number, seconds: number, build: (ctx: AudioContext, out: GainNode, t: number) => void, spatial?: Spatial): boolean {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0.001) return false;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, seconds + 0.3));
  build(ctx, out, ctx.currentTime + 0.005);
  window.setTimeout(() => out.disconnect(), (seconds + 0.3) * 1000);
  return true;
}

/** A band of noise `length` s long at `at`, a quick fall from `peak`: a click, a tick, the scrape of a ring. */
function burst(ctx: AudioContext, out: AudioNode, at: number, frequency: number, q: number, peak: number, length: number): void {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 1);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = frequency;
  band.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(peak, at);
  env.gain.exponentialRampToValueAtTime(0.0005, at + length);
  source.connect(band).connect(env).connect(out);
  source.start(at, Math.random() * (1 - length), length + 0.01);
}

/** A falling sine thump: the body of a knock or a seal. */
function thump(ctx: AudioContext, out: AudioNode, at: number, from: number, to: number, peak: number, length: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  const env = ctx.createGain();
  env.gain.setValueAtTime(peak, at);
  env.gain.exponentialRampToValueAtTime(0.0005, at + length);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

const vary = (x: number, by = 0.1): number => x * (1 - by + Math.random() * 2 * by);

/** A door's latch springing into its keep as the leaf shuts: a metallic snick and its echo. */
export function playLatchClick(level = 0.12, spatial?: Spatial): boolean {
  return oneShot(level, 0.1, (ctx, out, t) => {
    burst(ctx, out, t, vary(3400), 5, 0.9, 0.018);
    burst(ctx, out, t + 0.022, vary(2300), 4, 0.5, 0.025);
    thump(ctx, out, t, 180, 90, 0.35, 0.06);
  }, spatial);
}

/** An old hinge complaining as a leaf starts to swing: a short, wavering, nasal squeak. */
export function playHingeCreak(level = 0.035, spatial?: Spatial): boolean {
  return creak(level, vary(0.35, 0.25), vary(210, 0.2), 1100, spatial);
}

/** A floorboard giving under a step now and then: the hinge's stick-slip, lower, shorter and duller. */
export function playFloorCreak(level = 0.02): boolean {
  return creak(level, vary(0.22, 0.3), vary(120, 0.25), 650);
}

/** A sawtooth rising and settling at `pitch`, wobbling (stick-slip), through a narrow band at `band` Hz. */
function creak(level: number, length: number, pitch: number, band: number, spatial?: Spatial): boolean {
  return oneShot(level, length, (ctx, out, t) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.linearRampToValueAtTime(pitch * 1.35, t + length * 0.6);
    osc.frequency.linearRampToValueAtTime(pitch * 1.15, t + length);
    // The stick-slip of the pin: a fast wobble of the pitch.
    const wobble = ctx.createOscillator();
    wobble.frequency.value = vary(28);
    const depth = ctx.createGain();
    depth.gain.value = pitch * 0.06;
    wobble.connect(depth).connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = vary(band);
    filter.Q.value = 6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.05);
    env.gain.setValueAtTime(1, t + length * 0.7);
    env.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(filter).connect(env).connect(out);
    osc.start(t);
    wobble.start(t);
    osc.stop(t + length + 0.02);
    wobble.stop(t + length + 0.02);
  }, spatial);
}

/**
 * Wood meeting wood: a cupboard door against its carcass, a drawer home, a door against its stop.
 * `pitch` above 1 is a smaller piece (a drawer front), below 1 a heavier one (a door against the wall).
 */
export function playWoodKnock(level = 0.12, pitch = 1, spatial?: Spatial): boolean {
  return oneShot(level, 0.12, (ctx, out, t) => {
    thump(ctx, out, t, vary(230 * pitch), 110 * pitch, 0.8, 0.08);
    burst(ctx, out, t, vary(900 * pitch), 1.5, 0.45, 0.035);
  }, spatial);
}

/** Something soft coming to rest: an oven door dropping onto its stay, a heavy leaf at the end of its swing. */
export function playSoftThud(level = 0.1): boolean {
  return oneShot(level, 0.15, (ctx, out, t) => {
    thump(ctx, out, t, vary(120), 60, 0.9, 0.12);
    burst(ctx, out, t, vary(400), 1, 0.25, 0.05);
  });
}

/**
 * A fridge door's rubber seal: the dull "thup" of it letting go (`open`) or sucking shut. Opening,
 * the compressor's hum swells for a moment too, as a warm draught reaches the thermostat.
 */
export function playFridgeSeal(open: boolean, level = 0.14): boolean {
  return oneShot(level, open ? 1.8 : 0.15, (ctx, out, t) => {
    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx, 1);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = open ? 320 : 240;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0005, t);
    env.gain.exponentialRampToValueAtTime(1.2, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    noise.connect(low).connect(env).connect(out);
    noise.start(t, Math.random() * 0.8, 0.12);
    thump(ctx, out, t, open ? 90 : 75, 45, 0.6, 0.1);
    if (!open) return;
    // The hum bump: the compressor's mains harmonics, up and back down over a second and a half.
    for (const [frequency, peak] of [
      [100, 0.12],
      [150, 0.04],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const swell = ctx.createGain();
      swell.gain.setValueAtTime(0, t);
      swell.gain.linearRampToValueAtTime(peak, t + 0.35);
      swell.gain.linearRampToValueAtTime(0, t + 1.7);
      osc.connect(swell).connect(out);
      osc.start(t);
      osc.stop(t + 1.75);
    }
  });
}

/** A rocker light switch (or a lamp's own switch) snapping over: a sharp double click. */
export function playRockerClick(level = 0.09): boolean {
  return oneShot(level, 0.06, (ctx, out, t) => {
    burst(ctx, out, t, vary(4200), 4, 1, 0.012);
    burst(ctx, out, t + 0.009, vary(2600), 3, 0.6, 0.02);
  });
}

/** A small plastic click: a game box's lid coming fully open against its stop, or snapping shut. */
export function playPlasticClick(shut: boolean, level = 0.06): boolean {
  return oneShot(level, 0.05, (ctx, out, t) => {
    burst(ctx, out, t, vary(shut ? 2400 : 3100), 3.5, 1, 0.014);
  });
}

/**
 * Curtain rings running along their rod for `seconds`: a thin metallic hiss that swells and fades,
 * dotted with the tinks of rings knocking together.
 */
export function playCurtainRings(seconds: number, level = 0.05): boolean {
  const length = Math.max(0.3, Math.min(seconds, 2));
  return oneShot(level, length, (ctx, out, t) => {
    const source = ctx.createBufferSource();
    source.buffer = whiteNoise(ctx, 2);
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = vary(5200);
    band.Q.value = 2.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.08);
    env.gain.linearRampToValueAtTime(0.2, t + length * 0.6);
    env.gain.linearRampToValueAtTime(0, t + length);
    source.connect(band).connect(env).connect(out);
    source.start(t, Math.random());
    source.stop(t + length + 0.02);
    // The rings bunching up: most of the tinks come early, when the panel starts to move.
    const tinks = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < tinks; i++) {
      const at = t + length * Math.pow(Math.random(), 1.6) * 0.9;
      const ring = ctx.createOscillator();
      ring.type = 'sine';
      ring.frequency.value = vary(3600, 0.25);
      const ping = ctx.createGain();
      ping.gain.setValueAtTime(0.25, at);
      ping.gain.exponentialRampToValueAtTime(0.0005, at + 0.05);
      ring.connect(ping).connect(out);
      ring.start(at);
      ring.stop(at + 0.06);
    }
  });
}

/** The intercom's handset at the ear for `seconds`: the line's mains hum under a crackle, and nobody. */
export function playIntercomLine(seconds = 1.4, level = 0.08): boolean {
  return oneShot(level, seconds, (ctx, out, t) => {
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, t);
    fade.gain.linearRampToValueAtTime(1, t + 0.06);
    fade.gain.setValueAtTime(1, t + seconds - 0.2);
    fade.gain.linearRampToValueAtTime(0, t + seconds);
    fade.connect(out);
    // A cheap earpiece: everything through a telephone band.
    const phone = ctx.createBiquadFilter();
    phone.type = 'bandpass';
    phone.frequency.value = 900;
    phone.Q.value = 0.7;
    phone.connect(fade);
    const hum = ctx.createOscillator();
    hum.type = 'square';
    hum.frequency.value = 50;
    const humLevel = ctx.createGain();
    humLevel.gain.value = 0.25;
    hum.connect(humLevel).connect(phone);
    hum.start(t);
    hum.stop(t + seconds + 0.02);
    const hiss = ctx.createBufferSource();
    hiss.buffer = whiteNoise(ctx, 2);
    hiss.loop = true;
    const hissLevel = ctx.createGain();
    hissLevel.gain.value = 0.08;
    hiss.connect(hissLevel).connect(phone);
    hiss.start(t, Math.random());
    hiss.stop(t + seconds + 0.02);
    // The crackle: pops at random, denser at the start as the handset leaves the hook.
    const pops = 10 + Math.floor(Math.random() * 10);
    for (let i = 0; i < pops; i++) burst(ctx, phone, t + seconds * Math.pow(Math.random(), 1.4), vary(1800, 0.4), 1.2, vary(0.8, 0.5), 0.01);
  });
}
