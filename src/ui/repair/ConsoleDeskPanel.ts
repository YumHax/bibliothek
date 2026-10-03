import { getPlatform } from '@/catalog/platforms';
import { CONFIRM_MS } from '@/economy/pricing';
import type { NoticeActions } from '@/notices';
import { FAULTS, resaleOf } from '@/repair/consoles';
import type { Workshop } from '@/repair/Workshop';
import { playCoins } from '@/audio/coins';
import { escapeHtml } from '../html';
import { ModalPanel } from '../ModalPanel';
import './repair.css';

export interface ConsoleDeskDeps {
  workshop: Workshop;
  wallet: { earnCoins(coins: number): void };
  notices: NoticeActions;
}

/**
 * TV REPAIR's counter for consoles (docs/household.md "Repairing a console"): the working consoles the player mended
 * at home, with what the repairer pays for each (`resaleOf`); two clicks sell one (the first arms the row). The broken
 * ones still at home are listed for what they are, nothing more. A `ModalLike` opened by the card on the counter.
 */
export class ConsoleDeskPanel extends ModalPanel {
  private readonly card: HTMLElement;
  private armed: { id: string; until: number } | null = null;
  private message = '';

  constructor(container: HTMLElement, private readonly deps: ConsoleDeskDeps) {
    super(container, { className: 'ui-modal--centre repair-panel' });
    this.root.innerHTML = '<article class="repair ui-card" role="dialog" aria-modal="true" aria-label="Consoles bought"></article>';
    this.card = this.root.querySelector('.repair')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('[data-action="close"]')) return this.close();
      const id = target.closest<HTMLButtonElement>('button[data-action="sell"]')?.dataset.id;
      if (id) this.sell(id);
    });
    deps.workshop.subscribe(() => {
      if (this.isOpen) this.render();
    });
  }

  protected onOpened(): void {
    this.armed = null;
    this.message = '';
    this.render();
  }

  private sell(id: string): void {
    const now = performance.now();
    if (this.armed?.id !== id || now > this.armed.until) {
      this.armed = { id, until: now + CONFIRM_MS };
      this.render();
      return;
    }
    this.armed = null;
    const item = this.deps.workshop.working.find((c) => c.id === id);
    const coins = this.deps.workshop.sell(id, this.deps.wallet);
    if (coins === null || !item) return;
    playCoins(3);
    const name = getPlatform(item.platform).shortName;
    this.message = `“A working ${name}? Lovely job. There you go.”`;
    this.deps.notices.reward({ title: `Sold the ${name}`, detail: `Mended at home, bought for ${item.paid}.`, coins });
    this.render();
  }

  private render(): void {
    const { workshop } = this.deps;
    const working = workshop.working;
    const broken = workshop.consoles.filter((c) => !c.fixed);
    const now = performance.now();
    const rows = working.map((c) => {
      const price = resaleOf(c.platform);
      const armed = this.armed?.id === c.id && now <= this.armed.until;
      return `<li><span>${escapeHtml(getPlatform(c.platform).name)}<small>Mended at home · bought for ${c.paid} from ${escapeHtml(c.from)}</small></span><button type="button" class="ui-btn" data-action="sell" data-id="${escapeHtml(c.id)}">${armed ? `${price} coins?` : `Sell · ${price}`}</button></li>`;
    }).join('');
    const waiting = broken.length
      ? `<p class="console-desk__dim">Still broken at home: ${broken.map((c) => `a ${escapeHtml(getPlatform(c.platform).shortName)} (${escapeHtml(FAULTS[c.fault].symptom.toLowerCase().replace(/\.$/, ''))})`).join(', ')}. “Bring it in once it works.”</p>`
      : '';
    const body = rows
      ? `<ul class="console-desk__rows">${rows}</ul>`
      : '<p class="console-desk__dim">“I buy consoles that work. Broken ones you fix yourself, at home: the crate by the door has a few, sold as seen.”</p>';
    this.card.innerHTML = `
      <header><h2>TV REPAIR · we buy working consoles</h2></header>
      ${this.message ? `<p class="repair__step">${escapeHtml(this.message)}</p>` : ''}
      ${body}${waiting}
      <footer><button type="button" class="ui-btn" data-action="close" data-autofocus>Close</button></footer>`;
  }
}
