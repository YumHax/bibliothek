/** Standard mapping (https://w3c.github.io/gamepad/#remapping): button index → `Input` press code. */
export const GAMEPAD_BUTTON_CODES = [
  'GamepadA', 'GamepadB', 'GamepadX', 'GamepadY',
  'GamepadLB', 'GamepadRB', 'GamepadLT', 'GamepadRT',
  'GamepadSelect', 'GamepadStart', 'GamepadLS', 'GamepadRS',
  'GamepadUp', 'GamepadDown', 'GamepadLeft', 'GamepadRight', 'GamepadHome',
] as const;

export type PadButton = (typeof GAMEPAD_BUTTON_CODES)[number];

/** How the controls help names a button (inside a `[...]` key cap). */
export const PAD_LABELS: Readonly<Record<PadButton, string>> = {
  GamepadA: 'A', GamepadB: 'B', GamepadX: 'X', GamepadY: 'Y',
  GamepadLB: 'LB', GamepadRB: 'RB', GamepadLT: 'LT', GamepadRT: 'RT',
  GamepadSelect: 'Select', GamepadStart: 'Start', GamepadLS: 'Left stick', GamepadRS: 'Right stick',
  GamepadUp: 'D-pad ↑', GamepadDown: 'D-pad ↓', GamepadLeft: 'D-pad ←', GamepadRight: 'D-pad →', GamepadHome: 'Home',
};
