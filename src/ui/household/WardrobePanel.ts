import { OUTFITS, type OutfitFacts, type OutfitId } from '@/household/outfits';
import { CardPanel } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import './household.css';

interface WardrobeDeps {
  /** What the unlocks are judged on, now. */
  facts(): OutfitFacts;
  worn(): OutfitId;
  wear(id: OutfitId): void;
}

/**
 * The wardrobe's rail: every outfit with what it does, the one worn marked, the others to put on
 * or, not earned yet, how to earn them. What is worn stays on until changed. A `ModalLike` opened
 * from inside the wardrobe.
 */
export class WardrobePanel extends CardPanel {
  constructor(container: HTMLElement, private readonly deps: WardrobeDeps) {
    super(container, { className: 'household-panel', cardClass: 'household-panel__card ui-card', title: 'The wardrobe', dismiss: 'Close the doors', dismissAutofocus: true });
  }

  protected render(): Html {
    const facts = this.deps.facts();
    const worn = this.deps.worn();
    const rows = OUTFITS.map((outfit) => {
      const open = outfit.unlocked(facts);
      const action = outfit.id === worn && open
        ? html`<span class="household-panel__tag">Wearing</span>`
        : open
          ? html`<button type="button" class="ui-btn" data-action="wear" data-id="${outfit.id}">Put it on</button>`
          : html`<span class="household-panel__tag household-panel__tag--locked">Not yet</span>`;
      const perk = outfit.perk ? html`<small class="household-panel__perk">${outfit.perk}</small>` : '';
      const earn = open ? '' : html`<small>${outfit.earn}</small>`;
      return html`<li class="${open ? '' : 'household-panel__row--locked'}"><span>${outfit.name}<small>${outfit.look}</small>${perk}${earn}</span>${action}</li>`;
    });
    return html`<p class="household-panel__dim">What you wear goes out with you. Each outfit helps in one place.</p>
      <ul class="household-panel__rows">${rows}</ul>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'wear' || !el.dataset.id) return;
    this.deps.wear(el.dataset.id as OutfitId);
    this.refresh();
  }
}
