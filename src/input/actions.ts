import { PAD_LABELS, type PadButton } from './padButtons';

/**
 * Every player action that has a key, in one table: the key codes, the controller button and the
 * on-screen button that do the same, the Settings row that may move it, and where it applies.
 *
 * Codes are the game's codes, i.e. what `Input.onPress` hands the Session: a physical
 * `KeyboardEvent.code` after `Input.setBindings` has mapped it (so `isAction(code, 'buy')` still holds
 * when the player moved Buy to another key), or a virtual press from the gamepad / touch bar (never
 * remapped). The first code is the one the help and the hints name.
 *
 * Shared keys are settled by the Session's route order (`Session.routes`), never here:
 * - `KeyE`: `walkAway` (arcade, first) > `putBackPiece` (furniture carried) > `putBack` (a box in hand) > `standUp` (seated, last);
 * - `KeyM`: `setDown` (furniture carried) > `putHere` (a shelf box in hand, aimed at a shelf) > `moveFurniture` (hands free);
 *   the right mouse button does the same (`Session.bindInput`: a tap with a box in hand, a press otherwise);
 * - `KeyR`: `turnPiece` (furniture carried) first; `KeyQ`: `turnPieceBack` (furniture carried) > `readStalls` (market);
 * - `KeyG`: `gridSnap` (furniture carried); `KeyU`: `handBack` (market copy in hand) > `undoMove` (hands free);
 * - `KeyO`: `lookInside` (a market copy: finds out a fake, lets the key go on) then `openBox`;
 * - `KeyR`: `holdCopy` (a market copy in hand) > `randomPick` (Browse skips it while holding);
 * - `Space` / `Enter`: `fire` (the arcade replays on its end card) > `pickUpFound` (Browse);
 * - movement keys: walking, the arcade stick while at a machine, `standUp` when seated.
 * A shared key has one Settings row (the entry with `rebind`); rebinding moves every action on it.
 *
 * Controller buttons that spend (`buy`, `haggle`) sit on the triggers, which do nothing else: B and RB
 * are the right mouse button (rotating a box) and the d-pad walks, so neither may ever buy by accident.
 * The right stick's click only calls the cat (harmless anywhere); holding Select opens the journal.
 */
export type ActionContext =
  /** Walking about (the `FirstPersonController` reads these as held keys). */
  | 'walk'
  /** Anywhere in a room with the hands free. */
  | 'room'
  /** A box in hand. */
  | 'held'
  /** A market copy in hand (or just bought). */
  | 'market'
  /** At an arcade machine: every key is the game's. */
  | 'arcade'
  /** In the armchair or the bed. */
  | 'seated'
  /** Panels and menus (over the room and the start card too). */
  | 'panels'
  /** In photo mode: every key is its own (the walking keys fly the camera). */
  | 'photo'
  /** Carrying a piece of furniture about the room. */
  | 'furnishing';

export interface TouchSpec {
  label: string;
  title: string;
  /** Position in the on-screen action bar, left to right. */
  slot: number;
}

export interface ActionSpec {
  codes: readonly string[];
  context: ActionContext;
  /** What it does, for whoever reads the table. */
  hint: string;
  /** Controller button that also presses `codes[0]` (the gamepad's key aliases). */
  pad?: PadButton;
  /** Controller button that presses `codes[0]` when held (half a second, in the room); its short press stays its own. */
  padHold?: PadButton;
  /** On-screen button (touch bar) that presses `codes[0]`. */
  touch?: TouchSpec;
  /** Settings > Keyboard row label: the player may move this key (one row per key). */
  rebind?: string;
}

