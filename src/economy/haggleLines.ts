/*
 * What a seller says in a haggle, by the voice their character gives them (`ui/market/haggleVoice` picks it from the
 * person's traits): a chatty one warms to it, a proud one barely bends, a gruff one grumbles, a shy one apologises.
 * `{price}` is the coins, `{game}` the title, `{flaw}` what the player pointed out ("the manual", "the box").
 */

export type HaggleVoice = 'plain' | 'warm' | 'proud' | 'gruff' | 'shy';

/** One line set: what the seller opens with and answers each move with. */
export interface HaggleLineSet {
  open: readonly string[];
  accept: readonly string[];
  counter: readonly string[];
  insult: readonly string[];
  walk: readonly string[];
  /** The player pointed out a flaw: they give a little. */
  flaw: readonly string[];
  /** "I'll think about it till Sunday": they come down. */
  laterYes: readonly string[];
  /** The same, to a seller who won't be pushed: they bristle. */
  laterNo: readonly string[];
}

export const HAGGLE_LINES: Readonly<Record<HaggleVoice, HaggleLineSet>> = {
  plain: {
    open: ['{game}? {price}, like it says.', '{game}. {price} on the tag.', 'That one’s {price}.'],
    accept: ['Go on then, {price}. You drive a hard bargain.', '{price}? Done. Don’t tell the others.', 'Fair enough. {price} it is.', 'You know your stuff. {price}, shake on it.'],
    counter: ['Not a chance. {price}, and I’m being generous.', 'I can’t go that low. {price}?', 'Meet me at {price}.', 'Hmm. {price}, final offer. Well, nearly.'],
    insult: ['Are you having a laugh? {price}.', 'That’s an insult to the cartridge. {price}.', 'I paid more than that for it myself! {price}.'],
    walk: ['Enough. It’s {price}, take it or leave it.', 'We’re done haggling. {price}, my last word.', 'You’ve worn me out. {price}, not a coin less.'],
    flaw: ['All right, {flaw}, I’ll give you that. {price}.', 'Hm. {flaw}. Fine: {price}.', 'You noticed {flaw}. {price}, then.'],
    laterYes: ['Sunday? It won’t be here Sunday. {price}, today.', 'Don’t make me wait. {price} and it’s yours.'],
    laterNo: ['Suit yourself. Someone else will have it by then. {price}.', 'Then come back Sunday. It’s {price} today.'],
  },
  warm: {
    open: ['Ah, {game}! Lovely, that one. {price}.', '{game}, good eye. {price} on it, but we can talk.', 'Oh, I remember when that came out. {price}.'],
    accept: ['Go on, for you: {price}. Shake!', '{price}, done! Come here, you.', 'Oh, all right, {price}. You’ve made my morning.', '{price}. It’s going to a good home, I can tell.'],
    counter: ['Ooh, not quite. {price}, and I’ll throw in a smile.', 'You’ll ruin me! {price}?', 'Let’s meet in the middle: {price}.', 'I like you, so: {price}. Nearly my best.'],
    insult: ['Oh, come on! You’re pulling my leg. {price}.', 'You wound me, you really do. {price}.', 'Ha! Nice try. {price}.'],
    walk: ['Right, that’s me done, love. {price}, and still friends.', 'You’ve talked me hoarse! {price}, my last.', 'No more, no more. {price}, and go on, smile.'],
    flaw: ['Ah, {flaw}, yes, you’ve caught me. {price}.', 'Fair’s fair, {flaw}. {price}, then.', 'Sharp eyes! {flaw}. Call it {price}.'],
    laterYes: ['Don’t leave me waiting all week! {price}, now.', 'Oh, don’t go. {price}, just for you.'],
    laterNo: ['Ha, you’ll be back. It’s {price}, though.', 'Sunday’s a long way off, love. {price}.'],
  },
  proud: {
    open: ['{game}. {price}. It is worth it.', '{game}, a good copy. {price}.', 'Careful with the corners. {price}.'],
    accept: ['{price}. Very well.', 'Hm. {price}. Agreed.', 'For a buyer who knows: {price}.', '{price}. Look after it.'],
    counter: ['No. {price}.', 'This copy is better than that. {price}.', '{price}. I don’t go lower for this one.', 'I know what I have. {price}.'],
    insult: ['That is not a serious offer. {price}.', 'Please. Look at the box. {price}.', 'I won’t answer that. {price}.'],
    walk: ['We are finished. {price}.', 'Enough. {price}, or leave it on the table.', 'My price is {price}. That is all.'],
    flaw: ['Yes, {flaw}. I had seen. {price}.', '{flaw}, true. {price}, not less.', 'Mm. {flaw}. {price}.'],
    laterYes: ['Sunday it may be gone. {price}.', '{price}, then. Today only.'],
    laterNo: ['Then Sunday. {price} today.', 'As you like. It will not wait for you. {price}.'],
  },
  gruff: {
    open: ['{game}. {price}. Tag’s right there.', 'Yeah, {game}. {price}.', '{price}. Don’t bend it.'],
    accept: ['Fine. {price}. Happy?', '{price}. Done, before I change my mind.', 'Pfft. {price}. Go on.', '{price}. Don’t tell anyone.'],
    counter: ['Nope. {price}.', 'You’re joking. {price}.', '{price}, and stop looking at me like that.', 'Ugh. {price}.'],
    insult: ['Get out of it. {price}.', 'Is that a joke? {price}.', 'I’ve had better offers from pigeons. {price}.'],
    walk: ['That’s it. {price}. Take it or don’t.', 'I’m done. {price}.', 'Enough of this. {price}, final.'],
    flaw: ['Yeah, yeah, {flaw}. {price}.', 'Fine, {flaw}. {price}. Happy now?', 'Hmph. {flaw}. {price}.'],
    laterYes: ['Sunday? Pfft. {price} now and we’re done.', 'Don’t mess me about. {price}.'],
    laterNo: ['Go on then, wait. {price}.', 'See if I care. {price}.'],
  },
  shy: {
    open: ['Oh, um, {game}… {price}, if that’s all right.', '{game}. It’s, um, {price}.', 'That one’s {price}… sorry.'],
    accept: ['Oh! Yes, {price}. Thank you.', '{price}… all right. Thank you.', 'Okay. {price}. I hope you like it.', '{price}, yes. Sorry, yes.'],
    counter: ['Oh… I couldn’t, sorry. {price}?', 'Um. Maybe {price}?', 'I’m sorry, {price} is… about right?', '{price}? If that’s okay.'],
    insult: ['Oh. That’s… very low. {price}?', 'I, um. No. {price}.', 'Oh dear. {price}, really.'],
    walk: ['I’m sorry, I can’t do more. {price}.', 'I think… {price}. Sorry.', '{price}. That’s really all.'],
    flaw: ['Oh, {flaw}… yes, sorry. {price}.', 'You’re right, {flaw}. {price}?', 'I didn’t mean to hide {flaw}. {price}.'],
    laterYes: ['Oh, don’t go… {price}?', 'Um, {price}, today?'],
    laterNo: ['Oh. Okay. It’s {price}, then.', 'I understand. {price}.'],
  },
};
