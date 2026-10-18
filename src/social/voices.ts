import { findPerson } from './people';
import { TRADE_LINES, TRADE_PHONE_LINES } from './socialLines';
import type { LineKey, Manner, PersonCard, PersonId, SocialPlace, Trait } from './types';

/*
 * Whose words a line is in (docs/social.md "Lines"): a card's own `lines` first, then their trade's (`TRADE_LINES`),
 * then the voice of their strongest trait (grumpy Mr Leclerc does not say "You dear thing"), else none and the shared
 * lines of `socialLines` speak. Placeholders as in `SOCIAL_LINES`.
 */

/** The traits that colour a voice, the strongest first (a grumpy chatterbox grumbles first). */
const VOICE_ORDER: readonly Trait[] = ['grumpy', 'proud', 'shy', 'businesslike', 'funny', 'competitive', 'gossip', 'chatty', 'nostalgic', 'generous'];

/** What a trait changes of the shared words: their thanks, how they take news, their birthday, a hurt, a second hello. */
const TRAIT_VOICES: Partial<Record<Trait, Partial<Record<LineKey, readonly string[]>>>> = {
  grumpy: {
    thanks: ['Hm. That’s… decent of you. Thank you.', 'You didn’t have to. But. Thank you.', 'Well. I won’t say no. Thank you.'],
    news: ['Hm. Good for you, I suppose.', 'Well. That’s something.', 'Not bad. Don’t let it go to your head.'],
    birthday: ['It’s my birthday. No singing. I mean it.', 'Another year. Nobody needs to make a fuss.'],
    hurt: ['I’ve been insulted by better.', 'Charming. Now leave me be.'],
    twice: ['You again. Twice in one day.', 'Back already? What now?'],
    call: ['{name} here. Have you a minute? I won’t keep you.', 'It’s {name}. I’ll be brief.'],
  },
  proud: {
    thanks: ['That’s generous. I’m touched, truly.', 'I don’t accept gifts lightly. I accept this one.'],
    news: ['Well done. Truly.', 'Impressive. I mean that.'],
    hurt: ['I won’t forget that. Not ever.', 'You’ll find I have a long memory.'],
    call: ['Good day. {name} speaking. Is this a convenient moment?'],
  },
  shy: {
    thanks: ['Oh! For me? I… thank you.', 'You didn’t have to… thank you. Really.'],
    news: ['Oh, that’s nice. Really nice.', 'Oh! Good. I’m glad for you.'],
    birthday: ['It’s… my birthday, actually. Don’t tell anyone.'],
    hurt: ['…Oh.', 'I… I see.'],
    twice: ['Oh, hello again.', 'Oh! You came back.'],
    call: ['Hello? It’s… it’s {name}. Is this a bad time?', 'Hi, it’s {name}. Sorry, I can call back.'],
  },
  businesslike: {
    thanks: ['Appreciated. Thank you.', 'Thank you. I’ll remember that.'],
    news: ['Good business.', 'Sounds like a fair deal. Well done.'],
    call: ['{name} here. Have you two minutes?'],
  },
  funny: {
    thanks: ['A gift! Should I be worried? Ha! Thank you.', 'For me? What do you want? Ha! Thank you.'],
    news: ['Ha! Look at you go!', 'No! Brilliant. You’ll be insufferable now.'],
    birthday: ['Birthday today. I’m officially vintage.'],
    twice: ['Twice in a day! People will talk.', 'You again! Are you following me?'],
    call: ['Guess who? It’s {name}! Don’t hang up.', 'It’s {name}! I had nothing to do, so I rang you. Flattered?'],
  },
  competitive: {
    news: ['Not bad. I’d have done it faster.', 'Ha! I’ll top that, you’ll see.'],
  },
  gossip: {
    news: ['No! Really? Wait till I tell everyone.', 'Tell me everything. From the beginning.'],
    twice: ['Back again? Sit, sit. I’ve heard things since.', 'Twice in a day! Lovely. Now, listen…'],
    call: ['It’s {name}! Have you heard? No? Then sit down.', 'Hello, it’s {name}. I simply had to ring someone.'],
  },
  chatty: {
    news: ['No! Really? Sit down and tell me properly.', 'Oh, how wonderful. I want every detail.'],
    twice: ['Twice in a day! Lovely.', 'Back again? Sit, sit.'],
    call: ['Hello? It’s {name}! I was just thinking of you. How are things?', 'It’s {name}! Nothing urgent, I just felt like a chat.'],
  },
  nostalgic: {
    thanks: ['Oh, this takes me back. Thank you.', 'How thoughtful. Things like this don’t happen any more.'],
    news: ['Ah, that reminds me of the old days. Good for you.'],
  },
  generous: {
    thanks: ['You’re too good to me. Thank you.', 'Now I owe you one. Thank you!'],
  },
};

