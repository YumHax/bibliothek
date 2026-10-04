import { random } from '@/random';
/**
 * One lazily created AudioContext for the whole room. Browsers only let a context start after a user
 * gesture: `unlockAudioOnFirstGesture` (the bootstrap, once) creates it on the page's first click or
 * key press, so by the time a click's handler asks (`audioContext()`) it exists and only needs a
 * `resume()`; a sound nobody clicked for asks `startedAudioContext()` and plays only once a gesture
 * has started the audio; whoever must act the moment it starts registers with `onAudioStart`. These
 * three are the only ways to the context: nothing else creates one or listens for a gesture itself.
 *
 * The context carries the mixer the Settings screen drives: a master gain in front of the
 * speakers and one bus per channel behind it. `ctx.destination` is redirected to the `world` bus,
 * so every sound is under the master volume without knowing about it; the TV, the radio and the
 * arcade's machines connect to their own bus with `audioBus`. A sound the player is making with
 * their hands while the scene is ducked (a repair, the camera's shutter) takes `foregroundInput`:
 * the world's volume without the duck, a category and not a routing trick.
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
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'running') fireStarted();
  });
  return ctx;
}

/**
 * The context, for a sound that follows a click (created if the page never had one, resumed if the
 * browser suspended it). Null where there is no Web Audio at all (a headless run): the caller plays nothing.
 */
export function audioContext(): AudioContext | null {
  if (!context) {
    if (typeof AudioContext === 'undefined') return null;
    context = createContext();
    if (context.state === 'running') fireStarted();
  }
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

/** Who waits for the audio to start (`onAudioStart`); each is called once and dropped. */
const startListeners = new Set<() => void>();

function fireStarted(): void {
  const listeners = [...startListeners];
  startListeners.clear();
  for (const cb of listeners) cb();
}

/**
 * Calls `cb` once, as soon as the audio runs: now if it already does, else when the first gesture
 * starts it (or a suspended context resumes). For what must begin the moment there is sound (the street
 * heard through the windows) instead of listening for a gesture itself. Returns the unsubscribe.
 */
export function onAudioStart(cb: () => void): () => void {
  if (context?.state === 'running') {
    cb();
    return () => undefined;
  }
  startListeners.add(cb);
  return () => {
    startListeners.delete(cb);
  };
}

/** The input of a mixer bus of `ctx` (the context `audioContext()` returned), to connect a sound to instead of `destination`. */
export function audioBus(ctx: BaseAudioContext, channel: Exclude<AudioChannel, 'master'>): AudioNode {
  return (ctx === context && gains.get(channel)) || ctx.destination;
}

/** The world's volume straight into the master, past the scene's duck (`duckScene`): see `foregroundInput`. */
let foreground: GainNode | null = null;

/**
 * Where a sound the player is making lands while the scene is ducked (a repair at the kitchen table,
 * the camera's shutter): at the world's volume, but not under the curtain a pastime or a travel pulls
 * over the room's sounds. Falls back on `destination` for any other context.
 */
export function foregroundInput(ctx: BaseAudioContext): AudioNode {
  if (ctx !== context) return ctx.destination;
  if (!foreground) {
    foreground = context.createGain();
    foreground.gain.value = volumes.world;
    foreground.connect(gains.get('master') ?? context.destination);
  }
  return foreground;
}

/** Sets the mixer's volumes (0..1), live if the context exists, kept for when it is created otherwise. */
export function setVolumes(next: Partial<Record<AudioChannel, number>>): void {
  for (const [channel, value] of Object.entries(next) as [AudioChannel, number][]) {
    volumes[channel] = Math.min(1, Math.max(0, value));
    const gain = gains.get(channel);
    if (gain && context) gain.gain.setTargetAtTime(volumes[channel], context.currentTime, 0.02);
    if (channel === 'world' && foreground && context) foreground.gain.setTargetAtTime(volumes.world, context.currentTime, 0.02);
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

/**
 * Creates the context on the page's first click or key press, so ambient sounds can start then. Call once.
 * It keeps listening afterwards, doing nothing while the context runs: one the browser suspended later
 * (Safari's "interrupted" on a call or a device change, a tab left in the background) is resumed on the
 * next gesture, and tried again as the page comes back into view, instead of the room staying mute.
 */
export function unlockAudioOnFirstGesture(target: EventTarget = window): void {
  const unlock = (): void => {
    if (context?.state === 'running') return;
    audioContext();
  };
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && context && context.state !== 'running' && context.state !== 'closed') void context.resume().catch(() => undefined);
  });
}

/** Between the room's buses (all but the UI's) and the master: what a travel's curtain fades (`duckScene`). */
let scene: GainNode | null = null;

