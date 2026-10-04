import { tiesOf } from '@/social/gossip';
import { knowsBirthday } from '@/social/life/birthdays';
import { daysToBirthday, isBirthday, moodInfo, moodOf } from '@/social/mood';
import { everyone, findPerson, shortName } from '@/social/people';
import { effectsOf } from '@/social/perks';
import { GIFTS, TRAITS } from '@/social/socialPlan';
import { standing } from '@/social/standing';
import { atLeast, BOND_NAMES, bondOf, tierInfo, tierOf, warmthTier } from '@/social/tiers';
import type { PersonCard, PersonId, PersonState, SocialEffect, SocialGroup } from '@/social/types';
import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { nextTab } from '../panel/widgets';
import { icon, MOOD_ICONS, type IconName } from './icons';
import { trustGauge, warmthGauge } from './meters';
import { portrait } from './portrait';
import './social.css';
import './PeopleBook.css';
import { capitalise } from '@/text/strings';

/** What the book reads of the game: the day and the hour (the mood of the day). */
interface PeopleBookDeps {
  day(): number;
  hour(): number;
}

type Filter = SocialGroup | 'all';

/** Each tab's icon. */
const GROUP_ICON: Record<Filter, IconName> = { all: 'people', friends: 'heart', building: 'door', street: 'pin', market: 'tag', arcade: 'pad', rivals: 'trophy' };

/** The book's tabs, in order: everyone, then by group. */
const FILTERS: readonly { id: Filter; name: string }[] = [
  { id: 'all', name: 'Everyone' },
  { id: 'friends', name: 'Friends' },
  { id: 'building', name: 'Building' },
  { id: 'street', name: 'Street' },
  { id: 'market', name: 'Market' },
  { id: 'arcade', name: 'Arcade' },
  { id: 'rivals', name: 'Rivals' },
];

/** Whether the book lists `card` now: met, or listed from the start. */
function listed(card: PersonCard, s: Readonly<PersonState>): boolean {
  return s.met !== null || card.listed === 'always';
}

/** Whether the player has learned anything of them (their tastes in gifts show then): a fact, a trait, a gift given. */
function acquainted(s: Readonly<PersonState>): boolean {
  return s.known.length > 0 || s.traitsKnown.length > 0 || s.last.gift !== undefined;
}

/**
 * THE PEOPLE BOOK (docs/social.md "The People book"): everyone the player has met, by group, each with their tier,
 * warmth and trust, today's mood; a page per person with what the player knows of them (where to find them, the
 * traits and facts found out, greyed slots for the rest, what they like as a gift, their birthday), what they
 * remember, what the relationship does now and what comes next, whom they know. Opened by its key, the journal and
 * the pause menu; D-pad left / right changes the tab; Backspace, Esc or B go back from a page to the list.
 */
export class PeopleBook extends CardPanel {
  private filter: Filter = 'all';
  private page: PersonId | null = null;

  constructor(container: HTMLElement, private readonly deps: PeopleBookDeps) {
    super(container, { className: 'people-book', cardClass: 'people-book__book ui-card', title: 'People', header: false });
  }

  protected override onClosed(): void {
    this.page = null;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const { id } = el.dataset;
    if (action === 'filter' && id) {
      this.filter = id as Filter;
      this.page = null;
      this.refresh();
    } else if (action === 'person' && id) {
      this.page = id;
      this.refresh();
    } else if (action === 'back') this.goBack();
  }

  /** From a person's page, Esc and B go back to the list. */
  protected override onBack(): boolean {
    if (!this.page) return false;
    this.goBack();
    return true;
  }

  protected override onKey(e: KeyboardEvent): void {
    if (e.code === 'Backspace' && this.page) {
      e.preventDefault();
      this.goBack();
    }
  }

  protected override onSide(direction: 1 | -1): boolean {
    if (this.page) return false;
    const tabs = this.tabs();
    this.filter = nextTab(tabs.map((t) => t.id), this.filter, direction);
    this.refresh();
    return true;
  }

  private goBack(): void {
    this.page = null;
    this.refresh();
  }

  /** The tabs with anyone in them (everyone always). */
  private tabs(): typeof FILTERS {
    const shown = everyone().filter((p) => listed(p, standing(p.id)));
    return FILTERS.filter((f) => f.id === 'all' || shown.some((p) => p.group === f.id));
  }

  protected render(): Html {
    return this.page ? this.personPage(this.page) : this.listPage();
  }

  protected override actions(): PanelAction[] {
    return this.page ? [{ action: 'back', label: html`← All people <kbd>⌫</kbd>`, autofocus: true }] : [];
  }

