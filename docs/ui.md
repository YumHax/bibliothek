# The interface: panels, the kit and the tokens

Every DOM panel is a class on the kit in `src/ui/panel/`; every stylesheet reads the tokens in `src/ui/design/`.
`scripts/conventions/ui.mjs` and `css.mjs` keep both so (docs/checks.md).

## A panel

Something in the middle of the view extends `CardPanel` (`src/ui/panel/CardPanel.ts`): it gives the frame a `title`, a
`dismiss` verb ("Put it back", also the button's aria-label) and its own classes, implements `render(): Html` for the
body and `actions()` for its buttons (the dismiss is added, the primary one last), and reacts in `onAction(action, el)`
to any `[data-action]` click. A full-screen list over the blurred room extends `SheetPanel` (`MarketPanel` when the
wallet shows): `render()` paints `this.body`, `search` adds the one debounced field (`onSearch(query, platform)`),
`onOpened(...args)` sets state then calls `super`. Something with a layout of its own (the prize counter, the arcade
screen, a conversation) stays on the base `ModalPanel` and still gets the policies.

Markup comes from `html` (`import { html, paint, attr, raw } from '@/ui/panel/html'`): every interpolation is escaped, a
nested template or an array goes in whole, `raw()` admits a helper's markup, `paint(el, markup)` is the only place
`innerHTML` is written. The widgets (`priceHtml`, `walletLine`, `coverImg`, `gameRow`, `tabs` + `nextTab`, `emptyState`
in `src/ui/panel/widgets.ts`) return the same `Html`.

The base owns the policies: it registers with the controller navigation (`registerPanel`), closes on its dismiss,
Esc and B, and on a backdrop press only when the press began there; it focuses `[data-autofocus]`, else the first
control, else the dismiss; `refresh()` repaints and keeps the focus; `setStatus(text, 'info' | 'error' | 'ok')` writes
the frame's live line. Override `onKey` for the panel's own keys, `onEnter` for the shortcut when no control is
focused, `onBack` to step back from a sub-page (Esc and B honour it before closing), `onSide` for tabs. An
irreversible press takes `new Arming(() => this.refresh())` (`src/ui/confirmTwice.ts`) and `arming.press(key)`:
the first press arms and the label says so (`armedLine`), the second within `CONFIRM_MS` acts (a thing in the world on
its zone's clock passes that clock as the third argument and calls `expire()` from its update, so a dormant zone keeps
the arming; `again(key)` restarts the window at every press, for a run of quick presses); an arming on the wall
clock holds while the pointer rests on, or the focus is on, the armed control (read again after a repaint by its
`data-*`); destroying data asks `ConfirmDialog.ask({ title, text, confirm, danger })` (the menu's own `confirm` takes
an `also` button: the wipes offer "Download a copy first"). Something out of reach stays a focusable button with
`aria-disabled="true"` whose press says why in the status line ("40 coins short"); `disabled` is only for a state
that passes by itself ("Pricing…"). Listeners go through `this.listen(target, type, handler)` so
`dispose()` removes them with the panel.

Not on the kit yet: Overlay, TravelMenu, SearchBar, GamePanel, PayoutOverlay and the settings widgets (the audit's
F11/F27), and the world's own press-twice copies (Purchases, CopyOpening, ForSale, CartonCorner, ArcadePlay,
ProgramPlay, WallClock, NoticeDismiss). A panel registry (one `openPanel(id, data)` through the Session instead of the
seven "give it data then open" verbs) needs the Session's routing first.

## Social pieces

Who someone is to the player reads the same everywhere (the conversation, the People book, the phone, the hover
caption, the banners) through `src/ui/social/`:
- **The tier badge** (`badge.ts` `tierBadge(tier, person, { paper, small })`): a pastille edged in the tier's colour,
  a ring of it, the word in neutral ink (`tiers.tierName`: a light person reads New face / Regular / Old friend), so
  every tier passes 4.5:1; `paper` for a cream page. Never colour the word itself.
- **The bar** (`meters.ts` `relationMeter(s)`): the way to the next tier, full and striped while trust holds them;
  `trustStamps(s)` the stamps of trust beside it (one a promise kept's worth).
- **Portraits** (`portrait.ts` `portrait(id, size, ring, expression)`), painted at rest, smiling, frowning or surprised.
- **Icons** (`icons.ts`): one drawing per meaning (topics, moods, groups, gifts); `iconNamed(name)` for a name written
  in data.
- **The comic page** (`ConversationPanel`, `conversation/menu.ts`, `nameTag.ts`, `placement.ts`): the conversation's
  look, also the speech bubbles' (`notices.css` `.speech`) and the person's hover caption: cream paper (`--talk-paper`)
  with an ink outline (`--talk-ink`) and a flat offset shadow (`--talk-shadow`), the speech face `--ui-font-comic`
  (Patrick Hand) for what is said, `--ui-font-talk` (Atkinson Hyperlegible) for the rest, the name tag in ink with the
  print face. Its slot variables are in `social.css`'s theme block.
- **Long press** (`conversation/hold.ts` `HoldPress`): what is done for good in a conversation (a promise, a game or coins
  given away, an insult) is held 600 ms, its ring filling; the mouse, a key (Enter, Space, its digit) and the controller's
  A hold alike. It replaces the press-twice arming there.

Text in these pieces is never under 14 px (`--social-small`), what is read is 16 px (`--social-read`), and reduced
motion is the game's setting (`.reduce-motion`, `settings/motion.reduceMotion()`), never a media query of its own.

## The tokens

`src/ui/design/tokens.css` holds every colour (`--ui-*`: text, the three panel surfaces, four backdrops, borders,
fills, accent / gold / money / on-accent, the info / success / danger / armed states), size (`--fs-*` type scale, `--sp-*`
spacing, radii from 2xs to pill, four shadows), motion (`--dur-*`, two eases), stacking level (`--z-*`) and paper look
(`--paper-*`, `--ink-*`). `base.css` is the page, the text sizes (`ui-scale-*`, five), plain lettering (`plain-lettering` sets the hand,
comic and marker faces to the body's), `kbd` and the one focus ring (on paper it takes the paper's ink: `--focus`); `components.css` the building blocks
(`.ui-modal` with `--sheet` / `--centre`, `.ui-modal__card`, `.ui-card`, `.ui-btn` and `--armed`, `.ui-field`,
`.ui-tabs`, `.ui-row`, `.ui-chip`, `.ui-badge`, `.ui-coin`, `.ui-status`, `.ui-paper[data-paper]`). Each panel's sheet
comes last, in `@layer panels`, and only lays the blocks out: it sets slot variables in its theme block and reads them
with `var()`, never a raw colour, `z-index`, font family or duration. The kit's own frame classes (`.ui-panel`,
`.ui-panel--card` / `--sheet`, `.ui-panel__card`, `__header`, `__status` (+ `--error`, `--ok`), `__body`, `__footer`,
`.ui-confirm*`) are carried by the panels' former classes today; a legacy class listed beside a `.ui-*` selector in
components.css goes when its template says `.ui-*`.
