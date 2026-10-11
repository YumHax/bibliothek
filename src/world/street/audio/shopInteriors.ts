import { birdNote } from '@/audio/street/streetVoices';
import { tone } from '@/audio/synth';
import type { ShopKind } from '../streetPlan';
import type { SoundGraph } from './soundGraph';
import { random } from '@/random';

/*
 * What the street's shops sound like from the pavement, kind by kind (beside the cafés', bars', arcade's and
 * laundry's own in `ShopSounds`): a bed that runs while the shop is open, voices talking, a one-off now and then,
 * a tune. Heard faintly through the shut door and the glass (`glass`), in full while the door stands open after
 * someone went in or out (`ShopSounds.ring`). All synthesised.
 */

/** One shop kind's sound. */
export interface Interior {
  /** Loudness at the door when it is open, and the distance (m) at which it has halved. */
  loudness: number;
  reach: number;
  /** The share heard through the shut door and the glass. */
  glass: number;
  /** Voices talking inside (customers, a radio's commentator, a TV): how many, in which speech bands, how narrow. */
  voices?: { count: number; formants: readonly number[]; q: number; level: number };
  /** A bed running while it is open, into `out` (built with the graph). */
  bed?: (g: SoundGraph, out: AudioNode) => void;
  /** A one-off every so many seconds while it is open. */
  every?: readonly [number, number];
  tick?: (g: SoundGraph, out: AudioNode) => void;
  /** A tune playing inside (`BarMusic` full, these jukebox stations), at this level. */
  tune?: { styles: readonly string[]; level: number; cutoff: number };
}

export const INTERIORS: Partial<Record<ShopKind, Interior>> = {
  // The bakery: the ovens' extractor, the till, paper bags, the bread knife on the slicer.
  bakery: {
    loudness: 0.3, reach: 3, glass: 0.25,
    voices: { count: 2, formants: [520, 760, 1050], q: 3, level: 0.6 },
    bed: (g, out) => hum(g, out, 110, 0.18, 380),
    every: [2.5, 7],
    tick: (g, out) => (random() < 0.35 ? till(g, out) : random() < 0.6 ? paperBag(g, out) : slicer(g, out)),
  },
  // The newsagent: the till's beeps, the lottery terminal printing a ticket, pages of a paper turned.
  tabac: {
    loudness: 0.25, reach: 3, glass: 0.25,
    voices: { count: 2, formants: [480, 700, 980], q: 3, level: 0.5 },
    every: [3, 9],
    tick: (g, out) => (random() < 0.5 ? beeps(g, out) : random() < 0.6 ? printer(g, out) : pageTurn(g, out)),
  },
  // TV REPAIR: the wall of sets in snow, a set's voice, the CRTs' whine, a soldering iron's tick.
  electronics: {
    loudness: 0.25, reach: 3.2, glass: 0.3,
    voices: { count: 2, formants: [600, 900, 1300], q: 5, level: 0.45 },
    bed: (g, out) => {
      g.loop().connect(g.filter('highpass', 1800, 0.7)).connect(g.filter('lowpass', 7000)).connect(g.gain(0.12)).connect(out);
      g.oscillator('sine', 15734).connect(g.gain(0.006)).connect(out);
    },
    every: [4, 11],
    tick: (g, out) => crackle(g, out),
  },
  // The pet shop: the budgies chattering, the fish tank's bubbler.
  pets: {
    loudness: 0.3, reach: 3, glass: 0.3,
    bed: (g, out) => {
      hum(g, out, 100, 0.05, 260);
      g.loop().connect(g.filter('bandpass', 900, 0.8)).connect(g.gain(0.05)).connect(out);
    },
    every: [1.2, 5],
    tick: (g, out) => budgies(g, out),
  },
  // RETRO GAMES: a demo cart on the TV in the window, a box put down on the counter, the till.
  retro: {
    loudness: 0.3, reach: 3.5, glass: 0.35,
    voices: { count: 2, formants: [500, 720, 1000], q: 3, level: 0.5 },
    tune: { styles: ['CHIPTUNE'], level: 0.3, cutoff: 2600 },
    every: [5, 12],
    tick: (g, out) => (random() < 0.5 ? till(g, out) : boxDown(g, out)),
  },
  // The florist: the mister over the buckets, paper wrapped round a bouquet, the shears.
  florist: {
    loudness: 0.22, reach: 2.8, glass: 0.25,
    voices: { count: 1, formants: [700, 1000], q: 3, level: 0.5 },
    every: [4, 10],
    tick: (g, out) => (random() < 0.4 ? mister(g, out) : random() < 0.6 ? paperBag(g, out) : shears(g, out)),
  },
  // The greengrocer: the radio on the shelf with the football (a commentator, the crowd swelling), crates.
  grocer: {
    loudness: 0.28, reach: 3.2, glass: 0.3,
    voices: { count: 2, formants: [650, 950, 1250], q: 6, level: 0.55 },
    bed: (g, out) => {
      // The radio's stadium: a far crowd's roar under the commentary, swelling and falling.
      const roar = g.gain(0.08);
      g.loop().connect(g.filter('bandpass', 700, 0.5)).connect(roar).connect(out);
      const swell = g.oscillator('sine', 0.07);
      swell.connect(g.gain(0.06)).connect(roar.gain);
    },
    every: [5, 14],
    tick: (g, out) => crateDown(g, out),
  },
  // The butcher: the cleaver on the block, the cold room's compressor.
  butcher: {
    loudness: 0.3, reach: 3, glass: 0.25,
    voices: { count: 1, formants: [450, 680], q: 3, level: 0.5 },
    bed: (g, out) => hum(g, out, 98, 0.1, 300),
    every: [2.5, 8],
    tick: (g, out) => cleaver(g, out),
  },
  // The bookshop: hushed; a page turned, a book shelved, the old clock.
  books: {
    loudness: 0.12, reach: 2.5, glass: 0.2,
    bed: (g, out) => clockTicks(g, out),
    every: [5, 14],
    tick: (g, out) => (random() < 0.6 ? pageTurn(g, out) : boxDown(g, out)),
  },
  // The pharmacy: the till's beep, the automatic till drawer, a murmur at the counter.
  pharmacy: {
    loudness: 0.15, reach: 2.6, glass: 0.2,
    voices: { count: 1, formants: [520, 800], q: 3, level: 0.4 },
    bed: (g, out) => hum(g, out, 120, 0.04, 400),
    every: [6, 15],
    tick: (g, out) => beeps(g, out),
  },
  // The furniture shop: a long-case clock among the armchairs, a drawer run in and out.
  furniture: {
    loudness: 0.12, reach: 2.6, glass: 0.2,
    bed: (g, out) => clockTicks(g, out),
    every: [8, 18],
    tick: (g, out) => boxDown(g, out),
  },
};

