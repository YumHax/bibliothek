import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { DecorEntry } from '../props/decor';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import type { PlatformId } from '@/catalog/types';

/*
 * THE NEIGHBOURS' FLATS: the flats behind the doors on the stairs, one shell dressed for whoever the
 * player visits. Reached by travel from their door on the landing once they invite the player in
 * (`visits.ts`), left by their door back onto the same landing. One zone for all of them, far out
 * along +x like the shops: built once, dressed anew on the way in (`FlatDressing`), so six flats cost
 * one zone, one lamp and one TV glow. Zone-local metres, origin at the floor's centre; walls as
 * named from the room: the door on the front wall (+z) in a little entrance hall (the vestibule, a
 * partition with an opening), the window on the back wall (-z), the TV on the right.
 *
 *    back  ┌────────[shelf]──────────[window]─────────┐
 *          │                              armchairs → TV│ right
 *    z 1.0 ├──┬ opening ┬──┐                          │
 *          │ vestibule   │                          │
 *    front └────[door]──┴──────────────────────────────┘
 *          x -3.2 ........ -1.3 .................... 3.2
 */

export const NEIGHBOUR_FLAT_ROOM: RoomOptions = {
  width: 6.4,
  depth: 5.2,
  height: 2.95,
  opaqueWalls: ['front', 'left', 'right'],
  finish: { floor: 'parquet', walls: 0xe8dfcc, trim: 0xe4ddd0 },
};

/** A thing of a host's flat (`NeighbourHost.dressing`): a piece of the flat's furniture as the shops show it, a decor entry, or one of the flat's own. */
export type Dressing =
  /** A static model of a flat's piece (`shop/displayPieces`, lights taken out): its own collider. */
  | { kind: 'piece'; id: HomeUpgrade; variant?: number; at: Placement }
  /** One of the decor kinds (`props/decor`), lights taken out. */
  | { kind: 'decor'; entry: DecorEntry }
  /** A budgie's cage on its stand, the birds hopping. */
  | { kind: 'birdcage'; at: Placement }
  /** A dog's basket (the dog is out on the landing, or under the table: only its basket and its bowl). */
  | { kind: 'dogBasket'; at: Placement; color: number }
  /** A painted poster on a wall: big lettering and a band of colour. */
  | { kind: 'poster'; at: Placement; title: string; sub?: string; colors: [bg: number, ink: number]; width?: number; height?: number }
  /** An old vector console (the Vectrex) on a table, its screen glowing: shown, not for sale. */
  | { kind: 'vectrex'; at: Placement }
  /** An upright piano against a wall, its lid up. */
  | { kind: 'piano'; at: Placement; color?: number };

/**
 * One neighbour's flat as the player finds it: who (their door on the stairs, `doorKey(k, i)`), how they look (the
 * stairs' `randomLook(seed + 900)`), how well they must know the player before inviting them in (`friendship`, from
 * `building/friendship`), the walls' paint, what is on their shelf (`platforms`: drawn from the index, the same every
 * visit, a first print among them; `favourite`: the game by the TV they watch with the player, never for sale), what
 * they say on the way in and later, where they settle (their armchair, or a spot of their own), the rest of their flat.
 */
export interface NeighbourHost {
  k: number;
  i: number;
  who: string;
  seed: number;
  inviteAt: number;
  walls: number;
  platforms: PlatformId[];
  /** How many of their own games stand on their shelf (one a first print): theirs, never for sale. */
  shelf: number;
  favourite: PlatformId;
  /** Said at the door the first time they let the player in, then on later visits. */
  welcome: { first: string; again: string[] };
  /** Their chat in the flat, in turn. */
  lines: string[];
  /** Watching their favourite with the player: said as it starts. */
  watching: string[];
  /** Where they settle once they have said hello: their armchair (`seat`), or standing at a spot facing `yaw`. */
  rest: { seat: true } | { at: [x: number, z: number]; yaw: number };
  dressing: Dressing[];
  /** Which side of the building their window looks out of (`NEIGHBOUR_FLAT_PLAN.outlook`); default the courtyard. */
  side?: 'street' | 'courtyard';
}

