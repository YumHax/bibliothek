import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { SEED_GAMES } from '@/catalog';
import { chance, fnv1a, lcg, pick, shuffled, type Rng } from '@/random';

/*
 * What a copy's box holds besides its cartridge (docs/media.md "The papers in the box"): its instruction booklet and,
 * for a copy that kept its booklet, what came with it then — a registration card, a leaflet of the publisher's other
 * games, sometimes a folded poster or a map. Which ones, and what is written on them, is drawn from the game's id: the
 * same copy holds the same papers every time. A copy without its booklet (or a worn one) lost the lot.
 */

/** How a paper is held up to read: leafed through (bound at its left edge), or turned over (one sheet). */
type PaperKind = 'booklet' | 'leaflet' | 'card' | 'poster';

/** What one page (or one side of a sheet) shows; the drawing is `pageArt`'s. */
export type PageContent =
  /** The booklet's front: the platform's band, the cover art in a frame, the title. */
  | { kind: 'cover' }
  /** The inside cover: the health and care notice every booklet opened on. */
  | { kind: 'warning' }
  /** A page of print under a heading. */
  | { kind: 'text'; heading: string; body: string }
  /** The pad drawn, its buttons named. */
  | { kind: 'controls' }
  /** The lined page at the back; what a previous owner pencilled there, if anything. */
  | { kind: 'notes'; pencil: string | null }
  /** The back cover: the publisher, where it was printed, a code. */
  | { kind: 'backCover' }
  /** A leaflet's page: other games of the publisher's, or an advert. */
  | { kind: 'catalogue'; heading: string; titles: readonly string[] }
  | { kind: 'advert'; heading: string; body: string }
  /** The registration card's front (filled in by a child's hand, sometimes) and its back (the address, the stamp). */
  | { kind: 'registration'; filled: { name: string; age: string; liked: string } | null }
  | { kind: 'postage' }
  /** A poster's front (the cover art, big) and its back (a map of the game's world, or tips). */
  | { kind: 'poster' }
  | { kind: 'map'; places: readonly string[] };

export interface Paper {
  kind: PaperKind;
  /** What it is called, in a word or two ("the booklet", "a registration card"): the prompt line names it. */
  name: string;
  /** One page, or the sheet unfolded (m). */
  width: number;
  height: number;
  /** Bound: its pages in order, the cover first, the back cover last (an even count). A sheet: its front, its back. */
  pages: readonly PageContent[];
  /** A sheet that came folded: into how many across and down (creases drawn, unfolded when taken out). */
  folds?: { across: number; down: number };
  /** The paper's colour (css). */
  stock: string;
}

/** How each pad is drawn and named on the booklet's controls page. */
export const PAD_NAMES: Record<PlatformId, readonly string[]> = {
  nes: ['Control Pad', 'SELECT', 'START', 'B Button', 'A Button'],
  snes: ['Control Pad', 'SELECT', 'START', 'Y', 'X', 'B', 'A', 'L', 'R'],
  gb: ['Control Pad', 'SELECT', 'START', 'B Button', 'A Button'],
  megadrive: ['Directional Pad', 'START', 'Button A', 'Button B', 'Button C'],
  n64: ['Control Stick', '+ Control Pad', 'START', 'A', 'B', 'C Buttons', 'Z Trigger', 'L', 'R'],
  ps1: ['Directional buttons', 'SELECT', 'START', '△', '○', '✕', '□', 'L1 L2', 'R1 R2'],
};

/** What the controls page says the buttons do, in the manuals' words. */
const CONTROLS: Record<PlatformId, string> = {
  nes: 'Control Pad: moves. A Button: jumps, or the action shown. B Button: the second action. START: begins the game, and pauses it. SELECT: picks a mode on the title screen.',
  snes: 'Control Pad: moves. B and Y Buttons: the main actions. A and X Buttons: the others. L and R Buttons: the shoulders. START: pauses. SELECT: the menu, in some games.',
  gb: 'Control Pad: moves. A Button: the main action. B Button: the second. START: pauses. SELECT: the menu. Turn the contrast dial if the screen is too faint.',
  megadrive: 'Directional Pad: moves. Buttons A, B and C: the actions, as the game sets them. START: begins the game, and pauses it.',
  n64: 'Control Stick: moves, gently or all the way. A and B Buttons: the actions. Z Trigger: under the pad. C Buttons: the camera, in most games. START: pauses.',
  ps1: 'Directional buttons: move. ✕ ○ □ △ buttons: the actions. L1 L2 R1 R2: the shoulders. START: pauses. SELECT: the map or the options, in some games.',
};

