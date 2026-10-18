import { KEYS, PersistedStore } from '@/persistence';
import { findPerson } from './people';
import type { PersonId, TierId } from './types';

/*
 * What friends leave the player (docs/social.md "Keepsakes"): one thing at Friend, another at a close friend's,
 * each looking like whoever gave it (Mémé's recipe card in her hand, Inès' postcard, Marco's arcade ticket signed MAR,
 * a photo of the two of you), handed over in their tier's scene (`scenes/tierScenes`) and kept on the kitchen's fridge
 * door (eight, then the corkboard's twenty: `world/kitchen/fridgeKeepsakes`). Clicked, it says their words again.
 * Never taken back when a friendship cools: nothing the player owns is ever taken. Saved under
 * `KEYS.socialKeepsakes`, with the scenes still to play.
 */

/** What a keepsake is made of (its look on the fridge, `world/kitchen/keepsakeTextures`). */
export type KeepsakeKind = 'photo' | 'polaroid' | 'postcard' | 'ticket' | 'drawing' | 'recipe' | 'sheet' | 'card' | 'note' | 'bookmark' | 'tag' | 'setlist' | 'pressed';

/** The tiers a keepsake comes with (`acquaintance`: Mme Pereira's welcome note, the first day's promise kept). */
export type KeepsakeTier = Extract<TierId, 'acquaintance' | 'friend' | 'close'>;

export interface KeepsakeDef {
  kind: KeepsakeKind;
  /** As the caption names it after its giver's name: "sheet music" ("Mrs Moreau’s sheet music"). */
  name: string;
  /** What is written on it, read when it is clicked (their words). */
  words: string;
  /** What they say handing it over. */
  giving: string;
  /** A word or two painted on it (a ticket's "MAR", a card's "Respect."). */
  mark?: string;
  /** Its paper's or its ink's colour. */
  colour: number;
  /** A postcard's picture side; a photo's caption. */
  place?: string;
}

/**
 * Everyone's keepsakes, by tier. A close friend's is often a photo of the two of you (`kind: 'photo'`: the frame at
 * their door the moment it is given, kept small with the save), else what they would give.
 */
