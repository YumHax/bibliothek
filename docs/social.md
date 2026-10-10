# People and relationships (`src/social/`)

Everyone the player can know has a card, a standing on two axes, a mood of the day, things to learn about them and
things they remember. Clicking someone opens a conversation; how the player stands with them changes what they do:
perks when you get along, penalties when you don't. Read this before touching anyone the player talks to.

## People

- **Cards** (`social/people/`): `building.ts` (residents behind the doors, `door` = `stairwell/building.doorKey`, the
  concierge, the syndic, the attic's student, the postman, Claire), `friends.ts` (Sam, Inès, Marco: their ids are
  `visitors/friendsPlan`'s), `town.ts` (Front Street, the market, the arcade, the saleroom, Victor). A card says who
  they are (`name`, `short`, `role`, `group`, `whereabouts`, `intro`), how they take things (`traits`, `tastes`,
  `likes` / `dislikes` as gifts, `birthday` in the social year), who they know (`ties`, -1..1), what can be learned
  (`facts`, each from a tier), what their tier does (`effects`), their own words (`lines`), where they start
  (`startWarmth`, `startTrust`) and whether the book lists them before they are met (`listed: 'always'`).
- `people/index.ts`: `findPerson`, `everyone`, `personAtDoor(key)`, `shortName`;
  `addPerson(card)` adds someone met at run time (a small ad's seller, a stallholder).
- `lookBook.rememberLook(id, look)`: whoever builds a body for a person records its look, so the portrait
  (`ui/social/portrait`) is the face met; before that the card's `look.seed` is drawn.

## Two axes (`standing.ts`, `tiers.ts`)

- **Warmth** -100..100 (do they like you) and **trust** 0..100 (can they rely on you). A module-level store saved
  under `KEYS.social`; the old `KEYS.neighbourFriendship` (by door) is read once into warmth.
- **Tiers** (`socialPlan.TIERS`): Nemesis, Hostile, Cold, Stranger, Acquaintance, Friendly, Friend, Close (the ids;
  the player reads `stranger` as "Polite" and `close` as "Close friend", never a glyph). Their colours say the side:
  reds and a cold blue below, grey in the middle, greens above, gold for a close friend. Above Acquaintance a tier
  also needs trust: short of it they stay a tier lower (the UI says what the two of you are: "Likes you, doesn’t rely
  on you").
- **Bonds** (`tiers.bondOf`): friend (warm, trusted), charmer (warm, not relied on), business (trusted, cool),
  enemy, neutral.
- `nudge(id, { warmth, trust, why, reason, day, memory, gossip })` is the one way to move a standing: `reason`
  counts once a game day, `why` is the banner's or the card's words, `memory` is kept (the mildest forgotten first), `gossip` sends
  it down the grapevine. Every change goes to `onSocial` listeners with the tier before and after (a tier is told
  once: `PersonState.told`).
- `building/friendship.ts` is the old door-keyed API (`friendship`, `befriend`, `COLD`) over the same store.
- **Gains slow as they grow** (`GAIN`): a warmth gain is × (1 - warmth / `span`) ^ `power` (never under `floor`), a
  trust gain × (1 - trust / `trustSpan`); talk (the Talk and Mean groups, not an apology) warms one person
  `talkPerDay` a day at most (`standing.talkWarmth`), so a day's chatter can't buy a friendship. Standings are kept to
  a tenth so the slivers near the top add up. Tuned with `npm run social`: a casual player reaches Friendly or
  Friend with most people in 60 game days (trust holds the rest), a diligent one every Close perk in 120.
- **Drift** (`settleDay`, run at boot and on every new game day by `bootstrap/social`): after `DRIFT.graceDays`
  without contact (`friendGraceDays` for a friend or closer, so a friendship holds over an evening away; any change
  of standing counts, the grapevine and the phone too), warmth slides back towards `DRIFT.rest`; a close friend
  slower, a proud one slower back up.
  Trust never drifts. Mild memories fade after `MEMORY.fadeDays`.
- **The grapevine** (`gossip.grapevine`): a deed's warmth reaches whoever is tied to the person, at
  `GOSSIP.share` × the tie (an enemy of theirs the other way), twice as far from a gossip.
- **Mood of the day** (`mood.ts`): drawn per person and game day, darker for a night owl in the morning, an early
  bird late, a grumpy one early; `markMood(id, day, steps, why)` moves it for the day (the power cut, a noisy
  night); their birthday puts them in a good mood.
- **The building's opinion** (`reputation.ts`): the residents' average warmth, as a name ("the nice one on the 5th").

## Talking (`conversation.ts`, `ui/social/ConversationPanel`)

- A person in the room is a `Walker` or a `Vendor` given a `social` hook (`world/people/socialHook.talkHook(ctx.social,
  id, () => TalkSession)`): the caption becomes "Name · Friend · talk" (the role before they are met) and a click
  opens the conversation instead of a line. `actReaction(body, reaction)` acts what the panel reports.
- `TalkSession`: the person, the place (`SocialPlace`), their `body` (`speak`, `react`: a body that reacts is in the
  room; one without, `voiceBody`, is only a voice), the place's `extras` (swap, haggle, visit: `TalkExtra`,
  `opensPanel` when it opens a panel of its own), `onClose`.
- The panel (`ui/social/ConversationPanel` + `social.css`), built the way The Sims does it: **the person is the
  show, the UI says no rules**. No odds, no numbers, no previews of what a choice brings, no locked rows, no "done
  today" labels, no help page: the player learns to read people from their mood, their ways and their reactions.
  - The person: the view turns gently to their face (`player/lookTowards`, through `deps.frame`). Their answers come
    over their head (`body.speak`), their body takes what was said (`react`; talked out it looks at its watch,
    leaving it waves); while the panel is open the speech layer is `conversing` (`notices/speech`): an answer replaces
    the speaker's line at once instead of queueing behind it, the bubble drops its name tag and a reward banner comes
    in higher (`body.conversing`). By their face (`core/screenPoint`, followed each frame): one to three hearts rising
    (warmer) or cracked ones falling (cooler) by how much it moved, with a chime or a low note (`uiSounds` `warm` /
    `cool`), "trusts you more" or "less" when trust moved; and on opening, their thought: the icon of a talk their
    ways make welcome now, found out or not (its chip glows until talked about). Only a voice (`voiceBody`, through a
    door or a counter) or a call shows their painted face in the card and says their lines there, on a paper slip.
  - The card, beside them and clear of the bubble over their head (placed from their head's place on screen, on its
    right, else its left; it moves only when they walk off), its foot fixed above the subtitles: it grows upwards, so
    the rows under the pointer never move. Top to bottom: the line the player just said, in quotes
    (`conversation.playerLine`, `socialLines.PLAYER_LINES`, or a place entry phrased as speech), or what they did
    (an entry that is an action, as a stage direction); their name (a click opens their page in the People book),
    role and tier in a word; one bar (`meters.relationMeter`, the same as the book's: cold left, warm right, neutral in
    the middle, no ticks), easing to the new standing; the day (a birthday, the mood and why, the ways of theirs
    found out, a new one glowing), wrapping rather than cut; the bond in words when trust is what holds them back.
  - The menu: the place's own entries that are open now first (a shut one is not shown; words in quotes are said,
    the rest done; `TalkExtra.tag` adds a word like "news"), the talk on chips two by two, then Give…, Ask… and Be
    mean… side by side (sub-lists, Back last), Goodbye last. A found-out trait of theirs that makes a choice go down
    well now tags it with the trait's name; an entry they never offered before says "new" (`social/noticed`, kept by
    row once a conversation ends; a first meeting is the baseline). An interaction not open at their tier is not
    shown until it is. Give lists the pocket with its own icons, tagged "a favourite" or "not for them" once a gift of
    that kind told it (`gifts.tasteOf`), then "A game…" (box art, best fits first; it leaves the collection:
    `Transactions.giveAway`) and "A few coins" (`COIN_GIFT`). A game given, coins and an insult take a second press
    (`confirmTwice.Arming`), the row saying what the second does.
  - Talked out (`TIRED_LINES`), they look at their watch and leave by themselves a moment later: one try costs, not
    a string of them. Leaving (Goodbye, Esc, a click on the room away from the card), they say goodbye
    (`FAREWELL_LINES`, by how warm they are) and wave.
  - Number keys pick (their digits show once a key is used, gone when the mouse moves), Backspace or B come back
    from a sub-list, Esc leaves. The very first conversation pins one tip (`notices.tip`, `noticed.firstConversation`).