/** A trait's voice on a call, in place of `TRAIT_VOICES` (their `hello` is how they pick up). */
const TRAIT_PHONE_VOICES: Partial<Record<Trait, Partial<Record<LineKey, readonly string[]>>>> = {
  grumpy: { hello: ['Yes? …Oh. It’s you.', 'Hm. Who is it? Ah.'] },
  proud: { hello: ['Good day. Ah, it’s you.'] },
  shy: { hello: ['H-hello? Oh, it’s you.', 'Hello? …Oh! Hi.'], twice: ['Oh, hello again.', 'Oh! You rang again.'] },
  businesslike: { hello: ['Yes, hello?', 'Speaking. Ah, it’s you.'] },
  funny: {
    hello: ['Hello, you’ve reached the… oh, it’s you!', 'Hello? Ha, I knew it’d be you.'],
    news: ['Ha! Listen to you go!', 'No! Brilliant. You’ll be insufferable now.'],
    twice: ['Twice in a day! People will talk.', 'You again! Can’t get enough of me?'],
  },
  gossip: { hello: ['Hello? Oh, it’s you! I was just about to ring someone.'], twice: ['Ringing again? Good. I’ve heard things since.', 'Twice in a day! Lovely. Now, listen…'] },
  chatty: {
    hello: ['Hello? Oh, it’s you! How lovely!', 'Hello-o? Oh, hello, you!'],
    news: ['No! Really? Tell me properly, from the start.', 'Oh, how wonderful. I want every detail.'],
    twice: ['Twice in a day! Lovely.', 'You again? Lovely, I’d only just put the phone down.'],
  },
};

/** Said standing in front of someone: a card's or a trade's own of these are never said on a call (`PHONE_*` lines are). */
const IN_PERSON_KEYS: ReadonlySet<LineKey> = new Set(['hello', 'leaving', 'bye']);

/** A child or a teenager (no insults offered, their own hurt). */
export function isYoung(card: PersonCard | null): boolean {
  const age = card?.look.age;
  return age === 'child' || age === 'teen';
}

/** The trait that colours `card`'s voice for `key`, or null. */
function traitVoice(card: PersonCard, key: LineKey, voices = TRAIT_VOICES): readonly string[] | undefined {
  for (const t of VOICE_ORDER) {
    if (!card.traits.includes(t)) continue;
    const lines = voices[t]?.[key];
    if (lines?.length) return lines;
  }
  return undefined;
}

/**
 * `id`'s lines of `key`: their own, their trade's, their strongest trait's; undefined for the shared ones. On the phone
 * (`place` 'phone'), their words for a call first (`phoneLines`, `TRADE_PHONE_LINES`, a trait's phone voice), and never
 * a hello, a leaving or a goodbye said standing in front of the player.
 */
export function voiced(id: PersonId, key: LineKey, place?: SocialPlace): readonly string[] | undefined {
  const card = findPerson(id);
  if (!card) return undefined;
  if (place === 'phone') {
    // At each level (their own, their trade's, their trait's) the words for a call first, then the others but for a
    // hello, a leaving or a goodbye.
    const inPerson = IN_PERSON_KEYS.has(key);
    const levels = [
      [card.phoneLines?.[key], inPerson ? undefined : card.lines?.[key]],
      card.trade ? [TRADE_PHONE_LINES[card.trade]?.[key], inPerson ? undefined : TRADE_LINES[card.trade]?.[key]] : [],
      [traitVoice(card, key, TRAIT_PHONE_VOICES), inPerson ? undefined : traitVoice(card, key)],
    ];
    return levels.flat().find((lines) => !!lines?.length);
  }
  const own = card.lines?.[key];
  if (own?.length) return own;
  const trade = card.trade ? TRADE_LINES[card.trade]?.[key] : undefined;
  if (trade?.length) return trade;
  return traitVoice(card, key);
}

/** How `id` carries themselves (their body's way of taking what is said), from their traits; null: no particular way. */
export function mannerOf(id: PersonId): Manner | null {
  const traits = findPerson(id)?.traits ?? [];
  if (traits.includes('grumpy')) return 'gruff';
  if (traits.includes('shy')) return 'shy';
  if (traits.includes('funny') || traits.includes('chatty') || traits.includes('competitive')) return 'lively';
  if (traits.includes('proud') || traits.includes('businesslike')) return 'proud';
  if (traits.includes('generous') || traits.includes('romantic') || traits.includes('nostalgic')) return 'warm';
  return null;
}

/** A stable number for `id` (a player's line picked per person, not the same for everyone on a day). */
export function personSeed(id: PersonId): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
