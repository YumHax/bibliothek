# Notices: what the game tells the player

There is no generic toast or hint line. Every message has a **kind**, and each kind has its own place on the screen,
its own look and its own way of being sure it is read. The API is `NoticeActions` (`src/notices/types.ts`), on
`SessionActions` (interactables), `SessionHost` (controllers) and `Notices` itself (bootstrap wiring).

| Kind | Call | Where / how | Read because |
| --- | --- | --- | --- |
| Speech (someone in the room) | `walker.speak(line, name)`, `vendor.speak(line)` | Bubble over their head (HTML on the HUD, follows the head), name tag | It is where the player looks when talking to someone; out of view it moves to the subtitles. Lines queue per speaker, never talked over. |
| Voice without a body | `say(line, speaker)` | Subtitle strip, bottom centre, `Name: line` | The film convention; queued. |
| Word in passing | `walker.say(word)`, `vendor.say(word)` | Small comic bubble, no name, only near and in view | Ambient: not meant to be read, dropped out of view. |
| Reaction | `react(text)` | Right under the crosshair and its caption | The eyes are on the crosshair when clicking. One at a time (the latest click wins). |
| Refusal | `refuse(text)` | Same place, red, ✕, shake, buzz | Seen and heard. |
| Reward | `reward({ title, detail, coins, tickets, big })` | Banner in the upper middle, display font, coin / ticket chips, arpeggio; `big`: rays + fanfare | Exuberant; queued one at a time, never dropped (past 4 waiting they merge into "…and N more"). Over the panels too. |
| Tip | `tip(text, { id, head, until, ms })` | Card pinned top left under the wallet, chime, slide-in | Stays until `until()` is true (the thing was done), replaced by the same `id`, or long after (default: 2× its reading time, 12 s at least). Max 3. |
| Card to read | `read({ title, text, effect, look })` | Paper card in the lower middle (`note`, `letter`, `radio`, `plaque`), rustle | Stays at least its reading time whatever the player does; then walking 1.2 m away puts it down, or 2.2× its reading time. Queued. |
| Alert | `Notices.alert(text)` | Red bar at the top, over everything | The game's own trouble (save failed, other tab, mouse lock); real time. |

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

The hover caption under the crosshair (`Overlay.setHoverLabel`) is not a notice: it names what is looked at.
