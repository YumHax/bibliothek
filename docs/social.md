# People and relationships (`src/social/`)

Everyone the player can know has a card, a standing (warmth, and trust earned by promises kept), a mood with a cause,
topics that matter to them and things they remember. The player gets close to people by learning what matters to them
and keeping their word, and the world shows it: their face before a choice, their greeting in the street, a keepsake
on the fridge. Nothing reads as a rule: no odds, no numbers, no previews of what a choice brings. Read this before
touching anyone the player talks to. (Social v2, 2026-10-17: the design is the "Bibliothek — Social v2" doc.)

## People

- **Cards** (`social/people/`): `building.ts` (residents behind the doors, `door` = `stairwell/building.doorKey`, the
  concierge, the syndic, the attic's student, the postman, Claire), `friends.ts` (Sam, Inès, Marco: their ids are
  `visitors/friendsPlan`'s), `family.ts` (Mémé, Gaspard), `kids.ts`, `market.ts`, `town.ts` (Front Street, the arcade,
  the saleroom, Victor). A card says who they are (`name`, `short`, `role`, `group`, `whereabouts`, `intro`), how they
  take things (`traits`, `tastes`, `likes` / `dislikes` as gifts, `birthday` in the social year), who they know
  (`ties`, -1..1), what can be learned (`facts`, each from a tier), what they like to talk about (`topics`), what makes
  their day (`moods`), what their tier does (`effects`), their own words (`lines`), where they start (`startWarmth`,
  `startTrust`) and whether the book lists them before they are met (`listed: 'always'`). One first name per person
  in the cast.
- **Two depths** (`PersonCard.depth`). *Deep* people (Mémé, Gaspard, Sam, Inès, Marco, the residents Roux, Moreau,
  Leclerc, Nguyen, Girard, Haddad, Dubois, Martin, Rossi, Mme Pereira, Théo upstairs, Victor) have 4-6 topics of their
  own, 3-5 facts, moods with causes, their own lines (hello, chat, leaving, bye, repeat) and promises. Everyone else is
  *light* (the default): their trade first (`trade`: clerk, stall, barista, shopkeeper, regular, neighbour, postman,
  kid, bidder, busker, attendant, whose shared words are `socialLines.TRADE_LINES`), one or two topics, and the short
  ladder (`tiers.tierName`: New face, Regular, Old friend).
- **Topics** (`PersonTopic`): the player's own line (`say`, 38 characters at most), the book's name for it (`name`),
  its icon (`ui/social/icons`), how they take it (`fit`, always the same for that person, so it can be learned), 2-3
  answers in their voice. Exactly one is `obvious` (what anyone can see or hear: the piano through the floor, Biscuit
  on his lead); the rest open at a tier (`from`, default Acquaintance) or once a fact is known (`after`). Every deep
  person has a sore spot (`fit: 'dislikes'`) whose answer says why; several are the other side of a feud. A topic that
  lands may teach a fact (`teaches`) and leave a memory phrased for "Remember when {memory}?".