/** A motor's or a fridge's hum: a low sawtooth through a low-pass. */
function hum(g: SoundGraph, out: AudioNode, hz: number, level: number, cutoff: number): void {
  g.oscillator('sawtooth', hz).connect(g.filter('lowpass', cutoff)).connect(g.gain(level)).connect(out);
}

/** A clock ticking, once a second (a pulse train through a woody band). */
function clockTicks(g: SoundGraph, out: AudioNode): void {
  const pulse = g.oscillator('square', 1);
  pulse.connect(g.filter('highpass', 2200, 4)).connect(g.filter('bandpass', 3000, 3)).connect(g.gain(0.08)).connect(out);
}

/** A noise burst through a band, into `out`. */
function scrape(g: SoundGraph, out: AudioNode, at: number, hz: number, q: number, envelope: readonly (readonly [number, number])[]): void {
  const band = g.filter('bandpass', hz, q);
  band.connect(out);
  g.shaped(band, at, envelope);
  window.setTimeout(() => band.disconnect(), 3000); // convention-ok: audio
}

/** The till: a drawer sprung open on its bell. */
function till(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  tone(g.ctx, out, t, { frequency: 2100, level: 0.08, length: 0.6 });
  tone(g.ctx, out, t, { frequency: 3300, level: 0.03, length: 0.4 });
  scrape(g, out, t + 0.02, 700, 1.5, [[0.01, 0.25], [0.15, 0]]);
}

/** A paper bag shaken open or a bouquet wrapped: a crinkle of quick high bursts. */
function paperBag(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  for (let i = 0; i < 7; i++) g.burst(out, t + i * 0.03 + random() * 0.04, 0.02, 0.05 + random() * 0.05);
}

