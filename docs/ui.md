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
the arming; `again(key)` restarts the window at every press, for a run of quick presses); destroying data asks
`ConfirmDialog.ask({ title, text, confirm, danger })`. Listeners go through `this.listen(target, type, handler)` so
`dispose()` removes them with the panel.

Not on the kit yet: Overlay, TravelMenu, SearchBar, GamePanel, PayoutOverlay and the settings widgets (the audit's
F11/F27), and the world's own press-twice copies (Purchases, CopyOpening, ForSale, CartonCorner, ArcadePlay,
ProgramPlay, WallClock, NoticeDismiss). A panel registry (one `openPanel(id, data)` through the Session instead of the
seven "give it data then open" verbs) needs the Session's routing first.

## The tokens

`src/ui/design/tokens.css` holds every colour (`--ui-*`: text, the three panel surfaces, four backdrops, borders,
fills, accent / gold / money / on-accent, the info / success / danger / armed states), size (`--fs-*` type scale, `--sp-*`
spacing, radii from 2xs to pill, four shadows), motion (`--dur-*`, two eases), stacking level (`--z-*`) and paper look
(`--paper-*`, `--ink-*`). `base.css` is the page, `kbd` and the one focus ring; `components.css` the building blocks
(`.ui-modal` with `--sheet` / `--centre`, `.ui-modal__card`, `.ui-card`, `.ui-btn` and `--armed`, `.ui-field`,
`.ui-tabs`, `.ui-row`, `.ui-chip`, `.ui-badge`, `.ui-coin`, `.ui-status`, `.ui-paper[data-paper]`). Each panel's sheet
comes last, in `@layer panels`, and only lays the blocks out: it sets slot variables in its theme block and reads them
with `var()`, never a raw colour, `z-index`, font family or duration. The kit's own frame classes (`.ui-panel`,
`.ui-panel--card` / `--sheet`, `.ui-panel__card`, `__header`, `__status` (+ `--error`, `--ok`), `__body`, `__footer`,
`.ui-confirm*`) are carried by the panels' former classes today; a legacy class listed beside a `.ui-*` selector in
components.css goes when its template says `.ui-*`.
