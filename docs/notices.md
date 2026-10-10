# Notices: what the game tells the player

There is no generic toast or hint line. Every message has a **kind**, and each kind has its own place on the screen,
its own look and its own way of being sure it is read. The API is `NoticeActions` (`src/notices/types.ts`), on
`SessionActions` (interactables), `SessionHost` (controllers) and `Notices` itself (bootstrap wiring).

| Kind | Call | Where / how | Read because |
| --- | --- | --- | --- |
| Speech (someone in the room) | `walker.speak(line, name)`, `vendor.speak(line)` | Bubble over their head (HTML on the HUD, follows the head), name tag | It is where the player looks when talking to someone; out of view it moves to the subtitles. Lines queue per speaker, never talked over; while a conversation is open (`conversing`, `body.conversing`), an answer replaces the speaker's line at once, the bubble drops its name tag and a reward banner comes in higher, clear of it. |
| Voice without a body | `say(line, speaker)` | Subtitle strip, bottom centre, `Name: line` | The film convention; queued. |
| Word in passing | `walker.say(word)`, `vendor.say(word)` | Small comic bubble, no name, only near and in view | Ambient: not meant to be read, dropped out of view. |
| Reaction | `react(text)` | Right under the crosshair and its caption (one column: caption, reaction, slip, tip card, touch badge) | The eyes are on the crosshair when clicking. One at a time (the latest click wins). |
| Refusal | `refuse(text)` | Same place, red, ✕, shake, buzz | Seen and heard. |
| Slip | `slip({ title, detail, coins, tickets })` | A small slip of paper under the reaction, the amount as a chip, a soft tick | Something changed hands with no fanfare (bought, held, a parcel, a debt settled): the eyes are where the click was. One at a time (the latest wins), stays its reading time. |
| Reward | `reward({ title, detail, coins, tickets, big })` | Banner in the upper middle, display font, coin / ticket chips, arpeggio (the slip's tick when nothing is counted); `big`: rays + fanfare | A gain with a number, a prize, a milestone. Queued one at a time, never dropped (past 4 waiting they merge into "…and N more"). Over the panels too. |
| Tip | `tip(text, { id, head, until, ms, look })` | A card under the crosshair (after the reaction and the slip) for its reading time, the crosshair ringing once to point at it, chime; then it folds into a pill in the hint tray, bottom left. A "To do" head (or `look: 'note'`) is a handwritten slip pinned top left under the wallet instead, like the to-do list | Stays until `until()` is true (the thing was done), replaced by the same `id` (no chime then), or long after (default: 2× its reading time, 12 s at least). One card at a time (a new one folds the last), 3 pills, 3 slips. The card folds early once the player walks a metre or acts (a reaction, a slip), unless it came in under 1.2 s ago: the column under the crosshair holds the caption and one notice. Settings > Game > Show tips off drops them. |
| Prompt | `prompt(text, { id, until })` | A quiet line at the bottom centre, over the subtitles' place, the keys as caps; no sound | The keys that matter in the state the player is in (seated, carrying, a box in hand: `Session.holdingKeys`, after what is aimed at; a pad in hand, at a machine). States stack: the latest shows, the one under comes back when it ends. Gone when `until()` says so or its remover is called; never timed, never put away by hand. Watching from a seat with nothing pressed for 4 s, it fades nearly out with the crosshair and the caption (`ui/HudIdle`, `body.hud-idle`). |
| Card to read | `read({ title, text, effect, look, from, date, place, accent, hand, of })` | Paper card in the lower middle, the room dimmed a touch behind it (`body.reading-up`); the look per paper (`readingLooks`): a `note`, a `letter` (out of its envelope flap, the date top right, the signature `from` bottom right, the `hand` in pen, on a typewriter or in print), a `postcard` (the picture side first, `place` on a painted sky, turned to the writing after 1.2 s or on a press), a `flyer` (headline band in its `accent`), the `radio`'s printout, a brass `plaque`; rustle | Stays at least its reading time unless put down by hand (X, a click, a tap); then walking 1.2 m away puts it down, or 2.2× its reading time. A long text is cut into pages (420 characters or 6 lines each, at sentence ends): the key turns them ("Turn over" on the pill, "1/3" on the stamp), the last press puts it down. One piece a card: the mailbox's and the notice board's pieces come one after the other, "2 of 3" stamped on each (`of`). Queued (past 3 waiting, the last says "…and N more notes"; a batch never merges). |
| Alert | `Notices.alert(text, ms?, { label, run }?)` | Red bar at the top, over everything; with an action, a button (Retry) it waits for, focused under the pause menu (Up / Enter / A reach it); one waiting for its button comes back silently | The game's own trouble (save failed or saved by a newer version, in the player's words: "your wallet"; other tab; mouse lock; the world not loading); real time. |

