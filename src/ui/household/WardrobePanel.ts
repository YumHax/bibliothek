import { OUTFITS, type OutfitFacts, type OutfitId } from '@/household/outfits';
import { escapeHtml } from '../html';
import { ModalPanel } from '../ModalPanel';
import './household.css';

export interface WardrobeDeps {
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
export class WardrobePanel extends ModalPanel {
  private readonly card: HTMLElement;

  constructor(container: HTMLElement, private readonly deps: WardrobeDeps) {
    super(container, { className: 'ui-modal--centre household-panel' });
    this.root.innerHTML = `<article class="household-panel__card ui-card" role="dialog" aria-modal="true" aria-label="The wardrobe"></article>`;
    this.card = this.root.querySelector('.household-panel__card')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) return this.close();
      const wear = target.closest<HTMLButtonElement>('button[data-action="wear"]');
      if (wear?.dataset.id) {
        this.deps.wear(wear.dataset.id as OutfitId);
        this.paint();
      }
    });
  }

  protected onOpened(): void {
    this.paint();
  }

  private paint(): void {
    const facts = this.deps.facts();
    const worn = this.deps.worn();
    const rows = OUTFITS.map((outfit) => {
      const open = outfit.unlocked(facts);
      const action = outfit.id === worn && open ? '<span class="household-panel__tag">Wearing</span>'
        : open ? `<button type="button" class="ui-btn" data-action="wear" data-id="${outfit.id}">Put it on</button>`
        : '<span class="household-panel__tag household-panel__tag--locked">Not yet</span>';
      const perk = outfit.perk ? `<small class="household-panel__perk">${escapeHtml(outfit.perk)}</small>` : '';
      const earn = open ? '' : `<small>${escapeHtml(outfit.earn)}</small>`;
      return `<li class="${open ? '' : 'household-panel__row--locked'}"><span>${escapeHtml(outfit.name)}<small>${escapeHtml(outfit.look)}</small>${perk}${earn}</span>${action}</li>`;
    }).join('');
    this.card.innerHTML = `
      <header><h2>The wardrobe</h2></header>
      <p class="household-panel__dim">What you wear goes out with you. Each outfit helps in one place.</p>
      <ul class="household-panel__rows">${rows}</ul>
      <footer><button type="button" class="ui-btn" data-action="close" data-autofocus>Close the doors</button></footer>`;
  }
}
