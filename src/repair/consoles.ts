import type { PlatformId } from '@/catalog/types';

/*
 * Broken consoles and what is wrong with them (docs/household.md "Repairing a console"): each platform has the
 * faults it is known for, each fault the tool that fixes it and how the hands go about it at the kitchen table
 * (`ui/repair/RepairPanel`). Numbers are first guesses.
 */

/** What can be wrong with a console. */
export type FaultId = 'pins' | 'contacts' | 'capacitor' | 'fuse' | 'battery' | 'lens' | 'ribbon';

/** What is on the bench. */
export type ToolId = 'brush' | 'iron' | 'spare' | 'swab' | 'screwdriver';

/** How the fix is done: rubbed clean, an old part swapped for a new one, joints soldered. */
export type RepairAction = 'scrub' | 'swap' | 'solder';

export interface Fault {
  /** What the seller says it does ("blinks and won't start"). */
  symptom: string;
  /** What the player finds once it is open. */
  finding: string;
  /** The part of the board it is in (`RepairPanel` draws and names them). */
  part: BoardPart;
  tool: ToolId;
  action: RepairAction;
  /** What the job card says once done. */
  done: string;
  /** The other way the same fault shows on some consoles (`faultOf` picks which): what the seller says, what is found. */
  alt: { symptom: string; finding: string };
}

/** The parts drawn on a board: the faulty one is one of them, the rest look fine. */
export type BoardPart = 'connector' | 'capacitor' | 'fuse' | 'battery' | 'lens' | 'ribbon' | 'regulator' | 'cpu';

export const FAULTS: Readonly<Record<FaultId, Fault>> = {
  pins: {
    symptom: 'The power light blinks and the picture never comes.',
    finding: 'The 72-pin connector’s pins are bent and black: the cartridge never seats.',
    part: 'connector',
    tool: 'spare',
    action: 'swap',
    done: 'A new 72-pin connector: the cartridge seats with a soft click.',
    alt: { symptom: 'You have to wiggle the cartridge for ages before anything comes up.', finding: 'The connector’s pins are splayed: a cartridge only touches them pushed hard to one side.' },
  },
  contacts: {
    symptom: 'Games freeze, or the screen comes up garbled.',
    finding: 'The cartridge slot’s contacts are furred with grime and oxide.',
    part: 'connector',
    tool: 'brush',
    action: 'scrub',
    done: 'The contacts scrubbed bright with cleaner and a brush.',
    alt: { symptom: 'Some games work, some don’t, and blowing on them only helps sometimes.', finding: 'Black tarnish along the slot’s contacts, worst at the middle where every cartridge rubs.' },
  },
  capacitor: {
    symptom: 'No sound, and a hum through the picture.',
    finding: 'One capacitor by the power socket has leaked: its top is domed and crusted.',
    part: 'capacitor',
    tool: 'iron',
    action: 'solder',
    done: 'The leaky capacitor out, a new one soldered in.',
    alt: { symptom: 'The picture rolls, and it crackles when it warms up.', finding: 'A capacitor near the regulator has bulged and wept brown onto the board.' },
  },
  fuse: {
    symptom: 'Dead: no light, nothing.',
    finding: 'The fuse by the power input is blown, its glass blackened.',
    part: 'fuse',
    tool: 'spare',
    action: 'swap',
    done: 'A new fuse in its clips.',
    alt: { symptom: 'It clicked once, smelled hot, and that was that.', finding: 'The little fuse has gone grey inside: the wire in it melted through.' },
  },
  battery: {
    symptom: 'Will not switch on on batteries.',
    finding: 'Old batteries leaked in it: the terminals are crusted white and green.',
    part: 'battery',
    tool: 'swab',
    action: 'scrub',
    done: 'The terminals cleaned with vinegar on a cotton bud, then dried.',
    alt: { symptom: 'Dead on batteries, fine on the mains adapter, which nobody has any more.', finding: 'White crust has crept up the battery springs: someone left a set in over a winter.' },
  },
  lens: {
    symptom: 'Spins the disc, then gives up.',
    finding: 'The laser’s lens is filmed with dust and smoke.',
    part: 'lens',
    tool: 'swab',
    action: 'scrub',
    done: 'The lens wiped clean with alcohol on a cotton bud.',
    alt: { symptom: 'The disc spins up, slows, and the menu comes back.', finding: 'A furry film on the laser lens: years of a smoker’s living room.' },
  },
  ribbon: {
    symptom: 'Lines missing down the screen.',
    finding: 'The screen’s ribbon cable has come loose at its joints.',
    part: 'ribbon',
    tool: 'iron',
    action: 'solder',
    done: 'The ribbon’s joints reflowed: every line back.',
    alt: { symptom: 'Half the screen is just bars, and it flickers if you press the corner.', finding: 'The ribbon cable’s joints have cracked at one end: they only touch when pressed.' },
  },
};