- `opening`: the first meeting is their `intro` (`meet`), then their hello, a cold or hostile word, a birthday, and
  once a day when trust is what holds them back, what they would like (`HELD_LINES`: the only hint of how to get
  closer).
- `perform(id, interaction, ctx, extra)`: odds = base × mood × traits (some by hour) + warmth; a landed daily
  interaction counts once a day (said again, they say so: `REPEAT_LINES`, a shrug), a miss always costs; the social
  battery (`BATTERY`, × traits) spent, more talk costs warmth (`TIRED_LINES`); a good chat may teach a fact; the
  trait that bent the odds is found out; a gift tells how they take its kind (`gifts.tasteFact`, kept with the facts
  learned). `onInteraction` hears every one (favours, challenges).
- **Extending**: a feature adds entries to anyone's conversation with `extras.addExtras(ctx => TalkExtra[])`.

## What it does (`perks.ts`)

A card's `effects` are perks from a tier up and penalties (`down`) from a tier down, some needing trust. A system asks
`effect(id, key)` (the value, `true`, or undefined) and keeps its default otherwise:
`effectValue('leclerc', 'noiseThreshold', 0.3)`. `effectsOf(id)` splits them for the book; `effectsCrossed` names
what a tier change brought.

Rules shared by everything here:
- Nothing the player owns is ever taken or damaged by a bad standing: penalties are prices, refusals, complaints,
  votes, notes and noise.
