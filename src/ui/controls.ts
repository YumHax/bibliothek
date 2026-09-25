import { everyKeyMarkup, keyMarkup, padMarkup, touchMarkup } from '@/input/actions';

/** Which tab of the Controls screen a line sits under. */
export type ControlGroup = 'room' | 'arcade' | 'market' | 'menus';

export const CONTROL_GROUPS: Array<{ id: ControlGroup; label: string }> = [
  { id: 'room', label: 'At home' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'market', label: 'Flea market' },
  { id: 'menus', label: 'Menus' },
];

/** The device a hint is written for; the Controls screen shows the active one. */
export type ControlDevice = 'keyboard' | 'gamepad' | 'touch';

export const CONTROL_DEVICES: Array<{ id: ControlDevice; label: string }> = [
  { id: 'keyboard', label: 'Keyboard & mouse' },
  { id: 'gamepad', label: 'Controller' },
  { id: 'touch', label: 'Touch' },
];

/**
 * One action of the controls help, in the key mini-markup of `keys.renderKeys` (`{KeyW}` a rebindable
 * key code, `[Click]` a literal cap). `pad` / `touch` are the same action on the other devices;
 * absent, the line is keyboard-only (`—` on that device). `whileHolding` lines are repeated in the
 * game panel's footer; `essential` lines are also on the title screen.
 */
export interface ControlHint {
  group: ControlGroup;
  action: string;
  keys: string;
  pad?: string;
  touch?: string;
  whileHolding?: boolean;
  essential?: boolean;
}

// Keys, controller buttons and touch buttons come from the action table (`input/actions`): `k('buy')` is
// `{KeyB}`, `pad('buy')` `[B]`, `touch('buy')` `[Buy]`. Literal caps are the mouse, the sticks and the
// buttons the devices handle themselves (A clicks, Start pauses, LB crouches).
const k = keyMarkup;
const pad = padMarkup;
const touch = touchMarkup;
const walk = `${k('forward')}${k('left')}${k('back')}${k('right')}`;
const stick = `${k('stickUp')}${k('stickLeft')}${k('stickDown')}${k('stickRight')}`;

