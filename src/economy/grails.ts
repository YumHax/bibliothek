import type { Game, PlatformId } from '@/catalog/types';
import { gameIdFor } from '@/catalog/nointro';
import { GRAIL } from './pricing';
import { seeded } from './seeded';

/**
 * A grail: a game so rare it never turns up in an ordinary crate. Each one comes to the flea market
 * on a day of its own (`grailOn`), heralded by rumours a few days before (`upcomingGrail`), at a
 * price of its own. `libretroName` is the index's name, so the copy's id is the index's (owning a
 * copy bought any other way counts) and its cover art is found.
 */
export interface Grail {
  platform: PlatformId;
  title: string;
  libretroName: string;
  /** Coins asked for a complete copy (before any haggle, which barely moves it). */
  price: number;
  /** Why collectors want it, for the panel and the papers. */
  lore: string;
  /** Who is selling, told vaguely by the rumours ("someone clearing out an attic of Super Nintendo carts"). */
  seller: string;
}

/** The dozen games every collector dreams of, on the platforms the game knows. Prices are an hour or two at the arcade. */
export const GRAILS: readonly Grail[] = [
  { platform: 'nes', title: 'Stadium Events', libretroName: 'Stadium Events (USA)', price: 2400, lore: 'Pulled from the shelves weeks after release and reissued as World Class Track Meet: hardly any boxed copies survive.', seller: 'an old sports shop clearing its stockroom' },
  { platform: 'nes', title: 'Little Samson', libretroName: 'Little Samson (USA)', price: 1500, lore: 'A late NES release with a tiny print run, and one of the best platformers on the console.', seller: 'a retired shopkeeper emptying the back of his van' },
  { platform: 'nes', title: 'The Flintstones: The Surprise at Dinosaur Peak!', libretroName: 'Flintstones, The - The Surprise at Dinosaur Peak! (USA)', price: 1300, lore: 'Sold almost only through rental shops in 1994: a boxed copy is a rare sight.', seller: 'a video rental shop closing down' },
  { platform: 'snes', title: 'EarthBound', libretroName: 'EarthBound (USA)', price: 1200, lore: 'Shipped in an oversized box with a strategy guide; most boxes were thrown away.', seller: 'someone clearing out an attic of Super Nintendo carts' },
  { platform: 'snes', title: 'Hagane: The Final Conflict', libretroName: 'Hagane - The Final Conflict (USA)', price: 1100, lore: 'A ninja action game released almost only to Blockbuster in the States.', seller: 'a man who used to work at a rental chain' },
  { platform: 'snes', title: 'Wild Guns', libretroName: 'Wild Guns (USA)', price: 900, lore: 'A cult western shooter from Natsume, printed in small numbers.', seller: 'a collector thinning out his Super Nintendo shelf' },
  { platform: 'gb', title: 'Kid Dracula', libretroName: 'Kid Dracula (USA, Europe)', price: 800, lore: "Konami's cheeky Castlevania spin-off, rarely seen complete with its box.", seller: 'a family selling a shoebox of Game Boy games' },
  { platform: 'megadrive', title: 'MUSHA', libretroName: 'MUSHA - Metallic Uniframe Super Hybrid Armor (USA)', price: 1000, lore: 'A legendary shooter with a heavy-metal soundtrack and a small American print run.', seller: 'a shooter fan parting with his Mega Drive collection' },
  { platform: 'megadrive', title: 'Crusader of Centy', libretroName: 'Crusader of Centy (USA)', price: 900, lore: 'An action RPG released late in the console’s life, to very few shops.', seller: 'a house clearance out in the suburbs' },
  { platform: 'n64', title: "Conker's Bad Fur Day", libretroName: "Conker's Bad Fur Day (USA)", price: 1000, lore: "Rare's foul-mouthed squirrel came out at the end of the N64, in a short run.", seller: 'a student selling his Nintendo 64 things' },
  { platform: 'n64', title: 'Ogre Battle 64', libretroName: 'Ogre Battle 64 - Person of Lordly Caliber (USA)', price: 900, lore: 'A tactical RPG from Atlus, printed in very small numbers.', seller: 'someone emptying a storage unit of RPGs' },
  { platform: 'ps1', title: 'Suikoden II', libretroName: 'Suikoden II (USA)', price: 1100, lore: 'Overlooked on release, adored since: the original black-label copies are prized.', seller: 'a collector moving abroad, selling his PlayStation RPGs' },
  { platform: 'ps1', title: 'Valkyrie Profile', libretroName: 'Valkyrie Profile (USA)', price: 1000, lore: 'An Enix RPG with a short print run; complete copies with both discs are hard to find.', seller: 'a cousin of somebody’s, clearing out a flat' },
];

/** The copy the market sells: the index's id and name, complete. */
export function grailGame(grail: Grail): Game {
  return {
    id: gameIdFor(grail.platform, grail.libretroName),
    title: grail.title,
    platform: grail.platform,
    status: 'owned',
    description: grail.lore,
    externalIds: { libretroName: grail.libretroName },
  };
}

const IDS = new Map(GRAILS.map((g) => [grailGame(g).id, g]));

/** The grail a game id is, if it is one. */
export function grailById(id: string): Grail | undefined {
  return IDS.get(id);
}

export function isGrail(id: string): boolean {
  return IDS.has(id);
}

/**
 * The grail on the market on `day`, if any: every `GRAIL.every` market days (from `GRAIL.offset`),
 * one grail, taken in turn from a seeded shuffle of the whole list (a new shuffle each time round),
 * so each one comes back, and a reload always tells the same story. Owning it does not change the
 * schedule: the copy is simply left out of what the player is shown.
 */
export function grailOn(day: number): Grail | null {
  const k = day - GRAIL.offset;
  if (k < 0 || k % GRAIL.every !== 0) return null;
  const turn = k / GRAIL.every;
  const round = Math.floor(turn / GRAILS.length);
  return shuffled(round)[turn % GRAILS.length]!;
}

/** The next grail from `day` on (today included) within `within` days, and in how many days it comes. */
export function upcomingGrail(day: number, within: number = GRAIL.rumourDays): { grail: Grail; day: number; inDays: number } | null {
  for (let d = day; d <= day + within; d++) {
    const grail = grailOn(d);
    if (grail) return { grail, day: d, inDays: d - day };
  }
  return null;
}

function shuffled(round: number): Grail[] {
  const rng = seeded(`grails:${round}`);
  const list = [...GRAILS];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}
