/**
 * Alternative input devices. Everything here talks to the rest of the app through `Input`
 * (virtual holds / presses), `FirstPersonController.applyLook` and `SyntheticMouse` (DOM mouse
 * events), so the Session, Interactor and Inspector need no knowledge of gamepads or touch.
 */
export { GamepadInput, GAMEPAD_BUTTON_CODES, type GamepadOptions } from './Gamepad';
export { TouchControls, DEFAULT_TOUCH_BUTTONS, type TouchButton, type TouchControlsOptions } from './TouchControls';
export { SyntheticMouse, type MouseButton } from './SyntheticMouse';
export { isTouchDevice, watchForTouch } from './deviceDetect';