/** How the game goes in: a cartridge pushed home, a disc on the spindle. */
const LOADING: Record<PlatformId, string> = {
  nes: 'Make sure the POWER switch is OFF. Insert the Game Pak into the front loader and press it down until it clicks. Slide the POWER switch ON. If the screen blinks, press RESET.',
  snes: 'Make sure the POWER switch is OFF. Insert the Game Pak firmly into the slot, label facing you. Slide the POWER switch ON. Never pull the Game Pak out while the power is ON.',
  gb: 'Make sure the POWER switch is OFF. Insert the Game Pak, label facing out, until it stops. Slide the POWER switch ON. Batteries low? The red light fades: change all four.',
  megadrive: 'Set up your console as its own manual describes. Make sure the power switch is OFF. Insert the cartridge firmly, label facing you. Turn the power switch ON.',
  n64: 'Make sure the POWER switch is OFF. Insert the Game Pak firmly into the slot. Slide the POWER switch ON. Do not touch the Control Stick while switching on: it sets its centre then.',
  ps1: 'Press the OPEN button and place the disc on the spindle, label side up. Close the disc cover. Press the POWER button. Handle the disc by its edges and keep it in its case.',
};

/** The page of tips near the back: a few drawn from these, the same for a game every time. */
const TIPS: readonly string[] = [
  'Look everywhere. Secrets hide in plain sight, and in walls that look like any other.',
  'Talk to everyone twice: some have more to say the second time.',
  'When the music changes, something is coming.',
  'Do not rush. A careful player sees more than a quick one.',
  'Lost a life? Watch how it happened, then try again.',
  'Write down the passwords you are given. You will be glad of it.',
  'Some enemies can be jumped on. Some cannot. Find out from a distance.',
  'Rest when the game lets you: there is no prize for playing tired.',
  'Coins are worth collecting: a hundred gives you an extra life in many games.',
  'Play with a friend: two pairs of eyes find twice the secrets.',
  'Stuck? Leave it for a day. The answer often comes on its own.',
  'The edges of the screen hide more than the middle.',
];

/** A child's name, age and favourite part, as written on a registration card that was filled in and never sent. */
const CHILDREN: readonly { name: string; age: string }[] = [
  { name: 'Kevin M.', age: '11' },
  { name: 'Sarah P.', age: '9' },
  { name: 'Tom Ellis', age: '12' },
  { name: 'Julien', age: '10' },
  { name: 'Amy B.', age: '8' },
  { name: 'Marco R.', age: '13' },
  { name: 'Lea', age: '11' },
  { name: 'Daniel Hart', age: '10' },
];
const LIKED: readonly string[] = ['the music', 'the last level', 'everything!!', 'the boss', 'the secret room', 'playing with my brother', 'the colours', 'the ending'];

/** The leaflet's adverts: a club, a hotline, a care kit. */
const ADVERTS: readonly { heading: string; body: string }[] = [
  { heading: 'Join the Players’ Club', body: 'Fill in your registration card and send it today: members get the club newsletter four times a year, with maps, tips and news of the games to come.' },
  { heading: 'Stuck? Call the Hotline', body: 'Game counsellors are waiting to help, Monday to Friday, 9 am to 6 pm. Ask your parents before you call. Calls are charged at the local rate.' },
  { heading: 'Keep it Clean', body: 'The official cleaning kit keeps your console and your games working like new. Ask for it wherever you bought this game.' },
  { heading: 'Coming Soon', body: 'Bigger worlds, faster action, more to find. Watch this space, and the window of your games shop.' },
];

/** A world's places, for the map on a poster's back. */
const PLACES: readonly string[] = ['The Old Forest', 'Castle Gate', 'Misty Lake', 'Northern Peaks', 'Sunken Ruins', 'The Village', 'Desert Pass', 'Tower of Winds', 'Hidden Cave', 'Harbour', 'Ice Fields', 'The Last Bridge'];

/** Paper colours: the booklet's cream, the card's white, the leaflet's gloss, the poster's. */
const STOCK = { booklet: '#f3efe4', card: '#f7f6f1', leaflet: '#faf8f2', poster: '#f5f3ee' } as const;