const KEEPSAKES: Readonly<Record<PersonId, Partial<Record<KeepsakeTier, KeepsakeDef>>>> = {
  meme: {
    friend: { kind: 'recipe', name: 'yoghurt-cake recipe', words: 'Yoghurt cake. One pot of yoghurt, two of sugar, three of flour, three eggs, half a pot of oil. A pinch of salt: Félix always forgot the salt.', giving: 'There. My yoghurt cake, written out properly.', colour: 0xfaf3e0 },
    close: { kind: 'polaroid', name: 'photo of Félix', words: 'Félix and me, the summer of 1972, on the beach at Fécamp. He had just won a goldfish. Keep it where you see it, and ring me on Sundays.', giving: 'I found this in the album. It’s yours now.', colour: 0xe8dcc0, place: 'Fécamp, 1972' },
  },
  gaspard: {
    friend: { kind: 'card', name: 'business card', words: 'AUBRY AUTOMOBILES, used cars since 1981. On the back, in biro: “For the garage, if you ever need a car. Family price. G.”', giving: 'My card. If you ever need wheels, you come to me, not some cowboy.', mark: 'AUBRY AUTOMOBILES', colour: 0xf4f4f0 },
    close: { kind: 'polaroid', name: 'photo of the brothers', words: 'Gaspard and Félix, eight and five, on one bicycle. On the back: “He always wanted the handlebars. I let him. G.”', giving: 'Maman would want you to have this. We were boys once, him and me.', colour: 0xe6d8bc, place: 'Rouen, 1958' },
  },
  sam: {
    friend: { kind: 'ticket', name: 'high-score slip', words: 'A slip torn from the arcade’s printer: SAM 1,204,500, SUPER SPRINT. “Beat that. You won’t. — S.”', giving: 'Remember this? I kept it all these years. Your turn to keep it.', mark: 'SAM 1,204,500', colour: 0xffe9a8 },
    close: { kind: 'photo', name: 'photo of the two of you', words: 'The two of you at your door, Sam grinning. On the back: “Player two, always.”', giving: 'Hold still! There. One for your fridge.', colour: 0xffffff },
  },
  ines: {
    friend: { kind: 'postcard', name: 'postcard', words: 'Wish you were here! The museum had a whole room of old consoles, I thought of you the whole time. Back Sunday. Love, Inès.', giving: 'I brought you a postcard back. I know, I could have just posted it.', colour: 0xfdf8ec, place: 'Greetings from Lisbon' },
    close: { kind: 'ticket', name: 'boarding pass', words: 'An old boarding pass, Osaka to Paris, and on the back: “Next trip, you’re coming. I’ve chosen the game shops already. Inès.”', giving: 'My boarding pass from Osaka. Read the back. I mean it.', mark: 'OSA → CDG', colour: 0xe8eef6 },
  },
  marco: {
    friend: { kind: 'ticket', name: 'arcade ticket', words: 'An orange ticket from the hall, signed in marker: MAR. “Rematch any time. You’ll still lose.”', giving: 'Here. The ticket from our first game. Signed, like a pro.', mark: 'MAR', colour: 0xf2a541 },
    close: { kind: 'card', name: 'tournament badge', words: 'A laminated badge from a 1998 fighting-game tournament: MARCO, PLAYER. On the back, in marker: “Tag team next year. You and me. Champions.”', giving: 'My badge from ’98. Best day of my life, until we met. Don’t tell Sam I said that.', mark: 'PLAYER', colour: 0xf5d24a },
  },
  roux: {
    friend: { kind: 'note', name: 'list of the building', words: 'Who lived where in 1971, in her careful hand: the Lamberts on the 6th, the Brunos on the 3rd, “and on the 5th, opposite, a young man with a guitar who played far too late. That was your flat.”', giving: 'I wrote down who lived where, the year I came. You should know your building.', colour: 0xf6efdc },
    close: { kind: 'photo', name: 'photo with Mrs Roux', words: 'Mrs Roux at her door, her hand on your arm. On the back: “To my neighbour across the landing. H. Roux.”', giving: 'Let me look at you. There. I want to remember this landing like this.', colour: 0xffffff },
  },
  moreau: {
    friend: { kind: 'sheet', name: 'sheet music', words: 'A page of Satie, pencilled all over: fingerings, a coffee ring, and at the bottom “For the 5th floor, who never complains about the scales. C.”', giving: 'A page of my Satie. Don’t laugh, I wrote all over it.', colour: 0xfbf8ef },
    close: { kind: 'card', name: 'recital invitation', words: 'Claudine Moreau, piano. A Sunday recital at the parish hall, 4 p.m. “Front row, kept for you. Bring nobody, bring everybody.”', giving: 'My little recital. You’re coming, I’ve kept you a seat.', mark: 'RECITAL', colour: 0xf3ead2 },
  },
  leclerc: {
    friend: { kind: 'note', name: 'list of quiet hours', words: 'The building’s quiet hours, typed, and under them in his hand: “Not that you need it. You are a considerate neighbour. A. Leclerc.”', giving: 'I typed the quiet hours out. Not for you. Well. For you to keep.', colour: 0xfafaf4 },
    close: { kind: 'pressed', name: 'pressed flower', words: 'A pressed cornflower under tape, and in tiny writing: “My wife grew these on the balcony. I thought you might like one. Alain.”', giving: 'It’s nothing. A flower. My wife grew them. Here.', colour: 0x4a6fd6 },
  },
  nguyen: {
    friend: { kind: 'recipe', name: 'phở recipe', words: 'Bao’s phở, in two hands: his list, and Linh’s corrections in red. “Less sugar than he says. — L.”', giving: 'Bao’s soup. Linh corrected it, of course.', colour: 0xfff6e6 },
    close: { kind: 'photo', name: 'photo with the Nguyens', words: 'Linh and Bao at your door, the twins peeking round them. On the back: “Dinner on Fridays, always room for one more.”', giving: 'The twins insisted on a photo. Everyone squeeze in!', colour: 0xffffff },
  },
  girard: {
    friend: { kind: 'ticket', name: 'stopwatch slip', words: 'A strip of receipt paper: “STAIRS, GROUND TO 5TH: 41.2 s. Record to beat. P.”', giving: 'My record up the stairs. Print it, frame it, beat it.', mark: '41.2 s', colour: 0xffffff },
    close: { kind: 'photo', name: 'photo with Pascal', words: 'Pascal flexing at your door, out of breath. On the back: “Training partner. P.”', giving: 'A photo, quick, I’ve just run up. For your fridge!', colour: 0xffffff },
  },
  haddad: {
    friend: { kind: 'tag', name: 'swap tag', words: 'One of her swap tags, punched and threaded: “Mega Drive, any condition. Except for you: in mint, please. R.”', giving: 'One of my tags. Only my best swappers get one.', mark: 'SWAP', colour: 0xf7e7c4 },
    close: { kind: 'photo', name: 'photo with Mrs Haddad', words: 'Mrs Haddad holding up a boxed game beside you. On the back: “The best trade I ever made: a neighbour. Rania.”', giving: 'Lina said I had to take a photo. So. A photo!', colour: 0xffffff },
  },
  dubois: {
    friend: { kind: 'note', name: 'watering note', words: 'How to keep a fern alive, in purple ink, underlined twice: “Water on Thursdays. Talk to it. It listens. S. Dubois.”', giving: 'For your plants. They need someone who knows.', colour: 0xf3e9f7 },
    close: { kind: 'pressed', name: 'pressed rose', words: 'A pressed rose from her balcony, and: “You are the only one in this building I tell everything. Don’t tell anyone. S.”', giving: 'A rose from my balcony. Between us, it’s my best one.', colour: 0xc8455a },
  },
  martin: {
    friend: { kind: 'card', name: 'cartridge label', words: 'A spare label from his brother’s shoebox of cartridges, in a boy’s handwriting: “GILLES — DO NOT TOUCH.”', giving: 'Gilles labelled everything. I found a spare one. Keep it.', mark: 'GILLES', colour: 0xf2f2e8 },
    close: { kind: 'photo', name: 'photo with Mr Martin', words: 'Mr Martin at your door with an old controller in his hand. On the back: “Gilles would have liked you. J-P.”', giving: 'A photo. My brother always took photos. It’s my turn.', colour: 0xffffff },
  },
  rossi: {
    friend: { kind: 'ticket', name: 'match ticket', words: 'A stub from the Comets’ last home game, and: “Next one, you’re coming. No excuses. Sofia.”', giving: 'The Comets’ ticket. Next time you come with me.', mark: 'COMETS', colour: 0x2e66c7 },
    close: { kind: 'photo', name: 'photo with Sofia', words: 'Sofia in her Comets scarf, arm round you. On the back: “Supporters’ club, two members.”', giving: 'Scarf on! Photo! It’s tradition.', colour: 0xffffff },
  },
  pereira: {
    acquaintance: { kind: 'note', name: 'welcome note', words: 'On the lodge’s paper, in round handwriting: “Welcome to number 12. Bins on Tuesdays, the stair light on its timer, and if anything is wrong you come to me. Thank you for Mrs Roux’s parcel. F. Pereira, concierge.”', giving: 'A word of welcome. Everyone who moves in gets one. The good ones get it the next morning.', colour: 0xfdf6e3 },
    friend: { kind: 'card', name: 'lodge calendar', words: 'The lodge’s little calendar of the year: bins, the chimney sweep, the meeting, and her own day off circled, “so you know when not to knock”.', giving: 'The lodge’s calendar. I only give it to the ones who read it.', mark: 'LODGE', colour: 0xf3e3b5 },
    close: { kind: 'card', name: 'lodge key tag', words: 'A blank key tag from the lodge’s board, with your floor written on it in her hand: “5th. One of mine.”', giving: 'Every family in this building has a tag on my board. Now you too.', mark: '5th', colour: 0xd9b36a },
  },
  bertin: {
    friend: { kind: 'card', name: 'syndic’s card', words: 'Hubert Bertin, building syndic. On the back: “For the agenda, my private number. Use it wisely.”', giving: 'My card. The private number is on the back. For emergencies only.', mark: 'SYNDIC', colour: 0xf0f0f0 },
    close: { kind: 'note', name: 'minutes', words: 'An extract of the co-owners’ minutes, signed: “The meeting thanks the 5th floor for their good sense.” In his hand, beside it: “Unanimous. G.B.”', giving: 'The minutes. You’re in them, in a good way.', colour: 0xf7f5ee },
  },
  student: {
    friend: { kind: 'setlist', name: 'setlist', words: 'A setlist scrawled on a pizza box flap: six songs, and at the end “+ the one for the 5th floor (the quiet one)”.', giving: 'My setlist for Saturday. The last song’s for you. The quiet one.', colour: 0xd8b78a },
    close: { kind: 'photo', name: 'photo with Théo', words: 'Théo with his guitar on his back at your door. On the back: “First fan. T.”', giving: 'A photo for when I’m famous. You’ll be in the documentary.', colour: 0xffffff },
  },
  postman: {
    friend: { kind: 'card', name: 'postcard of the round', words: 'A card of the sorting office, and: “Your round is my favourite. Five floors, but worth it. Moussa.”', giving: 'From the sorting office. We get a stack every Christmas.', colour: 0xf0e2b8 },
  },
  claire: {
    friend: { kind: 'note', name: 'note from Claire', words: 'On her uncle Henri’s headed paper: “Henri would have been glad his games went to someone who plays them. Claire.”', giving: 'On my uncle’s paper. He had boxes of it.', colour: 0xf6f1e4 },
  },
  hugo: {
    friend: { kind: 'drawing', name: 'drawing of the cat', words: 'A crayon drawing of a cat with a crown, very orange, signed HUGO in a corner. “THE KING OF THE BILDING”.', giving: 'I drew your cat. He’s the king. It says so.', mark: 'HUGO', colour: 0xffffff },
    close: { kind: 'card', name: 'club card', words: 'A membership card of the courtyard’s club, stamped three times: “MEMBER No. 5 (the grown-up one)”.', giving: 'You’re in the club now. Number five. That’s good.', mark: 'CLUB', colour: 0xffd36b },
  },
  mai: {
    friend: { kind: 'drawing', name: 'drawing of the building', words: 'The building drawn in felt-tip, every window lit, and a stick figure on the 5th floor holding a game. “YOU”.', giving: 'It’s our building. That one’s you.', mark: 'MAI', colour: 0xffffff },
  },
  tuan: {
    friend: { kind: 'card', name: 'trading card', words: 'His best trading card, a holographic dragon, with “ON LOAN FOREVER — TUAN” on the back.', giving: 'My best card. It’s on loan. Forever.', mark: 'TUAN', colour: 0xb8d7ff },
  },
  lina: {
    friend: { kind: 'drawing', name: 'comic strip', words: 'A three-panel comic: you, a stall, a game in a box, and a big “!!!” in the last panel. Signed LINA.', giving: 'I made a comic about you. It’s a true story.', mark: 'LINA', colour: 0xffffff },
  },
  victor: {
    friend: { kind: 'note', name: 'list of markets', words: 'Three flea markets outside Paris, the days they are worth it, in his tidy capitals. “Don’t tell anyone I told you. V.C.”', giving: 'Three markets worth the train. Don’t thank me. Don’t tell anyone either.', colour: 0xf4f1e8 },
    close: { kind: 'card', name: 'card', words: 'VICTOR CRANE, COLLECTOR. On the back, one word in ink: “Respect.”', giving: 'My card. Turn it over.', mark: 'Respect.', colour: 0xfafafa },
  },
  lou: {
    friend: { kind: 'card', name: 'loyalty card', words: 'SUNNY SIDE CAFE, ten stamps, all ten stamped, and: “This one’s on me forever. Lou.”', giving: 'Your loyalty card. Full. I filled it myself, don’t tell the boss.', mark: 'SUNNY SIDE', colour: 0xffe08a },
  },
  remi: {
    friend: { kind: 'card', name: 'loyalty card', words: 'PARKSIDE CAFE, a card with a little drawing of the park’s pond, and: “For my favourite regular. R.”', giving: 'Here. My regulars get one. Only the good ones.', mark: 'PARKSIDE', colour: 0xbfe3c9 },
  },
  busker: {
    friend: { kind: 'setlist', name: 'setlist', words: 'Django’s set for the corner, on the back of a flyer, and your favourite tune circled: “Always last. For you.”', giving: 'My set. Your tune’s circled. I always end on it now.', colour: 0xe9d6a8 },
  },
  attendant: {
    friend: { kind: 'ticket', name: 'free-play token', words: 'A brass token stuck to a card: “GOOD FOR ONE FREE PLAY, ANY MACHINE. Gus.”', giving: 'A token for one free play. Don’t spend it all at once.', mark: 'FREE PLAY', colour: 0xd9b45a },
  },
  kid: {
    friend: { kind: 'ticket', name: 'ticket strip', words: 'A strip of arcade tickets folded into a star, and “FOR LUCK — NICO”.', giving: 'It’s a lucky star. Made of tickets. It works, I swear.', mark: 'NICO', colour: 0xf2a541 },
  },
  bookseller: {
    friend: { kind: 'bookmark', name: 'bookmark', words: 'A CORNER BOOKS bookmark with a line copied out in her hand: “A house without books is like a room without windows.”', giving: 'A bookmark. Every good reader needs one.', mark: 'CORNER BOOKS', colour: 0x8a4b38 },
  },
  butcher: {
    friend: { kind: 'note', name: 'note from Stan', words: 'On a butcher’s paper square: “For the cat. And for you, the good cut, any day. Stan.”', giving: 'Wrap paper. Read it.', colour: 0xf3e0d8 },
  },
  'stall-nes': {
    friend: { kind: 'tag', name: 'price tag', words: 'One of his price tags, the price crossed out: “NOT FOR SALE. For a real collector. Gégé.”', giving: 'A tag. No price on it. You’ll see.', mark: 'NOT FOR SALE', colour: 0xfff1a8 },
  },
  albers: {
    friend: { kind: 'card', name: 'club card', words: 'The collectors’ club, a member’s card with your name typed in: “Welcome, colleague. I. Albers, secretary.”', giving: 'The club’s card. You were on the list already, I just typed it.', mark: 'CLUB', colour: 0xe1e8f0 },
  },
  theo: {
    friend: { kind: 'ticket', name: 'métro ticket', words: 'A punched métro ticket with a note on the back: “The 8:10 waits for nobody. Except for you, once. Théo.”', giving: 'My ticket from this morning. A souvenir of the 8:10.', mark: '8:10', colour: 0xe9f0c4 },
  },
  'mrs-hall': {
    friend: { kind: 'polaroid', name: 'photo of Biscuit', words: 'Biscuit the dog in a scarf, very pleased with himself. On the back: “Biscuit says hello. M. Hall.”', giving: 'A photo of Biscuit. He insisted.', colour: 0xffffff, place: 'Biscuit, in the park' },
  },
};

