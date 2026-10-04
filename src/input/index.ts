/**
 * Alternative input devices. Everything here talks to the rest of the app through `Input`
 * (virtual holds / presses), `FirstPersonController.applyLook` and `SyntheticMouse` (DOM mouse
 * events), so the Session, Interactor and Inspector need no knowledge of gamepads or touch.
 */
export { GamepadInput,   } from './Gamepad';
export { TouchControls,    } from './TouchControls';
export { SyntheticMouse,  } from './SyntheticMouse';
export {  PAD_ALIASES,  primaryCode,  } from './actions';
