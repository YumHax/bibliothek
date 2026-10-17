import type { Fit, InteractionId, LineKey } from './types';

/*
 * What people say back, shared by everyone (a card's own `lines`, then their trade's `TRADE_LINES`, win over these):
 * by choice and by how it landed (`Fit`). Placeholders: {name} their short name, {gift} what was given, {game} the
 * game given or told about, {memory} a memory of theirs ("you lent me Zelda").
 */
export const SOCIAL_LINES: Record<'chat' | 'joke' | 'tease' | 'apologise' | 'askNumber' | 'insult' | 'giveGift' | 'giveGame' | 'giveCoins', Record<Fit, readonly string[]>> = {
  chat: {
    loves: ['Oh, don’t get me started! Actually, do. Sit down a minute.', 'You know, you’re easy to talk to. Nobody asks any more.', 'We should do this more often, really.', 'Ha! I was hoping someone would stop. Come here.', 'Now you’ve made my day. Well, my minute.'],
    likes: ['Oh, can’t complain. Well, I can, but I won’t.', 'Same old, same old. Nice of you to ask.', 'Ha! Same here. Exactly the same.', 'Not bad at all, thanks. You?', 'Busy, but the good kind of busy.'],
    meh: ['Can’t complain.', 'Same as ever.', 'Oh, you know. Getting by.', 'Fine, fine.', 'Mustn’t grumble.'],
    dislikes: ['Not now, please.', 'I really have to go, sorry.', 'Do I look like I want to chat?', 'Another time. Really.', 'Hm. No.'],
  },
  joke: {
    loves: ['Ha! Oh, that’s terrible. Tell me another.', 'I’m stealing that one. You won’t get it back.', 'You’re wasted on video games.', 'Stop, stop, my sides! Ha!', 'That’s dreadful. I love it.'],
    likes: ['Ha. Not bad, not bad.', 'Heh. I’ll give you that one.', 'Oh dear. That’s a groaner.', 'Ha! Go on then, one more. Just one.', 'That was nearly funny. Nearly.'],
    meh: ['…Was that a joke?', 'I don’t get it.', 'Hm.', 'Ah. A joke. Right.', 'I’ll laugh later, I promise.'],
    dislikes: ['Not funny.', 'Really? Now?', 'Please don’t.', 'I’m not in the mood for jokes.', 'Was that meant to be funny?'],
  },
  tease: {
    loves: ['Oi! Cheek. You’ll pay for that.', 'Says the one who…! Ha.', 'Oh, it’s like that, is it? Bring it on.', 'Ha! I walked into that one.', 'Careful, I give as good as I get.'],
    likes: ['Ha. Watch it, you.', 'Cheeky.', 'I’ll let that one go.', 'Ooh, somebody’s brave today.', 'Ha. Noted. And filed.'],
    meh: ['Hm. If you say so.', 'Right.', 'Mm.', 'Was that a dig? I can’t tell.'],
    dislikes: ['That’s not funny.', 'Excuse me?', 'I don’t appreciate that.', 'Leave it, please.', 'Charming.'],
  },
  apologise: {
    loves: ['Oh, come here. It’s forgotten. All of it.', 'That means a lot. Thank you. Really.', 'Well! Water under the bridge.', 'Thank you. I’ve been hoping you’d say that.'],
    likes: ['…All right. Thank you. Let’s say no more about it.', 'It takes something to say that. Apology accepted.', 'Fine. We start again.', 'All right. Clean slate. Don’t waste it.'],
    meh: ['I’ll think about it.', 'Hm. We’ll see.', 'Words are cheap. But thank you.', 'Noted. Give me time.'],
    dislikes: ['Words are cheap.', 'Not yet. I’m not ready.', 'Hmph.', 'Sorry doesn’t fix it.'],
  },
  askNumber: {
    loves: ['Of course! Here, I’ll write it down.', 'Finally, you asked! Here.', 'I was going to ask you for yours! Here.', 'Here. Ring me any time, I mean it.'],
    likes: ['Of course. Here, I’ll write it down. Ring any time, not after ten.', 'Sure! Text first, though, I never pick up.', 'Here. Don’t give it to the syndic.', 'Go on, then. Here.'],
    meh: ['I suppose. Here.', 'All right. For emergencies.', 'Fine. Don’t ring at dinner.'],
    dislikes: ['Maybe when we know each other better.', 'I’m not much of a phone person.', 'Let’s… see.'],
  },
  insult: {
    loves: ['I beg your pardon?!'],
    likes: ['I beg your pardon?!'],
    meh: ['I beg your pardon?!'],
    dislikes: ['I beg your pardon?!', 'How dare you.', 'Well. Now I know what you are.', 'I won’t forget that.', 'Get out of my sight.'],
  },
  giveGift: {
    loves: ['For me? Oh, {gift}! You shouldn’t have.', '{gift}! How did you know?', 'Oh, my favourite! You’re a treasure.', 'You remembered! Oh, you dear thing.', '{gift}! You’ve made my whole week.'],
    likes: ['Oh, that’s lovely. Thank you.', 'For me? That’s kind of you.', 'How nice. Thank you, really.', 'What a thought. Thank you.', 'Oh! You are kind.'],
    meh: ['Oh! Another one? You spoil me. Thank you.', 'You’re too kind, really. Thank you.', 'Twice in a day! You’re spoiling me.', 'You really don’t have to, you know.'],
    dislikes: ['Oh. {gift}. Thank you… I suppose.', 'Ah. I don’t really… but thank you.', 'That’s… not really my thing.', 'Oh. Well. It’s the thought, isn’t it?', 'I’ll… find someone who likes {gift}.'],
  },
  giveGame: {
    loves: ['{game}? For me? I don’t know what to say.', 'Oh, I’ve wanted {game} for ages!', '{game}… you remembered.', '{game}! I’m playing it tonight. All night.', 'No! {game}! Come here, you.'],
    likes: ['{game}! That’s very kind. I’ll give it a go.', 'Oh, a game! Thank you, really.', '{game}, eh? I’ll find the time. Thank you.', 'How generous. Thank you.'],
    meh: ['Another one? You’re too generous.', 'Thank you. I’ll find it a place.', 'You keep giving me games! Thank you.'],
    dislikes: ['{game}. Ah. Thank you. I’ll… find a place for it.', 'That’s very kind, but I don’t really play that.', 'A game. For me. Hm. Thank you.'],
  },
  giveCoins: {
    loves: ['Oh! That’s very decent of you.', 'Much appreciated, truly.', 'I won’t say no!', 'Now that’s a gift I understand.'],
    likes: ['Oh, you shouldn’t. But thank you.', 'That’s kind. Thank you.', 'Well, every little helps. Thank you.'],
    meh: ['Keep it. Really.', 'You already gave me some.', 'No, no. Put it away.'],
    dislikes: ['I don’t need your money.', 'Put that away.', 'What’s this for?', 'I’m not a charity.'],
  },
};