A key in a prompt or a tip is written in square brackets, `[E]`, `[Click]`, `[Right-click]` (the label from
`actionKeyLabel`, or `ui/verb`'s word), and drawn as a key cap (`keyCaps`): the eye finds the key before the sentence.

Putting things away by hand (`NoticeDismiss`, the `dismissNotice` key: X; a controller holds Y; touch taps, on the
release of a tap, so a look-drag starting on a notice leaves it; Esc too when the page hears it in the room, full screen
holding the keyboard: the card being read only, then the pause menu): a press
turns the page of the card being read (or a postcard's picture side) while pages are left, else puts it down at once,
read or not, and the next waiting one comes out; a second press within 0.45 s puts every waiting card away too. With no card up, a press skips the reward banner, the slip and takes the newest tip
down, wherever it is (twice: every tip, every waiting banner). Any press clears the subtitle strip. Alerts never go this
way (their button), nor prompts (state, not a message). A card shows how on the pill hanging off its foot ("Put down"
or "Turn over" with the key for the device in hand: `dismissHint`); a click (the pointer free) or a tap on a card, a
slip, a tip or a pill puts it away (or turns it) as well. X goes to a
piece of furniture carried (put away) and to a market copy in hand (swap) first.

Sounds: the chime is for a new tip card only (a tip replacing one of the same id is silent, the fold into the tray too);
the slip's tick for a slip and for a banner with nothing counted; the arpeggio for a gain; the fanfare for `big`.

Timing: `readMs(text)` = 1.2 s + 62 ms per character, 2.2 s to 15 s, times Settings > Display > Text stays on screen
(`setReadingPace`: 1, 1.6, 2.6). Every line said to the player (`addressed`) is also kept, the last 30, in
`speechLog` for the pause menu's "What was said" (`ui/SaidPanel`). Every clock but the alert's counts only while
the player is in front of the game (`attending`: not under the pause menu, tab visible); a panel open over the room
counts as attending, so a reward bought in a panel plays out over it.

## Choosing the kind

- The click worked: `react`. It did not: `refuse` (with the reason and the numbers: "costs 12, you have 5").
- Something was **gained** (coins or tickets won, a prize, a game won or given, a milestone, a story stage, a tier
  reached): `reward`, with `coins` / `tickets` as numbers; `big` only for a milestone (a prototype found, two more rooms,
  a tournament, the first day done, a prize won at the arcade; never a personal best, which a beginner beats every play).
- Something merely **changed hands** (bought, held, swapped, borrowed, a parcel come or unpacked, a debt settled, a
  credit taken, a free play): `slip`, same fields, `coins` negative for money spent. Never a fanfare for a purchase.
- The **keys that matter in a state** the player is in (seated, carrying a piece, a pad or a glowing box in hand, a
  purchase that can still be handed back): `prompt`, with `until` the state's end; `[Key] verb` groups joined by " · ",
  at most three, no sentences.
- **How to** do something next (a key, where to go): `tip`, one action and at most two keys as `[Key]` caps, under 90
  characters, with `until` whenever the game can tell it was done. Never on an event the player did not ask about: a
  tip answers a click (a refusal, a purchase, a thing bought), or it is someone's line in the room.
- A text the player **asked to read** (clicked a flyer, a plaque, the radio): `read`. Story in `text`, what it changed in
  `effect`.
- Someone **talks**: their own `speak`; `say` only when nobody stands there.
- Split mixed messages: `sale.speak('Enjoy it!')` + `slip({ title: 'Bought X', detail: 'In the parcel in the hall.',
  coins: -12 })` + `prompt('[U] hand it back · 10 s', { until: window over })`.
- Household `Outcome`s go through `household/tellOutcome` (not done: refuse; done with a second line: a card with the
  effect; else react). A `pay()`'s `paid()` line with a second line is a card the same way.

While the pause menu is up (`body.menu-open`) the speech, subtitles, crosshair and its caption and line, the slip, tips,
prompts, cards and the wallet chip (the menu's status says it) step back; rewards and alerts stay over it. An alert up (`body.alert-up`) hides the
edge caption along the top. Subtitles past three fade out (the oldest), never cut. Tips off (Settings > Game): the first
day's chain waits, marking nothing seen.

The hover caption under the crosshair (`Overlay.setHoverLabel`) is not a notice: it names what is looked at, as `Name` or
`Name · verb` (lowercase verb, never "Click to …"); the Overlay draws the verb behind a key cap for the device in hand (the
mouse, the controller's A, a fingertip: the device last used, `input/lastDevice`), fades it in, and re-reads it 4 times a
second while looked at (`Session.onHover`); a long name ends in an ellipsis. A tip written as a sentence says "click / press A /
tap" through `ui/verb`. A panel closed with Esc (no gesture: the browser would refuse the mouse lock) shows a quiet "Click or
press Enter to return to the room" card instead of an alert; closed with E (the use key, outside a text field: `ModalPanel`,
`ModalStack`), a gesture, it goes straight back in (closed from a controller, the room is entered the controller's
way). A lock the browser refuses (its cooldown) keeps the card up saying "Resuming…" and tries once more; only a second
refusal is an alert.
