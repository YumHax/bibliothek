import type { Pose } from '../poses';
import type { Reaction } from '../performer';
import type { FaceKey, GestureName } from './gestures';

/*
 * What a person does of their own accord, from the gestures they know: the fidgets of someone
 * standing about (a scratch, a look at the watch, a roll of the shoulders, a look round), suited to
 * how they stand (arms folded, nobody scratches their head), and how they react to what happens to
 * them (`Reaction`), in their own measure: the expressive show it with the whole body, the
 * reserved mostly on the face; hands busy on a machine lift off only for the big moments.
 */

export interface Context {
  pose: Pose;
  seated: boolean;
  /** Hands on a machine's controls. */
  handsBusy: boolean;
  /** Something in the hand (a phone, a book, an umbrella). */
  holding: boolean;
  glasses: boolean;
  /** 0..1, the temperament's. */
  expressive: number;
}

/** A fidget for someone standing (or sitting) idle, or null: nothing this time. */
export function idleFidget(ctx: Context, random: () => number): GestureName | null {
  if (ctx.holding) return random() < 0.5 ? 'lookAround' : null;
  if (ctx.handsBusy) return random() < 0.4 ? 'rollShoulders' : null;
  if (ctx.seated) return pick(['lookAround', 'rollShoulders', 'stretch'], random);
  if (ctx.pose !== 'stand') return pick(['lookAround', 'rollShoulders', 'lookAround'], random);
  const options: GestureName[] = ['scratchHead', 'rubNeck', 'checkWatch', 'rollShoulders', 'lookAround', 'lookAround', 'wipeHands'];
  if (ctx.glasses) options.push('adjustGlasses', 'adjustGlasses');
  if (random() < 0.12) return 'stretch';
  return pick(options, random);
}

export interface Response {
  gesture: GestureName | null;
  face: FaceKey;
  /** How long the face holds the feeling (s). */
  seconds: number;
  /** A nod of the head with it. */
  nod?: boolean;
}

/** How they take `reaction`: a gesture (or none), a face, maybe a nod. */
export function respond(reaction: Reaction, ctx: Context, random: () => number): Response {
  const body = random() < ctx.expressive;
  switch (reaction) {
    case 'good':
      return { gesture: null, face: { smile: 0.55 }, seconds: 0.9, nod: random() < 0.5 };
    case 'great':
      if (!body) return { gesture: null, face: { smile: 1, browsUp: 0.4 }, seconds: 1.6, nod: true };
      return { gesture: ctx.handsBusy || random() < 0.6 ? 'fistPump' : 'clap', face: { smile: 1, browsUp: 0.3 }, seconds: 1.8 };
    case 'record':
      return { gesture: body || random() < 0.5 ? 'cheerHop' : 'fistPump', face: { smile: 1, browsUp: 0.8, jaw: 0.4 }, seconds: 2.6 };
    case 'fail':
      if (ctx.handsBusy) return { gesture: random() < 0.6 ? 'wince' : 'headShake', face: { frown: 0.8, squint: 0.4 }, seconds: 1.4 };
      return { gesture: body ? pick(['headShake', 'facepalm', 'slapPanel'], random) : 'wince', face: { frown: 0.9, squint: 0.3 }, seconds: 1.8 };
    case 'near':
      if (!body) return { gesture: 'headShake', face: { browsUp: 0.9, jaw: 0.3, frown: 0.2 }, seconds: 1.6 };
      return { gesture: random() < 0.65 ? 'handsOnHead' : 'coverMouth', face: { browsUp: 1, jaw: 0.35 }, seconds: 1.8 };
    case 'over':
      return { gesture: pick(['sigh', 'sigh', 'rubNeck', 'stretch', 'headShake'], random), face: { frown: 0.3 }, seconds: 1.5 };
    case 'ready':
      return { gesture: ctx.handsBusy && random() < 0.5 ? null : 'rubHands', face: { smile: 0.5 }, seconds: 1.2 };
  }
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)]!;
}
