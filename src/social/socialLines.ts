import type { InteractionId } from './types';

/*
 * What people say back, shared by everyone (a card's own `lines` win over these): by interaction, landed (`win`)
 * or not (`lose`). Placeholders: {name} their short name, {about} whoever is gossiped about, {gift} what was
 * given, {game} the game given or talked about.
 */
export const SOCIAL_LINES: Record<InteractionId, { win: readonly string[]; lose: readonly string[] }> = {
  chat: {
    win: ['Oh, it’s been one of those weeks. Thanks for asking, really.', 'You know, you’re easy to talk to.', 'Ha! Same here. Exactly the same.', 'We should do this more often.'],
    lose: ['Mm. Sorry, I’m miles away.', 'Right. Well.', 'I really have to go, sorry.'],
  },
  askDay: {
    win: ['Long! But better now. Thank you for asking, nobody does.', 'Do you really want to know? All right then…', 'Quiet. Lovely and quiet. Yours?'],
    lose: ['Fine. It was fine.', 'Not one I want to talk about.', 'Why do you ask?'],
  },
  talkGames: {
    win: ['Oh, don’t get me started. Actually, do get me started.', 'You’ve got the bug as badly as I do.', 'That one! I had forgotten all about that one.', 'Now you’re talking my language.'],
    lose: ['I don’t really… games aren’t my thing.', 'You lost me at “cartridge”.', 'Mm-hm. Fascinating. Truly.'],
  },
  compliment: {
    win: ['Oh! Well. Thank you. That’s kind.', 'Stop it. No, go on.', 'You’ve made my day, you know.'],
    lose: ['What do you want?', 'Hm. Flattery.', 'Right…'],
  },
  joke: {
    win: ['Ha! Oh, that’s terrible. Tell me another.', '*laughs* I’m stealing that one.', 'You’re wasted on video games.'],
    lose: ['…Was that a joke?', 'I don’t get it.', 'Not now.'],
  },
  gossip: {
    win: ['No! {about}? I knew it. I knew it!', 'Well, that explains a lot about {about}.', 'You didn’t hear it from me, but… about {about}…'],
    lose: ['I don’t like talking behind {about}’s back.', 'That’s not very nice.', 'I’d rather not.'],
  },
  complain: {
    win: ['Don’t tell me. The lift, the bins, the stairs light. A disgrace.', 'Finally, someone who sees it!', 'I have been saying this for years.'],
    lose: ['It’s not that bad.', 'You’ve only just moved in.', 'Everyone complains. Nobody does anything.'],
  },
  apologise: {
    win: ['…All right. Thank you. Let’s say no more about it.', 'Well. It takes something to say that. Apology accepted.', 'Fine. Water under the bridge.'],
    lose: ['Words are cheap.', 'I’ll think about it.', 'Hm. We’ll see.'],
  },
  askNumber: {
    win: ['Of course. Here, I’ll write it down. Ring any time, not after ten.', 'Sure! Text first, though, I never pick up.', 'Here. Don’t give it to the syndic.'],
    lose: ['Maybe when we know each other better.', 'I’m not much of a phone person.', 'Let’s… see.'],
  },
  askFavour: {
    win: ['For you? Of course. Just say when.', 'Consider it done.', 'What are neighbours for?'],
    lose: ['Ooh, not this week, sorry.', 'I’m stretched too thin, really.', 'Ask me another time.'],
  },
  askTip: {
    win: ['Between us? …', 'All right, here’s one for free.', 'Since it’s you…'],
    lose: ['I don’t know anything.', 'If I knew, I wouldn’t say.', 'Find out like everyone else.'],
  },
  askDiscount: {
    win: ['Go on then, today only. Don’t tell anyone.', 'For a regular? I suppose.', 'Fine. Ten percent. Robbery.'],
    lose: ['Prices are prices.', 'Nice try.', 'Do I look like a charity?'],
  },
  tease: {
    win: ['Oi! Cheek. *grins*', 'Says the one who…! Ha.', 'Oh, you’re going to regret that.'],
    lose: ['That’s not funny.', 'Excuse me?', 'I don’t appreciate that.'],
  },
  insult: {
    win: ['I beg your pardon?!', 'How dare you.', 'Well. Now I know what you are.'],
    lose: ['I beg your pardon?!', 'How dare you.'],
  },
  challenge: {
    win: ['You’re on. Loser buys the coffee.', 'Ha! You’ll regret that.', 'Name the game.'],
    lose: ['Not today.', 'I don’t play games with people I don’t know.', 'Pff.'],
  },
  giveGift: {
    win: ['For me? Oh, {gift}! You shouldn’t have.', 'Oh, that’s lovely. Thank you.', '{gift}! How did you know?'],
    lose: ['Oh. {gift}. Thank you… I suppose.', 'Ah. I don’t really… but thank you.', 'That’s… not really my thing.'],
  },
  giveGame: {
    win: ['{game}? For me? I don’t know what to say.', 'Oh, I’ve wanted {game} for ages!', '{game}… you remembered.'],
    lose: ['{game}. Ah. Thank you. I’ll… find a place for it.', 'That’s very kind, but I don’t really play that.'],
  },
  giveCoins: {
    win: ['Oh! That’s very decent of you.', 'Much appreciated, truly.', 'I won’t say no.'],
    lose: ['I don’t need your money.', 'Put that away.', 'What’s this for?'],
  },
};

/** When the day's talk is spent (the battery empty). */
export const TIRED_LINES: readonly string[] = ['Sorry, I’m talked out for today.', 'Let’s pick this up another day, shall we?', 'I really must get on.'];

/** On their birthday, a word of it once. */
export const BIRTHDAY_LINES: readonly string[] = ['It’s my birthday today, you know.', 'You remembered? It’s my birthday!', 'Another year older. Don’t ask which.'];

/** The first word to someone cold or hostile, when their card has none. */
export const COLD_LINES: readonly string[] = ['Hm.', 'Yes?', 'What is it now?'];
export const HOSTILE_LINES: readonly string[] = ['I have nothing to say to you.', 'Leave me alone.', 'Don’t.'];
export const HELLO_LINES: readonly string[] = ['Hello!', 'Oh, hi.', 'Ah, there you are.'];
