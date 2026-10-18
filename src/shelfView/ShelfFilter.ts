import './shelfView.css';

interface ShelfFilterOptions {
  /** The words typed so far (empty: nothing looked for). */
  onQuery(query: string): void;
  /** Put down: Enter keeps what it found leaning out, Esc lets them back. */
  onClose(keep: boolean): void;
}

/**
 * What the player is looking for on the bookcase faced (docs/furnishing.md "The bookcase view"): a strip of masking
 * tape with a pencil line, top centre, the words written as they are typed. The keys stay on the field (the room
 * hears none of them); Enter puts it down keeping the boxes that match leaning out, Esc puts them back.
 */
export class ShelfFilter {
  private readonly root: HTMLDivElement;
  private readonly field: HTMLInputElement;

  constructor(container: HTMLElement, private readonly options: ShelfFilterOptions) {
    this.root = document.createElement('div');
    this.root.className = 'shelf-filter';
    this.root.hidden = true;
    const label = document.createElement('label');
    label.className = 'shelf-filter__tape';
    const head = document.createElement('span');
    head.className = 'shelf-filter__head';
    head.textContent = 'Looking for';
    this.field = document.createElement('input');
    this.field.className = 'shelf-filter__field';
    this.field.type = 'text';
    this.field.autocomplete = 'off';
    this.field.spellcheck = false;
    this.field.setAttribute('aria-label', 'Looking for a game on these shelves');
    label.append(head, this.field);
    this.root.append(label);
    container.appendChild(this.root);
    this.field.addEventListener('input', () => this.options.onQuery(this.field.value));
    this.field.addEventListener('keydown', (e) => {
      // The room never hears what is typed here (W would step in, F would open it again).
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.close(true);
      else if (e.code === 'Escape') this.close(false);
    });
    // Clicked away from (the lock lost, another window): put down as it stands.
    this.field.addEventListener('blur', () => this.close(true));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.root.hidden = false;
    this.field.value = '';
    this.field.focus();
  }

  /** Puts the strip away; `keep`: what it found stays leaning out. */
  close(keep: boolean): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.field.blur();
    if (!keep) this.options.onQuery('');
    this.options.onClose(keep);
  }
}
