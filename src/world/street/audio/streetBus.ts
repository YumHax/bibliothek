import { outdoorsInput } from '@/audio/audioContext';

/**
 * Where every sound of Front Street connects (the traffic, the shops, the cues, the people, the
 * works): `outdoorsInput` (muffled from the building's sas) with the facades' answer on top. The
 * street is a canyon 24 m between building lines: a sound bounces back off the near and the far
 * row a few tens of milliseconds later, duller and to the other side. Two short delays, panned
 * apart, low-passed, with a little feedback; kept faint (a hint of the walls, never an echo).
 * One per audio context, never torn down (the street's own graphs come and go in front of it).
 */
const ECHO = {
  /** Seconds to the near and the far facade and back, for a listener on the pavement. */
  delays: [0.034, 0.118],
  pans: [-0.55, 0.55],
  /** Level of each reflection and how much of it comes round again. */
  wet: 0.09,
  feedback: 0.22,
  /** Brick and render swallow the highs. */
  lowpass: 2600,
};

const inputs = new WeakMap<BaseAudioContext, AudioNode>();

export function streetInput(ctx: BaseAudioContext): AudioNode {
  const known = inputs.get(ctx);
  if (known) return known;
  const out = outdoorsInput(ctx);
  const input = ctx.createGain();
  input.connect(out);
  ECHO.delays.forEach((seconds, i) => {
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
  });
  inputs.set(ctx, input);
  return input;
}
