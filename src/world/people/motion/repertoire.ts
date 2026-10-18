import type { Pose } from '../poses';
import type { Reaction } from '../performer';
import type { FaceKey, GestureName } from './gestures';
import { pick } from '@/random';

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
  if (ctx.seated) return pick(random, ['lookAround', 'rollShoulders', 'stretch', 'rubNose', 'chinRest', 'touchCheek']);
  if (ctx.pose !== 'stand') return pick(random, ['lookAround', 'rollShoulders', 'lookAround', 'rubNose']);
  const options: GestureName[] = ['scratchHead', 'rubNeck', 'checkWatch', 'rollShoulders', 'lookAround', 'lookAround', 'wipeHands', 'rubNose', 'scratchNape', 'touchCheek'];
  // The reserved keep their hands to themselves (joined, in a pocket); the expressive touch their face.
  if (ctx.expressive < 0.5) options.push('claspHands', 'pocketHand');
  else options.push('chinRest', 'rubNose');
  if (ctx.glasses) options.push('adjustGlasses', 'adjustGlasses');
  if (random() < 0.12) return 'stretch';
  return pick(random, options);
}

/**
 * A fidget for someone listening (a conversation, while the other talks), or null: the small
 * moves of attention and waiting, never a stretch or a look away round the room.
 */
export function listenFidget(ctx: Context, random: () => number): GestureName | null {
  if (ctx.holding || ctx.handsBusy) return random() < 0.5 ? 'listenTilt' : null;
  if (ctx.seated) return pick(random, ['listenTilt', 'listenTilt', 'chinRest', 'touchCheek', null]);
  if (ctx.pose !== 'stand') return pick(random, ['listenTilt', 'listenTilt', 'rubNose', null]);
  return pick(random, ['listenTilt', 'listenTilt', 'chinRest', 'claspHands', 'touchCheek', 'rubNose', ctx.expressive < 0.5 ? 'pocketHand' : 'chinRest', null]);
}

interface Response {
  gesture: GestureName | null;
  face: FaceKey;
  /** How long the face holds the feeling (s). */
  seconds: number;
  /** A nod of the head with it. */
  nod?: boolean;
}

/**
 * What a conversation's moment does to them (the social layer's reactions, `social/conversation` `Reaction`):
 * a loved topic lights them up, a polite "meh" is a look away, an insult hurts. Named here so the body needs no
 * social import.
 */
export type SocialAct = 'delighted' | 'pleased' | 'laugh' | 'thanks' | 'nod' | 'bored' | 'shrug' | 'annoyed' | 'hurt' | 'restless' | 'bye';

/**
 * Their manner, from who they are (the social layer's `voices.mannerOf`, named here likewise): the gruff keep it to a
 * nod, the shy cover a laugh with a hand, the proud straighten up where others wince, the lively throw their arms
 * about, the warm join their hands.
 */
export type Manner = 'gruff' | 'shy' | 'proud' | 'lively' | 'warm';

/** How much more (or less) the body joins in, by manner. */
const MANNER_BODY: Record<Manner, number> = { gruff: -0.25, shy: -0.15, proud: -0.1, lively: 0.25, warm: 0.05 };
/** How big the face goes, by manner. */
const MANNER_FACE: Record<Manner, number> = { gruff: 0.7, shy: 0.85, proud: 0.85, lively: 1.15, warm: 1.05 };

/** A social reaction's response: the gesture, the face (scaled), how long it holds and fades, a lean in or back (radians, held as long). */
interface SocialResponse extends Response {
  fade: number;
  lean: number;
}

/**
 * How they take a conversation's moment `act`, `strength` 0..1 (a little warmth, a big moment), in their own
 * measure: an expressive person laughs, claps, shakes their head where a reserved one smiles, presses their lips;
 * hands that are busy (holding something, on a machine) leave the arms out of it.
 */