/** The bench's tools, as the tray names them (`ui/repair/repairArt` draws them). */
export const TOOLS: Readonly<Record<ToolId, { name: string }>> = {
  brush: { name: 'Contact cleaner and brush' },
  iron: { name: 'Soldering iron' },
  spare: { name: 'Spare parts box' },
  swab: { name: 'Cotton buds' },
  screwdriver: { name: 'Screwdriver' },
};

/** Each platform's faults, its value working (coins), and how many screws hold its shell. */
export const CONSOLES: Readonly<Record<PlatformId, { faults: readonly FaultId[]; value: number; screws: number; shell: string; band: string }>> = {
  nes: { faults: ['pins', 'contacts', 'fuse'], value: 110, screws: 6, shell: '#c9c6bd', band: '#3b3a3d' },
  snes: { faults: ['capacitor', 'contacts', 'fuse'], value: 120, screws: 6, shell: '#cfcdc6', band: '#8a86a8' },
  n64: { faults: ['contacts', 'fuse'], value: 110, screws: 4, shell: '#3a3b40', band: '#2a2b30' },
  megadrive: { faults: ['capacitor', 'contacts'], value: 90, screws: 4, shell: '#1f1f22', band: '#c8463a' },
  gb: { faults: ['battery', 'ribbon', 'contacts'], value: 80, screws: 6, shell: '#c4c2b6', band: '#5c5f8a' },
  ps1: { faults: ['lens', 'capacitor'], value: 85, screws: 4, shell: '#b8b8b4', band: '#5a5a62' },
};

export const REPAIR = {
  /** A broken console sells at this share of its working value (the seller's flat, TV REPAIR's crate). */
  brokenShare: [0.18, 0.3] as readonly [number, number],
  /** TV REPAIR buys a working one back at this share. */
  resaleShare: 0.68,
  /** TV REPAIR's crate of spares-or-repair has a console this often (a game day). */
  crateOdds: 0.5,
} as const;

/** A console bought broken: what it is, what is wrong, what it cost and where from. */
export interface BrokenConsole {
  id: string;
  platform: PlatformId;
  fault: FaultId;
  paid: number;
  from: string;
}

/** A broken `platform`'s fault and price drawn from `u1`, `u2` (0..1). */
export function brokenOf(platform: PlatformId, u1: number, u2: number): { fault: FaultId; price: number } {
  const spec = CONSOLES[platform];
  const fault = spec.faults[Math.floor(u1 * spec.faults.length)] ?? spec.faults[0]!;
  const [lo, hi] = REPAIR.brokenShare;
  return { fault, price: Math.max(5, Math.round(spec.value * (lo + u2 * (hi - lo)))) };
}

/**
 * How `console`'s fault shows: its usual symptom and finding, or the other one (`Fault.alt`) for about half of them,
 * the same before it is bought (the seller's word) as on the kitchen table after (drawn from what it is and its price).
 */
export function faultOf(console: { platform: PlatformId; fault: FaultId; paid: number }): Fault {
  const fault = FAULTS[console.fault];
  let h = console.paid;
  for (const ch of `${console.platform}${console.fault}`) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h % 2 ? { ...fault, ...fault.alt } : fault;
}

/** What TV REPAIR pays for a working `platform`. */
export function resaleOf(platform: PlatformId): number {
  return Math.round(CONSOLES[platform].value * REPAIR.resaleShare);
}
