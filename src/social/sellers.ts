import type { ScriptedAd } from '@/classifieds/ads';
import type { SellerKind } from '@/classifieds/rules';
import type { PlatformId } from '@/catalog/types';
import { KEYS, PersistedStore } from '@/persistence';
import { addPerson, findPerson } from './people';
import { countedToday, nudge, warmth } from './standing';
import type { PersonCard, PersonId, Trait } from './types';

/*
 * The small ads' sellers as people (docs/social.md "Small-ad sellers"): each seller met is a person of a visit
 * (`seller:<ad id>`), added at run time with their kind's temper. A pleasant visit (a chat, a compliment, a gift
 * that landed) eases their haggle; an insulting offer sours them; a seller left happy rings back with a follow-up ad
 * ("my brother has a box too") a few days later.
 */

/** What a small ad's seller needs to be a person. */
interface SellerAd {
  id: string;
  kind: SellerKind;
  name: string;
  flat: string;
  seed: number;
  platform: PlatformId | null;
}

/** Each kind's temper, as traits; and how they introduce themselves. */
const KINDS: Record<SellerKind, { traits: readonly Trait[]; intro: string; likes: PersonCard['likes'] }> = {
  clearOut: { traits: ['chatty', 'generous', 'nostalgic'], intro: 'Come in, come in. They were my son’s. He’s thirty-four now and he won’t take them.', likes: ['flowers', 'cake'] },
  mover: { traits: ['funny', 'businesslike'], intro: 'Hi! Sorry about the boxes. I’m off on Friday, so everything goes.', likes: ['coffee', 'croissant'] },
  collector: { traits: ['collector', 'proud', 'neat'], intro: 'Good evening. Please, mind the boxes: everything is complete.', likes: ['record', 'coffee'] },
  loft: { traits: ['nostalgic', 'shy', 'generous'], intro: 'Hello, dear. They were all in Dad’s loft. I hope they mean something to someone.', likes: ['flowers', 'croissant'] },
};

/** How a visit sways their haggle: from this warmth up, the lowest share moves by `floor` and they hear `patience` more offers. */
const EASE: readonly { warmth: number; floor: number; patience: number }[] = [
  { warmth: 8, floor: -0.03, patience: 1 },
  { warmth: 20, floor: -0.06, patience: 1 },
];

/** A seller left at least this warm rings back with another ad; this many days later; this much warmth an insult costs. */
const FOLLOW_UP = { warmth: 22, afterDays: 2 } as const;
const INSULT_WARMTH = -8;

/** Who sends the follow-up ad, by kind: a relative or a friend, and what they say on the doorstep. */
const RELATIVES: Record<SellerKind, { who: string; greeting: (name: string) => string }> = {
  clearOut: { who: 'sister', greeting: (name) => `You’re the one ${name} told me about! She said you were lovely. Mine are on the table.` },
  mover: { who: 'flatmate', greeting: (name) => `${name} said you were sound. I’m clearing out too, have a look.` },
  collector: { who: 'friend from the club', greeting: (name) => `${name} vouched for you. That doesn’t happen often. Please, the table.` },
  loft: { who: 'brother', greeting: (name) => `My sister ${name} said you were kind. Dad left me a box too, would you believe.` },
};

/** The sellers met, saved so they stay in the People book after a reload (their standing is saved with everyone's). */
const met = new PersistedStore<SellerAd[]>({
  key: KEYS.socialSellers,
  version: 1,
  defaults: () => [],
  read: (data) => (Array.isArray(data) ? data.filter((a): a is SellerAd => !!a && typeof a.id === 'string' && typeof a.name === 'string' && a.kind in KINDS) : null),
});

/** Puts back the cards of the sellers met before (at start-up, before anything reads them). */
export function restoreSellers(): void {
  for (const ad of met.load()) if (!findPerson(`seller:${ad.id}`)) addCard(ad);
}

/** The person of `ad`'s seller, made on first asking (`chat`: their kind's talk, as their chat lines). */
function sellerPerson(ad: SellerAd, chat?: readonly string[]): PersonId {
  const id = `seller:${ad.id}`;
  if (findPerson(id) && !chat) return id;
  addCard(ad, chat);
  const saved = met.load();
  if (!saved.some((a) => a.id === ad.id)) met.save([...saved, { id: ad.id, kind: ad.kind, name: ad.name, flat: ad.flat, seed: ad.seed, platform: ad.platform }]);
  return id;
}

/** Registers `ad`'s seller's card. */
function addCard(ad: SellerAd, chat?: readonly string[]): void {
  const id = `seller:${ad.id}`;
  const kind = KINDS[ad.kind];
  addPerson({
    id,
    name: ad.name,
    role: `${ad.flat}, Park Corner Mansions (a small ad)`,
    group: 'street',
    whereabouts: 'At home in Park Corner Mansions, the hours of their ad',
    intro: kind.intro,
    traits: kind.traits,
    ...(ad.platform ? { tastes: { platforms: [ad.platform] } } : {}),
    likes: kind.likes,
    dislikes: ['scrap'],
    birthday: ad.seed % 60,
    look: { seed: ad.seed % 997, role: 'vendor' },
    ...(chat ? { lines: { chat } } : {}),
  });
}

/** How the visit sways `adId`'s seller in a haggle, or null when it doesn't. */
export function sellerEase(adId: string): { floor: number; patience: number } | null {
  const w = warmth(`seller:${adId}`);
  let ease: { floor: number; patience: number } | null = null;
  for (const step of EASE) if (w >= step.warmth) ease = { floor: step.floor, patience: step.patience };
  return ease;
}

/** Insulting offers at `adId`'s seller's table: they remember. */
export function sellerInsulted(adId: string, insults: number, day: number): void {
  if (insults <= 0 || !findPerson(`seller:${adId}`)) return;
  nudge(`seller:${adId}`, { warmth: INSULT_WARMTH * insults, day, why: 'insulted by your offer', memory: 'you lowballed me' });
}

/** The player came in to `ad`'s seller: who they are (the conversation introduces them). */
export function sellerOf(ad: SellerAd, chat?: readonly string[]): PersonId {
  return sellerPerson(ad, chat);
}

/**
 * The visit to `ad`'s seller is over: left happy, they put the word round, and a relative's ad goes in the paper a
 * couple of days later (once per seller; `inject` is idempotent by id). True when one was sent.
 */
export function sellerVisitEnded(ad: SellerAd, day: number, inject: (spec: ScriptedAd) => void): boolean {
  const id = `seller:${ad.id}`;
  if (!findPerson(id) || ad.id.startsWith('followup:') || warmth(id) < FOLLOW_UP.warmth || countedToday(id, 'followUp', day)) return false;
  nudge(id, { reason: 'followUp', day });
  const relative = RELATIVES[ad.kind];
  inject({
    id: `followup:${ad.id}`,
    fromDay: day + FOLLOW_UP.afterDays,
    kind: ad.kind,
    name: `${ad.name}’s ${relative.who}`,
    platform: ad.platform,
    text: `${ad.name}’s ${relative.who} has a box of games too. ${ad.name} says you’re the one to ring. Park Corner Mansions.`,
    greeting: relative.greeting(ad.name),
  });
  return true;
}
