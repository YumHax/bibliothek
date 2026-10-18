import { isYoung } from '../voices';
import type { PersonCard, TierId } from '../types';

/*
 * What people say in their tier's scene at the flat's door (docs/social.md "Tier scenes"), before their keepsake's own
 * words (`KeepsakeDef.giving`), and the notes they slip under the door instead: a friendly one, a keepsake posted, a
 * cooled friendship. By who they are (`sceneVoice`): a neighbour, an old friend, a child, the postman, the rival, the
 * uncle; a line is picked per person so each says the same one every time.
 */

/** Whose words a scene is in. */
export type SceneVoice = 'neighbour' | 'friend' | 'kid' | 'trade' | 'rival' | 'kin';

/** Who `card` is, for their scene's words. */
export function sceneVoice(card: PersonCard): SceneVoice {
  if (isYoung(card)) return 'kid';
  if (card.id === 'gaspard') return 'kin';
  if (card.group === 'rivals') return 'rival';
  if (card.group === 'friends') return 'friend';
  if (card.group === 'building' && card.trade !== 'postman') return 'neighbour';
  return 'trade';
}

/** Their first words at the door, by the tier just reached. */
export const DOOR_OPENERS: Record<SceneVoice, Record<'friend' | 'close', readonly string[]>> = {
  neighbour: {
    friend: [
      'Sorry to knock so late. I won’t keep you, I just had something for you.',
      'I was passing, and I thought: no, go up and say it. I’m glad you moved in.',
      'Hello! Don’t worry, nothing’s wrong. Quite the opposite.',
    ],
    close: [
      'You know, it feels like I’ve known you for years.',
      'I said to myself: tonight I go up and tell them. So. Here I am.',
      'I don’t say this to many people. You’re a real friend.',
    ],
  },
  friend: {
    friend: ['Don’t panic, I only came up to give you something.', 'Hey. I was in the area. Well, I came on purpose. Here.'],
    close: ['You know you’re my favourite idiot, right? Come here.', 'All these years. All these years! This is for you.'],
  },
  kid: {
    friend: ['Hi! Mum said I could come up. I made you something!', 'Hi! Close your eyes. No, open them. It’s for you!'],
    close: ['You’re my best grown-up friend. Here!', 'I told everyone at school about you. This is for you.'],
  },
  trade: {
    friend: ['Not on the round, for once. Just me, with something for you.', 'Sorry to bother you after hours. I wanted to give you this myself.'],
    close: ['I don’t do this on every landing, you know. You’re one of the good ones.'],
  },
  rival: {
    friend: ['Don’t look so surprised. Even rivals have manners.'],
    close: ['I find, to my annoyance, that I like you. There. Take this before I change my mind.'],
  },
  kin: {
    friend: ['Félix would have… well. This is for you.'],
    close: ['I’m no good at this. Here. Maman would want you to have it.'],
  },
};

/** Mme Pereira at the door the evening the first day's parcel reached Mrs Roux (`tierScenes.welcomeKept`). */
export const WELCOME_THANKS: readonly string[] = [
  'Mrs Roux telephoned the lodge. She’s had her parcel, and from you. Thank you.',
  'Most people who move in, I don’t see them for a month. You, the first day. That’s good.',
  'If you need anything, the lodge is open from eight. Goodnight, neighbour.',
];

/** What a close friend adds once the keepsake is given: an invitation. */
export const CLOSE_INVITES: Record<SceneVoice, readonly string[]> = {
  neighbour: ['And come round one evening. I mean it. The door’s open.', 'Come and eat with us one night. No need to ring first.', 'Drop in whenever. Really. Any time.'],
  friend: ['Next time, my place. I’ll even tidy.', 'And come to mine some time. I’ll cook. Badly.'],
  kid: ['You can come to my birthday! If Mum says yes.', 'Come and play at ours! We have juice.'],
  trade: ['If you’re ever passing the sorting office, the coffee’s on me.'],
  rival: ['Perhaps one day I will show you the collection. Perhaps.'],
  kin: ['Come to Maman’s on Sunday. I’ll be there. Probably.'],
};