/** One keepsake the player has. */
export interface OwnedKeepsake {
  person: PersonId;
  tier: KeepsakeTier;
  /** The game day it was given (from that day on it is on the fridge: Mme Pereira's welcome waits for the next morning). */
  day: number;
  /** A photo's picture: a small JPEG data URL taken at their door. */
  photo?: string;
}

/**
 * A tier's scene still to play: who, which tier, from which (for the banner), since when, and from which day it may
 * (`notBefore`: a note for the next morning). `acquaintance` is Mme Pereira's thanks at the door, the first day's
 * promise kept; `welcome` her welcome note the morning after.
 */
export interface PendingScene {
  person: PersonId;
  tier: Extract<TierId, 'acquaintance' | 'friendly' | 'friend' | 'close'> | 'welcome';
  before: TierId;
  day: number;
  notBefore?: number;
}

interface KeepsakeSave {
  owned: OwnedKeepsake[];
  pending: PendingScene[];
  /** The friendly notes slipped already, by person. */
  noted: PersonId[];
}

let store: PersistedStore<KeepsakeSave> | null = null;
let state: KeepsakeSave | null = null;
const listeners = new Set<() => void>();

function loaded(): KeepsakeSave {
  if (state) return state;
  store = new PersistedStore<KeepsakeSave>({ key: KEYS.socialKeepsakes, version: 1, defaults: () => ({ owned: [], pending: [], noted: [] }), read: readSave });
  state = store.load();
  return state;
}