export const ACTIONS = {
  // --- walking (read as held keys by the FirstPersonController) ---------------------------------------
  forward: { codes: ['KeyW'], context: 'walk', hint: 'walk forward (double-tap and hold: sprint)', rebind: 'Forward' },
  back: { codes: ['KeyS'], context: 'walk', hint: 'walk back', rebind: 'Back' },
  left: { codes: ['KeyA'], context: 'walk', hint: 'strafe left', rebind: 'Left' },
  right: { codes: ['KeyD'], context: 'walk', hint: 'strafe right', rebind: 'Right' },
  crouch: { codes: ['ShiftLeft', 'ShiftRight'], context: 'walk', hint: 'crouch while held (sprint while held when Settings > Controls says Shift sprints)', rebind: 'Crouch / sprint' },
  crouchAlt: { codes: ['KeyZ'], context: 'walk', hint: 'crouch while Shift sprints (Settings > Controls)', rebind: 'Crouch when Shift sprints' },

  // --- E, O: the box in hand ---------------------------------------------------------------------------
  putBack: {
    codes: ['KeyE'], context: 'held', hint: 'put the box back', pad: 'GamepadX',
    touch: { label: 'Put back', title: 'Put the game back / stand up', slot: 1 }, rebind: 'Put back / walk away',
  },
  walkAway: { codes: ['KeyE'], context: 'arcade', hint: 'walk away from the machine (shares putBack’s key)' },
  standUp: { codes: ['KeyE'], context: 'seated', hint: 'stand up, like any movement key (shares putBack’s key)' },
  openBox: {
    codes: ['KeyO'], context: 'held', hint: 'open / close the box', pad: 'GamepadY',
    touch: { label: 'Open', title: 'Open the box', slot: 2 }, rebind: 'Open the box',
  },
  lookInside: { codes: ['KeyO'], context: 'market', hint: 'open a market copy: a fake shows inside (shares openBox’s key)' },

  // --- Moving things about the flat (docs/furnishing.md): right-click takes, M does the same ----------------------
  moveFurniture: {
    codes: ['KeyM'], context: 'room', hint: 'pick up the piece of furniture looked at, to move it (a right-click does too)', padHold: 'GamepadX',
    touch: { label: 'Move', title: 'Move the furniture you look at (or hold a finger on it)', slot: 8 }, rebind: 'Move furniture / put the box here',
  },
  putHere: {
    codes: ['KeyM'], context: 'held', hint: 'put the box in hand where you aim on a shelf (a right-click tap does too; shares moveFurniture’s key)',
    touch: { label: 'Put here', title: 'Put the box where you aim on a shelf', slot: 8 },
  },
  setDown: {
    codes: ['KeyM'], context: 'furnishing', hint: 'set the carried piece down (a click does too)',
    touch: { label: 'Set down', title: 'Set the piece down here', slot: 1 },
  },
  turnPiece: {
    codes: ['KeyR'], context: 'furnishing', hint: 'turn the carried piece a quarter clockwise (the wheel turns it an eighth)',
    touch: { label: 'Turn', title: 'Turn the piece', slot: 2 },
  },
  turnPieceBack: {
    codes: ['KeyQ'], context: 'furnishing', hint: 'turn the carried piece a quarter the other way (shares readStalls’s key)',
    touch: { label: 'Turn back', title: 'Turn the piece the other way', slot: 5 },
  },
  gridSnap: {
    codes: ['KeyG'], context: 'furnishing', hint: 'snap the carried piece to the grid, or let it go free', rebind: 'Grid on / off',
    touch: { label: 'Grid', title: 'Snap to the grid, or place freely', slot: 4 },
  },
  putBackPiece: {
    codes: ['KeyE'], context: 'furnishing', hint: 'put the carried piece back where it was (a right-click does too)',
    touch: { label: 'Put back', title: 'Put the piece back where it was', slot: 3 },
  },
  storePiece: {
    codes: ['KeyX'], context: 'furnishing', hint: 'put the carried piece away (the pause menu takes it out again, in any room; shares swap’s key)',
    touch: { label: 'Put away', title: 'Put the piece away, out of sight', slot: 6 },
  },
  planView: {
    codes: ['KeyL'], context: 'room', hint: 'plan the room from above: move the furniture with the mouse (again: back)', rebind: 'Plan the room',
  },
  undoMove: {
    codes: ['KeyU'], context: 'room', hint: 'undo the last piece of furniture moved (hands free; shares handBack’s key)', rebind: 'Undo a move / hand back',
  },

  // --- browsing the room -------------------------------------------------------------------------------
  search: {
    codes: ['KeyF', 'Slash'], context: 'room', hint: 'open the quick search',
    touch: { label: 'Search', title: 'Search the collection', slot: 5 }, rebind: 'Search',
  },
  randomPick: { codes: ['KeyR'], context: 'room', hint: 'random pick, again: walk to it', rebind: 'Random pick / hold for the day' },
  sortShelves: { codes: ['KeyT'], context: 'room', hint: 'sort the shelves by platform / year / title', rebind: 'Sort the shelves' },
  nightMode: { codes: ['KeyN'], context: 'room', hint: 'night mode', rebind: 'Night mode' },
  callCat: { codes: ['KeyC'], context: 'room', hint: 'call the cat', pad: 'GamepadRS', rebind: 'Call the cat' },
  journal: { codes: ['KeyJ'], context: 'room', hint: 'open the journal: today, the days before', padHold: 'GamepadSelect', rebind: 'Journal' },
  photoMode: { codes: ['KeyP'], context: 'room', hint: 'photo mode (again: leave it)', rebind: 'Photo mode' },

  // --- a market copy in hand ---------------------------------------------------------------------------
  buy: {
    codes: ['KeyB'], context: 'market', hint: 'buy it', pad: 'GamepadRT',
    touch: { label: 'Buy', title: 'Buy the market copy in hand', slot: 3 }, rebind: 'Buy',
  },
  haggle: {
    codes: ['KeyH'], context: 'market', hint: 'haggle (once a day per copy)', pad: 'GamepadLT',
    touch: { label: 'Haggle', title: 'Make the stallholder an offer', slot: 4 }, rebind: 'Haggle',
  },
  holdCopy: { codes: ['KeyR'], context: 'market', hint: 'hold it for the day (shares randomPick’s key)' },
  swap: { codes: ['KeyX'], context: 'market', hint: 'swap one of yours for it', rebind: 'Swap' },
  handBack: { codes: ['KeyU'], context: 'market', hint: 'hand back what was just bought' },
  readStalls: { codes: ['KeyQ'], context: 'market', hint: 'hold to read titles and prices from the aisle', rebind: 'Read the stalls / turn a piece back' },

  // --- found box, panels -------------------------------------------------------------------------------
  pickUpFound: { codes: ['Enter', 'NumpadEnter'], context: 'room', hint: 'pick up the box the search / random pick found' },
  collection: {
    codes: ['Tab'], context: 'panels', hint: 'open / close the collection', pad: 'GamepadSelect',
    touch: { label: 'Games', title: 'Collection', slot: 6 },
  },
  close: {
    codes: ['Escape'], context: 'panels', hint: 'close the open panel, pause (the controller’s Start: PointerLockFlow)',
    touch: { label: 'Menu', title: 'Pause menu', slot: 7 },
  },

  // --- at an arcade machine (read as held keys by `MachineRun` through `ARCADE_KEYS`) ------------------
  stickLeft: { codes: ['KeyA', 'ArrowLeft'], context: 'arcade', hint: 'the stick, left' },
  stickRight: { codes: ['KeyD', 'ArrowRight'], context: 'arcade', hint: 'the stick, right' },
  stickUp: { codes: ['KeyW', 'ArrowUp'], context: 'arcade', hint: 'the stick, up' },
  stickDown: { codes: ['KeyS', 'ArrowDown'], context: 'arcade', hint: 'the stick, down' },
  fire: { codes: ['Space', 'Enter', 'NumpadEnter'], context: 'arcade', hint: 'fire; on the end card, play again' },

  // --- photo mode (`src/photo`: the walking keys fly the camera; the held ones are read each frame) ------
  photoCapture: { codes: ['Enter', 'NumpadEnter'], context: 'photo', hint: 'take the photo (a click does too)' },
  photoUp: { codes: ['Space'], context: 'photo', hint: 'fly up while held' },
  photoDown: { codes: ['ShiftLeft', 'ShiftRight'], context: 'photo', hint: 'fly down while held' },
  photoFocusNear: { codes: ['KeyQ'], context: 'photo', hint: 'focus nearer while held' },
  photoFocusFar: { codes: ['KeyE'], context: 'photo', hint: 'focus further while held' },
  photoBlurLess: { codes: ['KeyZ'], context: 'photo', hint: 'less blur while held' },
  photoBlurMore: { codes: ['KeyX'], context: 'photo', hint: 'more blur while held' },
  photoDarker: { codes: ['KeyC'], context: 'photo', hint: 'darker while held' },
  photoBrighter: { codes: ['KeyV'], context: 'photo', hint: 'brighter while held' },
  photoLook: { codes: ['KeyG'], context: 'photo', hint: 'next grade' },
  photoFrame: { codes: ['KeyF'], context: 'photo', hint: 'next guide (none, thirds, cinema, square)' },
  photoHelp: { codes: ['KeyH'], context: 'photo', hint: 'show / hide the help card' },
  photoReset: { codes: ['KeyR'], context: 'photo', hint: 'reset the lens and the grade' },
} satisfies Record<string, ActionSpec>;

