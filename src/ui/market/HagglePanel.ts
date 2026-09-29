import type { Negotiation, OfferKind, Reply } from '@/economy/haggle';
import { OFFER_KINDS } from '@/economy/haggle';
import type { StockItem } from '@/economy/StockItem';
import { playCoins } from '@/audio/coins';
import { actionKeyLabel } from '@/ui/keys';
import { MarketPanel, coinsHtml, escapeHtml, type PanelWallet } from './MarketPanel';

/** How a haggle ended, as the Session hears it. */
export type HaggleOutcome = 'deal' | 'walk' | 'stopped' | 'none';

interface Exchange {
  who: 'you' | 'them';
  text: string;
}

const OFFER_LABEL: Record<OfferKind, string> = { cheeky: 'Cheeky', fair: 'Fair', polite: 'Polite' };
/** What each offer risks, under its button: on an ordinary copy, and on the pride of a stall (a showpiece, an estate copy, a grail), whose seller barely moves. */
const OFFER_RISK: Partial<Record<OfferKind, string>> = { cheeky: 'might offend' };
const PROUD_RISK: Partial<Record<OfferKind, string>> = { cheeky: 'sure to offend', fair: 'might offend' };
const OFFER_LINE: Record<OfferKind, string> = {
  cheeky: 'I’ll give you {price}, cash.',
  fair: 'How about {price}?',
  polite: 'Would you take {price}?',
};

/**
 * Haggling over the copy in hand, as a short exchange with the stallholder: the three offers
 * (keys 1-3), taking their counter-offer (Enter), walking off (Esc or Close: their last word
 * stands for the day). What was said scrolls above, the asking price and the patience left
 * (dots) beside it. The negotiation itself (`Negotiation`) is pure; this panel only talks.
 */
export class HagglePanel extends MarketPanel {
  private item: StockItem | null = null;
  private negotiation: Negotiation | null = null;
  private log: Exchange[] = [];
  private insults = 0;
  private outcome: HaggleOutcome = 'none';
  private onDone: ((result: { insults: number; outcome: HaggleOutcome }) => void) | null = null;

  constructor(container: HTMLElement, wallet: PanelWallet) {
    super(container, wallet, { title: 'Haggle', className: 'haggle' });
  }

  /** Sets up the haggle over `item`; the Session opens the panel next. */
  start(options: { item: StockItem; negotiation: Negotiation; stall: string; onClose: (result: { insults: number; outcome: HaggleOutcome }) => void }): void {
    this.item = options.item;
    this.negotiation = options.negotiation;
    this.onDone = options.onClose;
    this.insults = 0;
    this.outcome = 'none';
    this.log = [{ who: 'them', text: `${options.item.game.title}? ${options.item.tagPrice} coins, like it says.` }];
    this.setTitle(`Haggling at ${options.stall}`, 'Make an offer. Too low and they take offence. Walk off (Esc) or run out of patience and their last counter-offer stands for the day.');
  }

  protected render(): void {
    const n = this.negotiation;
    const item = this.item;
    if (!n || !item) return;
    const pips = '●'.repeat(n.patienceLeft) || '—';
    const log = this.log.map((e) => `<p class="haggle__line haggle__line--${e.who}"><b>${e.who === 'you' ? 'You' : 'Stallholder'}</b> ${escapeHtml(e.text)}</p>`).join('');
    const proud = item.source === 'showpiece' || item.source === 'estate' || item.source === 'grail';
    const risks = proud ? PROUD_RISK : OFFER_RISK;
    const offers = OFFER_KINDS.map((kind, i) => {
      // An offer at or over what they ask now would only take their price: greyed, the Take button does that.
      const same = !n.done && n.offerPrice(kind) >= n.asking;
      const risk = !same ? risks[kind] : undefined;
      return `
      <button type="button" class="ui-btn" data-action="offer" data-kind="${kind}" ${n.done || same ? 'disabled' : ''} ${i === 1 ? 'data-autofocus' : ''}>
        <kbd>${i + 1}</kbd> ${OFFER_LABEL[kind]} ${same ? '<small class="haggle__risk">= asking</small>' : coinsHtml(n.offerPrice(kind))}${risk ? ` <small class="haggle__risk">${risk}</small>` : ''}
      </button>`;
    }).join('');
    const canTake = !n.done && n.asking < n.tag;
    this.body.innerHTML = `
      <div class="haggle__deal">
        <div class="haggle__what">
          <span class="catalogue__title">${escapeHtml(item.game.title)}</span>
          <span class="catalogue__meta">tag ${item.tagPrice} · asking ${n.done ? Math.round(n.factor * n.tag) : n.asking} coins${n.swayShare > 0 ? ` · in your favour today: ${Math.round(n.swayShare * 100)} %` : ''}</span>
        </div>
        <div class="haggle__patience" title="Patience left">${n.done ? '' : `patience <span>${pips}</span>`}</div>
      </div>
      <div class="haggle__log">${log}</div>
      <div class="haggle__offers">
        ${offers}
        <button type="button" class="ui-btn ui-btn--primary" data-action="take" ${canTake ? '' : 'disabled'}><kbd>Enter</kbd> Take ${n.asking}</button>
        ${n.done ? `<button type="button" data-action="close" class="ui-btn ui-btn--primary haggle__back">Back to the stall</button>` : ''}
      </div>`;
    const logEl = this.body.querySelector('.haggle__log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  protected onAction(action: string, el: HTMLElement): void {
    if (action === 'offer' && el.dataset.kind) this.offer(el.dataset.kind as OfferKind);
    else if (action === 'take') this.take();
  }

  protected onKey(e: KeyboardEvent): void {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
    if (i >= 0) this.offer(OFFER_KINDS[i % 3]!);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (this.negotiation?.done) this.close();
      else this.take();
    }
  }

  protected onClosed(): void {
    const n = this.negotiation;
    if (n && !n.done && this.outcome !== 'none') {
      n.abandon();
      this.outcome = 'stopped';
    }
    const done = this.onDone;
    this.onDone = null;
    done?.({ insults: this.insults, outcome: this.outcome });
  }

  private offer(kind: OfferKind): void {
    const n = this.negotiation;
    if (!n || n.done || n.offerPrice(kind) >= n.asking) return;
    this.log.push({ who: 'you', text: OFFER_LINE[kind].replace('{price}', `${n.offerPrice(kind)}`) });
    this.answer(n.offer(kind));
  }

  private take(): void {
    const n = this.negotiation;
    if (!n || n.done || n.asking >= n.tag) return;
    this.log.push({ who: 'you', text: `Go on, ${n.asking} it is.` });
    this.answer(n.acceptCounter());
  }

  private answer(reply: Reply): void {
    this.log.push({ who: 'them', text: reply.line });
    if (reply.kind === 'accept') {
      this.outcome = 'deal';
      playCoins(1, 0.06);
    } else {
      this.outcome = reply.kind === 'walk' ? 'walk' : 'stopped';
      if (reply.insulted) this.insults++;
    }
    this.setStatus(reply.kind === 'accept' ? `Deal: ${reply.price} coins. ${actionKeyLabel('buy')} at the stall to pay.` : reply.kind === 'walk' ? `Out of patience: ${reply.price} coins stands for today.` : '');
    this.refresh();
  }
}
