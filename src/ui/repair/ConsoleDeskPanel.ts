import { getPlatform } from '@/catalog/platforms';
import type { NoticeActions } from '@/notices';
import { faultOf, resaleOf } from '@/repair/consoles';
import type { HomeConsole, Workshop } from '@/repair/Workshop';
import { findPerson } from '@/social/people';
import { isMet } from '@/social/standing';
import { clerkOf } from '@/social/street/streetPerks';
import { playCoins } from '@/audio/coins';
import { Arming } from '../confirmTwice';
import { CardPanel } from '../panel/CardPanel';
import { html, raw, type Html } from '../panel/html';
import { Speaker } from '../panel/speaker';
import { formatCoins } from '@/text/money';
import { consoleArt } from './repairArt';
import './repair.css';

/** Who speaks over the counter (`Speaker`'s first argument). */
type SpeakerWho = ConstructorParameters<typeof Speaker>[0];

interface ConsoleDeskDeps {
  workshop: Workshop;
  wallet: { earnCoins(coins: number): void };
  notices: NoticeActions;
}

/** What the repairer says as the player comes to the counter: with something to sell, or with nothing yet. */
const HELLO = {
  wares: ['Let’s see what you’ve brought me.', 'Mended it yourself? Put it on the mat, I’ll have a look.'],
  none: ['I buy consoles that work. Broken ones you fix yourself, at home: the crate by the door has a few, sold as seen.'],
} as const;

/**
 * TV REPAIR's counter for consoles (docs/household.md "Repairing a console"): the repairer behind it (their face and
 * words, `panel/speaker`), the working consoles the player mended at home laid on the counter mat, each drawn, with
 * a hand-written tag of what the repairer pays for it (`resaleOf`) and "Sell it" (two presses, `confirmTwice`); then
 * the broken ones still on the kitchen table, pinned up as a list with what is wrong with each. A `ModalLike` opened
 * by the card on the counter.
 */
export class ConsoleDeskPanel extends CardPanel {
  private readonly arming = new Arming(() => this.armingChanged());
  /** The repairer is saying what they would pay (an armed sale): the line goes when the arming lapses. */
  private offering = false;
  private readonly speaker: Speaker;
  private hellos = 0;

  constructor(container: HTMLElement, private readonly deps: ConsoleDeskDeps) {
    super(container, { className: 'repair-panel console-desk', cardClass: 'repair console-desk__card ui-card', title: 'TV REPAIR', label: 'Consoles bought', dismiss: 'Leave the counter', dismissAutofocus: true });
    this.speaker = new Speaker(repairer(), { className: 'console-desk__speaker' });
    this.speaker.mountAbove(this.body);
    deps.workshop.subscribe(() => {
      if (this.isOpen) this.refresh();
    });
  }

  protected override onOpened(): void {
    this.arming.reset();
    this.offering = false;
    this.speaker.setWho(repairer());
    const lines = this.deps.workshop.working.length ? HELLO.wares : HELLO.none;
    this.speaker.say(lines[this.hellos++ % lines.length]!);
    super.onOpened();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'sell' && el.dataset.id) this.sell(el.dataset.id);
  }

  private sell(id: string): void {
    const item = this.deps.workshop.working.find((c) => c.id === id);
    if (!item) return;
    const name = getPlatform(item.platform).shortName;
    if (!this.arming.press(id)) {
      this.speaker.say(`${formatCoins(resaleOf(item.platform))} for the ${name}. Shall I take it?`);
      this.offering = true;
      return;
    }
    this.offering = false;
    const coins = this.deps.workshop.sell(id, this.deps.wallet);
    if (coins === null) return;
    playCoins(3);
    this.speaker.say(`A working ${name}? Lovely job. There you go.`, 'smile');
    this.deps.notices.reward({ title: `Sold the ${name}`, detail: `Paid ${formatCoins(item.paid)} for it broken, mended at home.`, coins });
    this.refresh();
  }

  /** An armed sale lapsed: the repairer's offer is taken back with the button. */
  private armingChanged(): void {
    if (this.offering && this.arming.key === null) {
      this.offering = false;
      this.speaker.say('No? Have a think, it’s not going anywhere.');
    }
    this.refresh();
  }

  protected render(): Html {
    const { workshop } = this.deps;
    const working = workshop.working;
    const broken = workshop.consoles.filter((c) => !c.fixed && c.atShop === undefined);
    const counter = working.length
      ? html`<ul class="console-desk__wares">${working.map((c) => this.ware(c))}</ul>`
      : html`<div class="console-desk__bare">${raw(consoleArt('nes', { broken: true }))}<p>Nothing on the mat yet. Mend one on the kitchen table and bring it in.</p></div>`;
    const home = broken.length
      ? html`<section class="console-desk__home ui-paper">
          <h3>Still on your kitchen table</h3>
          <ul>${broken.map((c) => html`<li>${raw(consoleArt(c.platform, { broken: true }))}<span><strong>${getPlatform(c.platform).name}</strong><small>${faultOf(c).symptom}</small></span></li>`)}</ul>
        </section>`
      : '';
    return html`<section class="console-desk__counter" aria-label="On the counter">${counter}</section>${home}`;
  }

  /** A mended console on the mat: its drawing, where it came from, the repairer's tag and the button. */
  private ware(c: HomeConsole): Html {
    const price = resaleOf(c.platform);
    const armed = this.arming.isArmed(c.id);
    return html`<li class="console-desk__ware">
      ${raw(consoleArt(c.platform))}
      <span class="console-desk__what"><strong>${getPlatform(c.platform).name}</strong><small>Mended at home · from ${c.from}, ${formatCoins(c.paid)}</small></span>
      <span class="console-desk__tag">${formatCoins(price)}</span>
      <button type="button" class="ui-btn${armed ? ' ui-btn--armed' : ''}" data-action="sell" data-id="${c.id}">${armed ? `Sell for ${formatCoins(price)}?` : 'Sell it'}</button>
    </li>`;
  }
}

/** The repairer behind the counter: TV REPAIR's clerk, by name once met. */
function repairer(): SpeakerWho {
  const id = clerkOf('electronics');
  const card = id ? findPerson(id) : undefined;
  if (!id || !card) return { name: 'The repairer' };
  return { name: isMet(id) ? (card.short ?? card.name) : 'The repairer', person: id };
}