  /** The portraits are drawn canvases: dropped into their slots (`data-portrait`, `data-size`) after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const id = slot.dataset.portrait!;
      const s = standing(id);
      slot.appendChild(portrait(id, Number(slot.dataset.size ?? 64), tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }

  private listPage(): Html {
    const all = everyone();
    const shown = all.filter((p) => listed(p, standing(p.id)));
    const unmet = all.length - shown.length;
    const cards = shown
      .filter((p) => this.filter === 'all' || p.group === this.filter)
      .sort((a, b) => standing(b.id).warmth - standing(a.id).warmth)
      .map((p) => this.tile(p));
    const tabs = this.tabs().map(
      (t) =>
        html`<button type="button" class="people-book__tab people-book__tab--${t.id}${t.id === this.filter ? ' people-book__tab--on' : ''}" data-action="filter" data-id="${t.id}" aria-pressed="${t.id === this.filter ? 'true' : 'false'}">${icon(GROUP_ICON[t.id], 1)}<span>${t.name}</span></button>`,
    );
    const friends = shown.filter((p) => atLeast(tierOf(standing(p.id).warmth, standing(p.id).trust), 'friend')).length;
    return html`<div class="people-book__spread">
      <nav class="people-book__tabs" aria-label="Groups">${tabs}</nav>
      <section class="people-book__page">
        <header class="people-book__masthead">
          <h2>${icon('book', 1)} People</h2>
          <p class="people-book__tally"><b>${shown.length}</b> known · <b>${friends}</b> ${friends === 1 ? 'friend' : 'friends'}${unmet > 0 ? html` · <i>${unmet} still to meet</i>` : ''}</p>
        </header>
        ${cards.length ? html`<ul class="people-book__grid">${cards}</ul>` : html`<p class="people-book__blank">Nobody here yet. Talk to people: click them.</p>`}
        ${unmet > 0 ? html`<p class="people-book__hint">${unmet} more ${unmet === 1 ? 'person' : 'people'} to meet: the stairs, Front Street, the market, the arcade, the saleroom.</p>` : ''}
      </section>
    </div>`;
  }

  /** A person on the list: a portrait card with their name, role, tier, gauges and the day's mood. */
  private tile(card: PersonCard): Html {
    const s = standing(card.id);
    const tier = tierInfo(tierOf(s.warmth, s.trust));
    const day = this.deps.day();
    const { mood } = moodOf(card.id, day, this.deps.hour());
    const cake = isBirthday(card.id, day) && knowsBirthday(card.id);
    return html`<li><button type="button" class="people-book__tile" data-action="person" data-id="${card.id}" style="--tier:${tier.colour}">
        <span class="people-book__face" data-portrait="${card.id}" data-size="56"></span>
        <span class="people-book__who">
          <b>${card.short ?? card.name}</b>
          <small>${card.role}</small>
          <span class="people-book__line"><span class="social-tier" style="--tier:${tier.colour}">${tier.glyph} ${tier.name}</span><span class="social-mood social-mood--${mood}">${icon(MOOD_ICONS[mood], 0.95)}</span>${s.number ? html`<span class="people-book__flag" aria-label="Number in your phone">${icon('phone', 0.9)}</span>` : ''}${cake ? html`<span class="people-book__flag people-book__flag--cake" aria-label="Birthday today">${icon('cake', 0.9)}</span>` : ''}</span>
        </span>
        <span class="people-book__gauges">${warmthGauge(s, { compact: true })}${trustGauge(s, { compact: true })}</span>
      </button></li>`;
  }