/** A registration card's size (m, landscape) and a poster's, unfolded. */
const CARD = { width: 0.14, height: 0.09 };
const POSTER = { width: 0.42, height: 0.297 };

/**
 * What a copy's box holds besides its media, the booklet first. `booklet` is the booklet's page size (the one in the
 * box), null when the copy lost it: then nothing else is left either.
 */
export function papersOf(game: Game, booklet: { width: number; height: number } | null): Paper[] {
  if (!booklet) return [];
  const rng = lcg(fnv1a(`${game.id}|papers`));
  const papers: Paper[] = [bookletOf(game, booklet, rng)];
  const disc = game.platform === 'ps1';
  if (chance(rng, disc ? 0.45 : 0.7)) papers.push(cardOf(rng));
  if (chance(rng, disc ? 0.6 : 0.5)) papers.push(leafletOf(game, booklet, rng));
  if (chance(rng, game.platform === 'gb' ? 0.15 : 0.25)) papers.push(posterOf(game, rng));
  return papers;
}

function bookletOf(game: Game, page: { width: number; height: number }, rng: Rng): Paper {
  const platform = getPlatform(game.platform);
  const pencil = game.past?.kind === 'notes' && game.past.found ? game.past.text : null;
  const tips = shuffled(rng, TIPS).slice(0, 3).join(' ');
  const pages: PageContent[] = [
    { kind: 'cover' },
    { kind: 'warning' },
    { kind: 'text', heading: 'Getting Started', body: `Thank you for choosing ${game.title} for the ${platform.name}. ${LOADING[game.platform]}` },
    { kind: 'controls' },
    { kind: 'text', heading: 'The Story', body: game.description?.trim() || `A new adventure begins on the ${platform.shortName}. What happens next is up to you.` },
    { kind: 'text', heading: 'Hints for Players', body: tips },
    { kind: 'notes', pencil },
    { kind: 'backCover' },
  ];
  return { kind: 'booklet', name: 'the booklet', width: page.width, height: page.height, pages, stock: STOCK.booklet };
}

function cardOf(rng: Rng): Paper {
  const child = chance(rng, 0.35) ? pick(rng, CHILDREN) : null;
  const filled = child ? { ...child, liked: pick(rng, LIKED) } : null;
  return { kind: 'card', name: 'a registration card', width: CARD.width, height: CARD.height, pages: [{ kind: 'registration', filled }, { kind: 'postage' }], stock: STOCK.card };
}

function leafletOf(game: Game, booklet: { width: number; height: number }, rng: Rng): Paper {
  const others = SEED_GAMES.filter((g) => g.platform === game.platform && g.id !== game.id).map((g) => g.title);
  const titles = shuffled(rng, others).slice(0, 6);
  const [first, second] = shuffled(rng, ADVERTS);
  const publisher = game.publisher ?? getPlatform(game.platform).shortName;
  const pages: PageContent[] = [
    { kind: 'advert', heading: first!.heading, body: first!.body },
    { kind: 'catalogue', heading: `Also from ${publisher}`, titles },
    { kind: 'advert', heading: second!.heading, body: second!.body },
    { kind: 'catalogue', heading: `More for your ${getPlatform(game.platform).shortName}`, titles: shuffled(rng, others).slice(0, 6) },
  ];
  return { kind: 'leaflet', name: 'a leaflet', width: booklet.width * 0.95, height: booklet.height * 0.95, pages, stock: STOCK.leaflet };
}

function posterOf(game: Game, rng: Rng): Paper {
  const quest = /rpg|role|adventure|action-adventure/i.test(game.genre ?? '') || chance(rng, 0.4);
  const back: PageContent = quest ? { kind: 'map', places: shuffled(rng, PLACES).slice(0, 7) } : { kind: 'text', heading: `${game.title}: Secrets`, body: shuffled(rng, TIPS).slice(0, 5).join(' ') };
  return { kind: 'poster', name: quest ? 'a folded map' : 'a folded poster', width: POSTER.width, height: POSTER.height, pages: [{ kind: 'poster' }, back], folds: { across: 3, down: 2 }, stock: STOCK.poster };
}

/** The controls page's words for a platform's pad. */
export function controlsText(platform: PlatformId): string {
  return CONTROLS[platform];
}
