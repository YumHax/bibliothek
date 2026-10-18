import type { BallotView } from '@/building/coproMeeting';
import type { ResolutionId } from '@/building/coproPlan';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, raw, type Html } from './panel/html';
import { playPaperRustle } from '@/audio/householdSounds';
import { playScratch } from '@/audio/dealSounds';
import { formatCoins } from '@/text/money';
import { reduceMotion } from '@/settings/motion';
import { COPRO_PLAN } from '@/building/coproPlan';
import { standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import type { PersonId } from '@/social/types';
import { portrait } from './social/portrait';
import { weekdayOf } from '@/time/wakefulness';
import './CoproPanel.css';

/** A voter's face beside their leaning: drawn this big (CSS px). */
const FACE_PX = 26;
/** Who is behind each name on the ballot (`COPRO_PLAN.voters`). */
const PERSON_OF: ReadonlyMap<string, PersonId> = new Map(COPRO_PLAN.voters.map((v) => [v.who, v.person as PersonId]));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** What the ballot box hands the panel: the open ballot, how to post it, the coins in hand, and what to say once posted. */
export interface CoproBallotSource {
  view(): BallotView | null;
  /** Posts the ballot; 'broke' when the bought votes cost more than the player has. */
  cast(votes: Partial<Record<ResolutionId, string>>, bought: Partial<Record<ResolutionId, number>>): 'closed' | 'broke' | 'cast';
  coins(): number;
  /** The ballot is in the box (or the meeting already sat): a line for the player. */
  done(text: string): void;
}

/** How the residents stand to the player's ballot, from how the player stands with them (docs/social.md). */
const STANCE = { with: 'with you', lobbied: 'brought round by a friend', against: 'against you' } as const;
/** The cross in a box, as a pen stroke that draws itself (CSS). */
const CROSS = raw('<svg class="copro-panel__cross" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5L16 15.5"/><path d="M16 4L4.5 16"/></svg>');
/** How long the ballot takes to fold into its envelope before the card goes. */
const FOLD_MS = 650;

/**
 * The co-ownership meeting's postal vote (`building/coproMeeting`): each resolution on the agenda
 * with its options (who among the residents leans to each), the player's pick, and votes bought by
 * paying towards the works. A `ModalLike` the hall's ballot box opens; "Post my vote" spends the coins
 * and drops the ballot in the box. Votes may be changed until the meeting sits; paid votes stay.
 */
export class CoproPanel extends CardPanel {
  private source: CoproBallotSource | null = null;
  private view: BallotView | null = null;
  private votes: Partial<Record<ResolutionId, string>> = {};
  private bought: Partial<Record<ResolutionId, number>> = {};
  /** The ballot is folding into its envelope (the card goes at the end). */
  private posting = false;

  constructor(container: HTMLElement) {
    super(container, { className: 'copro-panel', cardClass: 'copro-panel__card ui-card', title: "Postal vote of the co-owners' meeting", dismiss: 'Not now', header: false });
  }

  /** Deals the ballot (call before the Session opens the panel). */
  prepare(source: CoproBallotSource): void {
    this.source = source;
    this.view = source.view();
    this.votes = {};
    this.bought = {};
    this.posting = false;
    for (const item of this.view?.items ?? []) {
      if (item.vote) this.votes[item.id] = item.vote;
      this.bought[item.id] = item.bought;
    }
    if (this.isOpen) this.refresh();
  }

  private cost(): number {
    if (!this.view) return 0;
    let extra = 0;
    for (const item of this.view.items) if (this.votes[item.id]) extra += (this.bought[item.id] ?? 0) - item.bought;
    return extra * this.view.contribution;
  }

  /** A resident's face, a slot filled after the markup (`repaint`), with their name on a tag on hover. */
  private face(who: string): Html {
    const id = PERSON_OF.get(who);
    return html`<span class="copro-panel__face" role="img" aria-label="${who}" data-name="${who}"${id ? html` data-portrait="${id}"` : ''}>${id ? '' : who.slice(0, 1)}</span>`;
  }

  /** The residents' leaning towards the player, in two groups with their heads written out. */
  private swayHtml(view: BallotView): Html {
    const group = (title: string, stances: readonly (keyof typeof STANCE)[], tone: string): Html => {
      const people = view.sway.filter((s) => stances.includes(s.stance));
      if (!people.length) return html``;
      return html`<div class="copro-panel__lean copro-panel__lean--${tone}"><span class="copro-panel__lean-head">${title}</span><span class="copro-panel__faces">${people.map((s) => html`<span class="copro-panel__voter">${this.face(s.who)}<span class="copro-panel__voter-name">${s.who}${s.stance === 'lobbied' ? html` <em>(a friend's word)</em>` : ''}</span></span>`)}</span></div>`;
    };
    return html`<div class="copro-panel__sway">${group('Likely to vote with you', ['with', 'lobbied'], 'with')}${group('Likely to vote against you', ['against'], 'against')}</div>`;
  }

  protected render(): Html {
    const view = this.view;
    if (!view) {
      return html`<header class="copro-panel__head"><p class="copro-panel__kicker">Co-owners of No 12 · postal vote</p><h2>No meeting coming up</h2></header>
        <p class="copro-panel__blank">The ballot box is empty for now. The next agenda goes up on the hall’s board a few days before the meeting.</p>`;
    }
    const items = view.items.map((item, n) => {
      const options = item.options.map((o) => {
        const pressed = this.votes[item.id] === o.id;
        const faces = o.leaning.length ? html`<span class="copro-panel__faces">${o.leaning.map((who) => this.face(who))}</span>` : '';
        const now = o.id === item.current ? html` <span class="copro-panel__now">as it is now</span>` : '';
        return html`<button type="button" class="copro-panel__option" data-action="pick" data-res="${item.id}" data-option="${o.id}" aria-pressed="${pressed ? 'true' : 'false'}"><span class="copro-panel__box" aria-hidden="true">${pressed ? CROSS : ''}</span><span class="copro-panel__label">${o.label}${now}</span>${faces}</button>`;
      });
      const extra = this.bought[item.id] ?? 0;
      const canBuy = !!this.votes[item.id];
      const stamps = Array.from({ length: extra }, (_, i) => html`<span class="copro-panel__stamp${i < item.bought ? ' copro-panel__stamp--paid' : ''}" aria-hidden="true"></span>`);
      const words = extra === 0 ? 'No word with the syndic yet' : extra === 1 ? 'One word with the syndic' : `${extra} words with the syndic`;
      return html`<section class="copro-panel__item"><h3><span class="copro-panel__no">${n + 1}.</span> ${item.title}</h3><p class="copro-panel__dim">${item.detail}</p><div class="copro-panel__options">${options}</div>
        <div class="copro-panel__buy"><span class="copro-panel__buy-label">${words}${stamps.length ? html` <span class="copro-panel__stamps">${stamps}</span>` : ''}</span>
          ${extra > item.bought ? html`<button type="button" class="copro-panel__pen" data-action="buy" data-res="${item.id}" data-step="-1">Take it back</button>` : ''}
          <button type="button" class="copro-panel__pen" data-action="buy" data-res="${item.id}" data-step="1"${!canBuy || extra >= view.maxBought ? html` aria-disabled="true"` : ''}>Put in a word · ${formatCoins(view.contribution)}</button></div>
        </section>`;
    });
    const flats = view.playerVotes > 1 ? html`<p class="copro-panel__dim">Two flats are yours now: your cross counts twice.</p>` : '';
    const sway = view.sway.length ? this.swayHtml(view) : '';
    return html`<div class="copro-panel__fold${this.posting ? ' copro-panel__fold--posting' : ''}"><header class="copro-panel__head"><p class="copro-panel__kicker">Co-owners of No 12 · postal vote</p><h2>General meeting, ${WEEKDAYS[weekdayOf(view.day)]} at ${view.hour} o’clock</h2>${flats}${sway}</header>
      ${items}<p class="copro-panel__sign">Signed, the 5th floor</p></div>`;
  }

  /** The faces are drawn canvases: dropped into their slots after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const id = slot.dataset.portrait as PersonId;
      const s = standing(id);
      slot.appendChild(portrait(id, FACE_PX, tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }

  protected override actions(): PanelAction[] {
    if (!this.view) return [];
    const cost = this.cost();
    const short = cost - (this.source?.coins() ?? 0);
    const label = `Post my vote${cost ? ` · ${formatCoins(cost)}` : ''}${short > 0 ? ` · ${formatCoins(short)} short` : ''}`;
    return [{ action: 'post', label, primary: true, autofocus: true, className: `copro-panel__post${short > 0 ? ' is-short' : ''}` }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (this.posting) return;
    const id = el.dataset.res as ResolutionId | undefined;
    if (action === 'pick' && id && el.dataset.option) {
      if (this.votes[id] !== el.dataset.option) playScratch(0.06);
      this.votes[id] = el.dataset.option;
      this.setStatus('');
      this.refresh();
    } else if (action === 'buy' && id) {
      const item = this.view?.items.find((i) => i.id === id);
      if (!item || !this.view) return;
      const step = el.dataset.step === '-1' ? -1 : 1;
      // Pressed while it cannot: say why, never a dead button.
      if (el.getAttribute('aria-disabled') === 'true') {
        this.setStatus(this.votes[id] ? 'That is as much as the syndic will hear on it.' : 'Put your cross on this one first.', 'error');
        return;
      }
      this.bought[id] = Math.max(item.bought, Math.min(this.view.maxBought, (this.bought[id] ?? item.bought) + step));
      this.setStatus('');
      this.refresh();
    } else if (action === 'post') this.post();
  }

  private post(): void {
    const source = this.source;
    if (!source || !this.view) return;
    const short = this.cost() - source.coins();
    if (short > 0) {
      this.setStatus(`${formatCoins(short)} short for those words with the syndic: take one back, or come back with more.`, 'error');
      return;
    }
    const result = source.cast(this.votes, this.bought);
    if (result === 'broke') {
      this.setStatus('Not enough coins for those words with the syndic.', 'error');
      return;
    }
    // The ballot folds into its envelope and drops; then the card goes.
    this.posting = true;
    this.setStatus('');
    this.refresh();
    playPaperRustle(0.14);
    window.setTimeout(() => {
      this.posting = false;
      // Walked off mid-fold: the ballot is cast all the same, the card already gone.
      if (this.isOpen) this.close();
      source.done(result === 'cast' ? 'Your ballot drops into the box.' : 'The meeting already sat: the minutes are on the board.');
    }, reduceMotion() ? 0 : FOLD_MS);
  }
}
