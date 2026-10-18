import type { PersonCard } from '../types';

/*
 * The open house's regulars (docs/visitors.md "Gatherings"): neighbours from round about who come up the stairs when
 * the paper prints an open house. Their ids and seeds are `visitors/gathering/gatheringPlan`'s `GUESTS`, so the face in
 * the book is the one met in the flat; met at one open house, they are remembered at the next. Light people.
 */
const guest = (card: Omit<PersonCard, 'group' | 'trade' | 'whereabouts'>): PersonCard => ({ ...card, group: 'street', trade: 'regular', occasional: true, whereabouts: 'Up your stairs when there is an open house' });

export const GUEST_PEOPLE: readonly PersonCard[] = [
  guest({
    id: 'guest-jo',
    name: 'Jo Lemaire',
    short: 'Jo',
    role: 'a neighbour from round the corner',
    intro: 'Jo, from round the corner. I read THE GAMING WEEKLY cover to cover. Even the small ads.',
    topics: [{ id: 'paper', say: 'You came because of the paper?', again: 'Back for another open house?', name: 'The open house', icon: 'book', fit: 'likes', obvious: true, answers: ['My son had a NES. I wanted to see one again, in its box.', 'Every open house, I tell myself: just a look. Then I stay an hour.'] }],
    traits: ['nostalgic', 'chatty'],
    likes: ['croissant', 'cake'],
    birthday: 14,
    look: { seed: 4101, role: 'shopper' },
  }),
  guest({
    id: 'guest-ray',
    name: 'Raymond Okeke',
    short: 'Ray',
    role: 'a collector, Mega Drive mostly',
    intro: 'Ray. I collect too, a bit. Mega Drive, mostly. Nothing like this.',
    topics: [{ id: 'loft', say: 'Where do you keep yours?', again: 'Still in the loft, your collection?', name: 'His collection', icon: 'games', fit: 'loves', obvious: true, answers: ['In the loft. My wife calls it the attic of shame. I call it the attic.', 'Boxed in the loft, sorted by year. I go up there to think.'] }],
    traits: ['collector', 'proud'],
    likes: ['coffee', 'game'],
    birthday: 29,
    look: { seed: 4202, role: 'shopper' },
  }),
  guest({
    id: 'guest-amy',
    name: 'Amy Laurent',
    short: 'Amy',
    role: 'a student, Game Boy forever',
    intro: 'Amy! My flatmate told me about your open house. I only ever had a Game Boy.',
    topics: [{ id: 'gameboy', say: 'Still got your Game Boy?', again: 'How’s the old Game Boy?', name: 'Her Game Boy', icon: 'games', fit: 'loves', obvious: true, answers: ['At my parents’, with a save I would die for.', 'The screen’s gone yellow. I still love it.'] }],
    traits: ['chatty', 'funny'],
    likes: ['croissant', 'plush'],
    birthday: 51,
    look: { seed: 4303, role: 'shopper' },
  }),
  guest({
    id: 'guest-ben',
    name: 'Ben Carvalho',
    short: 'Ben',
    role: 'a dad, with the kids at their gran’s',
    intro: 'Ben. The kids are at their gran’s, so I came to look at games in peace.',
    topics: [{ id: 'kids', say: 'Do your kids play the old ones?', again: 'Have the kids beaten you yet?', name: 'His kids', icon: 'family', fit: 'loves', obvious: true, answers: ['They laugh at the graphics. Then they won’t put the pad down.', 'My daughter beat my Mario time. I’m still recovering.'] }],
    traits: ['nostalgic', 'generous'],
    likes: ['coffee', 'cake'],
    birthday: 5,
    look: { seed: 4404, role: 'shopper' },
  }),
  guest({
    id: 'guest-lou',
    name: 'Lucie Fabre',
    short: 'Lucie',
    role: 'runs the second-hand shop round the corner',
    intro: 'Lucie. I run the second-hand place round the corner. Lamps, mostly. Games when I’m lucky.',
    topics: [{ id: 'shop', say: 'Anything good in your shop?', again: 'Found any games for the shop?', name: 'Her shop', icon: 'money', fit: 'likes', obvious: true, answers: ['Lamps. So many lamps. A Game Gear once, but I kept it.', 'If you ever sell, you know where I am. I mean it.'] }],
    traits: ['businesslike', 'chatty'],
    likes: ['coffee', 'flowers'],
    birthday: 43,
    look: { seed: 4505, role: 'shopper' },
  }),
  guest({
    id: 'guest-kim',
    name: 'Kim Tran',
    short: 'Kim',
    role: 'a gamer, N64 and speedruns',
    intro: 'Kim. N64, mostly. And speedruns. Where do I pay?',
    topics: [{ id: 'runs', say: 'Do you speedrun these?', again: 'Any new personal best?', name: 'Her speedruns', icon: 'trophy', fit: 'loves', obvious: true, answers: ['Every day. My Mario 64 time is decent. Not decent enough.', 'I shaved two seconds off last week. Two! I screamed.'] }],
    traits: ['competitive', 'funny'],
    likes: ['coffee', 'croissant'],
    birthday: 22,
    look: { seed: 4606, role: 'shopper' },
  }),
];
