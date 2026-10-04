import { random } from '@/random';
/**
 * The noise every synthesised sound is cut from, one buffer per context and length. A buffer is
 * never written again once filled, so any number of sources may play the same one at once; a
 * looping bed starts it at a random point (see `Voice.loop`) so two beds never line up. The shaped
 * kinds (`decayingNoise`, `crackleNoise`) are for a sound whose envelope is in the grain itself (a
 * knock's tap, a shutter, a page): cached too, keyed by their shape as well as their length.
 */
const whites = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
const browns = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
const shaped = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** `seconds` of white noise (-1..1), mono. */
export function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return cached(whites, ctx, seconds, (data) => {
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  });
}

/** `seconds` of brown noise (white integrated with a leak): deep and slow, a traffic rumble's raw stuff. */
export function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return cached(browns, ctx, seconds, (data) => {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  });
}

/**
 * `seconds` of white noise dying away over its length, `(1 - t) ^ power`: a tap's grain, a shutter's
 * click, where the fall is in the sample itself and the source plays it once from the start.
 */
export function decayingNoise(ctx: BaseAudioContext, seconds: number, power: number): AudioBuffer {
  return shapedNoise(ctx, `decay:${seconds}:${power}`, seconds, (data) => {
    for (let i = 0; i < data.length; i++) data[i] = (random() * 2 - 1) * (1 - i / data.length) ** power;
  });
}

/**
 * `seconds` of white noise under a raised-sine swell with a slow crackle laid on it (a page being
 * turned, paper rustling): `(sin² of the position) * (0.6 + 0.4 sin(i / 90))`.
 */
export function crackleNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return shapedNoise(ctx, `crackle:${seconds}`, seconds, (data) => {
    for (let i = 0; i < data.length; i++) {
      const envelope = Math.sin((Math.PI * i) / data.length) ** 2;
      data[i] = (random() * 2 - 1) * envelope * (0.6 + 0.4 * Math.sin(i / 90));
    }
  });
}

function shapedNoise(ctx: BaseAudioContext, key: string, seconds: number, fill: (data: Float32Array) => void): AudioBuffer {
  let buffers = shaped.get(ctx);
  if (!buffers) shaped.set(ctx, (buffers = new Map()));
  let buffer = buffers.get(key);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
    fill(buffer.getChannelData(0));
    buffers.set(key, buffer);
  }
  return buffer;
}

function cached(
  store: WeakMap<BaseAudioContext, Map<number, AudioBuffer>>,
  ctx: BaseAudioContext,
  seconds: number,
  fill: (data: Float32Array) => void,
): AudioBuffer {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  let buffers = store.get(ctx);
  if (!buffers) store.set(ctx, (buffers = new Map()));
  let buffer = buffers.get(length);
  if (!buffer) {
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    fill(buffer.getChannelData(0));
    buffers.set(length, buffer);
  }
  return buffer;
}