/** The bread slicer's blade: a buzz for a second. */
function slicer(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  const osc = g.ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 140;
  const env = g.gain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.06, t + 0.1);
  env.gain.setValueAtTime(0.06, t + 1);
  env.gain.linearRampToValueAtTime(0, t + 1.2);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 1.25);
  scrape(g, out, t + 0.1, 2400, 1, [[0.1, 0.06], [1, 0.05], [1.1, 0]]);
}

/** A till's or a scanner's beeps. */
function beeps(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  const n = 1 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) tone(g.ctx, out, t + i * 0.35, { frequency: 1800, level: 0.03, length: 0.09, type: 'square' });
}

/** A ticket printer's rapid ratchet. */
function printer(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  const band = g.filter('bandpass', 2800, 3);
  band.connect(out);
  for (let k = 0; k < 30; k++) g.burst(band, t + k * 0.03, 0.01, 0.08);
  window.setTimeout(() => band.disconnect(), 2000); // convention-ok: audio
}

/** A page turned: a soft rising swish. */
function pageTurn(g: SoundGraph, out: AudioNode): void {
  scrape(g, out, g.now + 0.02, 2600, 0.8, [[0.08, 0.1], [0.25, 0.04], [0.3, 0]]);
}

/** The static crackle of a set being tuned. */
function crackle(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  for (let i = 0; i < 12; i++) g.burst(out, t + random() * 0.6, 0.008, 0.06 + random() * 0.1);
}

/** The budgies: a burst of quick warbled notes, high and bright. */
function budgies(g: SoundGraph, out: AudioNode): void {
  let at = g.now + 0.02;
  const notes = 3 + Math.floor(random() * 6);
  for (let i = 0; i < notes; i++) {
    const from = 2600 + random() * 1600;
    const length = 0.04 + random() * 0.06;
    birdNote(g.ctx, out, { at, from, to: from * (0.7 + random() * 0.65), sweep: length * 0.8, attack: 0.008, length, level: 0.08 + random() * 0.1 });
    at += length + 0.02 + random() * 0.07;
  }
}

/** A box or a book put down on a counter: a woody knock. */
function boxDown(g: SoundGraph, out: AudioNode): void {
  const band = g.filter('bandpass', 380 + random() * 200, 1.6);
  band.connect(out);
  g.burst(band, g.now + 0.02, 0.07, 0.3);
  window.setTimeout(() => band.disconnect(), 1000); // convention-ok: audio
}

/** A crate of fruit dropped on the stack: a hollow knock and a rattle. */
function crateDown(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  const band = g.filter('bandpass', 300, 1.4);
  band.connect(out);
  g.burst(band, t, 0.1, 0.4);
  for (let i = 0; i < 4; i++) g.burst(band, t + 0.1 + i * 0.04, 0.02, 0.12);
  window.setTimeout(() => band.disconnect(), 1500); // convention-ok: audio
}

/** The cleaver through a joint into the block: a meaty thwack, the wood's knock. */
function cleaver(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  const chops = random() < 0.5 ? 1 : 2 + Math.floor(random() * 2);
  for (let i = 0; i < chops; i++) {
    const at = t + i * 0.45;
    const low = g.filter('lowpass', 260);
    low.connect(out);
    g.burst(low, at, 0.09, 0.5);
    const wood = g.filter('bandpass', 900, 2);
    wood.connect(out);
    g.burst(wood, at + 0.005, 0.04, 0.18);
    window.setTimeout(() => { // convention-ok: audio
      low.disconnect();
      wood.disconnect();
    }, 2500);
  }
}

/** The florist's mister: a fine hiss over the buckets. */
function mister(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  const n = 2 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) scrape(g, out, t + i * 0.5, 5200, 0.7, [[0.03, 0.07], [0.3, 0.05], [0.35, 0]]);
}

/** Shears through stems: two crisp snips. */
function shears(g: SoundGraph, out: AudioNode): void {
  const t = g.now + 0.02;
  for (const at of [0, 0.3]) {
    scrape(g, out, t + at, 3800, 4, [[0.005, 0.15], [0.05, 0]]);
    tone(g.ctx, out, t + at + 0.01, { frequency: 4400, level: 0.015, length: 0.08 });
  }
}
