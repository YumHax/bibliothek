import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { StockItem } from '@/economy/StockItem';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import { formatCoins } from '@/text/money';
import { standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import { icon } from '../social/icons';
import { portrait } from '../social/portrait';
import '../social/social.css';
import './household.css';

/** What the phone reaches: the people whose number the player has, the market's stalls (which know the player), the friends. */
interface PhoneDeps {
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
  /** The small ads read in the paper (`classifieds/`): ringing one agrees a visit. Absent: no page. */
  ads?: PhoneAds;
  /** The people whose number the player has (docs/social.md): ringing one opens the conversation. Absent: no page. */
  contacts?: PhoneContacts;
}

/** The address book as the phone reaches it (`social/`). */
export interface PhoneContacts {
  /** Everyone whose number the player has: who, a note (their tier, whether they pick up at this hour). */
  list(): readonly { id: string; name: string; note: string }[];
  /** Rings them: null when they picked up (the conversation opens over the phone), else why not ("Asleep at this hour"). */
  call(id: string): string | null;
}

/** The Gaming Weekly's small ads as the phone reaches them. */
export interface PhoneAds {
  /** The ads read (newest first): who, their words, and the visit agreed with them if any ("today 18:00–22:00"). */
  list(): readonly { id: string; who: string; text: string; booked: string | null }[];
  /** Rings the seller: what they say (a visit agreed). */
  ring(id: string): string;
  /** What to say when no ad was read yet. */
  hint: string;
}

/** The friends as the phone reaches them (the flat's `Visitors`, made after the panels). */
export interface PhoneFriends {
  list(): readonly { id: string; name: string; note: string; free: boolean }[];
  invite(id: string): string;
}

/** What else the phone books (the flat's gatherings: everyone round tonight, the paper for an open house). */
export interface PhoneEvents {
  list(): readonly { id: string; label: string; note: string; enabled: boolean }[];
  /** Asks for it: the line said. */
  call(id: string): string;
}

/** How long a stall on the line waits for its prices to settle before reading its table out, ms. */
const PRICING_WAIT_MS = 4000;

/** Copies a stall can put aside: not the bargain bin, not a grail (its seller keeps it on show), not already held or ordered. */
const holdable = (item: StockItem) => item.source !== 'bin' && item.source !== 'grail' && !item.reserved && item.priced;

/**
 * The phone on the nightstand: ring round the market's stalls that know the player (a regular's
 * stallholder reads out what is on the table today and puts a copy aside for the deposit, as if
 * the player had held it at the stall), or ask a friend round. A `ModalLike` opened by the phone.
 * A stall's page is a sub-page: Hang up, Esc or B go back to the address book; Put it down closes.
 */
export class PhonePanel extends CardPanel {
  private stall: PlatformId | null = null;
  /** The copies the stall on the line read out. */
  private items: readonly StockItem[] = [];
  private message = '';
  /** The page shown: the address book, or a stall on the line. */
  private page: Html = html``;
  private friends: PhoneFriends | undefined;
  private events: PhoneEvents | undefined;

  constructor(container: HTMLElement, private readonly deps: PhoneDeps) {
    super(container, { className: 'household-panel', cardClass: 'household-panel__card ui-card', title: '☎ The phone', label: 'The phone', dismiss: 'Put it down', dismissAutofocus: true });
    this.friends = deps.friends;
  }

  /** The friends' page, once the flat's visitors exist. */
  setFriends(friends: PhoneFriends): void {
    this.friends = friends;
  }

  /** The gatherings' lines, once the flat's visitors exist. */
  setEvents(events: PhoneEvents): void {
    this.events = events;
  }

  protected override onOpened(): void {
    this.message = '';
    this.stall = null;
    this.page = this.homePage();
    super.onOpened();
  }

  protected render(): Html {
    return html`${this.message ? html`<p class="household-panel__message">${this.message}</p>` : ''}${this.page}`;
  }

  protected override actions(): PanelAction[] {
    return this.stall !== null ? [{ action: 'back', label: 'Hang up' }] : [];
  }

  /** On a stall's page, Esc and B hang up instead of putting the phone down. */
  protected override onBack(): boolean {
    if (this.stall === null) return false;
    this.showHome();
    return true;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const { id } = el.dataset;
    if (action === 'stall' && id) void this.callStall(id as PlatformId);
    else if (action === 'back') this.showHome();
    else if (action === 'hold' && id) this.hold(id);
    else if (action === 'invite' && id) this.invite(id);
    else if (action === 'contact' && id && this.deps.contacts) {
      const why = this.deps.contacts.call(id);
      if (why !== null) {
        this.message = why;
        this.showHome();
      }
    } else if (action === 'ad' && id && this.deps.ads) {
      this.message = this.deps.ads.ring(id);
      this.showHome();
    } else if (action === 'event' && id && this.events) {
      this.message = this.events.call(id);
      this.showHome();
    }
  }

  /** The contacts' portraits are drawn canvases: dropped into their slots after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const s = standing(slot.dataset.portrait!);
      slot.appendChild(portrait(slot.dataset.portrait!, 36, tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }

  private showHome(): void {
    this.stall = null;
    this.page = this.homePage();
    this.refresh();
  }

  /** The address book: the stalls that know the player, the friends. */
  private homePage(): Html {
    const { deps } = this;
    const stalls = PLATFORM_LIST.filter((p) => deps.loyalty(p.id) >= deps.regularFrom);
    const market = !deps.marketOpen()
      ? html`<p class="household-panel__dim">${deps.closedLine()}</p>`
      : stalls.length
        ? html`<div class="household-panel__list">${stalls.map((p) => html`<button type="button" class="ui-btn" data-action="stall" data-id="${p.id}">The ${p.shortName} stall <span class="household-panel__tag">${deps.loyaltyName(p.id)}</span></button>`)}</div>`
        : html`<p class="household-panel__dim">No stallholder knows you well enough yet to put a copy aside over the phone. Buy at a stall a few times: regulars get the number.</p>`;
    const friends = this.friends?.list() ?? [];
    const people = this.friends
      ? html`<h3>Friends</h3><div class="household-panel__list">${friends.map((f) => html`<button type="button" class="ui-btn" data-action="invite" data-id="${f.id}"${attr('disabled', !f.free)}>Ask ${f.name} round <span class="household-panel__tag">${f.note}</span></button>`)}</div>`
      : '';
    const rows = this.events?.list() ?? [];
    const gatherings = rows.length
      ? html`<h3>Have people round</h3><div class="household-panel__list">${rows.map((r) => html`<button type="button" class="ui-btn" data-action="event" data-id="${r.id}"${attr('disabled', !r.enabled)}>${r.label} <span class="household-panel__tag">${r.note}</span></button>`)}</div>`
      : '';
    const ads = this.deps.ads;
    const adRows = ads?.list() ?? [];
    const small = !ads
      ? ''
      : adRows.length
        ? html`<h3>Small ads</h3><ul class="household-panel__rows">${adRows.map((ad) => html`<li><span>${ad.who}<small>${ad.booked ? `Expecting you ${ad.booked}` : ad.text}</small></span><button type="button" class="ui-btn" data-action="ad" data-id="${ad.id}">${ad.booked ? 'Ring again' : 'Ring'}</button></li>`)}</ul>`
        : html`<h3>Small ads</h3><p class="household-panel__dim">${ads.hint}</p>`;
    const contacts = this.deps.contacts;
    const contactRows = contacts?.list() ?? [];
    const book = !contacts
      ? ''
      : contactRows.length
        ? html`<h3>Contacts</h3><div class="social-contacts">${contactRows.map((c) => {
            const s = standing(c.id);
            const tier = tierInfo(tierOf(s.warmth, s.trust));
            return html`<button type="button" class="social-contact" data-action="contact" data-id="${c.id}" aria-label="Ring ${c.name}, ${c.note}" style="--tier:${tier.colour}">
              <span class="social-contact__face" data-portrait="${c.id}"></span>
              <span class="social-contact__who"><b>${c.name}</b><small>${c.note}</small></span>
              <span class="social-tier" style="--tier:${tier.colour}">${tier.glyph} ${tier.name}</span>
              <span class="social-contact__ring">${icon('phone', 1)}</span>
            </button>`;
          })}</div>`
        : html`<h3>Contacts</h3><p class="household-panel__dim">No numbers yet. Get to know people, then ask for theirs.</p>`;
    return html`${book}<h3>The market</h3>${market}${people}${gatherings}${small}`;
  }

  /** A stall picks up: what is on its table today that it could put aside. */
  private async callStall(platform: PlatformId, keepMessage = false): Promise<void> {
    this.stall = platform;
    if (!keepMessage) this.message = '';
    const name = PLATFORM_LIST.find((p) => p.id === platform)?.shortName ?? platform;
    this.page = html`<h3>The ${name} stall</h3><p class="household-panel__dim">Ringing…</p>`;
    this.refresh();
    const onStall = (await this.deps.todays()).filter((item) => item.game.platform === platform);
    // The stallholder looks the prices up first (a few seconds at most; what is still unpriced is not offered).
    await Promise.race([Promise.all(onStall.map((item) => item.settled)), new Promise((resolve) => window.setTimeout(resolve, PRICING_WAIT_MS))]);
    const items = onStall.filter(holdable);
    if (this.stall !== platform || !this.isOpen) return;
    this.items = items;
    const rows = items.slice(0, 8).map(
      (item, i) => html`<li><span>${item.game.title}<small>${stateOf(item)} · ${formatCoins(item.price)}</small></span>
      <button type="button" class="ui-btn" data-action="hold" data-id="${i}">Put it aside (${this.deps.deposit(item)} down)</button></li>`,
    );
    this.page = html`<h3>The ${name} stall</h3>
      <p class="household-panel__dim">“Oh, it’s you! Here’s what I’ve got on the table today.”</p>
      ${rows.length ? html`<ul class="household-panel__rows">${rows}</ul>` : html`<p class="household-panel__dim">“Nothing I could put by, sorry. Come and see.”</p>`}`;
    this.refresh();
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
}

function stateOf(item: StockItem): string {
  return item.condition === 'complete' ? 'complete' : item.condition === 'noManual' ? 'no manual' : 'worn';
}
