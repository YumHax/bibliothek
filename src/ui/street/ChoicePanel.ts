import type { PersonId } from '@/social/types';
import { formatCoins } from '@/text/money';
import { reduceMotion } from '@/settings/motion';
import { playPenStroke } from '@/audio/pastimeSounds';
import { playTicketTear } from '@/audio/ticketSounds';
import { CardPanel } from '../panel/CardPanel';
import { attr, html, raw, type Html } from '../panel/html';
import { inlinePictogram } from '../panel/pictograms';
import { Speaker } from '../panel/speaker';
import { FACE_PAPER, portrait } from '../social/portrait';
import './ChoicePanel.css';

/** One thing to pick: its words, a line under them, and why it cannot be picked now (`unavailable`: shown, not taken). */
interface Choice {
  id: string;
  label: string;
  detail?: string;
  unavailable?: string;
  /** A person it is for (the postcard's addressee): their face beside the name. */
  person?: PersonId;
  /** What it costs, chalked beside it (the Christmas stall's menu). */
  price?: number;
  /** A small picture beside it on a menu (`panel/pictograms`, or `cone`). */
  picture?: string;
}

/**
 * The scene the pick is dressed in, so each moment looks like itself:
 * - `bus`: line 38's route board, a stop per choice, the fare on a ticket that tears off on the pick;
 * - `taxi`: the meter showing the fare, the answers as the player's own balloons to the driver;
 * - `post`: a postcard from the newsagent's rack, the people as faces, the name written in on the pick;
 * - `stall`: a chalked menu board under fairy lights.
 */
type ChoiceLook =
  | { kind: 'bus'; line: string; fare: number; from: string }
  | { kind: 'taxi'; fare: number }
  | { kind: 'post'; price: number }
  | { kind: 'stall' };

/** Who asks (the driver, the keeper): their face and their words over the choices. */
interface ChoiceWho {
  name: string;
  line: string;
  seed?: number;
  person?: PersonId;
}

/** What a choice is dealt before the Session opens it: the card's title, a line over the list, the choices, who hears the pick. */
interface ChoiceDeal {
  title: string;
  intro?: string;
  choices: readonly Choice[];
  pick(id: string): void;
  /** The dismiss's words ("Not now"). */
  dismiss?: string;
  look?: ChoiceLook;
  who?: ChoiceWho;
}

/** How long the pick's little scene plays before the card goes (ms): the ticket torn, the name written in. */
const PICK_MS = { bus: 520, post: 640, taxi: 260, stall: 300, plain: 0 } as const;
/** The faces on the postcard's address list (CSS px), on the card's cream. */
const FACE = 40;
/** The fairy lights strung over the stall's board. */
const BULBS = 13;

/** A paper cone of chestnuts: not one of the kit's pictograms, drawn here in the same strokes. */
const CONE = '<svg class="choice-panel__picture" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M3.5 6.5h9L8 15z"/><path d="M5 6.5c0-1.6 1-2.6 1.8-2.2M7.6 6.5c0-2 1.2-3 2.2-2.4M10.4 6.5c.2-1.2.8-1.8 1.4-1.6"/><path d="M5.6 9.5h4.8"/></svg>';

/**
 * A small card to pick one of a few things in the street (docs/ui.md "A panel"): where line 38 goes, where the taxi
 * goes, whom a card in the pillar box is for, what the Christmas stall serves. Each choice is a button with its line
 * under it; one that cannot be had now stays a focusable button, its why under it and said again on a press. The
 * deal's `look` dresses the card as the moment it is (`ChoiceLook`), its `who` puts the person asking at the top. The
 * pick plays its little scene (the ticket torn, the name written in), then is heard before the card closes, as
 * `StoragePanel` does.
 */
export class ChoicePanel extends CardPanel {
  private deal: ChoiceDeal | null = null;
  private readonly asker = new Speaker({ name: '' }, { face: 52, className: 'choice-panel__asker' });
  /** The pick being played out (its index), so a second press does nothing meanwhile. */
  private picking: number | null = null;
  private pickTimer = 0;
  /** What line 38's blind reads once a stop is picked. */
  private blind: string | null = null;

  constructor(container: HTMLElement) {
    super(container, { className: 'choice-panel', cardClass: 'choice-panel__card ui-card', title: 'Choose' });
    this.asker.mountAbove(this.body);
  }

