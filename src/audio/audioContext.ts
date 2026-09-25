/**
 * One lazily created AudioContext for the whole room. Browsers only let a context start after
 * a user gesture; every sound in the room is triggered by a click, so callers ask for it at
 * that moment and `resume()` covers the case where it was created while still suspended.
 *
 * The context carries the mixer the Settings screen drives: a master gain in front of the
 * speakers and one bus per channel behind it. `ctx.destination` is redirected to the `world` bus,
 * so every sound is under the master volume without knowing about it; the TV, the radio and the
 * arcade's machines connect to their own bus with `audioBus`.
 */
let context: AudioContext | null = null;

/** A mixer channel; `master` is the gain every bus goes through. */
export type AudioChannel = 'master' | 'screens' | 'arcade' | 'world' | 'ui';
const BUSES: readonly Exclude<AudioChannel, 'master'>[] = ['screens', 'arcade', 'world', 'ui'];

const volumes: Record<AudioChannel, number> = { master: 1, screens: 1, arcade: 1, world: 1, ui: 1 };
const gains = new Map<AudioChannel, GainNode>();

function createContext(): AudioContext {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  gains.set('master', master);
  for (const bus of BUSES) {
    const gain = ctx.createGain();
    gain.connect(master);
    gains.set(bus, gain);
  }
  for (const [channel, gain] of gains) gain.gain.value = volumes[channel];
  // An own property shadows the prototype's getter: `x.connect(ctx.destination)` now lands on the world bus.
  Object.defineProperty(ctx, 'destination', { value: gains.get('world'), configurable: true });
  return ctx;
}

export function audioContext(): AudioContext {
  context ??= createContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/**
 * The context if a gesture already started it, else null: for sounds nobody clicked for (a cabinet
 * nobody plays, a hall's hum), which must never be the ones creating it (the browser would refuse).
 */
export function startedAudioContext(): AudioContext | null {
  return context && context.state === 'running' ? context : null;
}

/** The input of a mixer bus of `ctx` (the context `audioContext()` returned), to connect a sound to instead of `destination`. */
export function audioBus(ctx: BaseAudioContext, channel: Exclude<AudioChannel, 'master'>): AudioNode {
  return (ctx === context && gains.get(channel)) || ctx.destination;
}

/** Sets the mixer's volumes (0..1), live if the context exists, kept for when it is created otherwise. */
export function setVolumes(next: Partial<Record<AudioChannel, number>>): void {
  for (const [channel, value] of Object.entries(next) as [AudioChannel, number][]) {
    volumes[channel] = Math.min(1, Math.max(0, value));
    const gain = gains.get(channel);
    if (gain && context) gain.gain.setTargetAtTime(volumes[channel], context.currentTime, 0.02);
  }
}

/** The effective volume of a channel (its own times the master), for sounds outside Web Audio (the YouTube players). */
export function channelVolume(channel: Exclude<AudioChannel, 'master'>): number {
  return volumes[channel] * volumes.master;
}

/** The street's own sounds pass through this on their way to the world bus: a low-pass and a gain the airlock closes. */
let outdoors: { filter: BiquadFilterNode; gain: GainNode } | null = null;
/** 0 heard in the open, 1 through the building's shut street door (`setOutdoorsMuffle`). */
let muffle = 0;

/**
 * Where a sound of the street connects instead of the world bus (the traffic, the shops): the same
 * bus behind a filter, so standing in the building's sas with the street door shut hears the street
 * through it (`world/airlock`). Falls back on `destination` for any other context.
 */
export function outdoorsInput(ctx: BaseAudioContext): AudioNode {
  if (ctx !== context) return ctx.destination;
  if (!outdoors) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.5;
    const gain = context.createGain();
    filter.connect(gain).connect(gains.get('world') ?? context.destination);
    outdoors = { filter, gain };
    applyMuffle(true);
  }
  return outdoors.filter;
}

/** How shut off the street sounds are, 0..1 (the sas's door open or shut); `instant` jumps there (a crossing). */
export function setOutdoorsMuffle(amount: number, instant = false): void {
  const next = Math.min(1, Math.max(0, amount));
  if (Math.abs(next - muffle) < 0.001 && !instant) return;
  muffle = next;
  applyMuffle(instant);
}

function applyMuffle(instant: boolean): void {
  if (!outdoors || !context) return;
  const hz = 16000 * Math.pow(420 / 16000, muffle);
  const level = 1 - 0.6 * muffle;
  const t = context.currentTime;
  if (instant) {
    outdoors.filter.frequency.cancelScheduledValues(t);
    outdoors.gain.gain.cancelScheduledValues(t);
    outdoors.filter.frequency.setValueAtTime(hz, t);
    outdoors.gain.gain.setValueAtTime(level, t);
  } else {
    outdoors.filter.frequency.setTargetAtTime(hz, t, 0.08);
    outdoors.gain.gain.setTargetAtTime(level, t, 0.08);
  }
}

/** Creates the context on the page's first click or key press, so ambient sounds can start then. Call once. */
export function unlockAudioOnFirstGesture(target: EventTarget = window): void {
  const unlock = (): void => {
    audioContext();
    target.removeEventListener('pointerdown', unlock, true);
    target.removeEventListener('keydown', unlock, true);
  };
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);
}
