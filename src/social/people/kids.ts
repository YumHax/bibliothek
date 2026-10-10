import type { PersonCard, SocialEffect } from '../types';

/*
 * The building's kids, down in the courtyard after school (docs/building.md "The kids in the yard"; their schedule,
 * carts and handhelds are `building/kids/kidsPlan`). Their ids are `KidId`s. A friend of theirs swaps more easily
 * (`easySwaps`, read by `yardKids.judgeSwap`); gone cold, they won't swap at all (`noSwaps`).
 */

const KID_EFFECTS: readonly SocialEffect[] = [
  { key: 'easySwaps', at: 'friend', value: 0.8, text: 'Swaps carts with you more easily' },
  { key: 'noSwaps', at: 'cold', down: true, text: 'Won’t swap carts with you' },
];

/** What every kid says unless they have their own line. */
const KID_LINES = {
  cold: ['Go away.', 'I’m not talking to you.'],
  hostile: ['Mum says I don’t have to talk to you.'],
};

export const KID_PEOPLE: readonly PersonCard[] = [
  {
    id: 'hugo',
    name: 'Hugo Moreau',
    short: 'Hugo',
    role: 'the Moreaus’ son, 4th floor',
    group: 'building',
    whereabouts: 'In the courtyard after school with his handheld, on the bench',
    intro: 'I’m Hugo. Fourth floor. You’re the one with ALL the games. Mum told me. Can I come and see?',
    traits: ['competitive', 'collector', 'chatty'],
    tastes: { platforms: ['gb', 'nes'], genres: ['action', 'platform'] },
    likes: ['cake', 'plush'],
    dislikes: ['flowers', 'coffee'],
    birthday: 9,
    look: { seed: 4101, role: 'shopper' },
    ties: { moreau: 0.8, mai: 0.3, tuan: 0.3, lina: 0.5 },
    facts: [
      { id: 'shoebox', text: 'Keeps his dad’s old NES carts in a shoebox', says: 'Dad’s old carts are in a shoebox under my bed. He doesn’t know I took them. Don’t tell.' },
      { id: 'champion', text: 'Wants to beat the arcade’s top score one day', says: 'One day my name’s going to be top of the Snake table at the arcade. HUG. Three letters.', from: 'acquaintance' },
      { id: 'piano', text: 'Hates his piano lessons', says: 'Mum makes me do piano. Every. Single. Day. I want a Game Boy Advance.', from: 'friendly' },
    ],
    effects: KID_EFFECTS,
    lines: {
      ...KID_LINES,
      hello: ['Hey!', 'Oh, hi!', 'Shh, last level.'],
      chat: ['Snake gets really fast after the fifty. Like REALLY fast.', 'Mum says I can’t go to the arcade alone. I’m twelve!', 'Did you know Tetris was invented by a Russian guy? True story.'],
    },
  },
  {
    id: 'mai',
    name: 'Mai Nguyen',
    short: 'Mai',
    role: 'one of the Nguyen twins, 3rd floor',
    group: 'building',
    whereabouts: 'In the courtyard after school, with her brother and their one handheld',
    intro: 'I’m Mai, he’s Tuan, we’re twins but I’m older. By six minutes. It’s my turn on the handheld.',
    traits: ['funny', 'competitive'],
    tastes: { platforms: ['gb'], genres: ['platform'] },
    likes: ['plush', 'cake'],
    dislikes: ['coins'],
    birthday: 27,
    look: { seed: 4207, role: 'shopper' },
    ties: { nguyen: 0.9, tuan: 0.8, hugo: 0.3, lina: 0.4 },
    facts: [
      { id: 'older', text: 'Six minutes older than Tuan, and says so', says: 'Six minutes older. It counts.' },
      { id: 'frog', text: 'Can play the frog game with her eyes shut', says: 'I can do the frog one with my eyes shut. Nearly.', from: 'acquaintance' },
    ],
    effects: KID_EFFECTS,
    lines: {
      ...KID_LINES,
      hello: ['Hi!', 'It’s my turn, not his.', 'Hello!'],
      chat: ['Tuan says frogs can’t jump that far in real life. He’s wrong.', 'Dad’s restaurant has a fish tank. I named all the fish.', 'When I’m big I’ll have more games than you.'],
    },
  },
  {
    id: 'tuan',
    name: 'Tuan Nguyen',
    short: 'Tuan',
    role: 'one of the Nguyen twins, 3rd floor',
    group: 'building',
    whereabouts: 'In the courtyard after school, looking over his sister’s shoulder',
    intro: 'I’m Tuan. It’s MY turn next. Do you have the one with the dinosaur?',
    traits: ['shy', 'funny'],
    tastes: { platforms: ['gb'], genres: ['platform'] },
    likes: ['plush', 'treats'],
    dislikes: ['flowers'],
    birthday: 27,
    look: { seed: 4213, role: 'shopper' },
    ties: { nguyen: 0.9, mai: 0.8, hugo: 0.3 },
    facts: [
      { id: 'dinosaur', text: 'Wants the game with the dinosaur', says: 'The one with the green dinosaur you ride. I want that one more than anything.' },
      { id: 'turn', text: 'Never gets his turn', says: 'She says it’s my turn after this level. She’s been on this level since Tuesday.', from: 'acquaintance' },
    ],
    effects: KID_EFFECTS,
    lines: {
      ...KID_LINES,
      hello: ['…Hi.', 'Hi! Is it my turn yet?', 'Hello.'],
      chat: ['Can cats play video games? Yours looks clever.', 'I’m going to be a game maker. Or a fireman.', 'Mai cheats. Don’t tell her I said.'],
    },
  },
  {
    id: 'lina',
    name: 'Lina Haddad',
    short: 'Lina',
    role: 'Mrs Haddad’s niece, Wednesdays and weekends',
    group: 'building',
    whereabouts: 'In the courtyard on Wednesdays and weekends, on the sandpit’s edge',
    intro: 'Lina. I’m at my aunt’s on Wednesdays and weekends. Sega’s better, by the way. Everyone knows.',
    traits: ['proud', 'collector'],
    tastes: { platforms: ['megadrive'], genres: ['action', 'platform'] },
    likes: ['cake', 'record'],
    dislikes: ['plush'],
    birthday: 52,
    look: { seed: 4333, role: 'shopper' },
    ties: { haddad: 0.8, hugo: 0.5, mai: 0.4 },
    facts: [
      { id: 'sega', text: 'Sega, always Sega, like her aunt', says: 'Nintendo is for babies. My aunt says so. She has ALL the Sega games.' },
      { id: 'blue', text: 'Wants blue hair like a hedgehog', says: 'When I’m allowed, I’m dyeing my hair blue. Spiky.', from: 'acquaintance' },
    ],
    effects: KID_EFFECTS,
    lines: {
      ...KID_LINES,
      hello: ['Hey.', 'Oh. Hi.', 'Watch this.'],
      chat: ['Blast processing. Look it up.', 'Hugo thinks he’s good at Snake. He’s not.', 'My aunt’s teaching me to haggle. Watch out.'],
    },
  },
];