  /** Deals the choices (call before the Session opens the panel). */
  show(deal: ChoiceDeal): void {
    window.clearTimeout(this.pickTimer);
    this.deal = deal;
    this.picking = null;
    this.blind = null;
    this.setTitle(deal.title);
    this.root.dataset.look = deal.look?.kind ?? 'plain';
    this.asker.el.hidden = !deal.who;
    if (deal.who) {
      const { name, seed, person } = deal.who;
      this.asker.setWho({ name, ...(person ? { person } : seed !== undefined ? { seed } : {}) });
      this.asker.say(deal.who.line, 'smile');
    }
    if (this.isOpen) this.refresh();
  }

  protected override dismissLabel(): string {
    return this.deal?.dismiss ?? 'Not now';
  }

  protected override onClosed(): void {
    window.clearTimeout(this.pickTimer);
  }

  protected render(): Html {
    const deal = this.deal;
    if (!deal) return html``;
    const look = deal.look;
    switch (look?.kind) {
      case 'bus':
        return this.bus(deal, look);
      case 'taxi':
        return this.taxi(deal, look);
      case 'post':
        return this.post(deal, look);
      case 'stall':
        return this.stall(deal);
      default:
        return html`${deal.intro ? html`<p class="choice-panel__intro">${deal.intro}</p>` : ''}<ul class="choice-panel__list">${deal.choices.map((c, i) => this.plainRow(c, i))}</ul>`;
    }
  }

  /** The faces on the postcard's list: canvases, put in their slots once the markup is down. */
  protected override repaint(): void {
    super.repaint();
    const deal = this.deal;
    if (deal?.look?.kind !== 'post') return;
    for (const [i, choice] of deal.choices.entries()) {
      if (!choice.person) continue;
      this.body.querySelector(`[data-face="${i}"]`)?.append(portrait(choice.person, FACE, FACE_PAPER, 'rest'));
    }
  }

  /** The common button: focusable even when it cannot be had (the press says why), the first one focused. */
  private button(choice: Choice, i: number, className: string, inner: Html): Html {
    const picked = this.picking === i;
    return html`<button type="button" class="${className}${picked ? ' is-picked' : ''}" data-action="pick" data-index="${i}"${choice.unavailable ? html` aria-disabled="true"` : ''}${attr('data-autofocus', i === this.firstOpen())}>${inner}</button>`;
  }

  private firstOpen(): number {
    const i = this.deal?.choices.findIndex((c) => !c.unavailable) ?? -1;
    return i < 0 ? 0 : i;
  }

  private plainRow(choice: Choice, i: number): Html {
    const detail = choice.unavailable ?? choice.detail;
    return html`<li>${this.button(choice, i, 'ui-btn choice-panel__choice', html`<span class="choice-panel__label">${choice.label}</span>${detail ? html`<span class="choice-panel__detail">${detail}</span>` : ''}`)}</li>`;
  }

  /** Line 38's route board: where you stand, the line's strip, a stop per choice; the fare on a ticket stub below. */
  private bus(deal: ChoiceDeal, look: Extract<ChoiceLook, { kind: 'bus' }>): Html {
    const stops = deal.choices.map((choice, i) => {
      const detail = choice.unavailable ?? choice.detail;
      return html`<li class="cp-bus__stop">${this.button(
        choice,
        i,
        'cp-bus__pick',
        html`<span class="cp-bus__dot" aria-hidden="true"></span><span class="cp-bus__name">${choice.label}</span>${detail ? html`<span class="cp-bus__when">${detail}</span>` : ''}`,
      )}</li>`;
    });
    const torn = this.picking !== null;
    return html`<div class="cp-bus">
        <p class="cp-bus__blind"><span class="cp-bus__number">${look.line}</span><span class="cp-bus__dest">${this.blind ?? 'Where to?'}</span></p>
        <ol class="cp-bus__route">
          <li class="cp-bus__stop cp-bus__stop--here"><span class="cp-bus__dot" aria-hidden="true"></span><span class="cp-bus__name">${look.from}</span><span class="cp-bus__when">You are here</span></li>
          ${stops}
        </ol>
        <div class="cp-bus__ticket${torn ? ' is-torn' : ''}" aria-label="${`A ticket, ${formatCoins(look.fare)}, the way back included`}">
          <span class="cp-bus__ticket-head">City buses · Line ${look.line}</span>
          <span class="cp-bus__fare">${formatCoins(look.fare)}</span>
          <span class="cp-bus__ticket-foot">There and back · No ${String(4700 + Number(look.line) * 13).padStart(5, '0')}</span>
        </div>
      </div>`;
  }

