import type { PlatformId } from '@/catalog/types';
import type { Honour, Honours } from '@/economy/Honours';
import type { Zone } from '../zone/Zone';
import type { Placement } from '../Placement';
import { NeonSign } from '../props/NeonSign';
import type { ROOM_PLAN } from '../roomPlan';

/** Where the honours hang (`ROOM_PLAN.honours`), handed in by the collector's builder: the neons read no plan. */
type HonoursPlan = typeof ROOM_PLAN.honours;

/** Each console's tube colour (its box accent is too dark for neon on some: the Mega Drive's black). */
const NEON_COLOR: Partial<Record<PlatformId, number>> = {
  nes: 0xff4a4a,
  snes: 0xb58cff,
  gb: 0x9bff3a,
  megadrive: 0x3aa6ff,
  n64: 0xffd23a,
  ps1: 0x3affd8,
};

/** A console's name as its neon spells it (plain lettering, no logo). */
const CONSOLE_WORD: Partial<Record<PlatformId, string>> = {
  nes: 'NES',
  snes: 'SUPER NINTENDO',
  gb: 'GAME BOY',
  megadrive: 'MEGA DRIVE',
  n64: 'NINTENDO 64',
  ps1: 'PLAYSTATION',
};

/** A club set's neon: a word or two (the set's full name is in the book). */
const SET_WORD: Record<string, string> = {
  'set:mario-nes': 'MARIO',
  'set:zelda': 'ZELDA',
  'set:sonic': 'SONIC',
  'set:megaman': 'MEGA MAN',
  'set:metroid': 'METROID',
  'set:pokemon': 'POKEMON',
  'set:dkc': 'DK COUNTRY',
  'set:crash': 'CRASH',
  'set:ff-ps1': 'FINAL FANTASY',
  'set:castlevania': 'CASTLEVANIA',
};

/** The name a neon of `id` hangs under in the room's zone (the club's visitor looks up at it). */
function honourNeonName(id: string): string {
  return `Honour:${id}`;
}

/**
 * The honours over the living room's bookcases (`ROOM_PLAN.honours`, `economy/Honours`): every club set completed
 * lights a small neon of its name over the back wall, every console's whole built-in list a bigger one of the
 * console's name over the right wall, in the order they were earned. Neon without a light of its own, placed when
 * earned (nothing stands staged): a new one never changes the scene's lights.
 */
export function furnishHonours(zone: Zone, honours: Honours, plan: HonoursPlan): void {
  const placed = new Set<string>();
  const show = (): void => {
    let sets = 0;
    let consoles = 0;
    for (const honour of honours.earned) {
      const n = honour.kind === 'set' ? sets++ : consoles++;
      if (placed.has(honour.id)) continue;
      const spot = spotFor(plan, honour, n);
      if (!spot) continue;
      const size = honour.kind === 'set' ? plan.sets : plan.consoles;
      const sign = new NeonSign({ text: wordFor(honour), color: NEON_COLOR[honour.platform] ?? 0xff2fa0, width: size.width, height: size.height, intensity: 0, flicker: false, seed: n + 3 });
      sign.name = honourNeonName(honour.id);
      zone.placeAt(sign, spot);
      placed.add(honour.id);
    }
  };
  show();
  zone.onUnload(honours.subscribe(show));
}

function wordFor(honour: Honour): string {
  return honour.kind === 'console' ? (CONSOLE_WORD[honour.platform] ?? honour.name.toUpperCase()) : (SET_WORD[honour.id] ?? honour.name.toUpperCase());
}

/** The `n`th spot of its kind: the sets' two rows of five, left to right, the lower row first; the consoles' one row. */
function spotFor({ sets, consoles }: HonoursPlan, honour: Honour, n: number): Placement | null {
  if (honour.kind === 'console') {
    const along = consoles.along[n];
    return along === undefined ? null : { wall: consoles.wall, along, y: consoles.y };
  }
  const per = sets.along.length;
  const along = sets.along[n % per];
  const y = sets.y[Math.floor(n / per)];
  return along === undefined || y === undefined ? null : { wall: sets.wall, along, y };
}