const TIERS: readonly string[] = ['acquaintance', 'friendly', 'friend', 'close', 'welcome'];

function readSave(data: unknown): KeepsakeSave | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { owned?: unknown; pending?: unknown; noted?: unknown };
  const owned = Array.isArray(d.owned)
    ? d.owned.filter((o): o is OwnedKeepsake => !!o && typeof o.person === 'string' && (o.tier === 'acquaintance' || o.tier === 'friend' || o.tier === 'close') && typeof o.day === 'number' && (o.photo === undefined || (typeof o.photo === 'string' && o.photo.startsWith('data:image/'))))
    : [];
  const pending = Array.isArray(d.pending) ? d.pending.filter((p): p is PendingScene => !!p && typeof p.person === 'string' && TIERS.includes(p.tier) && typeof p.before === 'string' && typeof p.day === 'number' && (p.notBefore === undefined || typeof p.notBefore === 'number')) : [];
  const noted = Array.isArray(d.noted) ? d.noted.filter((n): n is string => typeof n === 'string') : [];
  return { owned, pending, noted };
}

function save(): void {
  store?.save(loaded());
  for (const cb of [...listeners]) cb();
}

/** `person`'s keepsake for `tier`, or null when they have none. */
export function keepsakeFor(person: PersonId, tier: KeepsakeTier): KeepsakeDef | null {
  return KEEPSAKES[person]?.[tier] ?? null;
}

