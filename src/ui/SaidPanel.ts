import { saidLines } from '@/notices/speechLog';
import { CardPanel } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { emptyState } from './panel/widgets';
import './SaidPanel.css';

/**
 * "What was said": the last lines people said to the player, newest first, with who said them, to read again
 * what went by too fast (the pause menu's button). A `ModalLike` the Session opens through `openPanel`.
 */
export class SaidPanel extends CardPanel {
  constructor(container: HTMLElement) {
    super(container, { className: 'said-panel', title: 'What was said', dismissAutofocus: true });
  }

  protected render(): Html {
    const lines = saidLines();
    if (!lines.length) return emptyState('Nobody has said anything to you yet.', 'said-panel__empty');
    return html`<ol class="said-panel__lines">${lines.map(
      (line) => html`<li>${line.name ? html`<b class="said-panel__who">${line.name}</b> ` : ''}<span>${line.text}</span></li>`,
    )}</ol>`;
  }
}
