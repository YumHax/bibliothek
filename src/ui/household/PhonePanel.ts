import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { StockItem } from '@/economy/StockItem';
import { describeCondition } from '@/economy/pricing';
import { playHangUp, playPickUp, playRingback } from '@/audio/phoneRing';
import { stallPerson } from '@/social/market';
import { shortName } from '@/social/people';
import { standing } from '@/social/standing';
import type { PersonId } from '@/social/types';
import { tierInfo, tierOf } from '@/social/tiers';
import { formatClock } from '@/text/clock';
import { formatCoins } from '@/text/money';
import { CardPanel } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import { coverImg, nextTab, priceHtml, tabs } from '../panel/widgets';
import { tierBadge } from '../social/badge';
import { icon, type IconName } from '../social/icons';
import { portrait } from '../social/portrait';
import { callScreen, faceSlot, initialsSlot, lineOpen, talkHtml, type Callee, type PhoneCall } from './phoneCall';
import { phoneLines, type PhoneLine } from './phoneLines';
import '../social/social.css';
import './household.css';
import './phone.css';

/** What the phone reaches: the people whose number the player has, the market's stalls (which know the player), the friends. */
interface PhoneDeps {
  /** The hour of the day (the status bar's clock). */
  hours(): number;
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
  /** A game's front cover, for the copies a stall reads out. Absent: no thumbnails. */
  coverUrl?: (game: Game) => string | undefined;
  /** The friends, and asking one round: the line said. Absent (until `setFriends`): no friends on the Invite page. */
  friends?: PhoneFriends;
  /** The small ads read in the paper (`classifieds/`): ringing one agrees a visit. Absent: no page. */
  ads?: PhoneAds;
  /** The people whose number the player has (docs/social.md): ringing one opens the conversation. Absent: no page. */
  contacts?: PhoneContacts;
  /** The messages friends left when nobody picked up (`social/phoneCalls`). Absent: none. */
  voicemail?: PhoneVoicemail;
}

/** The messages left on the phone, played once (they are gone once heard). */
export interface PhoneVoicemail {
  count(): number;
  /** Plays them, oldest first: who, when (words), what they said. */
  play(): readonly { id: string; name: string; when: string; text: string }[];
}

/** The address book as the phone reaches it (`social/`). */
export interface PhoneContacts {
  /** Everyone whose number the player has: who, whether they pick up now and a note saying so ("asleep until 8:00"), those who do first. */
  list(): readonly { id: string; name: string; note: string; picks: boolean }[];
  /** Rings them: null when they picked up (the conversation opens over the phone), else why not ("Asleep at this hour"). */
  call(id: string): string | null;
}

/** The Gaming Weekly's small ads as the phone reaches them. */
export interface PhoneAds {
  /** The ads read (newest first): who, where, their words, and the visit agreed with them if any ("today, 18:00–22:00"). */
  list(): readonly { id: string; name: string; flat: string; text: string; booked: string | null }[];
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
  /** Each: what it is, who answers the ring, a word on it (or why not now), whether it can be asked now. */
  list(): readonly { id: string; label: string; who: string; note: string; enabled: boolean }[];
  /** Asks for it: the line said. */
  call(id: string): string;
}

type PhoneTab = 'contacts' | 'messages' | 'stalls' | 'ads' | 'invite';

/** How long a stall on the line waits for its prices to settle before reading its table out, ms. */
const PRICING_WAIT_MS = 4000;
/** How long the far end rings before they pick up (or not), ms: about two burrs of the ringing tone. */
const RING_MS = 1900;
/** How much longer it rings on when nobody picks up, before the phone gives up, ms. */
const NO_ANSWER_MS = 1400;
/** The ringing tone's cadence while a call rings, ms. */
const BURR_EVERY_MS = 1500;
/** How often the status bar's clock is read again while the phone is up, ms. */
const CLOCK_TICK_MS = 2000;
/** The copies a stall reads out at most. */
const STALL_ROWS = 8;

/** Copies a stall can put aside: not the bargain bin, not a grail (its seller keeps it on show), not already held or ordered. */
const holdable = (item: StockItem) => item.source !== 'bin' && item.source !== 'grail' && !item.reserved && item.priced;

