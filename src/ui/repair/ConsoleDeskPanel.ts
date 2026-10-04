import { getPlatform } from '@/catalog/platforms';
import type { NoticeActions } from '@/notices';
import { FAULTS, resaleOf } from '@/repair/consoles';
import type { Workshop } from '@/repair/Workshop';
import { playCoins } from '@/audio/coins';
import { Arming } from '../confirmTwice';
import { CardPanel } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { formatCoins } from '@/text/money';
import './repair.css';

interface ConsoleDeskDeps {
  workshop: Workshop;
  wallet: { earnCoins(coins: number): void };
  notices: NoticeActions;
}

/**
 * TV REPAIR's counter for consoles (docs/household.md "Repairing a console"): the working consoles the player mended
 * at home, with what the repairer pays for each (`resaleOf`); two clicks sell one (`confirmTwice`). The broken
 * ones still at home are listed for what they are, nothing more. A `ModalLike` opened by the card on the counter.
 */
export class ConsoleDeskPanel extends CardPanel {
  private readonly arming = new Arming(() => this.refresh());
  private message = '';

  constructor(container: HTMLElement, private readonly deps: ConsoleDeskDeps) {
    super(container, { className: 'repair-panel', cardClass: 'repair ui-card', title: 'TV REPAIR · we buy working consoles', label: 'Consoles bought', dismissAutofocus: true });
    deps.workshop.subscribe(() => {
      if (this.isOpen) this.refresh();
    });
  }

  protected override onOpened(): void {
    this.arming.reset();
    this.message = '';
    super.onOpened();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'sell' && el.dataset.id) this.sell(el.dataset.id);
  }

  private sell(id: string): void {
    if (!this.arming.press(id)) return;
    const item = this.deps.workshop.working.find((c) => c.id === id);
    const coins = this.deps.workshop.sell(id, this.deps.wallet);
    if (coins === null || !item) return;
    playCoins(3);
    const name = getPlatform(item.platform).shortName;
    this.message = `“A working ${name}? Lovely job. There you go.”`;
    this.deps.notices.reward({ title: `Sold the ${name}`, detail: `Mended at home, bought for ${item.paid}.`, coins });
    this.refresh();
  }

  protected render(): Html {
    const { workshop } = this.deps;
    const working = workshop.working;
    const broken = workshop.consoles.filter((c) => !c.fixed);
    const rows = working.map((c) => {
      const price = resaleOf(c.platform);
      const armed = this.arming.isArmed(c.id);
      return html`<li><span>${getPlatform(c.platform).name}<small>Mended at home · bought for ${c.paid} from ${c.from}</small></span><button type="button" class="ui-btn" data-action="sell" data-id="${c.id}">${armed ? `${formatCoins(price)}?` : `Sell · ${price}`}</button></li>`;
    });
    const waiting = broken.length
      ? html`<p class="console-desk__dim">Still broken at home: ${broken.map((c) => `a ${getPlatform(c.platform).shortName} (${FAULTS[c.fault].symptom.toLowerCase().replace(/\.$/, '')})`).join(', ')}. “Bring it in once it works.”</p>`
      : '';
    const body = rows.length
      ? html`<ul class="console-desk__rows">${rows}</ul>`
      : html`<p class="console-desk__dim">“I buy consoles that work. Broken ones you fix yourself, at home: the crate by the door has a few, sold as seen.”</p>`;
    return html`${this.message ? html`<p class="repair__step">${this.message}</p>` : ''}${body}${waiting}`;
  }
}
