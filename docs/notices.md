# Notices: what the game tells the player

There is no generic toast or hint line. Every message has a **kind**, and each kind has its own place on the screen,
its own look and its own way of being sure it is read. The API is `NoticeActions` (`src/notices/types.ts`), on
`SessionActions` (interactables), `SessionHost` (controllers) and `Notices` itself (bootstrap wiring).

| Kind | Call | Where / how | Read because |
| --- | --- | --- | --- |
| Speech (someone in the room) | `walker.speak(line, name)`, `vendor.speak(line)` | Bubble over their head (HTML on the HUD, follows the head), name tag | It is where the player looks when talking to someone; out of view it moves to the subtitles. Lines queue per speaker, never talked over. |
| Voice without a body | `say(line, speaker)` | Subtitle strip, bottom centre, `Name: line` | The film convention; queued. |
| Word in passing | `walker.say(word)`, `vendor.say(word)` | Small comic bubble, no name, only near and in view | Ambient: not meant to be read, dropped out of view. |
| Reaction | `react(text)` | Right under the crosshair and its caption (one column: caption, reaction, touch badge) | The eyes are on the crosshair when clicking. One at a time (the latest click wins). |
| Refusal | `refuse(text)` | Same place, red, ✕, shake, buzz | Seen and heard. |
| Reward | `reward({ title, detail, coins, tickets, big })` | Banner in the upper middle, display font, coin / ticket chips, arpeggio; `big`: rays + fanfare | Exuberant; queued one at a time, never dropped (past 4 waiting they merge into "…and N more"). Over the panels too. |
| Tip | `tip(text, { id, head, until, ms, look })` | Card pinned top left under the wallet (one column with the chip: no gap when it hides), chime, slide-in; a "To do" head (or `look: 'note'`) is a handwritten slip like the to-do list | Stays until `until()` is true (the thing was done), replaced by the same `id`, or long after (default: 2× its reading time, 12 s at least). Max 3. Settings > Game > Show tips off drops them. |
| Card to read | `read({ title, text, effect, look })` | Paper card in the lower middle (`note`, `letter`, `radio`, `plaque`), rustle | Stays at least its reading time unless put down by hand (X, a click, a tap); then walking 1.2 m away puts it down, or 2.2× its reading time. Queued (past 3 waiting, the last says "…and N more notes"). |
| Alert | `Notices.alert(text, ms?, { label, run }?)` | Red bar at the top, over everything; with an action, a button (Retry) it waits for, focused under the pause menu (Up / Enter / A reach it); one waiting for its button comes back silently | The game's own trouble (save failed or saved by a newer version, in the player's words: "your wallet"; other tab; mouse lock; the world not loading); real time. |

Putting things away by hand (`NoticeDismiss`, the `dismissNotice` key: X; a controller holds Y; touch taps): a press
puts down the card being read at once, read or not, and the next waiting one comes out; a second press within 0.45 s
puts every waiting card away too. With no card up, a press skips the reward banner and takes the newest tip down (twice:
every tip, every waiting banner). Any press clears the subtitle strip. Alerts never go this way (their button). A card
shows how ("✕ X put down", for the device in hand: `dismissHint`); a click (the pointer free) or a tap on a card or a tip
puts it away as well. X goes to a piece of furniture carried (put away) and to a market copy in hand (swap) first.

Timing: `readMs(text)` = 1.2 s + 62 ms per character, 2.2 s to 15 s. Every clock but the alert's counts only while
the player is in front of the game (`attending`: not under the pause menu, tab visible); a panel open over the room
counts as attending, so a reward bought in a panel plays out over it.

## Choosing the kind

- The click worked: `react`. It did not: `refuse` (with the reason and the numbers: "costs 12, you have 5").
- Something was **gained** (coins, tickets, a game, a prize, a milestone, a parcel): `reward`, with `coins` / `tickets`
  as numbers, negative for money spent on something bought (the banner is about what you got).
- **How to** do something next (a key, where to go): `tip`, with `until` whenever the game can tell it was done.
- A text the player **asked to read** (clicked a flyer, a plaque, the radio): `read`. Story in `text`, what it changed in
  `effect`.
- Someone **talks**: their own `speak`; `say` only when nobody stands there.
- Split mixed messages. Before: `Bought X for 12. “Enjoy it!” Parcel in the hallway. U hands it back.` After:
  `sale.speak('Enjoy it!')` + `reward({ title: 'Bought X', detail: 'Parcel in the hallway', coins: -12 })` +
  `tip('U within 10 s hands it back', { until: window over })`.
- Household `Outcome`s go through `household/tellOutcome` (not done: refuse; done with a second line: a card with the
  effect; else react). A `pay()`'s `paid()` line with a second line is a card the same way.

While the pause menu is up (`body.menu-open`) the speech, subtitles, crosshair and its caption and line, tips, cards and the
wallet chip (the menu's status says it) step back; rewards and alerts stay over it. An alert up (`body.alert-up`) hides the
edge caption along the top. Subtitles past three fade out (the oldest), never cut. Tips off (Settings > Game): the first
day's chain waits, marking nothing seen.

The hover caption under the crosshair (`Overlay.setHoverLabel`) is not a notice: it names what is looked at, as `Name` or
`Name · verb` (lowercase verb, never "Click to …"); the Overlay draws the verb behind a key cap for the device in hand (the
mouse, the controller's A, a fingertip: the device last used, `input/lastDevice`), fades it in, and re-reads it 4 times a
second while looked at (`Session.onHover`); a long name ends in an ellipsis. A tip written as a sentence says "click / press A /
tap" through `ui/verb`. A panel closed with Esc (no gesture: the browser would refuse the mouse lock) shows a quiet "Click or
press Enter to return to the room" card instead of an alert (closed from a controller, the room is entered the controller's
way). A lock the browser refuses (its cooldown) keeps the card up saying "Resuming…" and tries once more; only a second
refusal is an alert.
