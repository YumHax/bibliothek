/**
 * Places on the HUD that several parts share, as one flex column each, so what they put there stacks
 * instead of overlapping by hand-set offsets (`order` in the CSS sets who is on top):
 * - `crosshair`: under the crosshair, the hover caption, then the click's reaction, then the touch
 *   "rotating" badge;
 * - `top-left`: the wallet chip, then the tips.
 * Made on first use, in `container`.
 */
export type HudSlot = 'crosshair' | 'top-left';

const slots = new Map<HudSlot, HTMLDivElement>();

export function hudSlot(container: HTMLElement, slot: HudSlot): HTMLDivElement {
  let el = slots.get(slot);
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = `hud-slot hud-slot--${slot}`;
    container.appendChild(el);
    slots.set(slot, el);
  }
  return el;
}