- Every perk and penalty is listed on its person's card, so the book can say it.
- A person's ids are stable: a save keeps them.

## Clarity: where the player reads relationships

- **Nothing is announced before it happens.** What a tier brings is told when it is reached (the banner), what bad
  blood costs when it starts (the card); neither the panel nor the book lists perks or penalties to come.
- **The hover caption** (`caption.socialCaption`): "Mrs Dubois · Friend · annoyed · talk" (the mood only when it is
  worth knowing before going up to them; the Overlay draws the last part as the verb behind a key cap), the role
  before they are met ("2nd floor, right · talk"). A resident's door says the tier too.
- **The conversation panel**: their tier in a word and the bar, the mood and why, a birthday, the ways found out;
  after a try, their answer and reaction in the room, the hearts and a word of trust by their face, a chime. Cold or
  worse, Apologise is offered. On the phone (place `phone`) the card shows their face with a phone badge and their
  lines on a dashed slip.
- **Tier changes** (`announce.announceTiers`, wired by `bootstrap/social`), in sentences (`tiers.tierChangeLine`):
  a reward banner when someone reaches Friendly or more or a perk comes into force ("Mrs Dubois is a friend now",
  the perk as its detail; `big` for a close friend); a card (`read`, look `note`) when they fall to Cold or lower or a
  perk is lost ("Mrs Dubois has gone cold on you", why, the penalty now in force). Smaller moves (a newcomer becoming
  an acquaintance, a thaw to civil) are only the journal's.
