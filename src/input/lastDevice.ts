import { Listeners } from '@/core/Listeners';

/** The device the player's hands are on: the keyboard and mouse, a controller, a touchscreen. */
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
let device: InputDevice = coarse ? 'touch' : 'keyboard';
const listeners = new Listeners<[device: InputDevice]>();
/** Mouse travel under the pointer lock (px) that says the hand is back on the mouse. */
const MOUSE_TRAVEL_PX = 40;

/**
 * The device last used, whatever the room's entry mode (`PointerLockFlow`'s `input-*` class says how the
 * room was entered, not what is in hand now): a real key or mouse button, a controller button or stick
 * (`GamepadInput` calls `noteDevice`), a finger. What every "click / press A / tap" line and key cap reads.
 */
export function lastDevice(): InputDevice {
  return device;
}

/** Says which device was just used (the controller, whose presses reach the page as virtual ones). */
export function noteDevice(used: InputDevice): void {
  if (used === device) return;
  device = used;
  listeners.emit(used);
}

/** Calls `listener` whenever the device in hand changes; returns the unsubscribe. */
export function onDeviceChange(listener: (device: InputDevice) => void): () => void {
  return listeners.add(listener);
}

if (typeof window !== 'undefined') {
  // Capture phase: heard before any handler that might act on the device (a caption redrawn, a lock asked for).
  window.addEventListener('keydown', (e) => e.isTrusted && noteDevice('keyboard'), true);
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.isTrusted) return;
      noteDevice(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'keyboard');
    },
    true,
  );
  // Moving the mouse under the pointer lock is using it again (a nudge of the desk is not: past a few pixels in a row).
  let travel = 0;
  let lastMove = 0;
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!e.isTrusted || device === 'keyboard' || !document.pointerLockElement) {
        travel = 0;
        return;
      }
      // Travel counts within one movement: a pause of a quarter second starts it again, so jitter never adds up.
      if (e.timeStamp - lastMove > 250) travel = 0;
      lastMove = e.timeStamp;
      travel += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (travel > MOUSE_TRAVEL_PX) {
        travel = 0;
        noteDevice('keyboard');
      }
    },
    true,
  );
}