/** The parts of the flat every host has: the door, the vestibule, the window, the TV and its side table, two armchairs, the shelf of games. */
export const NEIGHBOUR_FLAT_PLAN = {
  room: NEIGHBOUR_FLAT_ROOM,
  /** The door back onto the landing, in the vestibule. */
  door: { at: { wall: 'front', along: -2.25, y: 0 } as Placement, width: 0.83, height: 2.04 },
  /** Set down inside the door, facing through the vestibule's opening into the room. */
  arrival: { at: [-2.25, 1.9] as [number, number], yaw: 0 },
  /** The vestibule's partition (along z = `z` from the left wall to `x1`), its opening, and its side wall (x = `x1` back to the front wall). */
  vestibule: { z: 1.0, x1: -1.3, opening: { x: -2.25, width: 0.9, height: 2.1 }, thickness: 0.1 },
  window: { wall: 'back' as const, along: 1.1, width: 1.3, height: 1.7 },
  /**
   * Where the window really is, in the street's frame (`outlook/frames`), so the view through it is the one from
   * that flat: its glass's middle on the plan (x, z, at the host's floor, `landingY`), and the way out of it. The
   * courtyard side: our building's back (`oursBack`, its line at z -23.9), east of the stairwell's windows; the street
   * side: our front on Front Street (`ours`, z -12), under Mrs Roux's rooms' second French window. The facades the
   * window is in are not built in its view.
   */
  outlook: {
    courtyard: { at: [-2.0, -23.7] as [number, number], out: -1 as const, without: ['oursBack', 'oursBackW', 'oursWell', 'oursWellE', 'oursWellW'] },
    street: { at: [-5.8, -12.3] as [number, number], out: 1 as const, without: ['ours'] },
  },
  lamp: { at: { ceiling: [0.6, -0.4] } as Placement, switchAt: { wall: 'right', along: 2.15, y: 1.1 } as Placement },
  /** The TV's cabinet, its back to the right wall, the picture towards the armchairs. */
  tv: { at: { floor: [2.9, -0.35], rotationY: -Math.PI / 2 } as Placement },
  /** The side table by the TV, the favourite game lying on it. */
  sideTable: { at: { floor: [2.85, -1.35] } as Placement },
  /** The two armchairs facing the TV: the player's, the host's (`rest.seat`). */
  seats: { player: { floor: [1.15, -1.0], rotationY: Math.PI / 2 } as Placement, host: { floor: [1.15, 0.35], rotationY: Math.PI / 2 } as Placement },
  /** Where the host waits to say hello: by the opening, facing the vestibule. */
  greet: { at: [-1.55, 0.35] as [number, number], yaw: Math.PI * 0.85 },
  /** The shelf of their games against the back wall. */
  shelf: { at: { wall: 'back', along: -1.75, y: 0 } as Placement },
  /** Seat cushion height (m): where a seated host's hips go. */
  seatHeight: 0.45,
  /**
   * What a host says about one of their games on the shelf, clicked (`{title}` its title), in turn; about the first print
   * (`firstPrint`) the first time. Never a price: their games are theirs (a swap is how one comes to the player).
   */
  shelfTalk: {
    lines: [
      '{title}? Christmas, years ago. I still know the music by heart.',
      'Ah, {title}. My brother gave me that one. He wants it back, he says.',
      '{title}: I never got past the third level. Don’t tell anyone.',
      'That one, {title}, came from a car boot sale. One franc, the man said.',
      '{title} was my rainy-day game. Still is.',
      'I lent {title} to a cousin once. It came back without the manual. Never again.',
    ],
    firstPrint: 'That {title} is a first print, you know. Look at the back. I keep it out of the sun.',
    swap: 'If you want {title}, there is my note about a swap. Fair is fair.',
  },
  /** The hours they open the door to a visit (game hours). */
  hours: [9, 21.5] as [number, number],
  /** The flat's own room tone: a clock somewhere, the building's pipes, the street far off. */
  toneAt: [0, 1.4, -1.5] as [number, number, number],
};