/**
 * The room's own air: how long a sound rings on (s) and how much of it comes back (`wet`), by what
 * the room is made of. Tiles and bare concrete ring, a carpeted room swallows it, the street has only
 * its facades. Kept low: a hint of the space, never an echo chamber.
 */
export type RoomAir = 'wood' | 'carpet' | 'tiles' | 'concrete' | 'outdoors';
const AIR: Record<RoomAir, { seconds: number; wet: number; damp: number }> = {
  wood: { seconds: 0.35, wet: 0.1, damp: 0.5 },
  carpet: { seconds: 0.2, wet: 0.06, damp: 0.7 },
  tiles: { seconds: 0.7, wet: 0.18, damp: 0.25 },
  concrete: { seconds: 1.6, wet: 0.2, damp: 0.35 },
  outdoors: { seconds: 0.3, wet: 0.04, damp: 0.6 },
};
/** A change of room crossfades from one space to the next over about this long (s). */
const AIR_FADE_S = 0.3;
/** The world bus's send into the room's air, the two convolvers it crossfades between, and their return. */
let air: { send: GainNode; ret: GainNode; legs: { conv: ConvolverNode; gain: GainNode }[]; live: number; kind: RoomAir | null } | null = null;
const impulses = new Map<RoomAir, AudioBuffer>();

/** A synthetic impulse response: stereo noise under an exponential fall, its highs dying first (`damp`). */
function impulse(ctx: AudioContext, kind: RoomAir): AudioBuffer {
  const cached = impulses.get(kind);
  if (cached) return cached;
  const { seconds, damp } = AIR[kind];
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // A one-pole low-pass whose smoothing grows along the tail: bright at first, duller as it dies.
      const k = 1 - damp * t;
      low += (random() * 2 - 1 - low) * Math.max(0.05, k);
      data[i] = low * Math.pow(1 - t, 3);
    }
  }
  impulses.set(kind, buffer);
  return buffer;
}

/**
 * Sets the air of the room the listener is in (from what is underfoot: `Footsteps`): the world bus's
 * sounds ring on a little in it. Crossfades between two convolvers; the one faded out is let go.
 * Ignored until a gesture started the audio.
 */
export function setRoomAir(kind: RoomAir): void {
  const ctx = context;
  const world = gains.get('world');
  const master = gains.get('master');
  if (!ctx || ctx.state !== 'running' || !world || !master) return;
  if (!air) {
    const send = ctx.createGain();
    send.gain.value = 1;
    world.connect(send);
    const ret = ctx.createGain();
    ret.connect(scene ?? master);
    const legs = [0, 1].map(() => {
      const conv = ctx.createConvolver();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      conv.connect(gain).connect(ret);
      return { conv, gain };
    });
    air = { send, ret, legs, live: 0, kind: null };
  }
  if (air.kind === kind) return;
  const t = ctx.currentTime;
  // Two legs, `live` is 0 or 1: both indices exist.
  const out = air.legs[air.live]!;
  const next = air.legs[1 - air.live]!;
  out.gain.gain.setTargetAtTime(0, t, AIR_FADE_S / 3);
  const leaving = out;
  window.setTimeout(() => {
    if (air && air.legs[air.live] !== leaving) {
      try {
        air.send.disconnect(leaving.conv);
      } catch {
        // not connected
      }
    }
  }, AIR_FADE_S * 4000);
  next.conv.buffer = impulse(ctx, kind);
  try {
    air.send.disconnect(next.conv);
  } catch {
    // not connected
  }
  air.send.connect(next.conv);
  next.gain.gain.cancelScheduledValues(t);
  next.gain.gain.setValueAtTime(0, t);
  next.gain.gain.setTargetAtTime(AIR[kind].wet, t, AIR_FADE_S / 3);
  air.live = 1 - air.live;
  air.kind = kind;
}

/**
 * Fades the room's sounds (the world, the screens, the arcade; not the UI) to `level` (0..1) over
 * about `seconds`, and back with `level` 1: a travel crossfades one zone's sound into the next under
 * its curtain (`world/travel`). The mixer's own volumes are untouched.
 */
export function duckScene(level: number, seconds: number): void {
  const master = gains.get('master');
  if (!context || !master) return;
  if (!scene) {
    scene = context.createGain();
    scene.connect(master);
    for (const bus of ['world', 'screens', 'arcade'] as const) {
      const gain = gains.get(bus);
      if (!gain) continue;
      gain.disconnect(master);
      gain.connect(scene);
    }
    // The room's air fades with the room.
    if (air) {
      air.ret.disconnect(master);
      air.ret.connect(scene);
    }
  }
  scene.gain.setTargetAtTime(Math.min(1, Math.max(0, level)), context.currentTime, Math.max(0.01, seconds / 3));
}