/** How they take the player's news (`news.ts`): any news, and a game's ({game}). */
export const NEWS_LINES: Record<'any' | 'game', Record<Fit, readonly string[]>> = {
  any: {
    loves: ['No! Really? Tell me everything!', 'Oh, that’s wonderful news!', 'Well, look at you! I’m so pleased.', 'Ha! That’s the best thing I’ve heard all week.', 'You don’t say! Sit down, start again, slowly.'],
    likes: ['Oh, nice! Good for you.', 'Well, well. Good for you.', 'Ha! Not bad at all.', 'That’s good to hear.', 'Look at that. Well done.'],
    meh: ['Ah. Good, good.', 'Mm. Nice.', 'Is that so.', 'Oh. Right. Good.', 'Fancy that.'],
    dislikes: ['Hm. If you say so.', 'I can’t say I care for that.', 'Must you tell me?', 'I’d rather not hear about it.', 'Is that supposed to be good news?'],
  },
  game: {
    loves: ['{game}? You lucky thing! Where? How much?', '{game}! Oh, I’d give anything to have a go.', 'No! {game}! You have to show me.', '{game}! I’ve looked for that for years!', 'You found {game}? I could kiss you. I won’t.'],
    likes: ['{game}, eh? Good find.', 'Oh, {game}. I remember that one.', 'Nice! {game} is a good one.', '{game}! Not bad, not bad at all.'],
    meh: ['{game}. Right. Is that a good one?', 'Ah. Games. Good for you.', 'Oh? Is that a good one?', 'I don’t know that one. Is it nice?'],
    dislikes: ['Another game? Where do you put them all?', 'More games. Of course.', 'Games again. Don’t you ever go outside?'],
  },
};

