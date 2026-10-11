import { outdoorsInput } from '@/audio/audioContext';

/**
 * Where every sound of Front Street connects (the traffic, the shops, the cues, the people, the
 * works): `outdoorsInput` (muffled from the building's sas) with the walls' answer on top. Between
 * two rows of facades a sound bounces back off the near and the far one a few tens of milliseconds
 * later, duller and from their side: two short delays, panned apart, low-passed, with a little
 * feedback; kept faint (a hint of the walls, never an echo). How far and how loud each comes back
 * follows where the listener stands (`setStreetEcho`, from `StreetSound`): the canyon of Front
 * Street, one wall along Park Street with the open park across, almost dry in the park, a close
 * slap in the corner bay or under the bus shelter. One per audio context, never torn down (the
 * street's own graphs come and go in front of it).
 */
const ECHO = {
  /** Seconds to the near and the far facade and back, for a listener on Front Street's pavement (until told otherwise). */
  delays: [0.034, 0.118],
  pans: [-0.55, 0.55],
  /** Level of each reflection and how much of it comes round again. */
  wet: 0.09,
  feedback: 0.22,
  /** Brick and render swallow the highs. */
  lowpass: 2600,
  /** How quickly the reflections follow the listener (s): a walk, never a jump (a delay line sliding is a pitch glide). */
  follow: 0.6,
};

/** What the walls send back where the listener stands: per reflection (near, far), its delay (s), level and side. */
export interface StreetEcho {
  delays: readonly [number, number];
  wet: readonly [number, number];
  pans: readonly [number, number];
}

interface Reflection {
  delay: DelayNode;
  wet: GainNode;
  pan: StereoPannerNode;
}

const inputs = new WeakMap<BaseAudioContext, { input: AudioNode; reflections: Reflection[] }>();

export function streetInput(ctx: BaseAudioContext): AudioNode {
  return bus(ctx).input;
}

/** Moves the walls' answer to where the listener stands (eased). */
export function setStreetEcho(ctx: BaseAudioContext, echo: StreetEcho): void {
  const t = ctx.currentTime;
  bus(ctx).reflections.forEach((r, i) => {
    r.delay.delayTime.setTargetAtTime(echo.delays[i] ?? 0.05, t, ECHO.follow);
    r.wet.gain.setTargetAtTime(echo.wet[i] ?? 0, t, ECHO.follow);
    r.pan.pan.setTargetAtTime(echo.pans[i] ?? 0, t, ECHO.follow / 2);
  });
}

function bus(ctx: BaseAudioContext): { input: AudioNode; reflections: Reflection[] } {
  const known = inputs.get(ctx);
  if (known) return known;
  const out = outdoorsInput(ctx);
  const input = ctx.createGain();
  input.connect(out);
  const reflections = ECHO.delays.map((seconds, i) => {
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = seconds;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = ECHO.lowpass;
    const back = ctx.createGain();
    back.gain.value = ECHO.feedback;
    const wet = ctx.createGain();
    wet.gain.value = ECHO.wet;
    const pan = ctx.createStereoPanner();
    pan.pan.value = ECHO.pans[i] ?? 0;
    input.connect(delay).connect(dull).connect(wet).connect(pan).connect(out);
    dull.connect(back).connect(delay);
    return { delay, wet, pan };
  });
  const made = { input, reflections };
  inputs.set(ctx, made);
  return made;
}
