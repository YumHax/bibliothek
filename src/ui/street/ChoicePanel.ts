import { CardPanel } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import './ChoicePanel.css';

/** One thing to pick: its words, a line under them, and why it cannot be picked now (`unavailable`: shown, not taken). */
interface Choice {
  id: string;
  label: string;
  detail?: string;
  unavailable?: string;
}

/** What a choice is dealt before the Session opens it: the card's title, a line over the list, the choices, who hears the pick. */
interface ChoiceDeal {
  title: string;
  intro?: string;
  choices: readonly Choice[];
  pick(id: string): void;
  /** The dismiss's words ("Not now"). */
  dismiss?: string;
}

/**
 * A small card to pick one of a few things in the street (docs/ui.md "A panel"): where line 38 goes, whom a card in
 * the pillar box is for. Each choice is a button with its line under it; one that cannot be had now stays a focusable
 * button whose press says why in the status line. The pick is heard before the card closes, as `StoragePanel` does.
 */
export class ChoicePanel extends CardPanel {
  private deal: ChoiceDeal | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'choice-panel', cardClass: 'choice-panel__card ui-card', title: 'Choose' });
  }

  /** Deals the choices (call before the Session opens the panel). */
  show(deal: ChoiceDeal): void {
    this.deal = deal;
    this.setTitle(deal.title);
    if (this.isOpen) this.refresh();
  }

  protected override dismissLabel(): string {
    return this.deal?.dismiss ?? 'Not now';
  }

  protected render(): Html {
    const deal = this.deal;
    if (!deal) return html``;
    const rows = deal.choices.map(
      (choice, i) => html`<li><button type="button" class="ui-btn choice-panel__choice" data-action="pick" data-index="${i}"${choice.unavailable ? html` aria-disabled="true"` : ''}${attr('data-autofocus', i === 0)}>
        <span class="choice-panel__label">${choice.label}</span>${choice.detail ? html`<span class="choice-panel__detail">${choice.detail}</span>` : ''}
      </button></li>`,
    );
    return html`${deal.intro ? html`<p class="choice-panel__intro">${deal.intro}</p>` : ''}<ul class="choice-panel__list">${rows}</ul>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'pick' || !this.deal) return;
    const choice = this.deal.choices[Number(el.dataset.index)];
    if (!choice) return;
    if (choice.unavailable) {
      this.setStatus(choice.unavailable, 'info');
      return;
    }
    const pick = this.deal.pick;
    this.deal = null;
    this.close();
    pick(choice.id);
  }
}