/** Their goodbye from the landing as they go back down. */
export const DOOR_GOODBYES: Record<SceneVoice, readonly string[]> = {
  neighbour: ['Right. Goodnight!', 'See you on the stairs!', 'Sleep well, neighbour.'],
  friend: ['Right. Love you, bye!', 'Later! Don’t stay up all night.'],
  kid: ['Bye! I have to go to bed!', 'Bye bye! See you on the stairs!'],
  trade: ['Right, I’ll let you get on. Goodnight!'],
  rival: ['Good evening.', 'Until the next sale.'],
  kin: ['Right. Mind how you go.'],
};

/** A friendly note slipped under the door: their words, signed. */
export const FRIENDLY_NOTES: Record<SceneVoice, readonly string[]> = {
  neighbour: ['Thank you for the chat the other day. It did me good.', 'Just a word to say it’s nice having you in the building.', 'You made my week, you know. Thank you.'],
  friend: ['Good seeing you the other day. We should do it more.', 'Just saying: you’re a good one. Don’t let it go to your head.'],
  kid: ['THANK YOU for the games. You are cool.', 'You are my favourite neighbour. From me.'],
  trade: ['Thanks for the coffee the other day. It made my round.'],
  rival: ['A pleasant conversation. I had forgotten they existed.'],
  kin: ['Maman says you’re good for her. She’s right, for once.'],
};

/** Under a keepsake posted rather than handed over (someone who does not come to the door). */
export const POSTED_LINES: readonly string[] = ['I’ve put it in with this note. For your fridge.', 'It’s in the envelope. Stick it somewhere you’ll see it.'];

/** When they came to the door and nobody answered: the keepsake left on the mat, and a word. */
export const MISSED_LINES: readonly string[] = ['I knocked, but you were out. I’ve left it for you.', 'Came up, nobody home. It’s under the door. Next time!'];

/** A cooled friendship's note under the door, in their hand, by who they are and how far it fell. */
export const COOLING_NOTES: Record<SceneVoice, Partial<Record<TierId, readonly string[]>>> = {
  neighbour: {
    cold: ['I thought we got on. Evidently not.', 'I’d rather you kept your distance for a while.', 'I’m disappointed, I won’t pretend otherwise.'],
    hostile: ['Don’t bother knocking.', 'I know what you are now.', 'Stay away from my door.'],
    nemesis: ['You’ll regret this.', 'This building isn’t big enough for the two of us.'],
  },
  friend: {
    cold: ['I thought we were mates. I need a break from you for a bit.', 'Not sure what’s going on with you. Call me when you know.'],
    hostile: ['Don’t call me.', 'I’m done. Seriously.'],
    nemesis: ['Lose my number.', 'We’re finished, you and me.'],
  },
  kid: { cold: ['You were mean.'], hostile: ['I don’t like you any more.'], nemesis: ['I don’t like you any more. At all.'] },
  trade: { cold: ['I’ll leave your post at the lodge from now on.'], hostile: ['Your post goes to the lodge. Collect it yourself.'] },
  rival: { cold: ['I had thought you a worthy rival. I see I was mistaken.'], hostile: ['Stay out of my way at the market.'], nemesis: ['You will regret this. I never forget a slight.'] },
  kin: { cold: ['I see how it is.'], hostile: ['Don’t expect me at Sunday lunch.'], nemesis: ['We are done, you and I.'] },
};

/** A line of `lines` for `person`, the same one every time (their name picks it). */
export function lineFor(person: string, lines: readonly string[], salt = 0): string {
  let h = salt;
  for (let i = 0; i < person.length; i++) h = (h * 31 + person.charCodeAt(i)) >>> 0;
  return lines[h % lines.length]!;
}