/** When their talk is done (`TALK.exchanges` said): they have to go, nicely. */
export const LEAVING_LINES: readonly string[] = ['Right, I must dash. Lovely talking to you!', 'Oh, look at the time. I have to go.', 'Let’s pick this up another day, shall we?', 'I’d better get on. Good to see you!', 'Goodness, is that the time? I’m off.'];

/** Trust is what holds them back (their warmth would reach the next tier): once a day, they say what they would like. */
export const HELD_LINES: readonly string[] = [
  'You’re good company. I’d just like to know I can count on you.',
  'I like you, I do. Whether I can rely on you, we’ll see.',
  'Friends help each other out, don’t they? We’ll get there.',
  'Talk is nice. A hand now and then is nicer.',
];

/** A good memory of theirs called back as they open the conversation ({memory}: "you lent me Zelda"). */
export const CALLBACK_LINES: readonly string[] = ['Remember when {memory}? Made my week.', 'I was just thinking about when {memory}.', 'You know, I still smile about when {memory}.', 'I was telling someone about when {memory}. Made me smile.'];

/** A bad one, by someone still sore. */
export const GRUDGE_LINES: readonly string[] = ['I haven’t forgotten when {memory}.', 'Don’t think I’ve forgotten when {memory}.', 'After {memory}? You’ve a nerve.'];

/** Their first word on a day their mood is not fine (the panel says why). */
export const MOOD_OPENINGS: Record<'good' | 'low' | 'annoyed', readonly string[]> = {
  good: ['What a day! Honestly, I’m in a great mood.', 'Ah, perfect timing! I’m in such a good mood.', 'Hello, hello! What a good day it’s been.', 'You catch me on a good day!'],
  low: ['Don’t mind me, I’m not at my best today.', 'Oh, hello. Sorry, I’m a bit off today.', 'Hello. Not my day, I’m afraid.', 'Oh. It’s you. Sorry, I’m a bit down.'],
  annoyed: ['Not a good moment, I warn you.', 'Hmph. Today of all days.', 'Make it quick, would you?', 'Don’t ask. Really, don’t.'],
};

/** Their goodbye when the player leaves, by how warm they are: warm, neutral, cold, hostile. */
export const FAREWELL_LINES: Record<'warm' | 'even' | 'cold' | 'hostile', readonly string[]> = {
  warm: ['See you soon!', 'Take care, now.', 'Come by any time.', 'Lovely to see you!', 'Don’t be a stranger!'],
  even: ['Bye, then.', 'See you around.', 'Have a good one.', 'Bye now.'],
  cold: ['Right.', 'Hm. Bye.', 'Goodbye.'],
  hostile: ['Good riddance.', 'Finally.', 'Don’t come back.'],
};

/** A topic or small talk said again in the same conversation: it falls flat, and they let it show. */
export const REPEAT_LINES: readonly string[] = ['Ha, you said that already.', 'We’ve been over that, haven’t we?', 'Yes, yes. You told me.', 'Again? You’re repeating yourself.', 'Are you all right? You asked me that.'];

/**
 * What the player says choosing something without words of its own (a topic and a piece of news carry theirs): the
 * panel shows it as theirs, then the answer comes over the other's head. Placeholders as in `SOCIAL_LINES`.
 */