/** The six neighbours who ask the player in: ours on the landing, the 4th, the 3rd, the 2nd's two and the 1st's. */
export const NEIGHBOUR_HOSTS: readonly NeighbourHost[] = [
  {
    // Our landing's other door: a widow on her own, the salon kept as it was in 1975.
    k: 0, i: 0, who: 'Mrs Roux', seed: 11, inviteAt: 8, walls: 0xd9c7a4, side: 'street',
    platforms: ['nes', 'gb'], shelf: 4, favourite: 'nes',
    welcome: {
      first: 'Oh! The young man from across the landing. Come in, come in, mind the rug.',
      again: ['Come in, dear, I’ve just made tea.', 'There you are! Sit, sit.', 'My favourite neighbour. Don’t tell the others.'],
    },
    lines: [
      'My grandson left all these games when he moved to Lyon. Take what you like, I don’t know what they’re worth.',
      'Henri, my late husband, sat in that armchair every evening for forty years.',
      'The budgies are called Pompidou and Giscard. Don’t ask.',
      'The stairs get longer every year, I swear it.',
      'You play those games all night, I hear the music through the wall. I don’t mind. It’s company.',
    ],
    watching: ['Ah, this one! My grandson played it on Sundays. The music goes round and round.', 'I never understood who the little man is cross with.'],
    rest: { seat: true },
    dressing: [
      { kind: 'piece', id: 'sideboard', at: { wall: 'left', along: -0.8, y: 0 } },
      { kind: 'piece', id: 'livingRug', variant: 0, at: { floor: [1.4, -0.3] } },
      { kind: 'birdcage', at: { floor: [-2.6, -1.9] } },
      { kind: 'decor', entry: { kind: 'pictureFrame', at: { wall: 'left', along: -0.8, y: 1.6 }, options: { motif: 'botanical', width: 0.55, height: 0.7, frameColor: 0x8a6a3a, seed: 3 } } },
      { kind: 'decor', entry: { kind: 'pictureFrame', at: { wall: 'right', along: 1.4, y: 1.6 }, options: { motif: 'mountains', width: 0.45, height: 0.35, frameColor: 0xb89a5a, seed: 7 } } },
      { kind: 'decor', entry: { kind: 'plant', at: { floor: [0.25, -2.25] }, options: { kind: 'fig', pot: 'ceramic', seed: 5 } } },
      { kind: 'piece', id: 'radio', at: { floor: [-2.95, -0.8] } },
      { kind: 'decor', entry: { kind: 'wallCalendar', at: { wall: 'front', along: 0.8, y: 1.5 } } },
    ],
  },
  {
    // The 4th, left: the Moreaus, the piano heard on the stairs (`STAIRWELL_PLAN.doors[1][0]`).
    k: 1, i: 0, who: 'Mr & Mrs Moreau', seed: 23, inviteAt: 25, walls: 0xc9d3c0,
    platforms: ['snes', 'megadrive'], shelf: 5, favourite: 'snes',
    welcome: {
      first: 'Our neighbour the collector! Come in. Excuse the piano, my husband was practising. Badly.',
      again: ['Come in, come in. He’s off the piano for today, we promise.', 'Ah, good! Our son’s old games want looking at.'],
    },
    lines: [
      'Our son had a Super Nintendo. He’s an accountant now. Can you believe it.',
      'Mind the third step on the way down. It creaks like my knees.',
      'The piano? Twenty years of lessons and still the same three pieces.',
      'If you see the concierge, tell her the lift made the noise again.',
      'We’ve got a shoebox of cartridges somewhere. Have a look at the shelf.',
    ],
    watching: ['He used to stay up past midnight with this one. We pretended not to hear.', 'The music! I could play that on the piano. Badly.'],
    rest: { at: [-2.4, -1.4], yaw: Math.PI * 0.3 },
    dressing: [
      { kind: 'piano', at: { wall: 'left', along: -1.4, y: 0 }, color: 0x2a1a12 },
      { kind: 'piece', id: 'livingRug', variant: 1, at: { floor: [1.3, -0.3] } },
      { kind: 'piece', id: 'kitchenTable', at: { floor: [-0.4, 0.2], rotationY: Math.PI / 2 } },
      { kind: 'decor', entry: { kind: 'pictureFrame', at: { wall: 'left', along: -1.4, y: 1.9 }, options: { motif: 'map', width: 0.8, height: 0.55, seed: 11 } } },
      { kind: 'decor', entry: { kind: 'plant', at: { floor: [2.8, -2.2] }, options: { kind: 'monstera', pot: 'terracotta', seed: 13 } } },
      { kind: 'piece', id: 'speakers', at: { floor: [2.95, 0.65], rotationY: -Math.PI / 2 } },
    ],
  },
  {
    // The 3rd, left: the Nguyens' son's corner of the living room, posters and his old consoles.
    k: 2, i: 0, who: 'The Nguyens', seed: 65, inviteAt: 16, walls: 0xb9c8d6,
    platforms: ['n64', 'ps1', 'gb'], shelf: 5, favourite: 'n64',
    welcome: {
      first: 'Hey! Mum said you collect games. Come in, I’m Minh. Shoes off, she’ll kill me.',
      again: ['Yo! Come in, Mum’s at work.', 'Hey! Want to see what I found under my bed?'],
    },
    lines: [
      'I play everything on my Switch now, but these were my dad’s. He says they stay in this house. Forever.',
      'Dad says the N64 is “the best console ever made”. He says that about everything from 1997.',
      'The arcade down the street has a dance machine. My record is on it. Initials MNH.',
      'Mrs Dubois’s dog barks every time I go past. We’re friends really.',
      'If you’ve got Pokémon doubles, I’m interested. Just saying.',
    ],
    watching: ['Ohh, this one. Dad and me finished it together. Don’t watch the ending, it’s sad.', 'Watch, watch, this bit is impossible.'],
    rest: { at: [-0.3, -1.9], yaw: Math.PI },
    dressing: [
      { kind: 'piece', id: 'bed', at: { wall: 'left', along: -1.2, y: 0 } },
      { kind: 'piece', id: 'floorCushions', at: { floor: [1.9, 0.55] } },
      { kind: 'poster', at: { wall: 'left', along: -1.1, y: 1.85 }, title: 'GALAXY RACER', sub: 'IN CINEMAS', colors: [0x1a2a5a, 0xf0c040], width: 0.6, height: 0.85 },
      { kind: 'poster', at: { wall: 'right', along: 1.6, y: 1.7 }, title: 'NEON CITY', sub: 'WORLD TOUR', colors: [0x6a1a4a, 0x40e0d0], width: 0.55, height: 0.75 },
      { kind: 'poster', at: { wall: 'front', along: 0.6, y: 1.75 }, title: 'LEVEL UP', sub: 'GAME FAIR', colors: [0xe8e0d0, 0xc0302a], width: 0.5, height: 0.7 },
      { kind: 'piece', id: 'bedroomRug', at: { floor: [-0.8, -0.9] } },
      { kind: 'decor', entry: { kind: 'crate', at: { floor: [2.85, 1.9] }, options: { style: 'cardboard', seed: 4 } } },
    ],
  },
  {
    // The 2nd, left: R. Haddad, who swaps games (`NeighbourTrades`), a tidy collector's flat.
    k: 3, i: 0, who: 'R. Haddad', seed: 41, inviteAt: 20, walls: 0xe6e1d8,
    platforms: ['megadrive', 'snes', 'ps1'], shelf: 6, favourite: 'megadrive',
    welcome: {
      first: 'The collector from the fifth! Come in, come in. I’ve been hoping you’d knock.',
      again: ['Come in. I re-sorted the shelf, alphabetical by publisher this time.', 'Ah, good timing. I need a second opinion.'],
    },
    lines: [
      'I sort by publisher. Then by year. Then I start again.',
      'The flea market had a lot of cartridges this week, but the good ones go before nine.',
      'If you ever want to swap, I leave a note under your door. Old habit.',
      'Never peel a price sticker in a hurry. Hairdryer, low, patient.',
      'Mrs Roux’s grandson’s games are the best kept secret in the building.',
    ],
    watching: ['A Mega Drive classic. Blast processing, they called it. Nobody knew what it meant.', 'I know every note of this. Every single one.'],
    rest: { seat: true },
    dressing: [
      { kind: 'piece', id: 'sideboard', at: { wall: 'left', along: -1.1, y: 0 } },
      { kind: 'piece', id: 'readingCorner', at: { floor: [-2.4, -1.8], rotationY: Math.PI / 4 } },
      { kind: 'piece', id: 'livingRug', variant: 1, at: { floor: [1.3, -0.3] } },
      { kind: 'decor', entry: { kind: 'pictureFrame', at: { wall: 'left', along: -1.1, y: 1.7 }, options: { motif: 'poster', width: 0.6, height: 0.8, seed: 17 } } },
      { kind: 'decor', entry: { kind: 'plant', at: { floor: [2.85, -2.2] }, options: { kind: 'yucca', pot: 'ceramic', seed: 19 } } },
      { kind: 'piece', id: 'framedPrint', variant: 2, at: { wall: 'right', along: 1.5, y: 1.6 } },
    ],
  },
  {
    // The 2nd, right: Mrs Dubois and her small dog (its yaps through the door), the kitchen smells of ham.
    k: 3, i: 1, who: 'Mrs Dubois', seed: 71, inviteAt: 16, walls: 0xe9d3c4, side: 'street',
    platforms: ['gb', 'nes'], shelf: 3, favourite: 'gb',
    welcome: {
      first: 'Oh, hello! Don’t mind Biscuit, he barks but he’s a coward. Come in.',
      again: ['Come in, Biscuit’s asleep for once.', 'Hello, dear! Ham sandwich? I’ve made too many.'],
    },
    lines: [
      'Biscuit is fourteen. In dog years he’s older than the building.',
      'My nephew left his Game Boy things in a drawer. I keep them for the batteries.',
      'The lift? I don’t trust it since 1998. It knows why.',
      'If a cat ever turns up in my kitchen, I’ll know whose it is.',
      'The concierge knows everything. Everything. Be nice to her.',
    ],
    watching: ['Oh, the little grey one! My nephew played it on the train to Brittany.', 'Biscuit, look! He doesn’t look.'],
    rest: { at: [-0.6, -1.7], yaw: Math.PI * 0.9 },
    dressing: [
      { kind: 'piece', id: 'kitchenTable', at: { floor: [-0.9, -0.6] } },
      { kind: 'dogBasket', at: { floor: [-2.6, -1.9] }, color: 0x8a3a3a },
      { kind: 'piece', id: 'kitchenRug', at: { floor: [-0.9, -0.6] } },
      { kind: 'piece', id: 'appliances', at: { floor: [-2.9, -0.4], rotationY: Math.PI / 2 } },
      { kind: 'decor', entry: { kind: 'pictureFrame', at: { wall: 'left', along: 0.2, y: 1.6 }, options: { motif: 'stillLife', width: 0.5, height: 0.4, seed: 23 } } },
      { kind: 'decor', entry: { kind: 'plant', at: { floor: [2.85, 1.95] }, options: { kind: 'small', pot: 'terracotta', seed: 29 } } },
      { kind: 'decor', entry: { kind: 'wallCalendar', at: { wall: 'left', along: -1.5, y: 1.5 } } },
    ],
  },
  {
    // The 1st, left: J.-P. Martin's clutter, the Vectrex he will never sell.
    k: 4, i: 0, who: 'J.-P. Martin', seed: 83, inviteAt: 25, walls: 0xcdbf9e,
    platforms: ['nes', 'megadrive', 'n64', 'ps1'], shelf: 6, favourite: 'nes',
    welcome: {
      first: 'Ah, the young collector. Come in, if you can find the floor. Mind the crates.',
      again: ['Come in. I found another box. I always find another box.', 'Shut the door, the draught gets in the cartridges.'],
    },
    lines: [
      'That? A Vectrex. 1982. Draws in lines, real lines. Not for sale. Never. Ask me again in ten years.',
      'Everything in these crates came from somewhere. I just don’t remember where.',
      'I worked in a games shop on Park Street when you were a baby. Before it was a launderette.',
      'The old lift goes higher than the fifth, they say. Nobody remembers the button.',
      'Old Lambert on the third had the best collection of us all. Kept it to himself.',
    ],
    watching: ['Now that was a game. They don’t make cartridges like that any more. They don’t make cartridges at all.', 'I sold this one forty times in the shop. Never played it once.'],
    rest: { at: [-0.4, -1.95], yaw: Math.PI },
    dressing: [
      { kind: 'vectrex', at: { floor: [-0.4, -2.2] } },
      { kind: 'decor', entry: { kind: 'crate', at: { floor: [-2.75, -1.95] }, options: { style: 'wood', stack: 3, seed: 31 } } },
      { kind: 'decor', entry: { kind: 'crate', at: { floor: [-2.75, -1.1] }, options: { style: 'cardboard', stack: 2, seed: 37 } } },
      { kind: 'decor', entry: { kind: 'crate', at: { floor: [2.85, 1.85] }, options: { style: 'cardboard', stack: 2, seed: 41 } } },
      { kind: 'decor', entry: { kind: 'crate', at: { floor: [-0.7, 1.6] }, options: { style: 'wood', seed: 43 } } },
      { kind: 'piece', id: 'crt', at: { floor: [-2.75, 0.1], rotationY: Math.PI / 2 } },
      { kind: 'poster', at: { wall: 'left', along: -0.6, y: 1.8 }, title: 'GAME ZONE', sub: 'PARK STREET · 1989', colors: [0x2a2a2a, 0xe8c040], width: 0.7, height: 0.5 },
      { kind: 'decor', entry: { kind: 'pictureFrame', at: { wall: 'right', along: 1.6, y: 1.7 }, options: { motif: 'roofs', width: 0.5, height: 0.4, seed: 47 } } },
    ],
  },
];

/** The host behind door `k:i`, if that neighbour ever asks the player in. */
export function hostAt(k: number, i: number): NeighbourHost | undefined {
  return NEIGHBOUR_HOSTS.find((h) => h.k === k && h.i === i);
}