/**
 * The phone on the nightstand, drawn as the handset it is: a status bar with the game's clock, a screen per app
 * (Contacts, Messages, Market, Small ads, Invite) along a bar at the bottom, and a call screen over them whenever a
 * number is rung. A ring rings (the far end's tone, the face with rings pulsing out) before anyone answers: someone
 * who picks up opens the conversation over the phone; a stallholder reads out today's table and puts a copy aside for
 * the deposit; a seller, a friend or the paper says their piece in balloons by their faces. Nobody picking up says why
 * in words. Esc, B or Hang up end a call; Put it down closes the phone. The arrows step through the apps.
 */
export class PhonePanel extends CardPanel {
  private tab: PhoneTab = 'contacts';
  private call: PhoneCall | null = null;
  /** Bumped on every call and hang-up: a ring, a pause or a stall's lookup that lands after it does nothing. */
  private callSeq = 0;
  private burr = 0;
  private clockTimer = 0;
  private friends: PhoneFriends | undefined;
  private events: PhoneEvents | undefined;
  /** The messages just played, shown until the phone goes down. */
  private played: ReturnType<PhoneVoicemail['play']> = [];

  constructor(container: HTMLElement, private readonly deps: PhoneDeps) {
    super(container, { className: 'phone-panel', cardClass: 'phone-panel__card ui-card', title: 'The phone', header: false, dismiss: 'Put it down' });
    this.friends = deps.friends;
  }

  /** The friends on the Invite page, once the flat's visitors exist. */
  setFriends(friends: PhoneFriends): void {
    this.friends = friends;
  }

  /** The gatherings' lines, once the flat's visitors exist. */
  setEvents(events: PhoneEvents): void {
    this.events = events;
  }