export const PLAYER_LINES: Record<InteractionId, readonly string[]> = {
  topic: ['…'],
  news: ['…'],
  chat: ['How are things?', 'Busy week?', 'Nice to see you.', 'All well with you?', 'How’s life treating you?'],
  joke: ['Want to hear a terrible joke?', 'I’ve got one for you…', 'Stop me if you’ve heard this one.', 'Why did the cartridge blush?', 'Knock knock.'],
  apologise: ['I’m sorry about before.', 'I was out of line. Sorry.', 'Can we start again?', 'I owe you an apology.'],
  askNumber: ['Shall we swap numbers?', 'Can I have your number?'],
  tease: ['Is that your best shirt?', 'Still telling the same old stories?', 'You look like you slept in a hedge.', 'Did you get dressed in the dark?', 'Lost your touch, have you?'],
  insult: ['You’re impossible, you know that?', 'Nobody can stand you.', 'You’re a pain, you know.'],
  giveGift: ['This is for you: {gift}.', 'I brought you {gift}.', 'I thought of you: {gift}.'],
  giveGame: ['I thought you’d like {game}.', 'Here, {game}. It’s yours.', 'Found this for you: {game}.'],
  giveCoins: ['Here, for your trouble.', 'Have a few coins on me.', 'For you. No arguing.'],
};

/**
 * A light person's words by their trade (`PersonCard.trade`), before the shared ones: a clerk does not say "what are
 * neighbours for". Keys as a card's `lines`.
 */