export const CONTROLS: ControlHint[] = [
  // --- at home ---------------------------------------------------------------------------------------
  { group: 'room', action: 'Move', keys: walk, pad: '[Left stick]', touch: '[Left joystick]', essential: true },
  { group: 'room', action: 'Look around', keys: '[Mouse]', pad: '[Right stick]', touch: 'Drag on the right', essential: true },
  { group: 'room', action: 'Sprint', keys: `Double-tap ${k('forward')}, keep it held`, pad: 'Click [Left stick]', touch: 'Push the joystick far' },
  { group: 'room', action: 'Crouch', keys: `Hold ${k('crouch')}`, pad: 'Hold [LB]' },
  { group: 'room', action: 'Pick a game up, use what you look at', keys: '[Click]', pad: '[A]', touch: 'Tap', essential: true },
  { group: 'room', action: 'Rotate the game in hand', keys: 'Hold [Right click]', pad: 'Hold [RB], [Right stick]', touch: 'Long-press, drag', whileHolding: true },
  { group: 'room', action: 'Open / close the box', keys: k('openBox'), pad: pad('openBox'), touch: touch('openBox'), whileHolding: true },
  { group: 'room', action: 'Put it back', keys: `${k('putBack')} or [Click] elsewhere`, pad: pad('putBack'), touch: touch('putBack'), whileHolding: true },
  { group: 'room', action: 'Watch its longplay', keys: 'Bring it to the TV and [Click] the TV', pad: '[A] on the TV', touch: 'Tap the TV', whileHolding: true },
  { group: 'room', action: 'Watch it big', keys: '[Click] the ceiling projector or its wall', pad: '[A] on the projector', touch: 'Tap the projector', whileHolding: true },
  { group: 'room', action: 'Sit in an armchair (move to stand up)', keys: '[Click] the armchair', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Find a console’s games', keys: '[Click] a console on the TV stand', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Search a game (Enter picks it up)', keys: everyKeyMarkup('search'), touch: touch('search'), essential: true },
  { group: 'room', action: 'Random pick (again: walk to it)', keys: k('randomPick') },
  { group: 'room', action: 'Sort the shelves by platform / year / title', keys: k('sortShelves') },
  { group: 'room', action: 'Night mode', keys: k('nightMode') },
  { group: 'room', action: 'Your collection: statuses, import / export', keys: k('collection'), pad: pad('collection'), touch: touch('collection'), essential: true },
  { group: 'room', action: 'Lamps, curtains and blinds', keys: '[Click] them', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'The time (click twice: alarm in an hour)', keys: '[Click] a wall clock', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Doors, drawers, fridge, cupboards, taps, kettle, radio…', keys: '[Click] them', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Sleep until morning', keys: 'In bed, [Click] the bed again', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Call the cat', keys: k('callCat') },
  { group: 'room', action: 'Your journal: the day, the days before', keys: `${k('journal')} or [Click] the notebook on the hall console` },
  { group: 'room', action: 'The collector’s book: milestones, sets, value', keys: '[Click] the binder on the sideboard', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Photo mode (fly, focus, take a PNG)', keys: k('photoMode') },
  { group: 'room', action: 'Pet the cat, refill its bowl', keys: '[Click] it, [Click] the bowl', pad: '[A]', touch: 'Tap' },
  { group: 'room', action: 'Go out (arcade, flea market)', keys: '[Click] the key bowl, then the front door', pad: '[A]', touch: 'Tap', essential: true },
  { group: 'room', action: 'Pause, release the mouse', keys: k('close'), pad: '[Start]', touch: touch('close'), essential: true },

  // --- arcade ----------------------------------------------------------------------------------------
  { group: 'arcade', action: 'Play a cabinet (insert coin)', keys: '[Click] it', pad: '[A]', touch: 'Tap' },
  { group: 'arcade', action: 'Cabinet: move, fire', keys: `${k('stickLeft')}${k('stickRight')} / arrows, ${k('fire')}` },
  { group: 'arcade', action: 'Walk away from a machine', keys: k('walkAway'), pad: pad('walkAway'), touch: touch('walkAway') },
  { group: 'arcade', action: 'High score initials: letter, next', keys: `${k('stickUp')}${k('stickDown')}, ${k('fire')}` },
  { group: 'arcade', action: 'Pinball: flippers, launch', keys: `${k('stickLeft')} ${k('stickRight')}, hold and release ${k('fire')}` },
  { group: 'arcade', action: 'Alley: aim, power', keys: `${k('stickLeft')}${k('stickRight')}, hold and release ${k('fire')}` },
  { group: 'arcade', action: 'Claw: steer, drop', keys: `${stick}, ${k('fire')}` },
  { group: 'arcade', action: 'Neon Sheriff: aim, shoot (off screen reloads)', keys: `[Mouse], [Click] or ${k('fire')}`, pad: '[Right stick], [A]' },
  { group: 'arcade', action: 'Step Beat: step', keys: `${stick} / arrows`, pad: '[D-pad]' },
  { group: 'arcade', action: 'Paddle Wars: move, smash', keys: `${k('stickUp')}${k('stickDown')}, hold ${k('fire')}` },
  { group: 'arcade', action: 'Hoop Fever: aim, throw', keys: `[Mouse], hold and release ${k('fire')}` },
  { group: 'arcade', action: 'Spin the ticket wheel', keys: `${k('fire')} or [Click]`, pad: '[A]', touch: 'Tap' },
  { group: 'arcade', action: 'Next station on the jukebox', keys: '[Click] the jukebox', pad: '[A]', touch: 'Tap' },
  { group: 'arcade', action: 'Swap tickets for prizes, a mystery game or coins', keys: '[Click] the prize counter', pad: '[A]', touch: 'Tap' },

  // --- flea market -----------------------------------------------------------------------------------
  { group: 'market', action: 'Look closer at a game', keys: '[Click] it', pad: '[A]', touch: 'Tap' },
  { group: 'market', action: 'Buy it', keys: k('buy'), pad: pad('buy'), touch: touch('buy') },
  { group: 'market', action: 'Haggle (once a day per copy)', keys: k('haggle'), pad: pad('haggle'), touch: touch('haggle') },
  // The haggle panel reads its own digits and Enter (`ui/market/HagglePanel`).
  { group: 'market', action: 'Haggle: pick an offer, take their price', keys: '{Digit1}–{Digit3}, {Enter}' },
  { group: 'market', action: 'Hold it for the day', keys: k('holdCopy') },
  { group: 'market', action: 'Swap one of yours for it', keys: k('swap') },
  { group: 'market', action: 'Open it (fakes show inside)', keys: k('lookInside'), pad: pad('lookInside'), touch: touch('lookInside') },
  { group: 'market', action: 'Hand back what you just bought', keys: `${k('handBack')} within a few seconds` },
  { group: 'market', action: 'Read titles and prices from the aisle', keys: `Hold ${k('readStalls')}` },
  { group: 'market', action: 'Wanted cards, private sales, the club, your reputation', keys: '[Click] the notice board', pad: '[A]', touch: 'Tap' },
  { group: 'market', action: 'Sell your games', keys: '[Click] the WE BUY desk', pad: '[A]', touch: 'Tap' },
  { group: 'market', action: 'Order by mail', keys: '[Click] the mail-order counter', pad: '[A]', touch: 'Tap' },

  // --- menus (the panels' own keys, `ui/menu/MenuNav`: not rebindable) --------------------------------
  { group: 'menus', action: 'Move between buttons', keys: '[↑] [↓]', pad: '[D-pad]' },
  { group: 'menus', action: 'Pick', keys: '[Enter] or [Click]', pad: '[A]', touch: 'Tap' },
  { group: 'menus', action: 'Back, close a panel', keys: '[Esc]', pad: '[B]', touch: '[Close]' },
  { group: 'menus', action: 'Switch tabs', keys: '[←] [→]', pad: '[D-pad ←] [D-pad →]', touch: 'Tap the tab' },
  { group: 'menus', action: 'Resume', keys: '[Enter] on Resume, or [Click] outside', pad: '[Start]', touch: '[Resume]' },
];

/** Keys that cannot take another action (the menus and the browser own them). */
export const RESERVED_KEYS = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);