export function respondSocial(act: SocialAct, strength: number, ctx: Context, random: () => number, manner?: Manner): SocialResponse {
  const s = Math.max(0, Math.min(1, strength));
  const e = Math.max(0, Math.min(1, ctx.expressive + (manner ? MANNER_BODY[manner] : 0)));
  // The bigger the moment and the more expressive the person, the likelier it shows in the body.
  const body = !ctx.handsBusy && !ctx.holding && !ctx.seated && random() < e * (0.35 + 0.65 * s);
  const amp = (0.55 + 0.45 * s) * (0.75 + 0.35 * e) * (manner ? MANNER_FACE[manner] : 1);
  const own = manner ? mannered(act, manner, body, s, random) : undefined;
  const face = (f: FaceKey): FaceKey => {
    const out: FaceKey = {};
    for (const [k, v] of Object.entries(f) as [keyof FaceKey, number][]) out[k] = Math.min(1, v * amp);
    return out;
  };
  switch (act) {
    case 'delighted':
      if (own !== undefined) return { gesture: own, face: face({ smile: 1, browsUp: 0.7, wide: 0.25 }), seconds: 2.2, fade: 1.4, nod: !own, lean: 0.07 * amp };
      return { gesture: body && s >= 0.8 ? 'clap' : null, face: face({ smile: 1, browsUp: 0.7, wide: 0.25 }), seconds: 2.2, fade: 1.4, nod: !body, lean: 0.07 * amp };
    case 'pleased':
      return { gesture: own ?? null, face: face({ smile: 0.75, browsUp: 0.3 }), seconds: 1.6, fade: 1.2, nod: !own, lean: 0.02 };
    case 'laugh':
      if (own !== undefined) return { gesture: own, face: face({ smile: 0.9, squint: 0.45, jaw: own === 'laugh' ? 0.3 : 0 }), seconds: 1.7, fade: 1, nod: !own, lean: 0 };
      if (body) return { gesture: 'laugh', face: face({ smile: 1, squint: 0.6, jaw: 0.3 }), seconds: 1.8, fade: 1, lean: 0 };
      // The reserved chuckle: a smile, the eyes narrowing, no more.
      return { gesture: null, face: face({ smile: 0.8, smirk: 0.35, squint: 0.35 }), seconds: 1.6, fade: 1, nod: random() < 0.5, lean: 0 };
    case 'thanks':
      if (own !== undefined) return { gesture: own, face: face({ smile: 0.9, browsUp: 0.45 }), seconds: 1.8, fade: 1.2, nod: !own, lean: 0.03 };
      return { gesture: body && s >= 0.8 ? 'handsJoin' : null, face: face({ smile: 0.9, browsUp: 0.45 }), seconds: 1.8, fade: 1.2, nod: true, lean: 0.03 };
    case 'nod':
      return { gesture: own ?? null, face: face({ smile: 0.3, smirk: 0.25 }), seconds: 1.1, fade: 1, nod: true, lean: 0 };
    case 'bored':
      return { gesture: own ?? 'glanceAway', face: face({ smirk: 0.3, press: 0.15 }), seconds: 1.3, fade: 0.8, lean: -0.01 };
    case 'shrug':
      return { gesture: body || random() < 0.4 ? 'shrug' : null, face: face({ browsUp: 0.4, smirk: 0.45 }), seconds: 1.3, fade: 0.9, lean: 0 };
    case 'annoyed':
      if (own !== undefined) return { gesture: own, face: face({ frown: 0.7, press: 0.6 }), seconds: 2, fade: 1.4, lean: -0.04 };
      return { gesture: body ? 'headShake' : random() < 0.5 ? 'wince' : null, face: face({ frown: 0.7, press: 0.6 }), seconds: 2, fade: 1.4, lean: -0.04 };
    case 'hurt':
      if (own !== undefined) return { gesture: own, face: face({ frown: 0.45, sad: 0.9, squint: 0.3 }), seconds: 3, fade: 2, lean: -0.05 };
      return { gesture: body ? pick(random, ['facepalm', 'headShake']) : 'wince', face: face({ frown: 0.45, sad: 0.9, squint: 0.3 }), seconds: 3, fade: 2, lean: -0.05 };
    case 'restless':
      return { gesture: ctx.holding ? null : 'checkWatch', face: face({ browsUp: 0.3, press: 0.4 }), seconds: 1.5, fade: 1, lean: 0 };
    case 'bye':
      return { gesture: ctx.holding || ctx.handsBusy ? null : 'wave', face: face({ smile: 0.6 }), seconds: 1.4, fade: 1, nod: ctx.holding || ctx.handsBusy, lean: 0 };
  }
}