  /** From the back seat: the meter's red digits, and where to as the player's own answers to the driver. */
  private taxi(deal: ChoiceDeal, look: Extract<ChoiceLook, { kind: 'taxi' }>): Html {
    const answers = deal.choices.map((choice, i) => {
      const detail = choice.unavailable ?? choice.detail;
      return html`<li>${this.button(choice, i, 'cp-taxi__answer', html`<span class="cp-taxi__words">“${choice.label}, please.”</span>${detail ? html`<span class="cp-taxi__detail">${detail}</span>` : ''}`)}</li>`;
    });
    return html`<div class="cp-taxi">
        <div class="cp-taxi__meter" aria-label="${`The meter: ${formatCoins(look.fare)}, wherever you go`}">
          <span class="cp-taxi__flag">FOR HIRE</span>
          <span class="cp-taxi__digits">${String(look.fare).padStart(3, ' ')}</span>
          <span class="cp-taxi__unit">coins · any address in town</span>
        </div>
        <ul class="cp-taxi__answers">${answers}</ul>
      </div>`;
  }

  /** A postcard off the rack: the picture side's stamp and postmark, the address side's lines, the people to write to. */
  private post(deal: ChoiceDeal, look: Extract<ChoiceLook, { kind: 'post' }>): Html {
    const picked = this.picking !== null ? deal.choices[this.picking] : null;
    // The stamp's face value, a bare figure as on a real stamp (its aria-label says the coins).
    const stampFace = String(look.price);
    const people = deal.choices.map((choice, i) => {
      const detail = choice.unavailable ?? choice.detail;
      return html`<li>${this.button(
        choice,
        i,
        'cp-post__person',
        html`<span class="cp-post__face" data-face="${i}" aria-hidden="true"></span><span class="cp-post__name">${choice.label}</span>${detail ? html`<span class="cp-post__where">${detail}</span>` : ''}`,
      )}</li>`;
    });
    return html`<div class="cp-post">
        <div class="cp-post__card">
          <div class="cp-post__message"><span class="cp-post__scrawl">Thinking of you.</span><span class="cp-post__scrawl cp-post__scrawl--2">Lots of love x</span></div>
          <div class="cp-post__address">
            <span class="cp-post__stamp" aria-label="${`A stamp, ${formatCoins(look.price)} with the card`}">${stampFace}</span>
            <span class="cp-post__to">${picked ? html`<span class="cp-post__written">${picked.label}</span>` : ''}</span>
            <span class="cp-post__rule"></span><span class="cp-post__rule"></span>
          </div>
        </div>
        <p class="cp-post__ask">${deal.intro ?? 'Who is it for?'}</p>
        <ul class="cp-post__people">${people}</ul>
      </div>`;
  }

  /** The stall's chalk board under its fairy lights: each thing it serves with its little picture and its price. */
  private stall(deal: ChoiceDeal): Html {
    const bulbs = Array.from({ length: BULBS }, (_, i) => html`<span class="cp-stall__bulb" style="${`--i:${i}`}"></span>`);
    const items = deal.choices.map((choice, i) => {
      const picture = choice.picture === 'cone' ? raw(CONE) : choice.picture ? inlinePictogram(choice.picture, 'choice-panel__picture') : '';
      const detail = choice.unavailable ?? choice.detail;
      return html`<li>${this.button(
        choice,
        i,
        'cp-stall__item',
        html`${picture}<span class="cp-stall__what">${choice.label}</span>${choice.price !== undefined ? html`<span class="cp-stall__price">${formatCoins(choice.price)}</span>` : ''}${detail ? html`<span class="cp-stall__detail">${detail}</span>` : ''}`,
      )}</li>`;
    });
    return html`<div class="cp-stall">
        <div class="cp-stall__lights" aria-hidden="true">${bulbs}</div>
        <div class="cp-stall__board">
          ${deal.intro ? html`<p class="cp-stall__intro">${deal.intro}</p>` : ''}
          <ul class="cp-stall__menu">${items}</ul>
        </div>
      </div>`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action !== 'pick' || !this.deal || this.picking !== null) return;
    const index = Number(el.dataset.index);
    const choice = this.deal.choices[index];
    if (!choice) return;
    if (choice.unavailable) {
      this.setStatus(choice.unavailable, 'info');
      el.classList.remove('is-refused');
      void el.offsetWidth;
      el.classList.add('is-refused');
      return;
    }
    const deal = this.deal;
    const kind = deal.look?.kind ?? 'plain';
    const wait = reduceMotion() ? 0 : PICK_MS[kind];
    const done = (): void => {
      this.deal = null;
      this.picking = null;
      this.close();
      deal.pick(choice.id);
    };
    if (!wait) {
      done();
      return;
    }
    this.picking = index;
    if (kind === 'bus') {
      this.blind = choice.label.toUpperCase();
      playTicketTear();
    } else if (kind === 'post') playPenStroke();
    this.setStatus('');
    this.refresh();
    this.pickTimer = window.setTimeout(done, wait);
  }
}
