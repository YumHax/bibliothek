import type { ReadingNotice } from '@/notices';

/*
 * WHAT THE MEMORIES LEAVE BEHIND (docs/grandma.md "What the memories leave behind"): after a memory is seen the first
 * time, Mémé gets out the thing it was about and gives it to the player to take home (`Keepsakes`); the last comes when
 * every lot of Félix's in the sale's catalogue is home. Their words here; their 3D selves in `world/keepsakes/`.
 */

export type KeepsakeId = 'wrapping' | 'cushion' | 'screenPhoto' | 'gaspardLetter' | 'suitcaseLabel' | 'catalogue' | 'keyRing' | 'stickers';

interface KeepsakeLine {
  id: KeepsakeId;
  /** The memory (`MEMORIES` id) that brings it out; none for the stickers (every lot home). */
  memory?: string;
  /** What the caption and the stored list call it. */
  name: string;
  /** What she says handing it over, a line at a time. */
  give: readonly string[];
  /** The reward banner's line under its name. */
  detail: string;
  /** Read when clicked at home (the catalogue's card is written live: `catalogueCard`). */
  card?: ReadingNotice;
}

export const KEEPSAKES: readonly KeepsakeLine[] = [
  {
    id: 'wrapping',
    memory: 'christmas95',
    name: 'The sports pages',
    give: ['Wait. I kept this. Don’t laugh.', 'The paper from your Game Boy. The sports pages. I ironed it.'],
    detail: '“He never bought wrapping paper in his life.”',
    card: { look: 'note', title: 'The sports pages, 23 December 1995', text: 'Folded in eight, ironed flat. A football score nobody remembers.\n\nIn the margin, in Félix’s capitals: DON’T TELL MAMAN IT’S THE SPORTS PAGES.' },
  },
  {
    id: 'cushion',
    memory: 'wednesdays',
    name: 'Félix’s cushion',
    give: ['Here. Your cushion. The one you sat on in front of his set.', 'I took it when they emptied the flat. It still smells of his pipe. Don’t tell me it doesn’t.'],
    detail: '“Every Wednesday. You and that cushion.”',
  },
  {
    id: 'screenPhoto',
    memory: 'arcade',
    name: 'The photo from his wallet',
    give: ['They gave me his wallet, after. This was in it.', 'Your three letters. He carried them about for twenty years.'],
    detail: '“He was so proud you’d have thought he’d won it himself.”',
    card: { look: 'postcard', place: 'Saturday, the arcade', title: 'A photo of a screen', text: 'Blurred, taken too close, the flash in the glass. HIGH SCORES, and at the top three letters typed in by a teenager.\n\nOn the back, in biro: “The kid. First go.”' },
  },
  {
    id: 'gaspardLetter',
    memory: 'row',
    name: 'Gaspard’s letter',
    give: ['I found this in Félix’s things. Gaspard wrote it after that Sunday.', 'Read it at home. I’ve read it enough.'],
    detail: '“I should have said something that night.”',
    card: {
      look: 'letter',
      hand: 'pen',
      from: 'Gaspard',
      date: 'March 1999',
      text: 'Félix,\n\nAbout Sunday. I didn’t mean it the way Maman took it. But think about it. You’re forty, you live in two rooms with eleven hundred cartridges, and they’re worth more every year you don’t sell them.\n\nSell the Japanese ones at least. I know a man who would take the lot and not haggle.\n\nThe kid will grow out of it. They all do.',
    },
  },
  {
    id: 'suitcaseLabel',
    memory: 'leaving',
    name: 'Your suitcase label',
    give: ['He kept the label off your suitcase. It was on his fridge.', 'Take it. It’s yours, it always was.'],
    detail: '“You came back. Just a bit late, like all of us.”',
    card: { look: 'note', title: 'A brown luggage label', text: 'Your name in Félix’s capitals, the string still knotted.\n\nOn the back: HALF OF THESE ARE YOURS. COME AND GET THEM.' },
  },
  {
    id: 'catalogue',
    memory: 'sale',
    name: 'The sale’s catalogue',
    give: ['This is the catalogue of that sale. I kept it. I don’t know why.', 'I put a pencil mark by the ones I remember. If any of them ever comes home… you tell me.'],
    detail: '“Lot 1 to 412. I should have read the papers.”',
  },
  {
    id: 'keyRing',
    memory: 'keys',
    name: 'His key ring',
    give: ['The keys are yours now. But not the ring. I kept the ring.', 'Well. Now I’m giving you the ring. Don’t lose it, it was his father’s.'],
    detail: '“A day late. And look what you did with it.”',
    card: { look: 'note', title: 'A brass key ring', text: 'Worn smooth on one side by a thumb. A cardboard tag on it in Félix’s hand: 5th FLOOR, LEFT. MIND THE STEP.' },
  },
  {
    id: 'stickers',
    name: 'His roll of stickers',
    give: ['Every one of them. Home.', 'He used to put these on the back of every box. F.A. Round, like a coin.', 'There’s half a roll left. I think he’d want you to finish it.'],
    detail: '“All his lots, home again.”',
    card: { look: 'note', title: 'A roll of round stickers', text: 'Little white circles, F.A. printed in blue. Half a roll.\n\nThe last one on the backing has been started on and peeled back, as if he had changed his mind.' },
  },
];

/** Keepsake `id`'s words. */
export function keepsakeLine(id: KeepsakeId): KeepsakeLine {
  return KEEPSAKES.find((k) => k.id === id)!;
}

/** The keepsake a memory brings out, if one. */
export function keepsakeOf(memory: string): KeepsakeLine | null {
  return KEEPSAKES.find((k) => k.memory === memory) ?? null;
}

/** What she says once every lot is home, before the stickers. */
export const ALL_LOTS_HOME = ['Sit down. No, sit. I’ve something for you.'] as const;

/** Her lines when told a lot is home that has no line of its own, `{lot}` its number. */
export const LOT_TOLD = 'Lot {lot}. Another one home. I’ll put a tick by it.';

/** The entry of her conversation for a lot come home: the player's words, `{lot}` its number. */
export const LOT_ENTRY = 'Lot {lot} is home!';
