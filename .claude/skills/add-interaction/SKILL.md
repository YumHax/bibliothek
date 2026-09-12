---
name: add-interaction
description: Add a new player action - a key binding, a clickable behaviour, a new optional feature the Session routes to, or a new thing an Interactable can ask the Session to do.
---

# Add an interaction

Read `src/game/SessionParts.ts`, `src/game/SessionActions.ts` and `src/interaction/Interactable.ts` (all short).
Rules live in `src/game/Session.ts`; nothing else decides what a click or key does.

## A clickable object does something on its own (lamp, curtains, door...)

No Session change. In the class: `implements Interactable`, `hitboxes` (an `invisibleHitbox`), `label(player)` phrased as
"Click to ...", `activate(session)` does the thing. `player.held` / `player.seated` are readable for the phrasing.
Optional `labelPlacement()` returns `'edge'` to keep the caption off the crosshair.

## A clickable object needs the player moved or a game shown (sit, pick up, play)

Use the existing `SessionActions`: `pickUp`, `putBack`, `sit`, `stand`, `playOn(screen, box)`, `stopScreen`, `hint`.
If a new verb is needed, add it to `SessionActions` and implement it in `Session` (section "SessionActions").

## A key that drives an optional feature (like N for night, T for sort)

1. `SessionParts.ts`: add an optional part with a minimal structural interface (`XLike { doIt(): unknown }`).
   Keep it structural so the Session compiles without the feature.
2. `Session.bindInput()`: add a `case 'KeyX':` that checks the part exists, acts, `return`s. Physical codes only
   (`KeyboardEvent.code`); `KeyW/A/S/D`, `KeyE`, `KeyO`, `KeyF`, `Slash`, `KeyT`, `KeyN`, `KeyR`, `KeyC`, `Tab`,
   `Enter`, `Escape`, `ShiftLeft` are taken. Keys pressed while a box is held or while seated: see `STAND_UP_KEYS`.
3. `src/ui/controls.ts`: one hint line (`whileHolding: true` if it only applies with a box in hand).
4. `main.ts`: pass the concrete object in the `new Session({...})` parts.
5. Gamepad: map a button via `keyAliases` in `main.ts` (`GamepadX: 'KeyE'` style); touch: add a button in
   `src/input/TouchControls.ts` button bar if it should be reachable on a phone.

## A HUD element

New module under `src/ui/` with its own `.css` imported from the module; `z-index` above the canvas (shared rule in
`styles.css`); toggle with `el.hidden`. If it takes the keyboard, expose `isOpen` and have the Session treat it as modal
(see `modalOpen` and `CollectionEditorLike`).

Finish with `npm run typecheck && npm run build`; do not open a browser unless asked.
