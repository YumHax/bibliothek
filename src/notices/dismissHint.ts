import { lastDevice, onDeviceChange } from '@/input/lastDevice';
import { ACTIONS } from '@/input/actions';
import { PAD_LABELS } from '@/input/padButtons';
import { actionKeyLabel, onKeyLabelsChange } from '@/ui/keys';

/**
 * The small "✕ X put down" line on a card or a tip: how to put it away with the device in hand (the
 * `dismissNotice` key on the keyboard, its button held on a controller, a tap on a touchscreen).
 */
export function fillDismissHint(el: HTMLElement): void {
  const device = lastDevice();
  const cap = document.createElement('kbd');
  el.replaceChildren();
  if (device === 'touch') {
    el.append('✕ tap to put down');
    return;
  }
  if (device === 'gamepad') {
    cap.textContent = PAD_LABELS[ACTIONS.dismissNotice.padHold];
    el.append('✕ hold ', cap, ' put down');
    return;
  }
  cap.textContent = actionKeyLabel('dismissNotice');
  el.append('✕ ', cap, ' put down');
}

/** Refills every hint under `root` when the device in hand or the key changes; returns the unsubscribe. */
export function followDismissHints(root: HTMLElement): () => void {
  const refill = () => root.querySelectorAll<HTMLElement>('.notice-dismiss').forEach(fillDismissHint);
  const offDevice = onDeviceChange(refill);
  const offKeys = onKeyLabelsChange(refill);
  return () => {
    offDevice();
    offKeys();
  };
}

/** A new hint line for a card or tip. */
export function dismissHint(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'notice-dismiss';
  fillDismissHint(el);
  return el;
}

/**
 * A click or tap on `el` (the pointer free, or a finger) runs `put`: the card or tip goes. The press stops there, so
 * it neither looks round nor enters the room under it.
 */
export function closeOnPress(el: HTMLElement, put: () => void): void {
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    put();
  });
  el.addEventListener('click', (e) => e.stopPropagation());
}
