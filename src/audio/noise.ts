/**
 * The noise every synthesised sound is cut from, one buffer per context and length. A buffer is
 * never written again once filled, so any number of sources may play the same one at once; a
 * looping bed starts it at a random point (see `Voice.loop`) so two beds never line up.
 */
const whites = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
const browns = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

/** `seconds` of white noise (-1..1), mono. */
export function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return cached(whites, ctx, seconds, (data) => {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  });
}

/** `seconds` of brown noise (white integrated with a leak): deep and slow, a traffic rumble's raw stuff. */
export function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return cached(browns, ctx, seconds, (data) => {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  });
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
