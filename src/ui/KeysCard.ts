import './KeysCard.css';
import type { Updatable } from '@/core/Engine';
import { primaryCode } from '@/input/actions';
import { lastDevice } from '@/input/lastDevice';
import { CONTROLS, type ControlHint } from './controls';
import { renderKeys } from './keys';
import { html, paint, raw } from './panel/html';

/** What the player is doing, as the Session says it (`Session.handsContext`). */
type HandsContext = 'arcade' | 'market' | 'held' | 'seated' | 'room' | 'furnishing';

/** The card's title and the help lines it shows, per context (the help's table, `ui/controls`, filtered). */
const PICKS: Partial<Record<HandsContext, { title: string; pick: (line: ControlHint) => boolean }>> = {
  held: { title: 'A game in hand', pick: (line) => line.whileHolding === true },
  furnishing: { title: 'Carrying a piece', pick: (line) => line.action.startsWith('Carrying it') },
  seated: { title: 'Sitting', pick: (line) => /^(Look around|Sleep|Call the cat|Put down the card|Pause)/.test(line.action) },
  // Hands free: the keys of the room (the lines that name a key, not "click it"), the moves first.
  room: { title: 'Keys', pick: (line) => line.group === 'room' && !line.whileHolding && !line.action.startsWith('Carrying it') && /\{|\[Mouse\]/.test(line.keys) },
};

/**
 * THE KEYS CARD: while H is held in the room (`keysCard`), a card in the middle of the view lists the keys for what the
 * player is doing right now (a game in hand, a piece carried, seated, hands free), on the device last used. Let go of H,
 * it goes. Not at a stall with a copy in hand (H haggles there), nor at a machine, nor in photo mode (its own help).
 */
export class KeysCard implements Updatable {
  private readonly el: HTMLDivElement;
  private shownFor: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly input: { isDown(...codes: string[]): boolean },
    /** What the hands are on, or null when the card may not show (out of the room, a panel up, photo mode). */
    private readonly context: () => HandsContext | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'keys-card ui-card';
    this.el.hidden = true;
    this.el.setAttribute('role', 'note');
    container.appendChild(this.el);
  }

  update(): void {
    const context = this.input.isDown(primaryCode('keysCard')) ? this.context() : null;
    const pick = context ? PICKS[context] : undefined;
    const key = pick ? `${context}:${lastDevice()}` : null;
    if (key === this.shownFor) return;
    this.shownFor = key;
    if (!pick) {
      this.el.hidden = true;
      return;
    }
    const device = lastDevice();
    const rows = CONTROLS.filter(pick.pick).flatMap((line) => {
      const keys = device === 'gamepad' ? line.pad : device === 'touch' ? line.touch : line.keys;
      return keys === undefined ? [] : [html`<li>${line.action}<span class="keys-card__keys">${raw(renderKeys(keys))}</span></li>`];
    });
    paint(this.el, html`<h2 class="keys-card__title">${pick.title}</h2><ul class="keys-card__list">${rows}</ul>`);
    this.el.hidden = false;
  }
}