  private personPage(id: PersonId): Html {
    const card = findPerson(id);
    if (!card) return html``;
    const s = standing(id);
    const tierId = tierOf(s.warmth, s.trust);
    const tier = tierInfo(tierId);
    const day = this.deps.day();
    const { mood, why } = moodOf(id, day, this.deps.hour());
    const moodView = moodInfo(mood);
    const held = warmthTier(s.warmth) !== tierId;
    const known = s.met !== null || card.listed === 'always';
    const traits = card.traits.map((t) => (s.traitsKnown.includes(t) ? html`<li class="people-book__trait"><b>${TRAITS[t].name}</b><small>${TRAITS[t].blurb}</small></li>` : html`<li class="people-book__trait people-book__trait--unknown"><b>?</b><small>Not found out yet</small></li>`));
    const facts = (card.facts ?? []).map((f) => (s.known.includes(f.id) ? html`<li>${f.text}</li>` : html`<li class="people-book__unknown">Something to find out${f.from && f.from !== 'stranger' ? html` <small>(once ${tierInfo(f.from).name})</small>` : ''}</li>`));
    const gifts = acquainted(s)
      ? html`${(card.likes ?? []).map((g) => html`<span class="people-book__gift">${icon('heart', 0.85)} ${GIFTS[g].name}</span>`)}${(card.dislikes ?? []).map((g) => html`<span class="people-book__gift people-book__gift--no">${icon('close', 0.85)} ${GIFTS[g].name}</span>`)}`
      : html`<span class="people-book__unknown">Get to know them first.</span>`;
    const birthday = knowsBirthday(id) ? birthdayLine(id, day) : 'Not known yet';
    const memories = s.memories.length
      ? html`<ol class="people-book__diary">${s.memories.map((m) => html`<li class="${m.weight < 0 ? 'people-book__diary--sore' : ''}"><time>Day ${m.day}</time><span>“${capitalise(m.text)}.”</span></li>`)}</ol>`
      : html`<p class="people-book__unknown">Nothing yet.</p>`;
    const { active, next, penalties } = effectsOf(id);
    const stamp = (e: SocialEffect, kind: 'on' | 'bad' | 'next' | 'risk') =>
      html`<li class="people-book__stamp people-book__stamp--${kind}" style="--tier:${tierInfo(e.at).colour}"><span>${e.text}</span><small>${kind === 'on' ? 'Yours' : kind === 'bad' ? 'In force' : `${tierInfo(e.at).name}${e.down ? ' or worse' : ''}${e.trust ? ` · trust ${e.trust}` : ''}`}</small></li>`;
    return html`<div class="people-book__dossier" style="--tier:${tier.colour}">
      <aside class="people-book__id">
        <figure class="people-book__polaroid">
          <span class="people-book__tape"></span>
          <span data-portrait="${id}" data-size="132"></span>
          <figcaption>${card.short ?? card.name}</figcaption>
        </figure>
        <p class="people-book__ribbon"><span class="social-tier" style="--tier:${tier.colour}">${tier.glyph} ${tier.name}</span></p>
        <div class="people-book__meters">
          <span>${icon('heart', 0.9)} Warmth</span>${warmthGauge(s)}
          <span>${icon('key', 0.9)} Trust</span>${trustGauge(s)}
        </div>
        <p class="people-book__bond">${BOND_NAMES[bondOf(s.warmth, s.trust)]}${held ? html`<br><em>Trust holds them at ${tier.name}</em>` : ''}</p>
        <dl class="people-book__card">
          <dt>${icon('pin', 0.9)}</dt><dd>${known ? card.whereabouts : 'Not met yet'}</dd>
          <dt>${icon('cake', 0.9)}</dt><dd>${birthday}</dd>
          <dt>${icon(MOOD_ICONS[mood], 0.9)}</dt><dd>${moodView.name}${why ? html` · ${why}` : ''}</dd>
          <dt>${icon('phone', 0.9)}</dt><dd>${s.number ? 'Number in your phone' : card.phone ? 'Ask them for their number' : 'No phone'}</dd>
        </dl>
      </aside>
      <section class="people-book__notes">
        <header class="people-book__title">
          <h2>${card.name}</h2>
          <p>${card.role}</p>
        </header>
        <h3>Their ways</h3>
        <ul class="people-book__traits">${traits}</ul>
        ${facts.length ? html`<h3>What you know</h3><ul class="people-book__facts">${facts}</ul>` : ''}
        <h3>Gifts</h3>
        <p class="people-book__gifts">${gifts}</p>
        <h3>What it does</h3>
        <ul class="people-book__stamps">
          ${active.filter((e) => !e.down).map((e) => stamp(e, 'on'))}
          ${active.filter((e) => e.down).map((e) => stamp(e, 'bad'))}
          ${next.map((e) => stamp(e, 'next'))}
          ${penalties.map((e) => stamp(e, 'risk'))}
        </ul>
        <h3>They remember</h3>
        ${memories}
        <h3>Who they know</h3>
        ${this.web(id)}
      </section>
    </div>`;
  }

  /** Whom they know among the people met: their portrait in the middle, the others round it, a line each coloured by the tie. */
  private web(id: PersonId): Html {
    const ties = tiesOf(id)
      .filter((t) => standing(t.id).met !== null || findPerson(t.id)?.listed === 'always')
      .slice(0, 8);
    if (!ties.length) return html`<p class="people-book__unknown">Nobody you know.</p>`;
    const at = (i: number) => {
      const a = -Math.PI / 2 + (i / ties.length) * Math.PI * 2;
      return { x: 50 + Math.cos(a) * 38, y: 50 + Math.sin(a) * 36 };
    };
    const lines = ties.map((t, i) => {
      const p = at(i);
      const kind = t.tie >= 0.2 ? 'warm' : t.tie > -0.2 ? 'even' : 'cold';
      return html`<line x1="50" y1="50" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="people-book__thread people-book__thread--${kind}" style="--weight:${(1 + Math.abs(t.tie) * 2.5).toFixed(2)}"/>`;
    });
    const nodes = ties.map((t, i) => {
      const p = at(i);
      return html`<button type="button" class="people-book__node" data-action="person" data-id="${t.id}" style="left:${p.x.toFixed(1)}%;top:${p.y.toFixed(1)}%">
        <span data-portrait="${t.id}" data-size="38"></span><b>${shortName(t.id)}</b><small>${tieName(t.tie)}</small>
      </button>`;
    });
    return html`<div class="people-book__web">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      <span class="people-book__hub" data-portrait="${id}" data-size="46"></span>
      ${nodes}
    </div>`;
  }
}

function birthdayLine(id: PersonId, day: number): string {
  const days = daysToBirthday(id, day);
  if (days === 0) return 'Today! A gift counts three times';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function tieName(tie: number): string {
  return tie >= 0.6 ? 'close' : tie > 0.2 ? 'friends' : tie > -0.2 ? 'neighbours' : tie > -0.5 ? 'don’t get on' : 'can’t stand each other';
}