- `people/index.ts`: `findPerson`, `everyone`, `personAtDoor(key)`, `shortName`; `addPerson(card)` adds someone met at
  run time (a small ad's seller, a stallholder). `lookBook.rememberLook(id, look)`: whoever builds a body for a person
  records its look, so the portrait (`ui/social/portrait`) is the face met.

## Warmth, trust, tiers (`standing.ts`, `tiers.ts`, `socialPlan.ts`)

- **Warmth** -100..100 (do they like you) and **trust** 0..100 (can they count on you). A module-level store saved
  under `KEYS.social`; `nudge(id, { warmth, trust, why, reason, day, memory, memoryGame, gossip, raw })` is the one way
  to move it (`reason` counts once a game day, `raw` skips the slowing, `memoryGame` puts a cover beside the memory in
  the book). Every change goes to `onSocial` listeners with the tier before and after (told once: `PersonState.told`)
  and, through the grapevine, who told them (`SocialChange.from`). Saves from before v2 read `stranger` as `polite`
  and drop the old talk battery.
- **Trust is promises kept** (`PROMISE`): a promise kept is one stamp (`STAMP`, 15 trust, raw), broken it takes one
  away and stings. Talk and gifts bring no trust. The card and the book show it as stamps (`tiers.stampsOf`), a broken
  promise as a stamp struck through (`promises.promiseCounts`).
- **Tiers** (`socialPlan.TIERS`): Nemesis, Hostile, Cold, Polite, Acquaintance, Friendly, Friend, Close friend. Above
  Acquaintance a tier also needs stamps: Friendly one, Friend two, a close friend three; short of them they stay a tier
  lower and, once a day, say what they would like ("I'd just like to know I can count on you": `HELD_LINES`). Colours
  say the side: reds and a cold blue below, grey in the middle, greens above, gold for a close friend.
  `tierProgress(warmth, trust)` is the bar: the share of the way to the next tier (striped when stamps hold them);
  `tierName(id, person)` the word (a light person's short ladder).
- **Gains slow as they grow** (`GAIN`): a warmth gain is × (1 - warmth / `span`) ^ `power`, never under `floor`.
  Standings are kept to a tenth.
- **Drift** (`settleDay`, run at boot and on every new game day by `bootstrap/social`): after `DRIFT.graceDays`
  without contact (`friendGraceDays` for a friend or closer), warmth slides back towards `DRIFT.rest`; a close friend
  slower, a proud one slower back up. Trust never drifts. Mild memories fade after `MEMORY.fadeDays`.
- **Mood** (`mood.ts`): fine by default, and never good or low without a cause the player is told: a card's `moods`
  drawn on some days (`MOOD_DAYS`), the hour for a night owl, an early bird or a grumpy one, a mark of the day
  (`markMood(id, day, steps, why)`: the power cut, a noisy night, a lost vote; saved under `KEYS.socialMood`), their
  birthday. A mood scales what talk brings (`TALK.mood`), never the sign of it.
- **The building's opinion** (`reputation.ts`): the residents' average warmth, as a name ("the nice one on the 5th").

## Talking (`conversation.ts`, `ui/social/ConversationPanel`)

- A person in the room is a `Walker`, a `Vendor` or a `YardKid` given a `social` hook (`world/people/socialHook.talkHook`);
  a click opens the conversation. `TalkSession`: the person, the place (`SocialPlace`), their `body` (`speak`, `react`,
  `anticipate`, `hold`; a body without `react` is a voice: through a door, on the phone), the place's `extras`
  (`TalkExtra`: its `group`, `icon`, `once` / `due` for a promise, `fit` for the face), `onClose`, `opening`.
- **The rules** (`conversation.ts`). `beginConversation` makes a `Conversation`; only the day's first with someone moves
  the standing, from its first exchange, for `TALK.exchanges` choices; then they have to go (`leavingLine`), nicely.
  `choicesFor(id, ctx, convo)`: their open topics (`openTopics`, the ones not said lately first, `TALK.topics` of them),
  the player's news (`TALK.news`), small talk (chat, a joke), an apology below Polite, their number from Acquaintance,
  a tease from Friend, an insult; someone Cold or worse only takes an apology, a word or worse. Each `Choice` carries
  its `fit`: how they would take it now (their topic's fit, the news by their tastes and traits, small talk by
  `TRAITS[t].bends` at that hour), a step down for a topic said again in the conversation or talked about within
  `TALK.repeatDays`. `say(id, choice, ctx, convo, extra)` does it: their answer, their reaction and its `strength`, the
  warmth by fit (`TALK.fit`, × the mood, give or take `TALK.variance` of the amount), a fact taught, a trait found out,
  the fit learned (`fit:<topic>` in `known`), a memory kept (`remembered`); two hits make a good talk (`goodTalk`,
  `endConversation`). No hidden draw decides: the same thing said to the same person in the same mood lands the same
  way. Gifts (`giveGift`, `giveGame`, `giveCoins`) count one a day; a game given leaves a memory with its cover.
  `onInteraction` hears every choice (favours, birthdays, witnesses, the rival).
- **Their first word** (`opening`): the introduction the first time, a cold or hostile word, their birthday, once a day
  what they would like when stamps hold them, now and then a memory called back ("Remember when you lent me Zelda?",
  `CALLBACK_LINES`; a grudge's `GRUDGE_LINES`), their mood when it is not fine, else their hello. `farewell` by warmth.
- **Extending**: a feature adds entries to anyone's conversation with `extras.addExtras(ctx => TalkExtra[])`, and
  threads (what someone waits for, `threads.addThreadSource`).

### The panel (`ui/social/ConversationPanel` + `ui/social/conversation/*`, `social.css`)

No card: a comic page drawn over the room, and the person stays whole in the shot.
- The view turns gently to them (`player/lookTowards`, `zoomView`, `graphics/framing`'s depth of field and portrait
  light); while the panel is open the speech layer is `conversing`, the conversation is `talkState.setTalking(id)`
  (nothing is staged over it) and the speech layer draws no bubble for them (`notices.muteSpeech(anchor)`: their mouth
  and murmur still go): the panel draws their balloon itself. Everyone else's bubbles and subtitles step back while it
  is open (still kept under "What was said"), so nothing lands on the balloons.
- **Their balloon** (`.social-say`, placed each frame on their head by `conversation/placement.placeSay`, kept inside the
  screen, beside the head when there is no room above it): an ink-outlined balloon in the speech face (Patrick Hand),
  holding their line until the next choice. **The name tag** is pinned on top of it (`conversation/nameTag`): their face
  in the tier's ring, their name with the book's mark (a click, or Y, opens their page in the People book over the
  conversation; closing it comes back), the tier's word (`ui/social/badge`), the bar to the next tier and the stamps of
  trust, and their day when it matters (a birthday known, a mood and why). Their thought (a topic they love not yet
  found out) sits in a cloud beside the balloon, on the side with room.
- **The player's balloons** rise from the bottom of the screen over a soft shade (`conversation/menu.stageHtml`): four
  at most, slightly fanned, each with its key (1-4): the place's entries first, then topics, news (with the game's
  cover) and small talk, in the player's own words. Pointed at or focused, a balloon lifts and grows and their face
  answers before the click (`body.anticipate(fit)`); picked, it flies up to their balloon (`flyBalloon`) and their
  answer takes it. Under them, **chips**: Give… (the pocket, "A game…", "A few coins", the place's give entries), Ask…
  (their number, the place's asks), Promise… (promises as ticket-shaped balloons with their due), a quiet More… (tease,
  insult, overflow), and Goodbye, always last, on 0. A list swaps the balloons for its own and Back takes Goodbye's
  place.
- After a choice, at the end of their line: their body acts `react(reaction, strength)`, one to three hearts burst
  sideways from their balloon's tail (a cracked one falls) with a chime, the player's small face pops by the tag when
  they will remember it, and a fact learned flies as a card into the tag's book. A tier crossed fills the bar in the old
  colour, then it starts again in the new one as the badge turns over; the banner waits for the conversation's end.
- What is done for good (a promise, a game or coins given away, an insult) is held 600 ms with a filling ring
  (`conversation/hold`). When their talk is done they say so and look at their watch; the balloons fold away, Goodbye
  glows, and nothing closes by itself. A click in the room and the E key never end a conversation; Goodbye and Esc do.
- A voice or a call (no body): their painted face as a medallion at the top of the screen (it changes expression with
  each answer: `face.ts` rest, smile, frown, surprise), their balloon under it (dashed on the phone), the same tag and
  balloons.
- Digits 1-9 pick, 0 is Goodbye or Back (the keys' badges are always drawn: nothing moves). On the pad: up/down and
  left/right through the balloons and chips, A to pick (held for what is done for good), B back, Y for their page. A
  screen reader hears the player's line, their answer, their reaction in words and a tier change through the panel's
  status line. Nothing under 14 px, every text at 4.5:1 (`scripts/check-contrast.mjs`); "plain lettering" (Settings)
  turns the speech face into the body's.

### Bodies (`world/people/socialSelf`, `socialHook`)

A known person's body says how they stand with the player before any panel does. `Walker`, `Vendor` and `YardKid`
each own a `SocialSelf`.
- **Aimed at**: they look up at the player with the face of their tier and mood (`SocialHook.mien`), and let it go a
  second after.
- **Before the click**: `anticipate(fit)`: leaning in with the brows up for what they love, a half smile, a look aside
  for "meh", a wince and a lean back.
- **After it**: `react(reaction, strength)` in their own measure (temperament, `PersonModel.socialReact`): a laugh or a
  chuckle, a clap or a nod, joined hands for thanks, a glance away, a head shake, a wince. Reactions come once their
  line is said, never mid-line.
- **Kept**: while the conversation is open (`hold`), a passer-by stays and keeps their eyes on the player.
- **Passing**: within 8 m, once a pass, they greet by tier: a look away (hostile), eyes avoided (cold), a glance and
  "Hello." (polite), a nod (acquaintance), a wave and their hello (friendly), a friend slowing, a close friend stopping
  turned to the player. Someone with a word for the player (`threads.hasWordFor`) then beckons.

## Your news (`news.ts`, `newsSources.ts`)

What the player did lately is something to tell people: the player's own line in the menu, at most `TALK.news` at a
time, each told once to each person, fresh 4 game days (`KEYS.socialNews`). A person takes it by their tastes for a
game (`gifts.gameFit`) or by what their traits like or mind (`TRAITS[t].news`). `newsSources.startNews` turns what the
game already tells into news, once per id, never what is there at boot: a game come into the collection (the line by
where it came from: a grail, a sealed copy, a gift, the bin, a stall, a lot, a swap), an arcade medal, a console mended,
a visit to Mémé or a Sunday lunch, the power cut, the street's moments (the stray come home, a big scratch card, a
garage-sale find, Félix's copy bought back, the wager won, a find at the Mansions), and the journal's games nights,
open houses, the club's visit.

## Promises (`life/favours`, `promises.ts`, `conflicts/votes`, `street/wager`)

- A favour said yes to is a promise: "I'll do it" (group `promise`, a ticket with its due in words from
  `life/due.dueWords`, held to confirm). Kept (the gift handed over, the game lent and back, the visit made, the parcel
  carried up): `PROMISE.kept`, a whole stamp of trust, warmth, a memory, sometimes a few coins. Broken: `PROMISE.broken`.
  Refusing costs nothing. Mémé never asks one and never loses anything over one.
- Favours (`favoursPlan.FAVOURS`): on a new game day someone met at Acquaintance or warmer, without one going, may ask
  (`odds`, `perDay` across everyone in a fresh order each day, `gapDays` between one person's): fetch, find a game,
  lend one, check in at their door, carry a parcel up from the lodge. Someone Hostile or worse offers a make-amends
  favour once; done, they are civil again at least.
- The vote promised before a co-owners' meeting (each resident with a stance asks while the ballot is open) and the
  espresso owed on a lost wager are promises too. `promisesOf` / `promiseCounts` read them all.
- **Threads** (`threads.ts`): what someone waits for, in their words: a promise going (a ticket with its due), a need
  they spoke of (a favour offered), a word for the player (a make-amends offer, a conflict's side). The book lists them,
  the caption says "has a word for you", the body beckons.

## Conflicts (`conflicts/`, `KEYS.socialConflicts`)

Three quarrels (docs/building.md "The quarrels"): the noise (Leclerc against Théo upstairs), the rumour (Mrs Dubois
against Pascal), the hunt (Mrs Haddad against Victor). Each starts once both sides are met; while it runs their ties
part further (`lifeStore.tieOffset`). Each side tells its version when asked, then asks the player to take its side
(held): `CONFLICT.won` (warmth and a stamp) for one, `CONFLICT.lost` for the other, seen by any witness. Left alone it
lapses after `lapseDays` (each cools a little). Then the winner's word on how it ended, the loser's grudge, and after
`wayBackDays` the loser's way back. The cards' ties for these pairs are strong both ways (-0.7, -0.5, -0.5).

## Witnesses (`witnesses.ts`, `presence.ts`)

Known people's bodies register as present (weakly held, off on dispose). An insult, a gift, a promise kept or a side
taken in a public place (stairs, courtyard, street, shop, market, arcade, saleroom) is seen by the known people within
8 m (`presentNear`): they show it (`notice`: a turn of the head, a look, and one whispers to whoever is beside them),
each warms or cools by their tie to whom it was about (`WITNESS.acts`), and the one who whispers passes it on, named.
In private (their flat, the player's, the phone) nobody sees; only their ties hear of it (the grapevine,
`gossip.grapevine`: `GOSSIP.share` × the tie, twice as far from a gossip).

## What it does (`perks.ts`)

A card's `effects` are perks from a tier up and penalties (`down`) from a tier down, some needing trust. A system asks
`effect(id, key)` (the value, `true`, or undefined) and keeps its default otherwise:
`effectValue('leclerc', 'noiseThreshold', 0.3)`. `effectsOf(id)` splits them for the book; `effectsCrossed` names
what a tier change brought. Rules shared by everything here:
- Nothing the player owns is ever taken or damaged by a bad standing: penalties are prices, refusals, complaints,
  votes, notes and noise. A keepsake stays when a friendship cools.
- Every perk and penalty is listed on its person's card, so the book can say it once it is in force.
- A person's ids are stable: a save keeps them.

## Clarity: where the player reads relationships

- **Nothing is announced before it happens.** What a tier brings is told when it is reached, what bad blood costs when
  it starts; the book shows what someone waits for, never what they will give.
- **Three signals**: their face and body (how they take it now), the badge and the bar (where you stand), the threads
  (what you can do for them). Hearts, chimes, banners and the journal confirm them and add nothing.
- **The hover caption** (`caption.socialCaption`, drawn by the Overlay through `personCaption`): a known person on two
  lines: their face in the tier's ring, their name and the badge; then their state when it matters ("annoyed (the power
  cut)", "birthday today", "has a word for you"), the key cap and the verb. Before meeting them one line: their role
  and "talk". Never cut. A resident's door says the tier too.
- **Tier scenes** (`scenes/tierScenes.ts`, wired by `bootstrap/tierScenes.ts`; `announce.ts` asks `stageTierUp`):
  nothing mid-conversation (`talkState.onTalkEnd`). Friend or Close, for the building's people and the old friends: they
  come up to the flat's door one evening when the player is home (17:00-22:30; any waking hour after two days), knock
  (`StairLife.visitor` with their own look), say two or three lines, hand over the keepsake with a gesture (Close: an
  invitation, and a photo of the two of them); the reward banner comes once they have gone back down. Unanswered, the
  keepsake is slipped under the door with a word; after four days without a scene, it is posted. Everyone else posts
  theirs (an envelope on the hallway's mat, `Doorstep.slipNote`) and the banner shows at once. Friendly is a note under
  the door, once. A fall to Cold or lower is a letter in their hand under the door with what it costs now
  (`MailPiece.effect`); for anyone else the card is shown as before. Tier lines: `tiers.tierChangeLine`.
- **Keepsakes** (`keepsakes.ts`, `world/kitchen/fridgeKeepsakes.ts`, `KEYS.socialKeepsakes`): each deep person (and a
  few light ones) has one at Friend and another at Close, looking like who gave it (Mémé's cake recipe in her hand,
  Inès' postcard, Marco's arcade ticket signed MAR, Mrs Moreau's annotated Satie, the kids' drawings, Victor's card
  "Respect."; at Close often a photo of the two of you, kept as a small JPEG); Mme Pereira's welcome note at
  Acquaintance. The first eight go on the kitchen fridge's door under magnets and swing with it (`Fridge.face`), the next
  twenty on the corkboard once bought (`world/kitchen/Corkboard.ts`, furniture shop). Hovered: the giver and their tier
  now; clicked: their words; clicked again before looking away: their page. A click on the shut door between them takes a
  close look at them all (`player/closeUp`: the view turns and draws in, and lets go on walking off or looking away).
- **The People book** (`ui/social/PeopleBook` + `book/listPage`, `book/personPage`, `book/bookParts`,
  `PeopleBook.css`; the `people` key I, the journal's People button, the pause menu's People): an address book with
  coloured index tabs (Everyone, Friends, Building, Street, Market, Arcade, Rivals; D-pad left / right) and a cream page.
  The list opens on **Today** (at most four people with something for the player now: a word or a need in their hand,
  a promise going, a birthday known today or tomorrow), then a card per person met or listed, warmest first: their face
  in their tier's ring, name, role, the badge and one useful line (their open thread, else where they are now,
  `whereNow`, else `whereabouts`); "new" when their page holds something not seen. A person's page: on the left the
  Polaroid, the badge, the bar and the stamps, **Now** (where they are and until when, their mood and why, the birthday
  once known) and **Call** when the player has their number (greyed "asleep until 8:00" / "at work until 17:00" out of
  hours); on the right **What matters to them** (their topics, each marked loves it / likes it / not much / to avoid
  once seen, one "Still to find…" while some remain, never a count), the traits found out, the facts, how they took the
  gifts; **What they're waiting for** (needs on sticky notes, in their hand from Friend; promises on tickets with their
  due); **Between you** (the perks and penalties in force, as ink stamps); **Your memories** (a dated diary, a game's
  cover beside a memory about it); **Their world** (whom they know, a red thread for bad blood, each face a link). The
  page ages with the tier (`bookSeen.pageLook`): a typed index card up to Polite, the player's pencil notes from
  Acquaintance, their handwriting with a coffee ring and a doodle from Friend, a taped photo of the two of them for a
  close friend; the first change of look plays once. What changed since a page was last opened wears a "new" ribbon
  (`KEYS.peopleBookSeen`).
- **Portraits** (`ui/social/face.ts` painting, `portrait.ts` caching per expression): a head and shoulders from the
  look their body was built with, lit from the upper left on a backdrop of the tier's colour.
- **The journal** (`socialJournal.watchSocialJournal`, bullet ♥, kind `social`): a line when someone is met and on every
  tier crossed, in a sentence; every `DIGEST.everyDays` game days the week's digest (`KEYS.socialDigest`).

## The phone (`ui/household/PhonePanel`, `phoneCalls.ts`, `whereNow.ts`, `world/bedroom/friendCalls.ts`)

The bedroom phone's Contacts are everyone whose number the player has (asked in a conversation, the friends from the
start), those who pick up now first, then the warmest: their face in their tier's ring (greyed when they will not pick
up), the badge once, and in words whether they pick up ("picks up", "asleep until 8:00", "at work until 17:00":
`phoneState` reads `phoneHours` and whether they are at work, `whereNow`). A ring when they pick up opens the
conversation with place `phone` (what needs hands is not offered). Friends ring the player too: on about a third of game
days, between 10:30 and 20:30, someone deep or an old friend, a friend or closer, whose number the player has and who is
free then (never over Mémé's ring, never while a conversation is open). Picked up in time, the conversation opens on
their first word (`callerOpening`); let ring out, they leave a message (`KEYS.phoneCalls`): a red dot blinks on the
phone until its panel plays the messages, each on a paper slip.

## Mémé (`people/family.ts`, `grandmaSocial.ts`)

The player's grandmother (docs/story.md "Mémé"), in the book (Friends tab) and the phone from the start. A card with
`family: true`: her warmth never drifts (`settleDay` skips her) and never falls under `startWarmth` (`standing.apply`),
she has no penalty, asks no favour and loses nothing over a promise. `watchGrandma` hears `GrandmaVisits.subscribe` and
nudges her, each kind once a game day: a visit, a Sunday lunch (reason `sundayLunch`, which the journal reads to drop
its line), a gift (cake, flowers, a game shown), a memory seen (kept as a memory of hers), the scarf worn to hers. A ring
(`callGrandma`) opens the conversation with her own first words (`TalkSession.opening`: the album, Sunday, Saturday,
small talk) and counts once a day; from 21:00 to 23:00 she answers in her nightie and rings off. At Close
(`knitsScarf`) the wardrobe has her scarf. In her flat (`world/grandma/meme.ts`) a click opens the conversation, with
what the player has for her (flowers, cake, the latest game) and "Tell me about Félix?" as entries. Gaspard
(`GASPARD_ID`, same file) is not family: met at her Sunday table, he can go cold (docs/grandma.md "The end of the story").

## The first day (`onboarding/firstWelcome`, `KEYS.firstWelcome`)

Mme Pereira, met in the hall on the way out, has a topic she loves (her face shows it); once the first word is had she
has a favour, "Anything I can help with?": Mrs Roux's parcel, across the player's landing. Said yes to, it is the first
promise (a ticket, a thread in the book, a To-do); handed to Mrs Roux it is kept: a stamp of her trust, her warmth and a
memory, so she comes up a tier that day and, that evening, up the stairs to say thank you; the next morning her note is
on the fridge (`onWelcomeKept`). Let lapse past the next day, it is broken. Never for a save that met her before, nor
under `?debug`.

## Debug

- `?social`: everyone met, at Friendly at least (it writes to the save it plays on: use it with `?debug`).
- `?debug`: `bibliothek.social.table()` lists warmth, trust, tier, met and memories per person;
  `bibliothek.social.set(id, warmth, trust)` sets one (`bootstrap/debug.installSocialDebug`).
- The debug panel's **Social lab** tab (`cheats/socialLab`; `?debug&social-lab` opens it at boot) acts on the person
  being talked to, else the last one, else one picked with Previous / Next: their tier set outright (quietly), their
  mood marked for the day with a cause, the conversation opened each way (`OpeningKind`), each outcome played in it
  (loved, liked, polite, disliked, "they'll remember that", a fact to the book, a promise ticket, a tier up in the card,
  having to go), their tier's scene, the largest text and reduced motion (`registerLabConversation`,
  `registerLabScenes`).
- `npm run social` (docs/checks.md "Social sim", part of the typecheck) plays the layer headless through `choicesFor` /
  `say`: a typical player (60 days: 40-60 % of the deep people at Friendly or more, the mean of three; at most a fifth of
  everyone at 95+ warmth), diligent ones (120 days: every perk reachable), a careless clicker (30 choices on day 1: no
  more than one conversation at its best, never more than a little lost without an insult), and the cast's coverage.

## The building (`building/socialBuilding.ts`, `buildingSocialPlan.ts`, `coproSway.ts`)

How the residents' standing changes the building's systems; started by `bootstrap/social` (`startBuildingSocial`),
the post handed over by `bootstrap/world` (`setBuildingPost`). Its words and numbers are `BUILDING_SOCIAL`.

- **Noise** (`noiseComplaints`): Leclerc's `noiseThreshold` (how loud is too loud, 0.3 by default) and `noiseFrom`
  (when his quiet hours start: 23 a Friend, 21 Cold, else 22). At Close (`noComplaints`) he never complains: the flat
  loud after ten, he comes up once a night to listen at the door (`leclercVisit`, warmth and a memory). Hostile
  (`straightToSyndic`) he skips the knock and goes to the syndic. A complaint leaves a memory and his mood darker the
  next day. A Cold syndic (`strictReminders`) makes the reminder cost the building's goodwill 1.5 times as much.
- **The co-owners' meeting** (`coproSway`): every resident with a door carries the vote effects (`VOTE_EFFECTS` in
  `people/building`): a Friend votes with the player's ballot (`votesWithYou`), a Close one also brings round the voter
  they are closest to (`lobbies`), a Hostile one votes against it (`votesAgainst`), on the resolutions the player voted
  on. The ballot shows each stance ("Mrs Dubois: with you"). A Friend syndic (`tieBreak`) settles a tie the player's
  way; Friendly (`agendaEarly`) he tells the next agenda in conversation. A meeting just tallied puts the winners in a
  good mood and the losers in a bad one for the day.
- **Moods**: a power cut lifts every resident's mood that day; Mrs Moreau freed from the stuck lift with the player
  on the stairs gains warmth and a memory (`PowerCutScene`).
- **Feuds**: a resident Hostile or worse pins a note about the player on the hall's board about every other day
  (`feudNotes`, in their own voice). Nemesis Leclerc (`feud`) turns his radio up under the flat late at night; Hostile
  Mrs Moreau (`loudPiano`) practises scales at ten; Friendly she plays softer (`quietPiano`). These are
  `NEIGHBOUR_NOISE.throughWalls` entries with `needs` / `softer` on a person's effect.
- **Mrs Dubois**: Friendly (`gossipBoard`), "Any news in the building?" tells the board's latest or another
  resident's secret (a fact of theirs learned); Hostile (`badMouths`), once a game week the people she likes cool
  towards the player.
- **Mme Pereira**: Friendly (`parcelNews`), "Anything in the post for me?"; Friend (`holdsParcels`), parcels come a
  round sooner; Cold (`lateParcels`), a day late (`MailPost.delayHours` = `parcelDelayHours`); Close (`roofKey`), the
  roof key (`building/keys`). From Acquaintance she says what the building calls the player (`reputation.buildingName`).
- **The party**: the poster welcomes or digs at the 5th floor by the building's opinion, and the thanks raise a toast
  to the player when it is warm.

## Who talks in the building

Everyone met in the building opens the conversation (`world/people/socialHook.talkHook`), their body answering
(`bodyOf`: their lines over their head, `actReaction`), the place's own entries first. Each body built for a known
person records its look (`rememberLook`).
- **On the stairs** (`stairwell/Neighbours`, place `stairs`): the residents, stopping to talk. "Any news?" is what a
  click used to say (their swap, the hunt's clue, the move, their everyday lines; tagged "news" when there is some); "Swap games"
  opens their swap's panel while one is going. The old stairs chat nudge is gone: the conversation is the chat.
- **At their door** (`furnishStairwell` `NeighbourDoor`): a knock while they are in counts as before
  (`DoorVisit.knocked`) and the talk is had through the doorway (`voiceBody`: the subtitles); "Come in?" (greyed
  until they would ask the player in: `DoorVisit.canEnter`) and "Swap games". Out, nobody answers. Once met, the door's
  caption shows the tier.
- **In their flat** (`neighbourFlat/FlatDressing`, place `theirFlat`): "What's new?", "Watch their favourite
  together" (their favourite game on their TV, as clicking it does) and their swap.
- **The concierge** (`hall/Concierge`, 'pereira'): "Ask for the cellar key" (her errand), "About the timer
  buttons…", the answer once tried ("it's the 3rd floor's", warmth and trust for the favour), "Any news in the
  building?", "Coins in the Christmas box" (also warms her, once a day, as the box on the sill does).
- **The syndic** on meeting days (`hall/MeetingSetup`, 'bertin'): "The meeting, the agenda?".
- **The postman** (`stairwell/Postman`, 'postman'): clicked while he has a parcel, "Take the parcel" first.
- **The power cut** (`powerCut/PowerCutScene`: `POWER_CUT_PLAN` entries carry their `person`): the residents with
  candles and Mrs Moreau stuck in the lift, "Some night, eh?".
- **The party** (`courtyard/NeighboursParty`, place `courtyard`): each guest, "Some party!" (the party's chat and its
  friendship, once a party).
- **Claire** at the estate sale (`estateSale/EstateSale`): "About your uncle…".
- **Théo**, the attic's student (`stairwell/AtticStudent`, `STAIRWELL_PLAN.student`): some nights (`share`) from 22:00
  into the small hours, on our landing by the lift's gate, "Late one?".
- **The kids** in the courtyard after school (`courtyard/YardKids`, cards `people/kids`: Hugo, Mai, Tuan, Lina, group
  `building`; docs/building.md "The kids in the yard"), place `courtyard`: "Heard anything?" (the building's news in
  their words, tagged "news" on a day with some), "Swap carts?" (`easySwaps` at Friend, `noSwaps` at Cold) and "Bet I
  can beat your score!".


## The building's perks (`social/building/`, `buildingPerksPlan.ts`)

What the residents give a friend, as conversation entries (`social/extras`) and effects read by the systems they
change; wired once from `bootstrap/world` (`wire.ts`). What was given once and what ran today is saved under
`KEYS.buildingPerks` (`perkState`). Games given come from the seed catalogue, ones the player has not got
(`perkDeps.giveGames`), with where they came from: they wait in the parcel like any gift.
- **Mrs Roux** (`roux.ts`): Friendly, "Tell me about the building": one story a game day, every other one a true
  lead (the sixth floor's next step from `huntFile`, else the prototype's `NEXT_LEADS`). Friend with trust, "Ask
  about Lucien's box": four games from 1986-94, once. Close, her flat for 0.8 of its price (`annexPrice`, read by
  her door's sign). Moving day: a parting gift by her tier (coins; a game too at Close).
- **Mr Martin** (`martin.ts`): Friend, "Ask about his brother's cartridges" (his trust up); a later day, Close with
  his trust, "Open Gilles's box with him": five NES games, once (the parcel takes five at a time). Friendly in a power cut: "Sit in at cards" (2 coins,
  45 % to win 6, one hand a night).
- **Théo** (`student.ts`): Friend, the repair panel names the faulty part and the tool (`repairHint`, the panel's
  `hint`). Close, "Ask about his cartridges": a homebrew cart the player hasn't got (`HOMEBREW_CARTS`: it plays in the
  NES), once. Cold, his music through the ceiling every night, louder (`neighbourNoisePlan`, `needs: loudMusic`).
- **Mrs Haddad** (`haddad.ts`, `swaps.ts`): Friendly, her swaps offer more for what she asks (`swapGenerosity` in
  `NeighbourTrades`). Friend, "Ask about Albert Vasseur": the hunt's next lead, once a day. Close, a Sega find a week
  at 0.7 of its price.
- **Claire** (`claire.ts`): Friendly by the sale's end, two game days after it a note under the door and one of
  Henri's games (1983-91) in the parcel, once.
- **Meals** (`meals.ts`): Close with the Moreaus, "Accept Sunday lunch" on game Sundays 10-14; Close with the Nguyens,
  "Come to dinner" on Fridays 17-21. A beat in the dark (`household/Pastimes`, 150 min), warmth and trust, a card.
- **Cat sitting** (`catSitter.ts`): Friend with the Moreaus and trusted, back from 5 game hours out with the cat's bowl
  under 0.4, they have filled it (`Cat.bowl.refill`) and left a note. Once a game day.
- **The race** (`stairsRace.ts`): Friendly with Pascal, met 2 storeys or more below our landing, "Race you up!": back
  on our landing (world y 0) before his 6.2 s a storey pays 10 coins. One a day.
- **Word of mouth** (`smallPerks.ts`): Sofia's "Anything in the post for me?" (`MailPost`) and a Comets tip a day (it
  pays on the player's next COMET DASH game: `rossiCoaching` tickets, "a better first strip", `arcade/guestDays`); the
  postman's, Pascal's (carrying) and the Nguyens' (the spare pad) offers are lines only: the flat's furniture has no
  weight and a games night no pad limit to lift.

## The market, the saleroom, the small ads (`social/market.ts`, `social/saleroom.ts`, `social/sellers.ts`)

- **Stallholders** (`social/people/market.ts`, id `stall-<platform>`: Gégé NES, Yuki Super Nintendo, Malik Game Boy,
  Sandrine Mega Drive, Kev N64, Clémence PlayStation; look seed = the stall's index + 1). Their `Vendor` opens the
  conversation (place `market`); "What’s new on the table?" is their stall talk (`MarketFloor.linesAt`, the story's
  clue first). They share one set of effects (`STALL_EFFECTS`).
- **Loyalty is the warmer of two** (`stallLoyalty`): the copies counted by `MarketStanding` and the tier (Friendly 1,
  Friend 2, Close 3). `MarketStock` reads it for the haggle's sway, the copy kept aside (2) and the wishlist odds; the
  phone's stalls too (`bootstrap/ui`). A save from before is seeded once: each stall the player bought at knows them,
  warmed by the copies counted (`MARKET_SOCIAL.seed`).
- **What moves it**: a copy bought there (+3 warmth +1 trust, the first 3 a game day), a held copy collected (+3
  trust), each insulting haggle offer (-7 warmth -2 trust, remembered, passed round the hall: the stallholders are
  tied to each other).
- **Penalties**: Cold, they won't haggle ("Not with you", `refusesHaggle`); Hostile, the showpiece stays off their
  table and their tags are 5% dearer for this player (`hidesShowpiece`, `stallMarkup`: from the next draw, which is
  per day). Only ever dearer: buying to sell back still never pays.
- **Perks**: Friend, a copy kept aside and a morning call (a subtitle "on the phone") when a game off the wishlist is
  on their stall that day (`startMarketSocial`, at boot and on each new game day); Close with trust 60, credit: "Ask
  for credit" gives 50 coins, taken back from the wallet the next market day (`KEYS.marketCredit`); short, they are
  let down once a day (-10 warmth, -15 trust, a card) until it is paid; "Pay back" in a word with them settles early.
- **The saleroom's regulars** (Doris, Mr Okafor, Mrs Pettibone, Lenny): talkable in their seats (place `saleroom`;
  their old lines are their chat). A Friend leaves the player a lot they bid on (`LotRun.withdraw`): one on the
  wishlist, or any that day once asked ("Leave me the lots I bid on today?"). A Close one tips the star lot
  (`starLotTip`) or sells one lot they won today at what they paid (`tradePrice`, once a sale). The player winning a lot
  they bid on costs each -2 (a competitive one +1: "enjoyed the fight"), once a day.
- **Small-ad sellers**: each is a person of the visit (`seller:<ad id>`, `addPerson`, traits by kind, their kind's
  talk as chat). A pleasant visit eases their haggle (`sellerEase`: from warmth 8 and 20, `Negotiation.ease`, inside
  `NEGOTIATION.maxSway` and `lowest` like any sway); an insulting offer costs 8 warmth. Left at warmth 22 or more, a
  relative's ad goes in the paper two days later (`Classifieds.inject`, id `followup:<ad id>`, never a follow-up's).
