import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan';

/*
 * THE CAT'S OUTINGS, as data: when it slips out of the flat's open front door, where it goes in the
 * stairwell (zone-local metres of `STAIRWELL_PLAN`, its yaw there: +z is the cat's forward) and
 * what it does there, and who brings it back. Read by `CatOuting` and `escapes`.
 */

/** Where it hides: on a landing's doormat, in the lift's car, by the hall's mailboxes, or in at a neighbour's. */
export type HideKind = 'landing' | 'lift' | 'mailboxes' | 'neighbour';

export interface HideSpot {
  kind: HideKind;
  /** The landing (0 ours .. 5 the hall). */
  k: number;
  at: [number, number];
  yaw: number;
  pose: 'loaf' | 'sit';
  /** The share of outings that end here (the neighbour's only while they are in). */
  weight: number;
  /** Whose door, for `neighbour` (their door's key). */
  door?: string;
}

const { doorX, walk, car } = STAIRWELL_PLAN;
/** On a doormat, just off the door, facing the well. */
const MAT_Z = walk.doorZ + 0.13;

export const CAT_OUTING = {
  /** The front door stands open this long (s) with the cat about, and it may go. */
  doorOpenS: 3,
  /** The cat this near the door (m, inside) to try it. */
  reach: 7,
  /** Of the doors left open long enough with the cat about, this share tempt it. */
  chance: 0.3,
  /** At most one outing every this many game days. */
  everyDays: 2,
  /** Its trot down the stairs and back up (m/s). */
  speed: 0.95,
  /** A miaow from its hiding place every so often (s), louder than indoors: the stone carries it. */
  meowEveryS: { min: 7, max: 14 },
  /** Down the well its voice carries: heard as if this much nearer (share of the distance). */
  carry: 0.5,
  /** Called (C) from this near (m), it comes; further off, it only answers. */
  comesWithin: 4.5,
  /** At a neighbour's: they bring it back after this long (s). */
  neighbourKeepsS: { min: 70, max: 150 },
  /** Of the times it walks home by itself, this share it brings something back in its mouth. */
  bringsBack: 0.3,
  spots: [
    { kind: 'landing', k: 1, at: [doorX[1] + 0.2, MAT_Z], yaw: Math.PI, pose: 'loaf', weight: 0.12 },
    { kind: 'landing', k: 2, at: [doorX[0] + 0.15, MAT_Z], yaw: Math.PI, pose: 'loaf', weight: 0.12 },
    { kind: 'landing', k: 4, at: [doorX[1] - 0.1, MAT_Z], yaw: Math.PI, pose: 'sit', weight: 0.1 },
    { kind: 'lift', k: 0, at: [(car.x0 + car.x1) / 2, car.z0 + 0.45], yaw: 0, pose: 'sit', weight: 0.18 },
    { kind: 'mailboxes', k: 5, at: [0.88, 3.05], yaw: Math.PI / 2, pose: 'loaf', weight: 0.16 },
    // Mrs Dubois, 3rd floor right: she always has ham.
    { kind: 'neighbour', k: 3, at: [doorX[1], walk.doorZ + 0.05], yaw: Math.PI, pose: 'sit', weight: 0.32, door: '3:1' },
  ] as HideSpot[],
  /** Who brings it back from in their flat, and what they say at the door. */
  neighbour: {
    name: 'Mrs Dubois',
    seed: 73,
    lines: [
      'Is this one yours? He was in my kitchen, eating ham.',
      'I found your little one on my sofa. We had a lovely time, didn’t we?',
      'He came in when I opened for the paper. I gave him a bit of chicken, I hope that’s all right.',
    ],
    /** She leaves the cat on the doormat if nobody answers. */
    note: { title: 'YOUR CAT', lines: ['was visiting me again.', 'I left him on your mat.'], accent: 0xc98a8a, look: 'letter' as const, from: 'Mrs Dubois, 3rd floor' },
    /** A chat's worth of standing with her, each time. */
    friendship: 4,
  },
  /** What it may bring back in its mouth (a read card, its look a note). */
  finds: [
    { title: 'Something in its mouth', text: 'A torn cartridge label, half chewed. You can still read “…TENDO”.' },
    { title: 'Something in its mouth', text: 'A brass button. From a coat on the landing, probably. Better not ask whose.' },
    { title: 'Something in its mouth', text: 'A dusty feather. It drops it at your feet, very proud of itself.' },
    { title: 'Something in its mouth', text: 'A folded receipt from the flea market: “1 × boîte de jeux, 3 €”. Not yours.' },
  ],
};
