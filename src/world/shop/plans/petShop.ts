import type { ShopPlan } from '../shopPlan';
import { DOORMAT_AT, FRONT_EXIT, OPEN_SIGN_AT, arrival, customerDoor, shopRoom } from './shared';

const PETS_ROOM = shopRoom(6, 5, { floor: 'tiles', walls: 0xe4ecd8, ceiling: 0xf4f4ee, trim: 0x5a7a4a });
/** The tiles round the lower walls (washable, as a pet shop's are): what is pinned lower stands off them. */
const WAINSCOT = 1.1;
const OFF_TILES = 0.024;

// PAWS & CLAWS, by COMICS & MANGA: the rescue cat asleep in her basket in the middle of the floor, under a felt mobile;
// along the back the shelves of food and the wall of lit tanks; the tortoise's terrarium, the cat tree and the budgies
// on the left, the hamster under the cork board of pets to adopt by the door; the counter on the right with the leads
// and collars behind it, the pick & mix of treats before it, the cats' nap shelf and the children's drawings over the
// table of toys; the kibble on its pallet in the corner by the window, where the shop's own cat sleeps on show.
export const PET_SHOP: ShopPlan = {
  shop: 'pets',
  // PAWS & CLAWS' teal in the street (`SHOP_LOOKS.pets`).
  accent: 0x2f6a6a,
  room: PETS_ROOM,
  arrival: arrival(PETS_ROOM.depth),
  exit: FRONT_EXIT,
  lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
  // Turned to face the room, the clerk behind it with their back a step off the right wall (x 3).
  counter: { at: { floor: [2.0, -1.0], rotationY: -Math.PI / 2 }, width: 1.3 },
  clerk: {
    seed: 97,
    lines: [
      '“She’s a rescue. She needs a quiet flat. Full of games, you say? Perfect.”',
      '“Her bowls and her bed go with her. You only need to love her.”',
      '“The fish aren’t for sale. They’re the shop’s. They know it, too.”',
      '“A scratching post saves an armchair. Ask anyone.”',
      '“That’s Biscuit in the window. She came for a week, six years ago.”',
      '“The tortoise is called Sprint. He’s older than the shop.”',
      '“The hamster runs at night mostly. And whenever I’m on the phone.”',
    ],
    thanks: [
      '“Thank you! She’ll be so happy. Well, she’ll pretend not to be.”',
      '“Good choice. It’ll be up at yours by tonight.”',
      '“Lovely. Tell her the fish say hello.”',
    ],
    chores: [
      // Feeding the fish: a pinch of flakes over the tanks. Round the counter's end (x 1.72..2.28, from z -1.65) and
      // between the tanks (their glass at z -2.1) and the treats' stand (from z -1.52), not through them.
      { path: [[2.6, -1.88], [1.5, -1.88], [0.9, -1.7]], yaw: Math.PI, pose: 'play', seconds: 5, sound: 'feed', mutter: 'Breakfast!' },
    ],
  },
  customer: {
    seed: 19,
    door: customerDoor(PETS_ROOM.depth),
    hub: [0, 1.1],
    spots: [
      // By the back shelf, off the tanks the clerk feeds, and clear of the scratching post on the way.
      { at: [-0.2, -1.55], yaw: Math.PI },
      { at: [1.4, 1.0], yaw: Math.PI / 2 },
      { at: [-2.2, 0.6], yaw: -Math.PI / 2 },
    ],
    lines: [
      '“I only came for the fish food. I always leave with a toy.”',
      '“Look at that one, asleep in her basket. I’d take her if I could.”',
      '“My daughter drew the fish. The one with the teeth is me.”',
    ],
  },
  window: { along: 1.6, width: 1.4, height: 1.7 },
  fixtures: [
    // The shop's name over the back wall, the OPEN card on the door's glass, the mat inside the door (`common/`).
    { kind: 'prop', prop: 'nameBoard', options: { width: 1.6, height: 0.36 }, at: { wall: 'back', along: -1.3, y: 2.42 } },
    { kind: 'prop', prop: 'openSign', at: OPEN_SIGN_AT },
    { kind: 'prop', prop: 'doormat', options: { width: 0.95, depth: 0.55 }, at: DOORMAT_AT(PETS_ROOM.depth) },
    // White tiles round the lower walls with a teal band, and a batten over the food aisle.
    { kind: 'prop', prop: 'tiledWainscot', options: { height: WAINSCOT, tile: 0xf2f2ec, grout: 0xd8d8d0, accent: 0x2f6a6a }, at: { floor: [0, 0] } },
    { kind: 'prop', prop: 'tubeBatten', options: { length: 1.2, tubes: 2, diffuser: true, light: 0.5 }, at: { ceiling: [-1.3, -1.6] } },
    // What the floor gathers: a trodden patch in from the door, heel marks at the counter, shavings by the hamster.
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'grime', width: 1.1, depth: 0.6, amount: 0.5 }, at: { floor: [0, 1.55] } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'heels', width: 0.5, depth: 0.9, amount: 0.5 }, at: { floor: [1.45, -0.55] } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'sawdust', width: 0.45, depth: 0.8, amount: 0.35 }, at: { floor: [-2.45, 1.95] } },

    // The back wall: the food shelves, the wall of tanks and its card.
    { kind: 'goodsShelf', at: { wall: 'back', along: -1.3, y: 0 }, options: { width: 2.2, stock: 'pets', seed: 3 } },
    { kind: 'prop', prop: 'aquariumWall', options: { width: 2.0 }, at: { wall: 'back', along: 0.95, y: 0 } },
    { kind: 'prop', prop: 'notice', options: { lines: ['PLEASE', 'don’t tap the glass', 'the fish are napping'], paper: 0xfff3a6, ink: 0x1e3a6a }, at: { wall: 'back', along: 1.5, y: 1.98 } },

    // The left wall: the budgies in the corner, the tortoise, the food shelf, the hamster under the adoption board.
    { kind: 'birdcage', at: { floor: [-2.75, -2.25], rotationY: -Math.PI / 4 } },
    { kind: 'prop', prop: 'terrarium', options: { width: 0.8 }, at: { wall: 'left', along: -1.15, y: 0 } },
    { kind: 'prop', prop: 'notice', options: { lines: ['SPRINT', 'tortoise, 41', 'not for sale!'], width: 0.12, height: 0.15, hand: 'hand' }, at: { wall: 'left', along: -0.95, y: 1.45 } },
    { kind: 'goodsShelf', at: { wall: 'left', along: 0.6, y: 0 }, options: { width: 1.4, stock: 'pets', seed: 7 } },
    { kind: 'prop', prop: 'hamsterCage', options: { width: 0.8 }, at: { wall: 'left', along: 1.95, y: 0 } },
    {
      kind: 'prop',
      prop: 'corkBoard',
      options: {
        width: 0.8,
        height: 0.6,
        heading: 'ADOPT ME',
        items: [
          { lines: ['Pepper, 2', 'loves laps'], photo: ['#9ac0d8', '#2a2a2c'] },
          { lines: ['Bun-Bun', 'rabbit, 1'], photo: ['#d8e8c0', '#e8e0d4'] },
          { lines: ['Rex, 5', 'good with kids'], photo: ['#e8d0a0', '#8a5a2a'] },
          { lines: ['KITTENS', 'x4 · ask', 'inside!'] },
          { lines: ['Dog walker', 'Park St', 'mornings'] },
        ],
      },
      at: { wall: 'left', along: 1.95, y: 1.55 },
    },

    // The front wall: the found cat on the door's side, the dogs' water under the switch.
    { kind: 'prop', prop: 'notice', options: { lines: ['FOUND', 'grey tabby, Park Street', 'very friendly · ask inside'], hand: 'poster', width: 0.3, height: 0.42, accent: 0xc83a3a }, at: { wall: 'front', along: -2.05, y: 1.55 } },
    { kind: 'prop', prop: 'dogBowl', at: { floor: [-1.0, 2.2] } },
    { kind: 'prop', prop: 'notice', options: { lines: ['WATER', 'for good dogs ♥'], width: 0.15, height: 0.1, paper: 0xd8f0dc }, at: { wall: 'front', along: -1.0, y: 0.5, offset: OFF_TILES } },

    // The right wall: the leads and collars behind the counter, the nap shelf, the drawings over the toys.
    { kind: 'prop', prop: 'leadPegboard', options: { width: 1.0, height: 0.72 }, at: { wall: 'right', along: -1.0, y: 1.62 } },
    { kind: 'prop', prop: 'catWallShelf', at: { wall: 'right', along: 0.1, y: 1.75 } },
    { kind: 'prop', prop: 'kidsDrawings', at: { wall: 'right', along: 1.05, y: 1.45 } },
    { kind: 'table', id: 'toys', at: { floor: [2.1, 1.0], rotationY: -Math.PI / 2 }, options: { width: 0.8, depth: 0.5, height: 0.7 } },
    // The kibble in the corner by the window, its labels to the room.
    { kind: 'prop', prop: 'kibblePallet', at: { floor: [2.67, 2.0], rotationY: -Math.PI / 2 } },

    // The floor: the treats before the counter, the cat tree, the tunnel; the mobile over the rescue cat.
    { kind: 'prop', prop: 'treatBin', at: { floor: [1.3, -1.25], rotationY: -Math.PI / 2 } },
    { kind: 'prop', prop: 'catTree', at: { floor: [-1.85, -1.05], rotationY: 0.4 } },
    { kind: 'prop', prop: 'catTunnel', options: { length: 0.8 }, at: { floor: [-1.5, 1.1], rotationY: 0.3 } },
    { kind: 'prop', prop: 'ceilingMobile', options: { drop: 0.55 }, at: { ceiling: [-0.6, 0.4] } },

    // The counter: the free biscuits, the rescue's tin (the till at its -x end, the bell at +x).
    { kind: 'prop', prop: 'treatJar', on: 'counter', spot: [0.08, 0.06] },
    { kind: 'prop', prop: 'donationTin', on: 'counter', spot: [0.55, -0.1] },

    // The window: the shop's cat asleep on show, her mice round her (the street sees the same, docs/shops.md).
    { kind: 'prop', prop: 'shopCat', options: { card: ['BISCUIT', 'the shop cat', 'not for sale, sorry!'] }, on: 'windowDisplay', spot: [0.12, 0.02] },
    { kind: 'prop', prop: 'toyMice', options: { count: 3, spread: 0.13 }, on: 'windowDisplay', spot: [-0.42, 0.04] },
  ],
  displays: [
    { good: 'cat', at: { floor: [-0.6, 0.3], rotationY: 0.4 }, collides: false, tag: 'card' },
    { good: 'scratcher', at: { floor: [0.6, 0.1] } },
    { good: 'catToy', on: 'toys', spot: [0, 0], collides: false },
  ],
  // The pouches of fish treats on the counter, between the biscuit jar and the tin: for the street's stray as much as a cat at home.
  errands: [{ errand: 'treats', on: 'counter', spot: [0.32, 0.12] }],
};
