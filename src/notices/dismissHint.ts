import { lastDevice, onDeviceChange } from '@/input/lastDevice';
import { ACTIONS } from '@/input/actions';
import { PAD_LABELS } from '@/input/padButtons';
import { actionKeyLabel, onKeyLabelsChange } from '@/ui/keys';
import { capitalise } from '@/text/strings';

/**
 * The pill at the foot of a card: what the key in hand does to it ("Put down", or "Turn over" while pages
 * are left), with the `dismissNotice` key on the keyboard, its button held on a controller, a tap on a touchscreen.
 */
function fillDismissHint(el: HTMLElement): void {
  const device = lastDevice();
  const verb = el.dataset.verb ?? 'put down';
  const label = document.createElement('span');
  label.className = 'notice-dismiss__verb';
  const cap = document.createElement('kbd');
  el.replaceChildren();
  if (device === 'touch') {
    label.textContent = `Tap to ${verb}`;
    el.append(label);
    return;
  }
  label.textContent = capitalise(verb);
  if (device === 'gamepad') {
    cap.textContent = PAD_LABELS[ACTIONS.dismissNotice.padHold];
    el.append(label, 'hold', cap);
    return;
  }
  cap.textContent = actionKeyLabel('dismissNotice');
  el.append(label, cap);
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

/** A new hint pill for a card or tip ("Put down"). */
export function dismissHint(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'notice-dismiss';
  fillDismissHint(el);
  return el;
}

/** What the key does now: "turn over" while pages are left, "put down" on the last. */
export function setDismissVerb(el: HTMLElement, verb: 'put down' | 'turn over'): void {
  if (el.dataset.verb === verb) return;
  el.dataset.verb = verb;
  fillDismissHint(el);
}

/** A press on a notice is a tap (it puts it away) when the finger or pointer lifts this soon and this near (ms, px). */
const TAP_MS = 400;
const TAP_SLOP = 12;

/**
 * A click or tap on `el` (the pointer free, or a finger) runs `put`: the card or tip goes (or turns its page). It goes
 * on the release of a tap, not on the press: a look-drag of the thumb that happens to start on a slip or a tip card
 * leaves it up, unread no more. The press stops there, so it neither looks round nor enters the room under it.
 */
export function closeOnPress(el: HTMLElement, put: () => void): void {
  let press: { id: number; x: number; y: number; at: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() };
  });
  el.addEventListener('pointerup', (e) => {
    const p = press;
    press = null;
    if (!p || p.id !== e.pointerId) return;
    e.stopPropagation();
    if (performance.now() - p.at <= TAP_MS && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_SLOP) put();
  });
  el.addEventListener('pointercancel', () => (press = null));
  el.addEventListener('click', (e) => e.stopPropagation());
}