export const TRADE_LINES: Record<string, Partial<Record<LineKey, readonly string[]>>> = {
  clerk: {
    hello: ['Hello again! Looking for anything in particular?', 'Ah, welcome back.', 'Good to see you. Have a look round.', 'Hello! Mind the step.'],
    chat: ['Quiet day. Rain keeps them home.', 'We had a delivery in. Have a look before you go.', 'You’re one of my regulars now, you know.', 'The street’s busier than last year. Good for trade.'],
    leaving: ['I’d better see to the till. Shout if you need me!', 'Customer! Back in a moment.', 'Excuse me, the phone. Have a look round!'],
    bye: ['Thanks for coming in!', 'See you next time.', 'Mind how you go!'],
  },
  stall: {
    hello: ['Morning! Have a dig, it’s all fresh in.', 'Ah, my regular! What are we hunting today?', 'Hello hello. Mind the boxes.', 'There you are! I kept the good ones on top.'],
    chat: ['Slow start, but they’ll come. They always come.', 'Found a box in a cellar last week. Mice had eaten the manuals.', 'Everyone wants the same ten games. I tell them: dig!', 'Up at four for this pitch. Worth it, mostly.'],
    leaving: ['Hang on, I’ve got a customer.', 'Right, back to the table. Come by later!', 'Someone’s eyeing my showpiece. Excuse me!'],
    bye: ['Happy hunting!', 'See you next market!', 'Good luck out there!'],
  },
  barista: {
    hello: ['The usual?', 'Hello! Kettle’s on.', 'Ah, there you are.', 'Hello! Grab a stool.'],
    chat: ['The machine’s been temperamental all week. Like me.', 'You should try the cake. I mean it.', 'Busy, busy. But I like busy.', 'I can tell what people order by how they open the door.'],
    leaving: ['Queue’s building. Talk later?', 'Oh, the milk! One second.', 'Orders are piling up. Back in a bit!'],
    bye: ['Enjoy your day!', 'See you tomorrow.', 'Don’t work too hard!'],
  },
  shopkeeper: {
    hello: ['Good day to you.', 'Back again? Good.', 'Hello there.', 'Hello. What can I do for you?'],
    chat: ['Trade’s steady. Can’t complain.', 'The street’s busier than it used to be.', 'You’re becoming a regular, you know.', 'Thirty years on this street and it still surprises me.'],
    leaving: ['Excuse me, the counter calls.', 'There’s a queue forming. Back in a minute.', 'Right, back to work.'],
    bye: ['Good day!', 'Mind how you go.', 'See you soon.'],
  },
  regular: {
    hello: ['Oh, hello!', 'Ah, you again! Hello.', 'Hello again!', 'Well, hello there.'],
    chat: ['Same time, same place, that’s me.', 'Nice to get out, isn’t it?', 'You’re the one with all the games, aren’t you?', 'This street never changes. I like that.'],
    leaving: ['I’d better get on. See you around!', 'Oh, I’ll be late. Bye!', 'Must dash!'],
    bye: ['See you around!', 'Cheerio.', 'Bye now!'],
  },
  neighbour: {
    hello: ['Good day.', 'Ah, the fifth floor. Hello.', 'Hello there.', 'Ah, hello.'],
    chat: ['The building keeps its secrets. Some of them.', 'The stair light is on a timer, you know. Press it.', 'It’s a good building. Old, but good.', 'People come and go. The building stays.'],
    leaving: ['I mustn’t keep you.', 'I have papers waiting. Good day.', 'Excuse me, I must get on.'],
    bye: ['Good day.', 'Goodbye.', 'Until next time.'],
  },
  postman: {
    hello: ['Post! Oh, it’s you.', 'Morning! Nothing for you. Yet.', 'Hello! Mind the bag.', 'Ah, the fifth floor!'],
    chat: ['Four hundred doors and one dog. Guess which one I remember.', 'Catalogue season. My shoulder hates catalogue season.', 'The lift is my best friend in this building. Don’t tell the stairs.', 'Someone on your street gets letters with perfume on. Every week.'],
    leaving: ['Right, six streets to go!', 'The round won’t walk itself. Bye!', 'Gotta go, the van’s on the corner.'],
    bye: ['See you tomorrow!', 'Mind the post!', 'Cheers!'],
  },
  kid: {
    hello: ['Hi!', 'Oh, hi!', 'Hey! Watch this!', 'Hello!'],
    chat: ['I’m nearly at the end. Nearly. Like, three levels.', 'Do you have ALL the games? Like, all of them?', 'Mum says I can play until the streetlights come on.', 'I found a coin in the sandpit. It’s mine now.'],
    leaving: ['I have to go, it’s dinner!', 'My mum’s calling. Bye!', 'Wait, I have to save!'],
    bye: ['Bye!', 'See you!', 'Bye bye!'],
  },
  bidder: {
    hello: ['Ah. Hello.', 'Here for the sale?', 'Good day.', 'Sit down, it’s about to start.'],
    chat: ['The good lots come late. They always come late.', 'Watch the auctioneer’s hands, not his mouth.', 'I’ve a ceiling. Everyone should have a ceiling.', 'Half this room is here to watch. The other half is here to win.'],
    leaving: ['Shh, it’s starting.', 'My lot is coming up. Excuse me.', 'I need to look at the catalogue again.'],
    bye: ['Good luck. Not too much.', 'Until the next sale.', 'Goodbye.'],
  },
  busker: {
    hello: ['Hey hey! A request?', 'Ah, my audience!', 'Hello there! Stay a while.', 'Good to see a friendly face.'],
    chat: ['This keyboard is from 1986. Like my jokes.', 'Rain is bad for music and worse for the hat.', 'People hum my tunes on the bus. I can hear them. It’s lovely.', 'A coin in the hat and a smile is the best pay there is.'],
    leaving: ['Crowd’s gathering, back to work!', 'The bus is coming, they like a tune. Excuse me!'],
    bye: ['Keep humming!', 'See you on the corner!', 'Bye, music lover.'],
  },
  attendant: {
    hello: ['Hello! Coins, tickets, tissues?', 'Ah, my regular!', 'Welcome back to the noise.', 'Hello. The claw is behaving today. Mostly.'],
    chat: ['Comets had a tantrum this morning. Gave it a kick. Fixed.', 'Kids think I don’t see them sneak in. I see everything.', 'Every machine in here has a mood. Like people.', 'Saturday tournament’s getting big. Bring your A game.'],
    leaving: ['Change machine’s jammed again. Excuse me.', 'Someone’s winning a prize, I need to watch this.', 'Back to the counter!'],
    bye: ['Good luck out there!', 'See you on the high scores!', 'Bye!'],
  },
};

/** On their birthday, a word of it once. */
export const BIRTHDAY_LINES: readonly string[] = ['It’s my birthday today, you know.', 'It’s my birthday today! Don’t make a fuss.', 'Another year older. Don’t ask which.', 'Birthday today! Cake later, if anyone thinks of it.'];

/** The first word to someone cold or hostile, when their card has none. */
export const COLD_LINES: readonly string[] = ['Hm.', 'Yes?', 'What is it now?', 'Oh. You.'];
export const HOSTILE_LINES: readonly string[] = ['I have nothing to say to you.', 'Leave me alone.', 'Don’t.', 'You’ve some nerve.'];
export const HELLO_LINES: readonly string[] = ['Hello!', 'Oh, hi.', 'Ah, there you are.', 'Hello there.'];
