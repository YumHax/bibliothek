import { primaryCode, type ActionId } from '@/input/actions';
import { escapeHtml } from './html';

/**
 * Key names as the player's keyboard prints them. The game reads physical `KeyboardEvent.code`s,
 * which may be rebound (`Input.setBindings`); a label follows both the binding (which physical key
 * does it now) and the layout (`navigator.keyboard.getLayoutMap()` where the browser has it, so
 * `KeyW` reads Z on AZERTY). Without the layout API the QWERTY name is shown.
 */

const NAMES: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: '⌫',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  MetaLeft: '⌘', MetaRight: '⌘', CapsLock: 'Caps',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Backquote: '`',
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', IntlBackslash: '<',
};

let resolvePhysical: (code: string) => string = (code) => code;
let layout: ReadonlyMap<string, string> | null = null;
const listeners = new Set<() => void>();

interface KeyboardLayoutApi {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
}

/** Wires the labels to the input's bindings and asks the browser for the keyboard layout. Call once. */
export function initKeyLabels(input: { physicalFor(code: string): string }): void {
  resolvePhysical = (code) => input.physicalFor(code);
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard;
  keyboard
    ?.getLayoutMap()
    .then((map) => {
      layout = map;
      keyLabelsChanged();
    })
    .catch(() => {});
}

/** Re-renders whatever shows key names (after a rebinding). */
export function keyLabelsChanged(): void {
  for (const cb of listeners) cb();
}

export function onKeyLabelsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The printed name of a physical key. */
export function physicalKeyLabel(physical: string): string {
  const printed = layout?.get(physical);
  if (printed && printed.trim()) return printed.length === 1 ? printed.toUpperCase() : printed;
  if (NAMES[physical]) return NAMES[physical]!;
  if (/^Key[A-Z]$/.test(physical)) return physical.slice(3);
  if (/^Digit\d$/.test(physical)) return physical.slice(5);
  if (/^Numpad\d$/.test(physical)) return `Num ${physical.slice(6)}`;
  return physical;
}

/** The name of the key that does what the game reads as `code`. */
export function keyLabel(code: string): string {
  return physicalKeyLabel(resolvePhysical(code));
}

/** The name of the key that does `id` (see `input/actions`), for plain-text hints: "E to walk away". */
export function actionKeyLabel(id: ActionId): string {
  return keyLabel(primaryCode(id));
}

/**
 * Mini-markup for control hints: `{KeyW}` is a key code (named by `keyLabel`), `[Click]` a literal
 * key cap, anything else plain text. Returns trusted HTML.
 */
export function renderKeys(markup: string): string {
  return markup
    .split(/(\{[A-Za-z0-9]+\}|\[[^\]]+\])/)
    .map((part) => {
      if (part.startsWith('{') && part.endsWith('}')) return `<kbd>${escapeHtml(keyLabel(part.slice(1, -1)))}</kbd>`;
      if (part.startsWith('[') && part.endsWith(']')) return `<kbd>${escapeHtml(part.slice(1, -1))}</kbd>`;
      return escapeHtml(part);
    })
    .join('');
}
