import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { StockItem } from '@/economy/StockItem';
import { escapeHtml } from '../html';
import { ModalPanel } from '../ModalPanel';
import './household.css';

/** What the phone reaches: the market's stalls (which know the player), and the friends. */
export interface PhoneDeps {
  /** Whether the market answers now; the line when it does not ("They open at 8:00"). */
  marketOpen(): boolean;
  closedLine(): string;
  /** 0 (a stranger) .. 3 at a platform's stall, and its name ("Regular"). */
  loyalty(platform: PlatformId): number;
  loyaltyName(platform: PlatformId): string;
  /** From this loyalty on a stall puts a copy aside for the player over the phone. */
  regularFrom: number;
  /** Today's stock (owned copies left out). */
  todays(): Promise<readonly StockItem[]>;
  /** What holding `item` costs, and holding it: null once done, else why not. */
  deposit(item: StockItem): number;
  hold(item: StockItem): string | null;
  /** The friends, and asking one round: the line said. Absent (until `setFriends`): no friends' page. */
  friends?: PhoneFriends;
}

/** The friends as the phone reaches them (the flat's `Visitors`, made after the panels). */
export interface PhoneFriends {
  list(): readonly { id: string; name: string; note: string; free: boolean }[];
  invite(id: string): string;
}

/** How long a stall on the line waits for its prices to settle before reading its table out, ms. */
const PRICING_WAIT_MS = 4000;

/** Copies a stall can put aside: not the bargain bin, not a grail (its seller keeps it on show), not already held or ordered. */
const holdable = (item: StockItem) => item.source !== 'bin' && item.source !== 'grail' && !item.reserved && item.priced;

/**
 * The phone on the nightstand: ring round the market's stalls that know the player (a regular's
 * stallholder reads out what is on the table today and puts a copy aside for the deposit, as if
 * the player had held it at the stall), or ask a friend round. A `ModalLike` opened by the phone.
 */
export class PhonePanel extends ModalPanel {
  private readonly card: HTMLElement;
  private stall: PlatformId | null = null;
  /** The copies the stall on the line read out. */
  private items: readonly StockItem[] = [];
  private message = '';
  private friends: PhoneFriends | undefined;

  constructor(container: HTMLElement, private readonly deps: PhoneDeps) {
    super(container, { className: 'ui-modal--centre household-panel' });
    this.root.innerHTML = `<article class="household-panel__card ui-card" role="dialog" aria-modal="true" aria-label="The phone"></article>`;
    this.card = this.root.querySelector('.household-panel__card')!;
    this.friends = deps.friends;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) return this.close();
      const button = target.closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === 'stall' && id) void this.callStall(id as PlatformId);
      else if (action === 'back') this.showHome();
      else if (action === 'hold' && id) this.hold(id);
      else if (action === 'invite' && id) this.invite(id);
    });
  }

  /** The friends' page, once the flat's visitors exist. */
  setFriends(friends: PhoneFriends): void {
    this.friends = friends;
  }

  protected onOpened(): void {
    this.message = '';
    this.showHome();
  }

  /** The address book: the stalls that know the player, the friends. */
  private showHome(): void {
    this.stall = null;
    const { deps } = this;
    const stalls = PLATFORM_LIST.filter((p) => deps.loyalty(p.id) >= deps.regularFrom);
    const market = !deps.marketOpen()
      ? `<p class="household-panel__dim">${escapeHtml(deps.closedLine())}</p>`
      : stalls.length
        ? `<div class="household-panel__list">${stalls.map((p) => `<button type="button" class="ui-btn" data-action="stall" data-id="${p.id}">The ${escapeHtml(p.shortName)} stall <span class="household-panel__tag">${escapeHtml(deps.loyaltyName(p.id))}</span></button>`).join('')}</div>`
        : '<p class="household-panel__dim">No stallholder knows you well enough yet to put a copy aside over the phone. Buy at a stall a few times: regulars get the number.</p>';
    const friends = this.friends?.list() ?? [];
    const people = this.friends
      ? `<h3>Friends</h3><div class="household-panel__list">${friends.map((f) => `<button type="button" class="ui-btn" data-action="invite" data-id="${escapeHtml(f.id)}" ${f.free ? '' : 'disabled'}>Ask ${escapeHtml(f.name)} round <span class="household-panel__tag">${escapeHtml(f.note)}</span></button>`).join('')}</div>`
      : '';
    this.paint(`<h3>The market</h3>${market}${people}`);
  }

  /** A stall picks up: what is on its table today that it could put aside. */
  private async callStall(platform: PlatformId, keepMessage = false): Promise<void> {
    this.stall = platform;
    if (!keepMessage) this.message = '';
    const name = PLATFORM_LIST.find((p) => p.id === platform)?.shortName ?? platform;
    this.paint(`<h3>The ${escapeHtml(name)} stall</h3><p class="household-panel__dim">Ringing…</p>`, true);
    const onStall = (await this.deps.todays()).filter((item) => item.game.platform === platform);
    // The stallholder looks the prices up first (a few seconds at most; what is still unpriced is not offered).
    await Promise.race([Promise.all(onStall.map((item) => item.settled)), new Promise((resolve) => window.setTimeout(resolve, PRICING_WAIT_MS))]);
    const items = onStall.filter(holdable);
    if (this.stall !== platform || !this.isOpen) return;
    this.items = items;
    const rows = items.slice(0, 8).map((item, i) => `
      <li><span>${escapeHtml(item.game.title)}<small>${escapeHtml(stateOf(item))} · ${item.price} coins</small></span>
      <button type="button" class="ui-btn" data-action="hold" data-id="${i}">Put it aside (${this.deps.deposit(item)} down)</button></li>`).join('');
    this.paint(`<h3>The ${escapeHtml(name)} stall</h3>
      <p class="household-panel__dim">“Oh, it’s you! Here’s what I’ve got on the table today.”</p>
      ${rows ? `<ul class="household-panel__rows">${rows}</ul>` : '<p class="household-panel__dim">“Nothing I could put by, sorry. Come and see.”</p>'}`, true);
  }

  private hold(index: string): void {
    const item = this.items[Number(index)];
    if (!item || this.stall === null) return;
    const why = this.deps.hold(item);
    this.message = why ?? `“${item.game.title}, under the table for you till closing. ${item.due} to pay when you come by.”`;
    void this.callStall(this.stall, true);
  }

  private invite(id: string): void {
    if (!this.friends) return;
    this.message = this.friends.invite(id);
    this.showHome();
  }

  private paint(body: string, back = false): void {
    const message = this.message ? `<p class="household-panel__message">${escapeHtml(this.message)}</p>` : '';
    this.card.innerHTML = `
      <header><h2>☎ The phone</h2></header>
      ${message}${body}
      <footer>
        ${back ? '<button type="button" class="ui-btn" data-action="back">Hang up</button>' : ''}
        <button type="button" class="ui-btn" data-action="close" data-autofocus>Put it down</button>
      </footer>`;
  }
}

function stateOf(item: StockItem): string {
  return item.condition === 'complete' ? 'complete' : item.condition === 'noManual' ? 'no manual' : 'worn';
}