- **The People book** (`ui/social/PeopleBook` + `PeopleBook.css`, the `people` key I, the journal's People button,
  the pause menu's People): an address book, a leather cover with coloured index tabs down its spine (Everyone,
  Friends, Building, Street, Market, Arcade, Rivals; D-pad left / right) and a cream page. The list: a card per
  person met or `listed: 'always'`, warmest first, edged in their tier's colour, with portrait, name, role, their tier
  in a word with the bar, and their day in words (the mood, or "Birthday today"); "Not met yet" for one listed but
  not met; the tally of people known, friends, still to meet. A person's page (Backspace back; `showPerson` opens the
  book on it, from a name in a conversation): on the left a taped
  Polaroid, the tier, the bar, the bond in words, and a card of where to find them, the birthday (once known), today,
  the phone; on the right what you know (traits found out with a dashed "?" for each one still to find, facts in
  handwriting with a blank line for each one still to find, how they took the gifts given: "Loves flowers",
  "Doesn’t want a butcher’s scrap", "Glad of a croissant"), what is between you now as ink stamps (the perks in
  force in the tier's ink, the penalties in red), what they remember as a dated diary, and whom they know as a web
  (their portrait in the middle, the others round it on threads coloured by the tie, each a link to their page).
- **Portraits** (`ui/social/face.ts` painting, `portrait.ts` caching): a head and shoulders from the look their body
  was built with (skin, hair and its style, eyes with a catch-light, brows, jaw, nose, smile, freckles, beard,
  glasses, hat, the top and its collar, scarf, apron, age), lit from the upper left on a backdrop of the tier's colour,
  at the screen's density. The phone's contacts and a tier reached (the reward banner's `picture`) show them too.
- **The journal** (`socialJournal.watchSocialJournal`, bullet ♥, kind `social`): a line when someone is met ("Met
  Rania Haddad, 2nd floor, left") and on every tier crossed, in a sentence ("Mrs Haddad is friendly with you now.",
  "Things have cooled with Mr Leclerc."); every `DIGEST.everyDays` game days the week's digest: who
  grew closer or cooled by `DIGEST.notable` warmth or more, who was met. The warmth a week ago is kept under
  `KEYS.socialDigest`.

## The phone

The bedroom phone's Contacts (`ui/household/PhonePanel`, `PhoneContacts`, made in `bootstrap/social`): everyone whose
number the player has (`askNumber` in a conversation, the friends from the start), warmest first, with their tier and
whether they pick up now (`phoneHours`: 8:00 to 22:00, a night owl 11:00 to 1:00, an early bird 6:30 to 21:00). A ring
in their hours opens the conversation with place `phone` (the interactions that need hands, `notAt: ['phone']`, are
not offered); out of them the phone says why.

## Mémé (`people/family.ts`, `grandmaSocial.ts`)

The player's grandmother (docs/story.md "Mémé"), in the book (Friends tab) and the phone from the start. A card with
`family: true`: her warmth never drifts (`settleDay` skips her) and never falls under `startWarmth` (`standing.apply`),
and she has no penalty. `watchGrandma` hears `GrandmaVisits.subscribe` and nudges her, each kind once a game day: a
visit, a Sunday lunch (reason `sundayLunch`, which the journal reads to drop its line), a gift (cake, flowers, a game
shown), a memory seen (kept as a memory of hers), the scarf worn to hers. A ring (`callGrandma`) opens the conversation
with her own first words (`TalkSession.opening`: the album, Sunday, Saturday, small talk) and counts once a day; from
21:00 to 23:00 she answers in her nightie and rings off. At Close (`knitsScarf`) the wardrobe has her scarf. In her flat
(`world/grandma/meme.ts`) a click opens the conversation, with what the player has for her (flowers, cake, the latest
game) and "Tell me about Félix?" as entries. Her portrait is her look in her flat (`lookBook.rememberLook` at start-up).

## Debug

- `?social`: everyone met, at Friendly at least (it writes to the save it plays on: use it with `?debug`).
- `?debug`: `bibliothek.social.table()` lists warmth, trust, tier, met and memories per person;
  `bibliothek.social.set(id, warmth, trust)` sets one (`bootstrap/debug.installSocialDebug`).

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
- **Word of mouth** (`smallPerks.ts`): Sofia's "Anything in the post for me?" (`MailPost`) and a Comets tip a day; the
  postman's, Pascal's (carrying) and the Nguyens' (the spare pad) offers are lines only: the flat's furniture has no
  weight and a games night no pad limit to lift.

## The market, the saleroom, the small ads (`social/market.ts`, `social/saleroom.ts`, `social/sellers.ts`)

- **Stallholders** (`social/people/market.ts`, id `stall-<platform>`: Gégé NES, Yuki Super Nintendo, Malik Game Boy,
  Sandrine Mega Drive, Kev N64, Agnès PlayStation; look seed = the stall's index + 1). Their `Vendor` opens the
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
  beaten (`beatenOn`), a chat, a compliment or games talk that lands is gracious (+4 warmth, +3 trust, once); a
  tease or a challenge is gloating (−12 warmth, −4 trust, a memory). `view().mood` follows: `warm` from Friend,
  `bitter` from Hostile, else even, stung or smug as before; his lines go with it.
- **Penalties.** `snipesWishlist` (Hostile): his hunt in the hall goes for the dearest copy of the player's wishlist
  on the stalls (never a held, kept-aside or ordered one). `spiteBids` (Nemesis): the player's first bid on a lot
  brings him in on it up to 1.25 × the estimate × his keenness (`LotRun.join`).
- **Perks.** `duplicatesAtCost` (Friendly): his suitcase is priced at what he paid, no `TRADER_MARKUP`.
  `splitLots` (Friend, trust 35): "Go halves on this lot" while a lot is called, once a sale: he stops bidding
  (`LotRun.drop`, `Saleroom.splitWithRival`) and pays half the hammer price if the player wins.
  `showsCollection` (Close): once (`RivalCollector.shown`), an invitation to see his collection: a letter card, one
  of his duplicates (`a gift from Victor`, a big reward), the arc's end.

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
  (Marco): a word for the arcade. `postcards` (Inès Friendly): a postcard now and then on a new day at home,
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
  the old price struck). `askDiscount` landed takes 10% more off at the till, once that day (`tillFactor`,
  `spendTalkedDown`). Home goods are never sold back, so no price here can make buying to sell pay. Nadia:
  `freeTreats` (Friend) a pouch of three portions a game day, `catAdvice` (Close) a word on the cat by name. Karim:
  `repairTips` (Friend) says the fault and the tool of the console waiting on the kitchen table (`Workshop.nextBroken`,
  `repair/consoles.FAULTS`). Iris: `extraBunch` (Friend) four bunches for two (`CounterErrand`'s `portions`).
- **Gus**, the attendant: "What's new today?" is the day's news a line at a time (`ArcadeHall.newsToday`, the story's
  word first); `freeCredit` a coin across the counter once a day (Friendly), twice (Close); `insider` (Friend) all the
  news at once on a card; `noChange` (Cold) keeps the change machine "out of order" for the player
  (`ChangeMachine.jammed`).
- **Nico**, the kid: talkable; how he takes the player's games is `arcadeTalk.kidMood` (`ArcadeCrowd.kidMood`):
  `plain` comes over to watch and takes a free second stick six times in ten, `cheer` (Friendly) always comes and
  shouts a decent game, `devoted` (Close: `playerTwo`) always comes and always takes player two, `heckle` (Cold) comes
  to jeer and leaves the second stick alone. `doubles` (Friend): a tournament round won pays the regulars' whip-round,
  5 tickets (`ArcadeTournament.onRound`). The regulars stay anonymous.
- Animals keep their own trust: the stray cat (`street/life/StrayCat`) is fed and won over as before, outside this
  layer.

## Favours, birthdays, introductions, go-betweens (`social/life/`, saved under `KEYS.socialLife`)

Started once by `bootstrap/social` (`life/startLife.startSocialLife`); the journal's "to do" lists the favours
promised and the birthdays coming (`upcomingSocial`).
- **Favours** (`favours.ts`, data `favoursPlan.ts`): on a new game day, someone met at Acquaintance or warmer without
  a favour going may have one (`FAVOURS.odds`, two a day at most, `gapDays` between one person's). It shows in their
  conversation as "What can I do for you?"; asked, then "I'll do it" / "Sorry, I can't" (an offer lapses after
  `offerDays`, nothing lost). Kinds: `fetch` (bring a croissant, flowers or treats: given through the panel's Give),
  `findGame` (a seed game to their taste the player lacks: given through Give a game, within a week), `lend` (one of
  the player's games to their taste: the extra lends it, `lent` for `lendDays`, then back on its shelf), `checkIn`
  (knock on their door within a few days: a `NEIGHBOUR_HOSTS` resident, read from the knock's `lastCounted`),
  `parcel` (collect it at Mme Pereira's, then hand it over). A yes pins a To-do tip and a journal line. Done: trust
  and warmth (`FAVOURS.done`), told down the grapevine, a memory, some of the time coins; missed after a yes:
  `FAVOURS.failed` and a grudge. Someone Hostile or worse offers a make-amends favour once ("Is there anything I can
  do to make it up to you?"): done, they are a Stranger again at least. Completion hooks `conversation.onInteraction`
  and may replace the outcome's line with their thanks.
- **Birthdays** (`birthdays.ts`): known for the old friends from the start, for anyone else when a chat or "ask about
  their day" lands within 7 game days of it (they say so, appended to their line). The hall's board wishes the
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

`npm run social` (docs/checks.md "Social sim") plays the whole layer headless.