  protected override onOpened(): void {
    this.endCall();
    this.played = [];
    // A message waiting opens the phone on it, as its blinking light asked.
    this.tab = (this.deps.voicemail?.count() ?? 0) > 0 ? 'messages' : 'contacts';
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => this.tickClock(), CLOCK_TICK_MS);
    super.onOpened();
  }

  protected override onClosed(): void {
    this.endCall();
    window.clearInterval(this.clockTimer);
  }

  protected render(): Html {
    const apps = this.tabList();
    if (!apps.some((t) => t.id === this.tab)) this.tab = apps[0]!.id;
    return html`<div class="phone">
      <div class="phone__bar" aria-hidden="true">
        <span class="phone__time">${formatClock(this.deps.hours())}</span>
        <span class="phone__camera"></span>
        <span class="phone__status"><span class="phone__signal"><i></i><i></i><i></i><i></i></span><span class="phone__battery"><i></i></span></span>
      </div>
      <div class="phone__screen${this.call ? ' phone__screen--call' : ''}">${this.call ? this.callHtml(this.call) : this.page()}</div>
      ${!this.call && apps.length > 1 ? tabs({ tabs: apps.map((t) => ({ id: t.id, label: this.tabLabel(t) })), active: this.tab, className: 'phone__tabs', label: 'Apps' }) : ''}
    </div>`;
  }

  /** On a call, Esc and B hang up instead of putting the phone down. */
  protected override onBack(): boolean {
    if (!this.call) return false;
    this.hangUp();
    return true;
  }

  /** The arrows (or the D-pad) step through the apps; not during a call. */
  protected override onSide(direction: 1 | -1): boolean {
    if (this.call) return false;
    const ids = this.tabList().map((t) => t.id);
    if (ids.length < 2) return false;
    this.tab = nextTab(ids, this.tab, direction);
    this.refresh();
    return true;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const { id } = el.dataset;
    if (action === 'tab' && el.dataset.tab) {
      this.tab = el.dataset.tab as PhoneTab;
      this.refresh();
    } else if (action === 'hangup') this.hangUp();
    else if (action === 'contact' && id) this.ringContact(id);
    else if (action === 'stall' && id) this.ringStall(id as PlatformId);
    else if (action === 'hold' && id) void this.hold(Number(id));
    else if (action === 'ad' && id) this.ringAd(id);
    else if (action === 'invite' && id) this.ringFriend(id);
    else if (action === 'event' && id) this.ringEvent(id);
    else if (action === 'listen' && this.deps.voicemail) {
      this.played = this.deps.voicemail.play();
      playPickUp();
      this.refresh();
    }
  }

  /** The portraits are drawn canvases: dropped into their slots after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const id = slot.dataset.portrait!;
      const s = standing(id);
      slot.appendChild(portrait(id, Number(slot.dataset.size ?? 40), tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }

  // --- the apps -------------------------------------------------------------------------------------

  /** The apps this phone has now (a page whose source is not there yet is left out), each with its icon and badge. */
  private tabList(): { id: PhoneTab; name: string; icon: IconName; badge?: number }[] {
    const { deps } = this;
    const list: { id: PhoneTab; name: string; icon: IconName; badge?: number }[] = [];
    if (deps.contacts) list.push({ id: 'contacts', name: 'Contacts', icon: 'people' });
    if (deps.voicemail) list.push({ id: 'messages', name: 'Messages', icon: 'chat', badge: this.played.length ? 0 : deps.voicemail.count() });
    list.push({ id: 'stalls', name: 'Market', icon: 'cart' });
    if (deps.ads) list.push({ id: 'ads', name: 'Small ads', icon: 'pin' });
    if (this.friends || this.events) list.push({ id: 'invite', name: 'Invite', icon: 'door' });
    return list;
  }

  private tabLabel(t: { name: string; icon: IconName; badge?: number }): Html {
    return html`<span class="phone__tab-icon">${icon(t.icon, 1.2)}${t.badge ? html`<span class="phone__tab-badge">${t.badge}</span>` : ''}</span><span class="phone__tab-name">${t.name}</span>`;
  }

  private page(): Html {
    switch (this.tab) {
      case 'contacts': return this.contactsPage();
      case 'messages': return this.messagesPage();
      case 'stalls': return this.stallsPage();
      case 'ads': return this.adsPage();
      case 'invite': return this.invitePage();
    }
  }

  /** The address book: who picks up now, then who cannot (asleep, at work: said in words, their face greyed). */
  private contactsPage(): Html {
    const rows = this.deps.contacts?.list() ?? [];
    if (!rows.length) return this.empty('Contacts', 'people', 'No numbers yet. Get to know people, then ask for theirs.');
    const row = (c: (typeof rows)[number]) => {
      const s = standing(c.id);
      const tier = tierOf(s.warmth, s.trust);
      return html`<li><button type="button" class="phone-row${c.picks ? '' : ' phone-row--away'}" data-action="contact" data-id="${c.id}" aria-label="Ring ${c.name}: ${c.note}">
        ${faceSlot(c.id, 40)}
        <span class="phone-row__who"><b>${c.name}</b><small class="phone-row__state">${c.note}</small></span>
        ${tierBadge(tier, c.id, { small: true })}
        ${ringPill('Ring')}
      </button></li>`;
    };
    const free = rows.filter((c) => c.picks);
    const away = rows.filter((c) => !c.picks);
    return html`${heading('Contacts')}
      ${free.length ? html`<h3 class="phone__group">Free to talk</h3><ul class="phone-rows">${free.map(row)}</ul>` : ''}
      ${away.length ? html`<h3 class="phone__group">Not now</h3><ul class="phone-rows">${away.map(row)}</ul>` : ''}`;
  }

  /** The messages: a light blinking over the count until played, then each one by its sender's face. */
  private messagesPage(): Html {
    if (this.played.length) {
      return html`${heading('Messages')}<ul class="phone-messages">${this.played.map(
        (m) => html`<li class="phone-message">
          ${faceSlot(m.id, 40)}
          <span class="phone-message__body"><span class="phone-message__head"><b>${m.name}</b><small>${m.when}</small></span><q>${m.text}</q></span>
        </li>`,
      )}</ul>`;
    }
    const waiting = this.deps.voicemail?.count() ?? 0;
    if (!waiting) return this.empty('Messages', 'chat', 'No new messages.');
    return html`${heading('Messages')}<div class="phone-voicemail">
      <span class="phone-voicemail__light" aria-hidden="true"></span>
      <p class="phone-voicemail__count">${waiting === 1 ? 'A new message' : `${waiting} new messages`}</p>
      <p class="phone-voicemail__note">Someone rang while you could not pick up.</p>
      <button type="button" class="ui-btn ui-btn--primary" data-action="listen" data-autofocus>${waiting === 1 ? 'Listen to it' : 'Listen to them'}</button>
    </div>`;
  }

  /** The market's stalls whose stallholder knows the player well enough to put a copy by over the phone. */
  private stallsPage(): Html {
    const { deps } = this;
    if (!deps.marketOpen()) return this.empty('Market', 'lock', deps.closedLine());
    const stalls = PLATFORM_LIST.filter((p) => deps.loyalty(p.id) >= deps.regularFrom);
    if (!stalls.length) return this.empty('Market', 'cart', 'No stallholder knows you well enough yet to put a copy aside over the phone. Buy at a stall a few times: their regulars get the number.');
    return html`${heading('Market')}<ul class="phone-rows">${stalls.map((p) => {
      const who = stallPerson(p.id);
      return html`<li><button type="button" class="phone-row" data-action="stall" data-id="${p.id}" aria-label="Ring ${shortName(who)}, the ${p.shortName} stall">
        ${faceSlot(who, 40)}
        <span class="phone-row__who"><b>${shortName(who)}</b><small>the ${p.shortName} stall</small></span>
        <span class="phone-row__chip">${deps.loyaltyName(p.id)}</span>
        ${ringPill('Ring')}
      </button></li>`;
    })}</ul>`;
  }

  /** The small ads read in the Gaming Weekly: the seller, their words, the visit agreed with one. */
  private adsPage(): Html {
    const ads = this.deps.ads;
    const rows = ads?.list() ?? [];
    if (!ads || !rows.length) return this.empty('Small ads', 'pin', ads?.hint ?? '');
    return html`${heading('Small ads')}<ul class="phone-rows">${rows.map(
      (ad) => html`<li><button type="button" class="phone-row phone-row--ad${ad.booked ? ' phone-row--booked' : ''}" data-action="ad" data-id="${ad.id}" aria-label="Ring ${ad.name}">
        ${initialsSlot(ad.name, 40)}
        <span class="phone-row__who"><b>${ad.name}</b><small>${ad.flat}</small><span class="phone-row__ad">${ad.text}</span>${ad.booked ? html`<span class="phone-row__booked">Expecting you ${ad.booked}</span>` : ''}</span>
        ${ringPill(ad.booked ? 'Again' : 'Ring')}
      </button></li>`,
    )}</ul>`;
  }

  /** Asking people round: a friend today, everyone tonight, the paper for an open house. */
  private invitePage(): Html {
    const friends = this.friends?.list() ?? [];
    const events = this.events?.list() ?? [];
    if (!friends.length && !events.length) return this.empty('Invite', 'door', 'Nobody to ask round yet.');
    return html`${heading('Invite')}
      ${friends.length ? html`<h3 class="phone__group">Ask a friend round</h3><ul class="phone-rows">${friends.map(
        (f) => html`<li><button type="button" class="phone-row${f.free ? '' : ' phone-row--away'}" data-action="invite" data-id="${f.id}"${attr('disabled', !f.free)} aria-label="Ask ${f.name} round: ${f.note}">
          ${faceSlot(f.id, 40)}
          <span class="phone-row__who"><b>${f.name}</b><small>${f.note}</small></span>
          ${ringPill('Ask round')}
        </button></li>`,
      )}</ul>` : ''}
      ${events.length ? html`<h3 class="phone__group">Have people round</h3><ul class="phone-rows">${events.map(
        (r) => html`<li><button type="button" class="phone-row${r.enabled ? '' : ' phone-row--away'}" data-action="event" data-id="${r.id}"${attr('disabled', !r.enabled)} aria-label="${r.label}: ${r.note}">
          ${initialsSlot(r.who, 40)}
          <span class="phone-row__who"><b>${r.label}</b><small>${r.note}</small></span>
          ${ringPill('Ring')}
        </button></li>`,
      )}</ul>` : ''}`;
  }

  private empty(title: string, glyph: IconName, text: string): Html {
    return html`${heading(title)}<div class="phone-empty"><span class="phone-empty__glyph">${icon(glyph, 2)}</span><p>${text}</p></div>`;
  }

  // --- calls ----------------------------------------------------------------------------------------

  private callHtml(call: PhoneCall): Html {
    const speaker = (name: string) => this.faceOf(name);
    if (call.state === 'talk') return callScreen(call, talkHtml(call.lines, call.who, speaker));
    if (call.state !== 'stall') return callScreen(call, html``);
    const items = call.items;
    const table = items === null
      ? html`<p class="phone-call__note">${call.who.name} looks over the table…</p>`
      : items.length
        ? html`<ul class="phone-items">${items.slice(0, STALL_ROWS).map((item, i) => {
            const state = describeCondition(item.condition) || 'complete';
            return html`<li class="phone-item">
              <span class="phone-item__cover">${coverImg(this.deps.coverUrl?.(item.game), item.game, 'phone-item__img')}</span>
              <span class="phone-item__what"><b>${item.game.title}</b><small>${state}</small>${priceHtml(item.price)}</span>
              <button type="button" class="ui-btn phone-item__hold" data-action="hold" data-id="${i}">Put it aside<small>${formatCoins(this.deps.deposit(item))} down</small></button>
            </li>`;
          })}</ul>`
        : html``;
    return callScreen(call, html`${talkHtml(call.said, call.who, speaker)}${table}`);
  }

  /** The face of a name said on the line ("Sam: “…”"): a friend's or a contact's, if the name is theirs. */
  private faceOf(name: string): PersonId | null {
    const friend = this.friends?.list().find((f) => f.name === name);
    if (friend) return friend.id;
    return this.deps.contacts?.list().find((c) => c.name === name)?.id ?? null;
  }

  /**
   * Rings `who`: the call screen and the far end's tone, then `answer` once it has rung long enough (the call still
   * up, the phone still open). The tone goes on until something answers or the call ends.
   */
  private dial(who: Callee, answer: (seq: number) => void, after = RING_MS): void {
    this.stopBurr();
    const seq = ++this.callSeq;
    this.call = { state: 'ringing', who };
    playRingback();
    this.burr = window.setInterval(() => playRingback(), BURR_EVERY_MS);
    this.refresh();
    window.setTimeout(() => {
      if (seq === this.callSeq && this.isOpen) answer(seq);
    }, after);
  }

  /** The far end answered (or did not): the tone stops and the screen shows what came of it. */
  private settle(call: PhoneCall): void {
    this.stopBurr();
    if (lineOpen(call)) playPickUp();
    else playHangUp();
    this.call = call;
    this.refresh();
  }

  /** What was said on a line that picked up: balloons, or (no quote in it) the reason it did not go through. */
  private answered(who: Callee, text: string): PhoneCall {
    return { state: 'talk', who, lines: phoneLines(text) };
  }

  /** A contact: picked up, the conversation opens over the phone (the phone goes down); else, after a few more rings, why not. */
  private ringContact(id: string): void {
    const contact = this.deps.contacts?.list().find((c) => c.id === id);
    if (!contact || !this.deps.contacts) return;
    const who: Callee = { name: contact.name, sub: contact.note, face: id };
    const contacts = this.deps.contacts;
    const answer = (): void => {
      const why = contacts.call(id);
      if (why === null) {
        // They picked up: the conversation opens over the phone, which goes down.
        this.stopBurr();
        playPickUp();
        return;
      }
      // Picked up and rang straight off (Mémé in her nightie) in their own words, or nobody there: why, in words.
      this.settle(phoneLines(why).some((l) => l.kind === 'said') ? this.answered(who, why) : { state: 'missed', who, why: why || contact.note });
    };
    this.dial(who, (seq) => {
      if (contact.picks) return answer();
      // Nobody will pick up: it rings on a little, then the phone gives up.
      window.setTimeout(() => {
        if (seq === this.callSeq && this.isOpen) answer();
      }, NO_ANSWER_MS);
    });
  }

  /** A stall picks up: the stallholder reads out what is on the table today that they could put aside. */
  private ringStall(platform: PlatformId): void {
    const name = PLATFORM_LIST.find((p) => p.id === platform)?.shortName ?? platform;
    const person = stallPerson(platform);
    const who: Callee = { name: shortName(person), sub: `the ${name} stall`, face: person };
    const stock = this.deps.todays();
    this.dial(who, (seq) => {
      this.settle({ state: 'stall', who, platform, items: null, said: [{ kind: 'said', who: null, words: 'Oh, it’s you! Hang on, let me look at the table.' }] });
      void this.readTable(seq, stock, platform, who, []);
    });
  }

  /** The stall's copies that could be put aside, prices settled first (a few seconds at most; what is unpriced is left out). */
  private async readTable(seq: number, stock: Promise<readonly StockItem[]>, platform: PlatformId, who: Callee, said: readonly PhoneLine[]): Promise<void> {
    const onStall = (await stock).filter((item) => item.game.platform === platform);
    await Promise.race([Promise.all(onStall.map((item) => item.settled)), new Promise((resolve) => window.setTimeout(resolve, PRICING_WAIT_MS))]);
    if (seq !== this.callSeq || !this.isOpen) return;
    const items = onStall.filter(holdable);
    const opening: PhoneLine = { kind: 'said', who: null, words: items.length ? 'Here’s what I could put by for you today.' : 'Nothing I could put by, sorry. Come and see.' };
    this.call = { state: 'stall', who, platform, items, said: said.length ? said : [opening] };
    this.refresh();
  }

  /** A copy put aside over the phone: the stallholder says so (or why not), and reads the rest of the table again. */
  private async hold(index: number): Promise<void> {
    const call = this.call;
    if (call?.state !== 'stall' || !call.items) return;
    const item = call.items[index];
    if (!item) return;
    const why = this.deps.hold(item);
    const said: PhoneLine[] = why ? phoneLines(why) : [{ kind: 'said', who: null, words: `${item.game.title}, under the table for you till closing. ${formatCoins(item.due)} to pay when you come by.` }];
    await this.readTable(this.callSeq, this.deps.todays(), call.platform, call.who, said);
  }

  private ringAd(id: string): void {
    const ads = this.deps.ads;
    const ad = ads?.list().find((a) => a.id === id);
    if (!ads || !ad) return;
    const who: Callee = { name: ad.name, sub: ad.flat, face: null };
    this.dial(who, () => this.settle(this.answered(who, ads.ring(id))));
  }

  private ringFriend(id: string): void {
    const friends = this.friends;
    const friend = friends?.list().find((f) => f.id === id);
    if (!friends || !friend) return;
    const who: Callee = { name: friend.name, sub: 'asking them round', face: id };
    this.dial(who, () => this.settle(this.answered(who, friends.invite(id))));
  }

  private ringEvent(id: string): void {
    const events = this.events;
    const row = events?.list().find((r) => r.id === id);
    if (!events || !row) return;
    const who: Callee = { name: row.who, sub: row.label, face: null };
    this.dial(who, () => this.settle(this.answered(who, events.call(id))));
  }

  /** Hangs up (or steps back from a call that is over): the page the call was made from. */
  private hangUp(): void {
    const call = this.call;
    if (!call) return;
    if (lineOpen(call)) playHangUp();
    this.endCall();
    this.refresh();
  }

  private endCall(): void {
    this.callSeq++;
    this.stopBurr();
    this.call = null;
  }

  private stopBurr(): void {
    window.clearInterval(this.burr);
    this.burr = 0;
  }

  private tickClock(): void {
    const time = this.body.querySelector('.phone__time');
    if (time) time.textContent = formatClock(this.deps.hours());
  }
}

/** A screen's title, as a phone app heads its page. */
function heading(title: string): Html {
  return html`<h2 class="phone__title">${title}</h2>`;
}

/** The green pill a row rings with: the receiver and the word. */
function ringPill(label: string): Html {
  return html`<span class="phone-row__ring">${icon('handset', 0.95)}${label}</span>`;
}
