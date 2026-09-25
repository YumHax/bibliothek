---
name: add-interaction
description: Add a new player action - a key binding, a clickable behaviour, a new optional feature the Session routes to, or a new thing an Interactable can ask the Session to do.
---

# Add an interaction

Read `src/game/Session.ts` (a short router), `src/game/SessionHost.ts`, `src/game/SessionActions.ts` and
`src/interaction/Interactable.ts`. Rules live in `src/game/`: the Session routes, one controller per feature decides
(`ModalStack`, `Hands`, `Seating`, `Screens`, `GoingOut`, `ArcadePlay`, `MarketCounter`, `Purchases`, `Browse`,
`CatCare`). Nothing else decides what a click or key does. Money arithmetic (a payout, a price) goes in a function in
`src/economy/` (see `arcadePayout.ts`); the controller only applies what it returns.

## A clickable object does something on its own (lamp, curtains, door...)

No Session change. In the class: `implements Interactable`, `hitboxes` (an `invisibleHitbox`), `label(player)` phrased as
"Click to ...", `activate(session)` does the thing. `player.held` / `player.seated` are readable for the phrasing.
Optional `labelPlacement()` returns `'edge'` to keep the caption off the crosshair.

## A clickable object needs the player moved, a game shown, a panel opened, coins spent

Use the existing `SessionActions`: `pickUp`, `putBack`, `sit`, `stand`, `playOn(screen, box)`, `stopScreen`, `hint`,
`openPanel(panel)` (any `ModalLike`, e.g. a `ui/ModalPanel`: hands emptied, mouse released, room re-entered on close),
`pay({ price, paid })`, `buyUpgrade(offer)`. If a new verb is needed: add it to `SessionActions`, implement it in the
controller that owns the feature, and add a one-line delegation in `Session` (section "SessionActions"). World classes
only ever see `SessionActions`.

## A key or a feature (like N for night, T for sort, C for the cat): one controller

A new key = one `ACTIONS` entry in `src/input/actions.ts` + the controller's `isAction(code, '<id>')` check. The entry
holds everything else: `codes` (game codes, the first is the one the help names), `context`, `hint`, optional `pad`
(a `Gamepad*` button that presses the key: the gamepad aliases), `touch` (`{ label, title, slot }`: a touch-bar
button) and `rebind` (the Settings > Keyboard row). A key shared with another action gets its own entry with the same
code and no `rebind`/`pad`/`touch` (those live on one entry per key), and a line in the table's shared-keys comment.

1. **The controller** (`src/game/<Feature>.ts`, or the existing one it belongs to). Model: `CatCare.ts` (smallest) or
   `Browse.ts`.
   - `export interface <Feature>Parts { thing?: ThingLike }`: optional, structural shapes (`ThingLike { doIt(): unknown }`,
     in the file or in `SessionParts.ts` if several controllers share it), so the Session compiles without the feature.
     Core objects come as `Pick<CoreParts, 'player' | ...>`.
   - `constructor(parts, host: SessionHost)`: `host` is the Session's shared moves (`notify`, `hint`, `pickUp`,
     `putBack`, `stand`, `setFrozen`). Never reach another controller except through the host or a constructor argument.
   - `implements KeyRoute`: `onKey(code, e): boolean` returns true when it took the key (the routing stops). Check the
     part exists before taking the key. Test `isAction(code, 'id')`, never a raw code string (codes arrive already
     rebound by `Input.setBindings`, so the check follows the player's keys).
2. **`SessionParts.ts`**: add `<Feature>Parts` to the `extends` list of `SessionParts` (a new controller only).
3. **`Session.ts`**: construct it in the constructor and put it in `routes` at the right place. The route order is the key
   precedence and is documented on `routes` (panels -> deaf gate -> arcade -> market copy -> hands -> browse -> cat ->
   seated stand-up). Taken codes: see `ACTIONS`. A key that means something else with a box in hand or at a stall goes
   after `hands` / `counter`; `Seating` is last (movement keys and E stand up).
4. `src/ui/controls.ts`: one help line per action, keys from the table: `{ group, action, keys: k('id'), pad: pad('id'),
   touch: touch('id') }` (`whileHolding: true` if it only applies with a box in hand). Any other text naming a key follows
   the bindings and the layout: HTML through `renderKeys(`${keyMarkup('id')} does it`)`, plain text (hints, hover labels)
   with `actionKeyLabel('id')` from `ui/keys`.
5. `src/bootstrap/session.ts`: pass the concrete object in the `new Session({...})` parts (made in the bootstrap step that
   owns it: `services`, `ui`, `world`, `player`, `input`). Events are subscriptions (`interactor.onSelect(fn)`,
   `zones.onZoneChange(fn)`, `search.onSelect(fn)`: each returns its unsubscribe), never an assigned `events.onX`.
6. Gamepad / touch: nothing to wire; the entry's `pad` and `touch` feed `PAD_ALIASES` (main's `keyAliases`) and the
   touch bar. Buttons the gamepad already handles itself: A (click), B / RB (right mouse), Start (pause), LB (crouch),
   LS (sprint), the D-pad (walking, menus).

## A HUD element

New module under `src/ui/` with its own `.css` imported from the module; `z-index` above the canvas (shared rule in
`styles.css`); toggle with `el.hidden`. If it takes the keyboard it is a panel: extend `ui/ModalPanel` (it is a
`ModalLike`: `.ui-card` surface, `.ui-btn` buttons, a Close button, arrows / D-pad walk it) and open it through
`SessionActions.openPanel`; a panel that opens itself (like the arcade's big screen) is also listed in the Session
constructor's `watch` loop. A panel that works on the box in hand sets `keepsHeld` (or is opened with
`ModalStack.openHolding`, as the haggle and swap panels are).

Finish with `npm run typecheck && npm run build`; do not open a browser unless asked.
