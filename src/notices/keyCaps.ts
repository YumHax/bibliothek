/**
 * A key written in a notice: `[E]`, `[Click]`, `[Right-click]`, `[Space]` (the key's label from `ui/keys`'
 * `actionKeyLabel`, or the verb from `ui/verb`, in square brackets) is drawn as a key cap, so the eye finds the key
 * before the sentence. The convention is the prompts' and the tips' (docs/notices.md).
 */
const CAP = /\[([^[\]\n]{1,20})\]/g;

/** Writes `text` into `el`, each `[Key]` as a `<kbd>` cap (the element's children are replaced). */
export function writeWithCaps(el: HTMLElement, text: string): void {
  el.replaceChildren();
  let last = 0;
  for (const m of text.matchAll(CAP)) {
    const at = m.index ?? 0;
    if (at > last) el.append(text.slice(last, at));
    const kbd = document.createElement('kbd');
    kbd.className = 'notice-cap';
    kbd.textContent = m[1]!;
    el.append(kbd);
    last = at + m[0].length;
  }
  if (last < text.length) el.append(text.slice(last));
}
