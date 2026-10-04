import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST, getPlatform } from '@/catalog/platforms';
import { gameDayRandom } from '@/time/daily';
import { CLASSIFIEDS, SELLERS, type SellerKind } from './rules';

/** A private seller's small ad in THE GAMING WEEKLY: who, where, what, and when to come round. */
export interface Ad {
  /** `<day>:<n>` for a drawn ad, the caller's own for a scripted one (`ScriptedAd`). */
  id: string;
  /** The game day it went in, and the last day it runs. */
  day: number;
  until: number;
  kind: SellerKind;
  /** "Mrs Ward". */
  name: string;
  /** "flat 4": the flat in Park Corner Mansions. */
  flat: string;
  /** The platform the ad is about; null for a mix. */
  platform: PlatformId | null;
  /** The ad's words, as printed. */
  text: string;
  /** When they are in: hours of the clock. */
  hours: readonly [from: number, to: number];
  /** What the lot is drawn from (`sellerLot`). */
  seed: number;
  /** Set for an ad another feature put in (`Classifieds.inject`). */
  scripted?: ScriptedExtras;
}

/** What a scripted ad (a quest's clue, an event) brings beyond a drawn one. */
export interface ScriptedExtras {
  /** The lot is these game ids (seed games or index ids), not a draw; missing ones are skipped. */
  games?: readonly string[];
  /** A note left on the sideboard of the flat, read on a click (a quest's clue). */
  clue?: { title: string; text: string };
  /** What the seller says on the player's arrival, instead of their kind's greeting. */
  greeting?: string;
}

/** An ad another feature puts in the paper (`Classifieds.inject`): the fields a draw would give, the extras, and its days. */
export interface ScriptedAd {
  id: string;
  /** First game day it runs, and how many days (default `CLASSIFIEDS.lasts`). */
  fromDay: number;
  days?: number;
  kind: SellerKind;
  name: string;
  platform: PlatformId | null;
  text: string;
  hours?: readonly [from: number, to: number];
  /** The flat ("flat 9"); default drawn from the id. */
  flat?: string;
  games?: readonly string[];
  clue?: { title: string; text: string };
  greeting?: string;
}

/** The building the sellers live in: the mansion block over PARK FRUIT & VEG on Front Street, by Park Street's corner. */
export const SELLERS_BUILDING = 'Park Corner Mansions';

const NAMES: Readonly<Record<SellerKind, readonly string[]>> = {
  clearOut: ['Mrs Ward', 'Mr Okafor', 'Mrs Lindqvist', 'Mrs Patel', 'Mr Dubois', 'Mrs Russo'],
  mover: ['Jonas', 'Aisha', 'Tom', 'Inès', 'Marek', 'Lucy'],
  collector: ['Gareth', 'Yuki', 'Dev', 'Hélène', 'Rafael'],
  loft: ['Mrs Hall', 'Mr Nowak', 'Mrs Kovač', 'Mr Bell', 'Mrs Moreau'],
};

const TEXTS: Readonly<Record<SellerKind, readonly ((p: string, when: string) => string)[]>> = {
  clearOut: [
    (p, when) => `Clearing out my son’s old ${p} games. Boxed, the lot. Cheap to a good home. Call ${when}.`,
    (p, when) => `${p} games, our daughter’s, she’s at university now. Must go, the cupboard’s needed. Ring ${when}.`,
    (p, when) => `Old ${p} and its games, haven’t been touched in years. Make me an offer. Phone ${when}.`,
  ],
  mover: [
    (_p, when) => `Moving abroad end of the week. Video games, several consoles’ worth, must go. Offers. Call ${when}.`,
    (_p, when) => `Emptying the flat before I move: a box of old games, mixed. Quick sale. Ring ${when}.`,
  ],
  collector: [
    (p, when) => `Thinning my ${p} collection: complete in box, some first prints. Serious buyers only. ${cap(when)}.`,
    (p, when) => `Collector selling ${p} duplicates. CIB, kept in protectors. No time-wasters. Phone ${when}.`,
  ],
  loft: [
    (_p, when) => `Found a box of video games in my late father’s loft. No idea what they’re worth. Call ${when}.`,
    (_p, when) => `House clearance: old cartridges and discs, all sorts. Priced to go. Ring ${when}.`,
  ],
};

/** "after 6", "mornings", "between 10 and 7": how an ad puts its hours. */
function whenOf([from, to]: readonly [number, number]): string {
  if (from >= 17) return `after ${from - 12}`;
  if (to <= 13) return 'mornings';
  return `between ${clock12(from)} and ${clock12(to)}`;
}

function clock12(hours: number): string {
  const h = Math.floor(hours) % 12 || 12;
  return String(h);
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The ads that went in on game `day`, drawn from the day alone (the same all day, across reloads). */
export function adsPostedOn(day: number): Ad[] {
  const random = gameDayRandom('classifieds', day);
  const roll = random();
  const count = roll < CLASSIFIEDS.perDay.none ? 0 : roll < CLASSIFIEDS.perDay.none + CLASSIFIEDS.perDay.two ? 2 : 1;
  const ads: Ad[] = [];
  for (let n = 0; n < count; n++) {
    const kind = pickKind(random());
    const profile = SELLERS[kind];
    const platform = profile.platforms === 'one' ? PLATFORM_LIST[Math.floor(random() * PLATFORM_LIST.length)]!.id : null;
    const hours = profile.hours[Math.floor(random() * profile.hours.length)]!;
    const names = NAMES[kind];
    const name = names[Math.floor(random() * names.length)]!;
    const texts = TEXTS[kind];
    const text = texts[Math.floor(random() * texts.length)]!(platform ? getPlatform(platform).shortName : 'video', whenOf(hours));
    const flat = `flat ${1 + Math.floor(random() * 12)}`;
    ads.push({ id: `${day}:${n}`, day, until: day + CLASSIFIEDS.lasts - 1, kind, name, flat, platform, text, hours, seed: Math.floor(random() * 2 ** 31) });
  }
  return ads;
}

/** A scripted ad as the paper prints it. */
export function scriptedAd(spec: ScriptedAd): Ad {
  const days = spec.days ?? CLASSIFIEDS.lasts;
  const seed = [...spec.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hours = spec.hours ?? SELLERS[spec.kind].hours[0]!;
  return {
    id: spec.id,
    day: spec.fromDay,
    until: spec.fromDay + days - 1,
    kind: spec.kind,
    name: spec.name,
    flat: spec.flat ?? `flat ${1 + (seed % 12)}`,
    platform: spec.platform,
    text: spec.text,
    hours,
    seed,
    scripted: { games: spec.games, clue: spec.clue, greeting: spec.greeting },
  };
}

function pickKind(u: number): SellerKind {
  let acc = 0;
  for (const [kind, share] of Object.entries(CLASSIFIEDS.kinds) as [SellerKind, number][]) {
    acc += share;
    if (u < acc) return kind;
  }
  return 'clearOut';
}

/** "18:00" for hours of the clock. */
export function clockOf(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