- **Mrs Albers** (the club's visit): talkable while she is round (`Friend.talker`, `GatheringDeps.social`); her
  `clubBonus` at Friend scales the club's gift by 1.25.

## Victor (`economy/rivalCollector.ts`, `social/rivalry.ts`, `world/people/victorTalk.ts`)

Victor Crane is the same person in the hall (`market/RivalInHall`), outside RETRO GAMES (`street/shops/Trader`) and
in the saleroom's front row (`saleroom/furnishSaleroom`): `victorHook` makes each body talkable, his first word is
how the rivalry stands (`TalkSession.opening`: his `greeting`, or the copy he is after today), and talking counts
as having met him (`RivalCollector.meet`).
- **The rivalry moves the standing.** The player beating him to a copy or a lot (`beatenOnce(day)`) stings
  (−3 warmth) but earns respect (+4 trust); him getting there first pleases him (+2, once a day). The day he was
  beaten (`beatenOn`), a topic or a chat that lands is gracious (+4 warmth, once); a tease is gloating (−12 warmth, a
  memory). `view().mood` follows: `warm` from Friend,
  `bitter` from Hostile, else even, stung or smug as before; his lines go with it.
- **Penalties.** `snipesWishlist` (Hostile): his hunt in the hall goes for the dearest copy of the player's wishlist
  on the stalls (never a held, kept-aside or ordered one). `spiteBids` (Nemesis): the player's first bid on a lot
  brings him in on it up to 1.25 × the estimate × his keenness (`LotRun.join`).
- **Perks.** `duplicatesAtCost` (Friendly): his suitcase is priced at what he paid, no `TRADER_MARKUP`.
  `splitLots` (Friend, trust 30): "Go halves on this lot" while a lot is called, once a sale: he stops bidding
  (`LotRun.drop`, `Saleroom.splitWithRival`) and pays half the hammer price if the player wins.
  `showsCollection` (Close): once (`RivalCollector.shown`), an invitation to see his collection: a letter card, one
  of his duplicates (`a gift from Victor`, a big reward), the arc's end.
- **The wager** (`social/street/wager`, `bibliothek.rivalWager.v1`): an entry of his, "Fancy a wager on the next
  market?" (not while a wager runs or is owed, not the day he was beaten, not below Polite), is a bet on his next hunt
  at the flea market (`RivalCollector.endHunt` settles it): the
  player first to his copy wins (+4 trust, a moment for the book), him taking it loses. The loser owes an espresso:
  his waits behind either café's counter ("An espresso (on Victor)", the coffee of the day for nothing); the player's
  is a promise: bought in conversation (`COFFEE_PRICE`) it is kept (`PROMISE.kept`), not bought after `WAGER_GRACE`
  game days it is broken (`PROMISE.broken`, a memory). One wager at a time; "Still on for our bet?" while it runs.
- **First meeting**: before the player has ever spoken to him, his first word is the sale of Félix's flat (docs/story.md).
  One of Félix's copies sits in his suitcase some of his days (`felixLotOn(day, 'crane')`), firm at his markup, never
  at cost; he has a word about it once a visit. Bought back, a moment for the book.

## Friends (`world/visitors/friendSocial.ts`, `social/friendsLife.ts`)

Sam, Inès and Marco on a visit are talkable (`Friend.talker`, place `flat`): a click turns them to the player and
opens the conversation; a game they asked to borrow is its first entry ("They ask to borrow …", the `BorrowPanel`).
- **What moves them.** The door opened (+3 a day), a game lent (+4 warmth, +5 trust, a memory), a loan refused
  (−2), the bell unanswered (−2), their loan brought back (+2), cake (+4), a games night with a match (+5 each).
  A game one of them gave (`a gift from Sam`) leaving the collection, sold, swapped or given away (`watchGifts`):
  −8 warmth, −10 trust and a memory.
- **Perks.** `lendsGames` (Friend): "Borrow one of their games": a game of their taste the player lacks joins the
  collection for 5 game days (`friendsLife.borrow`; `Transactions.isKeepsake` keeps it off every desk, stall,
  swap and gift), then goes back with a note on the mat (`returnBorrowed`; a copy the player bought meanwhile stays).
  `helpsCarry` (Marco Friendly, Sam Friend): a hand with the furniture (a tip on moving it). `arcadePartner`
  (Marco): "Fancy the arcade tomorrow?" fixes the next game day (`friendsLife.arcadeDate`): that afternoon he is in
  the hall (`arcade/guestDays`), takes player two at PADDLE WARS and signs MAR on its table; a game together, +2. `postcards` (Inès Friendly): a postcard now and then on a new day at home,
  sometimes with a game (`maybePostcard`). `dropsBy` (Close): an unannounced visit outside the usual round
  (`VisitBook.plan`, `PlannedVisit.dropBy`) with a game they found. `takesSide` (Close): "Could you have a word
  with …?" for the coldest person met, once a week per friend (+8 warmth to them).
- **Penalty.** `stopsVisiting` (Cold): out of the day's draw and the phone's invitation; a loan still comes back.

## Front Street and the arcade (`social/street/streetPerks.ts`, `street/shops/baristaTalk`, `shop/clerkTalk`, `arcade/arcadeTalk`)

Their cards are `STREET_PEOPLE` and `ARCADE_PEOPLE` in `people/town.ts`, each `look.seed` the one their body is drawn
with (a `Walker` adds 200 to its seed: the busker's 77 is 277, Nico's 23 is 223).
- **The baristas** (Lou at SUNNY SIDE CAFE, Rémi at PARKSIDE CAFE: `street/shops/shopPlan.BARISTAS`, by fascia; any
  other café keeps its plain counter). A named café's door opens a conversation with a voice over the counter
  (`voiceBody`, subtitles). "A coffee" is the flea market's coffee of the day as before, with one market tip
  (`ShopEntrance.tips`, the most useful first); `twoTips` (Friendly) gives two and "Heard anything else?" the rest,
  `noTip` (Cold) none; `freeCoffee` (Friend) pours it on the house once a game day; `victorWhere` (Lou, Close) says
  where Victor is today (`rivalOnFrontStreet`, `rivalAtMarket`, `isAuctionDay`).
- **The busker** (Django): a click is the conversation (`Busker.talk`); its entries are the requests (a coin, free
  for a friend: `freeRequests`; a croissant or a bunch from the pocket), each a little warmth once a day. Every
  request is counted by tune (`street/buskerBook`, `KEYS.buskerRequests`); `favouriteTune` (Friendly) strikes up the
  most asked one (twice or more) when the player comes within 7 m, once a visit. `tape` (Close), once: a soundtrack
  LP for the sideboard's turntable (`HomeUpgrades.add('record')`) when there is one with room, else a cassette's 40
  tickets and a card.
- **The walk-in shops' clerks** (Bernard, Karim, Nadia, Iris: `streetPerks.clerkOf`): the clerk is the conversation
  (`ShopClerk` given `social`), "See everything for the flat" its first entry (the till's `HomeShopPanel`). Prices
  follow the clerk (`shopFactor`: `discount` 0.95 Friendly, 0.9 Friend for Bernard, 0.85 Close for Bernard and Karim;
  `markup` 1.05 Cold, 1.1 Hostile): the floor tags as the shop is built, the till live (`HomeShopPanel` `price`,
  the old price struck). "Any chance of a discount today?" (`streetPerks.askDiscount`, from Friendly, once a game
  day, no dice: a friend always obliges, someone Friendly unless their day is going badly) takes 10% more off at the
  till, once that day (`tillFactor`, `spendTalkedDown`). Home goods are never sold back, so no price here can make buying to sell pay. Nadia:
  `freeTreats` (Friend) a pouch of three portions a game day, `catAdvice` (Close) a word on the cat by name. Karim:
  `repairTips` (Friend) says the fault and the tool of the console waiting on the kitchen table (`Workshop.nextBroken`,
  `repair/consoles.FAULTS`). Iris: `extraBunch` (Friend) four bunches for two (`CounterErrand`'s `portions`).
- **Gus**, the attendant: "What's new today?" is the day's news a line at a time (the story's word first, then his
  people news, `arcade/gusLines`, then `ArcadeHall.newsToday`); his usual lines follow how he gets on with the player
  (curt when cold, warmer for a friend); `freeCredit` a coin across the counter once a day (Friendly), twice (Close); `insider` (Friend) all the
  news at once on a card; `noChange` (Cold) keeps the change machine "out of order" for the player
  (`ChangeMachine.jammed`).
- **Nico**, the kid: talkable; how he takes the player's games is `arcadeTalk.kidMood` (`HallKid`'s `KidMood`):
  `plain` comes over to watch and takes a free second stick six times in ten, `cheer` (Friendly) always comes and
  shouts a decent game, `devoted` (Close: `playerTwo`) always comes and always takes player two, `heckle` (Cold) comes
  to jeer and leaves the second stick alone. `doubles` (Friend): a tournament round won pays the regulars' whip-round,
  5 tickets (`ArcadeTournament.onRound`). The regulars (`economy/hallRegulars`) have names and their own words but no
  card: not talkable.
- **Hugo** (the building's kid) comes on Wednesday mornings (`arcade/guestDays`): talkable there (`arcadeTalk.hugoTalk`):
  "Want a tip for Snake?" once a day, +3 and he plays a little better (five tips count); watching the player's Snake,
  +1 once a day.
- Animals keep their own trust: the stray cat (`street/life/StrayCat`) is fed and won over as before, outside this
  layer. Trusted all the way with no cat at home, "take him home": Félix's cat moves in (`HomeContext.strayHome`:
  adopted for nothing, Mistigri, ginger), a big reward; with a cat at home already, the street stays his.
- **The shopkeepers** (`world/street/townsfolk/shopkeeperTalk`, `shopkeeperOf`): Stan the butcher and Agnès at CORNER
  BOOKS are a voice over their counter like the baristas. The shop's own business (its offer, or what a click did) is
  the first entry, the conversation closed first; "Have a look round" its lines. Stan: `freeScrap` (Friendly) a scrap
  for the stray once a game day, `noScrap` (Cold) refuses the counter; his `felixCat` fact (Friend) says whose cat the
  stray is. Agnès: `discount` 0.9 (Friendly; for the bookshop's prices), `felixGuide` (Close) once, a guide with
  Félix's pencilled maps (a card).
- **Known faces in the crowd** (`world/street/townsfolk/knownFaces`): the building's residents out at their hours are
  the stairs' people (`personAtDoor`, place `street`); two regulars keep hours (`townsfolk/regularsPlan`: they stay in
  outside them) and have cards: Bastien the 8:10 commuter (`passesLeads`, Friendly: "Heard anything on the platform?" is
  the day's lead) and Mrs Hall walking Biscuit (`mansionWord`, Friendly: which bell at the Mansions is worth ringing).
  Met, a known face passing within 6 m nods (Acquaintance) or waves (Friend), once a trip.
- **Out and about** (`world/street/townsfolk/TownRounds`, `townsfolkPlan`): Victor's espresso at the SUNNY SIDE CAFE at
  nine and his walk on to the flea market by RETRO GAMES' door, on his market and suitcase days (talkable, his
  rivalry's conversation); Lou outside her café's door on her breaks (talkable, place `street`).
- **Leads** (`social/street/leads`, `world/street/townsfolk/streetLeads`): a passer-by clicked now and then (once a game
  day) says something worth knowing instead of their line: one of Félix's copies on a stall today, who at the Mansions
  is clearing out or needs a hand, Victor's suitcase tomorrow. The journal writes it down (`onLead`, `bootstrap/social`).
- **Gifts from the street**: a coffee and a slice of cake to take away at either café ("A coffee to take away" in the
  barista's conversation: `errands` `coffee`, `cake`, into the pocket); the claw's bunnies from the prize shelf
  (`social/street/plushGifts`: what was won less what was given; the shelf still shows them). A game wrapped at the
  Christmas stall (`holidays/giftWrap`) comes first in "A game…" and means more given (`WRAPPED_GIFT`); a card posted
  in Front Street's pillar box warms a friend or family member once a game week (`post/cards`).

## Favours, birthdays, introductions, go-betweens (`social/life/`, saved under `KEYS.socialLife`)

Started once by `bootstrap/social` (`life/startLife.startSocialLife`); the journal's "to do" lists the favours
promised and the birthdays coming (`upcomingSocial`).
- **Favours** (`favours.ts`, data `favoursPlan.ts`): the promises' engine (see "Promises" above). It shows in their
  conversation as "What can I do for you?"; asked, then "I'll do it" (a promise) / "Sorry, I can't" (an offer lapses
  after `offerDays`, nothing lost). Kinds: `fetch` (bring a croissant, flowers or treats: given through Give),
  `findGame` (a seed game to their taste the player lacks, within a week), `lend` (one of the player's games to their
  taste, `lent` for `lendDays`, then back on its shelf), `checkIn` (knock on their door within a few days),
  `parcel` (collect it at Mme Pereira's, then hand it over). A yes pins a To-do tip and a journal line. Completion
  hooks `conversation.onInteraction` and may replace the outcome's line with their thanks.
- **Birthdays** (`birthdays.ts`): known for the old friends from the start, for anyone else when a chat or one of
  their topics lands within 7 game days of it (they say so, appended to their line). The hall's board wishes the
  residents theirs, signed by their friends in the building (and "the 5th floor" once the player wished them).
  "Wish them a happy birthday" on the day warms them once, more for a birthday the player knew ahead.
- **Introductions** (`introductions.ts`): two people the player knows who are together at a games night
  (`GamesNight.finish`), the neighbours' party (its day) or a power cut (the scene's pairs) grow closer, once a day per
  place: a tie offset (`lifeStore.tieOffset`) over their cards' ties, read by the grapevine (`gossip.tieBetween`,
  `tiesOf`). Grown close, it is news: a line in the journal and a note on the hall's board for a week ("Haddad and
  Martin play cards in the hall on Thursdays now").
- **Go-betweens** (`mediation.ts`): someone the player is Friendly with, close (tie 0.4+) to someone Cold or worse
  with the player, offers "Could you put in a word with X?", once a week: X warms by the tie × 10 and remembers who
  spoke up.

`npm run social` (docs/checks.md "Social sim") plays the whole layer headless (see "Debug").