/**
 * The gesture `manner` puts on `act` (null: none, on purpose; undefined: the shared way). `body`: the moment shows in
 * the body this time; `s` its strength.
 */
function mannered(act: SocialAct, manner: Manner, body: boolean, s: number, random: () => number): GestureName | null | undefined {
  switch (manner) {
    case 'gruff':
      // A nod and a grunt: nothing more, but a shake of the head when it annoys.
      if (act === 'delighted' || act === 'thanks' || act === 'laugh' || act === 'pleased') return null;
      if (act === 'annoyed') return 'headShake';
      if (act === 'bored') return 'sigh';
      return undefined;
    case 'shy':
      if (act === 'laugh') return body ? 'coverMouth' : null;
      if (act === 'delighted' || act === 'pleased') return body || random() < 0.35 ? 'touchCheek' : null;
      if (act === 'annoyed' || act === 'hurt') return 'glanceAway';
      if (act === 'nod') return random() < 0.3 ? 'rubNeck' : null;
      return undefined;
    case 'proud':
      if (act === 'hurt' || act === 'annoyed') return 'straighten';
      if (act === 'delighted') return body ? 'handsJoin' : null;
      if (act === 'laugh') return null;
      return undefined;
    case 'lively':
      if (act === 'delighted') return body && s >= 0.6 ? pick(random, ['clap', 'fistPump', 'cheerHop'] as const) : 'clap';
      if (act === 'laugh') return 'laugh';
      if (act === 'pleased') return body ? pick(random, ['rubHands', 'point'] as const) : null;
      if (act === 'bored') return 'sigh';
      return undefined;
    case 'warm':
      if (act === 'thanks' || act === 'delighted') return body ? 'handsJoin' : 'claspHands';
      if (act === 'pleased') return random() < 0.4 ? 'claspHands' : null;
      return undefined;
  }
}

/** How they take `reaction`: a gesture (or none), a face, maybe a nod. */
export function respond(reaction: Reaction, ctx: Context, random: () => number): Response {
  const body = random() < ctx.expressive;
  switch (reaction) {
    case 'good':
      return { gesture: null, face: { smile: 0.4, smirk: 0.35 }, seconds: 0.9, nod: random() < 0.5 };
    case 'great':
      if (!body) return { gesture: null, face: { smile: 1, browsUp: 0.4 }, seconds: 1.6, nod: true };
      return { gesture: ctx.handsBusy || random() < 0.6 ? 'fistPump' : 'clap', face: { smile: 1, browsUp: 0.3 }, seconds: 1.8 };
    case 'record':
      return { gesture: body || random() < 0.5 ? 'cheerHop' : 'fistPump', face: { smile: 1, browsUp: 0.8, jaw: 0.4, wide: 0.5 }, seconds: 2.6 };
    case 'fail':
      if (ctx.handsBusy) return { gesture: random() < 0.6 ? 'wince' : 'headShake', face: { frown: 0.7, squint: 0.4, press: 0.6 }, seconds: 1.4 };
      return { gesture: body ? pick(random, ['headShake', 'facepalm', 'slapPanel']) : 'wince', face: { frown: 0.7, squint: 0.3, sneer: 0.4, press: 0.3 }, seconds: 1.8 };
    case 'near':
      if (!body) return { gesture: 'headShake', face: { browsUp: 0.9, jaw: 0.3, frown: 0.2, wide: 0.7 }, seconds: 1.6 };
      return { gesture: random() < 0.65 ? 'handsOnHead' : 'coverMouth', face: { browsUp: 1, jaw: 0.35, wide: 1 }, seconds: 1.8 };
    case 'over':
      return { gesture: pick(random, ['sigh', 'sigh', 'rubNeck', 'stretch', 'headShake']), face: { sad: 0.55, puff: 0.35 }, seconds: 1.5 };
    case 'ready':
      return { gesture: ctx.handsBusy && random() < 0.5 ? null : 'rubHands', face: { smile: 0.35, smirk: 0.4 }, seconds: 1.2 };
  }
}