/** Whether the player has `person`'s keepsake of `tier`. */
export function hasKeepsake(person: PersonId, tier: KeepsakeTier): boolean {
  return loaded().owned.some((o) => o.person === person && o.tier === tier);
}

/** Every keepsake the player has by `day` (one dated later waits for its morning), oldest first: the fridge's first eight, then the corkboard's. */
export function keepsakesOwned(day = Infinity): readonly OwnedKeepsake[] {
  return loaded().owned.filter((o) => o.day <= day);
}

/** `person` gives the player their keepsake of `tier` (a photo with it); false when they have none or it was given already. */
export function giveKeepsake(person: PersonId, tier: KeepsakeTier, day: number, photo?: string): boolean {
  if (!keepsakeFor(person, tier) || !findPerson(person) || hasKeepsake(person, tier)) return false;
  loaded().owned.push(photo ? { person, tier, day, photo } : { person, tier, day });
  save();
  return true;
}

/** Hears every change of the keepsakes and the scenes to come (the fridge redraws). Returns the unsubscribe. */
export function onKeepsakes(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The scenes still to play, oldest first. */
export function pendingScenes(): readonly PendingScene[] {
  return loaded().pending;
}

/** A tier's scene to play (once per person and tier). */
export function queueScene(scene: PendingScene): void {
  const s = loaded();
  if (s.pending.some((p) => p.person === scene.person && p.tier === scene.tier)) return;
  s.pending.push(scene);
  save();
}

/** The scene was played (or given up on). */
export function sceneDone(scene: PendingScene): void {
  const s = loaded();
  s.pending = s.pending.filter((p) => !(p.person === scene.person && p.tier === scene.tier));
  save();
}

/** Whether `person`'s friendly note was slipped already; marks it slipped. */
export function noteOnce(person: PersonId): boolean {
  const s = loaded();
  if (s.noted.includes(person)) return false;
  s.noted.push(person);
  save();
  return true;
}

let pageOpener: ((person: PersonId) => void) | null = null;

/** How a keepsake opens its giver's page in the People book (`bootstrap/social`). */
export function setPersonPageOpener(open: (person: PersonId) => void): void {
  pageOpener = open;
}

/** Opens `person`'s page in the People book (nothing without a book). */
export function openPersonPage(person: PersonId): void {
  pageOpener?.(person);
}