export type ActionId = keyof typeof ACTIONS;

/** The table seen through its common shape (so optional fields read on any id). */
const SPECS: Readonly<Record<ActionId, ActionSpec>> = ACTIONS;
const IDS = Object.keys(ACTIONS) as ActionId[];

/** True when the game code `code` (as `Input.onPress` gives it) triggers one of `ids`. */
export function isAction(code: string, ...ids: ActionId[]): boolean {
  return ids.some((id) => SPECS[id].codes.includes(code));
}

/** The code the help names for `id`. */
export function primaryCode(id: ActionId): string {
  return SPECS[id].codes[0]!;
}

/** `{KeyB}`: the action's key in `renderKeys` markup (named after the bindings and the layout). */
export function keyMarkup(id: ActionId): string {
  return `{${primaryCode(id)}}`;
}

/** `{KeyF} or {Slash}`: every key of the action in `renderKeys` markup. */
export function everyKeyMarkup(id: ActionId, separator = ' or '): string {
  return SPECS[id].codes.map((code) => `{${code}}`).join(separator);
}

/** The first entry on `id`'s key that has `field` (a shared key has its buttons on one entry). */
function onSameKey<K extends 'pad' | 'touch'>(id: ActionId, field: K): ActionSpec[K] {
  const code = primaryCode(id);
  return SPECS[id][field] ?? IDS.map((other) => SPECS[other]).find((spec) => spec.codes[0] === code && spec[field])?.[field];
}

/** `[X]`: the controller button that presses the action's key, or undefined when none does. */
export function padMarkup(id: ActionId): string | undefined {
  const pad = onSameKey(id, 'pad');
  return pad && `[${PAD_LABELS[pad]}]`;
}

/** `[Buy]`: the on-screen button that presses the action's key, or undefined when none does. */
export function touchMarkup(id: ActionId): string | undefined {
  const touch = onSameKey(id, 'touch');
  return touch && `[${touch.label}]`;
}

/** Gamepad key aliases (`GamepadInput`'s `keyAliases`): each button presses its action's key. */
export const PAD_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  IDS.flatMap((id) => {
    const pad = SPECS[id].pad;
    return pad ? [[pad, primaryCode(id)]] : [];
  }),
);

/** Long presses on the controller (`GamepadInput`): each held button presses its action's key. */
export const PAD_HOLD_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  IDS.flatMap((id) => {
    const pad = SPECS[id].padHold;
    return pad ? [[pad, primaryCode(id)]] : [];
  }),
);

/** The touch action bar, left to right: each button presses its action's key, shown where its `context` applies (`TouchControls`). */
export const TOUCH_ACTIONS: ReadonlyArray<{ label: string; code: string; title: string; context: ActionContext }> = IDS.flatMap((id) => {
  const touch = SPECS[id].touch;
  return touch ? [{ ...touch, code: primaryCode(id), context: SPECS[id].context }] : [];
})
  .sort((a, b) => a.slot - b.slot)
  .map(({ label, code, title, context }) => ({ label, code, title, context }));

/** The keys the Settings screen lets the player move, in table order, with the action each one names. */
export const REBINDABLE_ACTIONS: ReadonlyArray<{ code: string; label: string }> = IDS.flatMap((id) => {
  const label = SPECS[id].rebind;
  return label ? [{ code: primaryCode(id), label }] : [];
});
