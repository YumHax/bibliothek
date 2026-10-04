import type { Game } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { optionsFor, opening, perform, type OptionView, type Outcome, type InteractionExtra, type TalkContext } from '@/social/conversation';
import { extrasFor } from '@/social/extras';
import { gameFit, giftName } from '@/social/gifts';
import { tiesOf } from '@/social/gossip';
import { isBirthday, moodInfo, moodOf } from '@/social/mood';
import { findPerson, shortName } from '@/social/people';
import { effectsOf } from '@/social/perks';
import { COIN_GIFT, GROUPS, TRAITS } from '@/social/socialPlan';
import { isMet, standing, tier } from '@/social/standing';
import type { ConversationPanelLike, TalkExtra, TalkSession } from '@/social/talk';
import { BOND_NAMES, bondOf, tierInfo, tierOf, tierRank, warmthTier } from '@/social/tiers';
import type { GiftKind, InteractionGroup, InteractionId, PersonId } from '@/social/types';
import { ModalPanel } from '../ModalPanel';
import { attr, html, paint, type Html } from '../panel/html';
import { GROUP_ICONS, icon, INTERACTION_ICONS, MOOD_ICONS, type IconName } from './icons';
import { oddsPips, tierProgress, trustGauge, warmthGauge, warmthVars } from './meters';
import { portrait } from './portrait';
import './social.css';
import { capitalise } from '@/text/strings';
import { formatCoins } from '@/text/money';

/** Something in the pocket that can be given. */
export interface PocketGift {
  kind: GiftKind;
  count: number;
  /** Takes one out of the pocket; false when there is none left. */
  take(): boolean;
}

/** What the panel needs of the game: the clock, the wallet, the collection, the pocket. */
interface ConversationDeps {
  day(): number;
  hour(): number;
  wallet: { readonly coins: number; spend(coins: number): boolean };
  /** The games the player could give (owned, not lent, not a keepsake). */
  givable(): readonly Game[];
  /** Gives `game` away (out of the collection); false when it could not go. */
  giveGame(game: Game): boolean;
  /** What is in the pocket to give. */
  pocket(): readonly PocketGift[];
  notices: Pick<NoticeActions, 'refuse'>;
}

/** A sub-list the panel is showing instead of the options: what to give, which game, whom to gossip about. */
type Picking = { kind: 'gift' } | { kind: 'game' } | { kind: 'about' } | null;

/** Under this warmth the panel says what the bad blood costs (the cold tier's floor). */
const WARMTH_COLD = -15;

/** How many of the player's games the "Give a game" list shows (the best fits first). */
const GAME_LIST = 12;

/**
 * Talking to someone (docs/social.md "Talking"): a sheet on the right with the room still in view on the left, the
 * person turned to the player. At the top their portrait, name and role, their tier, the warmth and trust bars, the
 * mood of the day; then what they just said and what it did (a chip: "+6 liked the joke", a fact learned); then the
 * interactions by group, each with its odds once the player knows them (▲▲ ▲ ▽ ▼, "?" for a stranger), the place's
 * own entries (swap, haggle, visit) among them. Number keys pick; Backspace, Esc or B come back from a sub-list;
 * Esc or Leave leaves. On the kit's base with its own sheet (not a card: the room stays in view).
 */
export class ConversationPanel extends ModalPanel implements ConversationPanelLike {
  private talk: TalkSession | null = null;
  private picking: Picking = null;
  private said = '';
  private chips: string[] = [];
  private readonly sheet: HTMLElement;
  /** The choices on screen in order (a click's `data-choice`), and those the number keys reach (shown ones, in order). */
  private choices: (() => void)[] = [];
  private keyed: (() => void)[] = [];
  /** The standing before the last interaction: the gauges ease from it to the new one. */
  private before: { warmth: number; trust: number } | null = null;
  /** The line being typed out, and its timer. */
  private reveal = 0;

  constructor(container: HTMLElement, private readonly deps: ConversationDeps) {
    super(container, { className: 'ui-panel social-talk', label: 'Conversation', backdropCloses: true });
    // Focusable, so a click on the sheet's text keeps the keys (1-9, Backspace) in the panel.
    paint(this.root, html`<aside class="social-talk__sheet ui-card" tabindex="-1"></aside>`);
    this.sheet = this.root.querySelector('.social-talk__sheet')!;
  }

  prepare(talk: TalkSession): void {
    this.talk = talk;
    this.picking = null;
    this.said = '';
    this.chips = [];
  }

  protected override onOpened(): void {
    const talk = this.talk;
    if (!talk) return;
    const { line, introduced } = opening(talk.person, this.context());
    const own = !introduced && tierRank(tier(talk.person)) > tierRank('cold') ? talk.opening?.() : null;
    this.say(own ?? line);
    if (introduced) this.chips = [`Met ${findPerson(talk.person)?.name ?? shortName(talk.person)}`];
    this.paint();
  }

  protected override onClosed(): void {
    window.clearInterval(this.reveal);
    const talk = this.talk;
    this.talk = null;
    talk?.onClose?.();
  }

  protected override repaint(): void {
    this.paint();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'choose') this.choices[Number(el.dataset.choice)]?.();
    else if (action === 'back') this.back();
  }

  /** From a sub-list, Esc and B come back to the options; from the options they leave. */
  protected override onBack(): boolean {
    if (!this.picking) return false;
    this.back();
    return true;
  }

  protected override onKey(e: KeyboardEvent): void {
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      const choice = this.keyed[Number(digit[2]) - 1];
      if (choice) {
        e.preventDefault();
        choice();
      }
      return;
    }
    if (e.code === 'Backspace' && this.picking) {
      e.preventDefault();
      this.back();
    }
  }

  private context(): TalkContext {
    return { day: this.deps.day(), hour: this.deps.hour(), place: this.talk?.place ?? 'elsewhere' };
  }

  private back(): void {
    this.picking = null;
    this.paint();
  }

  /** Their line: over their head when their body is here, in the panel always. */
  private say(line: string): void {
    this.said = line;
    this.talk?.body?.speak(line);
  }

  private choose(option: OptionView): void {
    if (option.id === 'giveGift') return this.pick({ kind: 'gift' });
    if (option.id === 'giveGame') return this.pick({ kind: 'game' });
    if (option.id === 'gossip') return this.pick({ kind: 'about' });
    if (option.id === 'giveCoins' && !this.deps.wallet.spend(COIN_GIFT)) {
      this.deps.notices.refuse(`${formatCoins(COIN_GIFT)} to give, you have ${this.deps.wallet.coins}`);
      return;
    }
    this.act(option.id);
  }

  private pick(picking: Picking): void {
    this.picking = picking;
    this.paint();
  }

  private act(id: InteractionId, extra: InteractionExtra = {}): void {
    const talk = this.talk;
    if (!talk) return;
    const was = standing(talk.person);
    this.before = { warmth: was.warmth, trust: was.trust };
    const outcome = perform(talk.person, id, this.context(), extra);
    this.picking = null;
    this.say(outcome.line);
    talk.body?.react?.(outcome.reaction);
    this.chips = chipsOf(talk.person, outcome);
    this.paint();
  }

  private runExtra(extra: TalkExtra): void {
    if (extra.opensPanel) {
      // A panel of its own opens for it (the swap, the haggle): this one makes way first.
      this.close();
      extra.run();
      return;
    }
    const result = extra.run() ?? {};
    if (result.line) this.say(result.line);
    if (result.close) {
      this.close();
      return;
    }
    this.chips = [];
    this.paint();
  }

  private paint(): void {
    const talk = this.talk;
    if (!talk) return;
    const id = talk.person;
    const card = findPerson(id);
    const s = standing(id);
    const tierId = tierOf(s.warmth, s.trust);
    const tier = tierInfo(tierId);
    const met = isMet(id);
    const ctx = this.context();
    const { mood, why } = moodOf(id, ctx.day, ctx.hour);
    const moodView = moodInfo(mood);
    const held = warmthTier(s.warmth) !== tierId;
    const traits = s.traitsKnown.map((t) => html`<span class="ui-chip social-chip">${TRAITS[t].name}</span>`);
    const birthday = isBirthday(id, ctx.day) ? html`<span class="ui-chip social-chip social-chip--gold">${icon('cake', 1)} Birthday today</span>` : '';
    const phone = talk.place === 'phone';
    this.choices = [];
    this.keyed = [];
    // The sheet takes the tier's colour: its glow, the ring, the gauge's fill.
    this.sheet.style.setProperty('--tier', tier.colour);
    this.sheet.classList.toggle('social-talk__sheet--cross', tierRank(tierId) <= tierRank('cold'));
    paint(
      this.sheet,
      html`<header class="social-talk__head">
        <div class="social-medallion" style="--tier:${tier.colour};--progress:${tierProgress(s).toFixed(3)}">
          <div class="social-medallion__face"></div>
          ${phone ? html`<span class="social-medallion__badge" aria-label="On the phone">${icon('phone', 0.9)}</span>` : ''}
        </div>
        <div class="social-talk__who">
          <h2 class="social-talk__name">${met ? (card?.name ?? id) : capitalise(card?.role ?? 'Someone')}</h2>
          <p class="social-talk__role">${met ? (card?.role ?? '') : 'You don’t know their name yet'}</p>
          <p class="social-talk__badges">
            <span class="social-tier" style="--tier:${tier.colour}">${tier.glyph} ${tier.name}</span>
            <span class="social-mood social-mood--${mood}">${icon(MOOD_ICONS[mood], 1)} ${moodView.name}</span>
          </p>
        </div>
      </header>
      <div class="social-talk__meters">
        <span class="social-talk__meter-name">${icon('heart', 0.95)} Warmth</span>${warmthGauge(s)}
        <span class="social-talk__meter-name">${icon('key', 0.95)} Trust</span>${trustGauge(s)}
      </div>
      <p class="social-talk__bond">${BOND_NAMES[bondOf(s.warmth, s.trust)]}${held ? html` · <em>trust holds them at ${tier.name}</em>` : ''}${why ? html` · ${why}` : ''}</p>
      ${traits.length || birthday ? html`<p class="social-talk__traits">${birthday}${traits}</p>` : ''}
      ${this.trouble(id)}
      <figure class="social-speech${phone ? ' social-speech--phone' : ''}">
        <blockquote class="social-speech__line">${this.said}</blockquote>
        <figcaption>${phone ? html`${icon('phone', 0.9)} on the phone` : met ? (card?.short ?? card?.name ?? '') : ''}</figcaption>
      </figure>
      ${this.chips.length ? html`<p class="social-talk__chips">${this.chips.map((c, i) => html`<span class="social-float${/^[-−]/.test(c) ? ' social-float--bad' : ''}" style="--i:${i}">${c}</span>`)}</p>` : ''}
      <div class="social-talk__options">${this.picking ? this.pickingHtml(id) : this.optionsHtml(id, ctx)}</div>
      <footer class="social-talk__foot">
        ${this.picking ? html`<button type="button" class="ui-btn ui-btn--sm" data-action="back">${icon('arrowLeft', 1)} Back <kbd>⌫</kbd></button>` : ''}
        <button type="button" class="ui-btn ui-btn--sm" data-action="close" aria-label="Leave">Leave <kbd>Esc</kbd></button>
      </footer>`,
    );
    this.sheet.querySelector('.social-medallion__face')!.appendChild(portrait(id, 88, tier.colour));
    this.animate();
    this.sheet.querySelector<HTMLButtonElement>('button[data-action="choose"]:not(:disabled)')?.focus({ preventScroll: true });
  }

  /**
   * After a paint: the line is typed out (quickly; at once for reduced motion), and the gauges ease from the standing
   * before the interaction to the one after.
   */
  private animate(): void {
    window.clearInterval(this.reveal);
    const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const line = this.sheet.querySelector<HTMLElement>('.social-speech__line');
    if (line && !quiet && this.said.length > 1) {
      const text = this.said;
      let shown = 0;
      const step = Math.max(1, Math.ceil(text.length / 45));
      line.textContent = '';
      line.classList.add('social-speech__line--typing');
      this.reveal = window.setInterval(() => {
        shown = Math.min(text.length, shown + step);
        line.textContent = text.slice(0, shown);
        if (shown >= text.length) {
          window.clearInterval(this.reveal);
          line.classList.remove('social-speech__line--typing');
        }
      }, 16);
    }
    const before = this.before;
    this.before = null;
    if (!before || quiet || !this.talk) return;
    const after = standing(this.talk.person);
    if (before.warmth === after.warmth && before.trust === after.trust) return;
    // The gauges are placed by variables: set the old standing's, then the new one's a frame later, and the CSS
    // transitions on the marker, the fill and the segments ease between them.
    const warmth = this.sheet.querySelector<HTMLElement>('.social-talk__meters .social-gauge--warmth');
    const trust = this.sheet.querySelector<HTMLElement>('.social-talk__meters .social-gauge--trust');
    const set = (w: number, t: number): void => {
      for (const [k, v] of Object.entries(warmthVars(w))) warmth?.style.setProperty(k, v);
      trust?.style.setProperty('--trust', t.toFixed(1));
    };
    set(before.warmth, before.trust);
    void warmth?.offsetWidth;
    requestAnimationFrame(() => set(after.warmth, after.trust));
  }

  /** Cold or worse: what the bad blood costs now, and the way back (an apology, a gift, a mutual friend). */
  private trouble(id: PersonId): Html | '' {
    const penalties = effectsOf(id).active.filter((e) => e.down);
    const s = standing(id);
    if (s.warmth >= WARMTH_COLD && !penalties.length) return '';
    return html`<aside class="social-trouble">
      <p class="social-trouble__head">${icon('storm', 1.05)} Bad blood</p>
      ${penalties.length ? html`<ul>${penalties.map((e) => html`<li>${e.text}</li>`)}</ul>` : ''}
      <p class="social-trouble__way">An apology, a gift they like or a word from a friend of theirs can mend it.</p>
    </aside>`;
  }

  /** A choice: its number key, its icon, its label, its odds (or why it is shut), read out whole. */
  private button(label: string, run: () => void, options: { icon?: IconName; side?: Html | string; disabled?: string | null; hint?: string; tone?: 'mean' | 'place' } = {}): Html {
    const n = this.choices.length;
    this.choices.push(run);
    // The folded Mean group gets no number: a key should never do something the player can't see.
    const k = options.tone === 'mean' ? -1 : this.keyed.length;
    if (k >= 0 && k < 9) this.keyed.push(run);
    const key = k >= 0 && k < 9 ? html`<kbd class="social-choice__key">${k + 1}</kbd>` : html`<span class="social-choice__key"></span>`;
    const disabled = options.disabled ?? null;
    const said = disabled ?? options.hint ?? '';
    const tone = options.tone ? ` social-choice--${options.tone}` : '';
    return html`<button type="button" class="social-choice${tone}" data-action="choose" data-choice="${n}"${attr('disabled', !!disabled)}${said ? html` aria-label="${label}, ${said}"` : ''}>
      ${key}<span class="social-choice__icon">${options.icon ? icon(disabled ? 'lock' : options.icon) : ''}</span><span class="social-choice__label">${label}</span><span class="social-choice__side">${disabled ? html`<small>${disabled}</small>` : (options.side ?? '')}</span>
    </button>`;
  }

  private optionsHtml(id: PersonId, ctx: TalkContext): Html {
    const options = optionsFor(id, ctx);
    const extras = [...(this.talk?.extras ?? []), ...extrasFor({ person: id, place: ctx.place, day: ctx.day, hour: ctx.hour, session: this.talk?.session ?? null })];
    const sections: Html[] = [];
    for (const group of GROUPS) {
      const rows: Html[] = [];
      // The place's own first: what the player most likely came for (swap, buy, visit).
      for (const extra of extras.filter((x) => x.group === group.id)) rows.push(this.button(extra.label, () => this.runExtra(extra), { icon: GROUP_ICONS[extra.group], disabled: extra.disabled?.() ?? null, tone: 'place' }));
      for (const option of options.filter((o) => o.group === group.id)) {
        rows.push(
          this.button(option.label, () => this.choose(option), {
            icon: INTERACTION_ICONS[option.id],
            side: oddsPips(option.odds, option.oddsKnown),
            disabled: option.disabled,
            hint: option.oddsKnown ? `about ${Math.round(option.odds * 100)}% it lands` : 'you don’t know them well enough to tell',
            tone: group.id === 'mean' ? 'mean' : undefined,
          }),
        );
      }
      if (!rows.length) continue;
      // Mean things are there, but folded away: one click to open, never an accident.
      if (group.id === 'mean')
        sections.push(html`<details class="social-group social-group--mean"><summary><h3>${icon(GROUP_ICONS[group.id], 0.95)} ${group.name}</h3></summary><div class="social-group__list">${rows}</div></details>`);
      else sections.push(html`<section class="social-group social-group--${group.id as InteractionGroup}"><h3>${icon(GROUP_ICONS[group.id], 0.95)} ${group.name}</h3><div class="social-group__list">${rows}</div></section>`);
    }
    return html`${sections}`;
  }

  private pickingHtml(id: PersonId): Html {
    const picking = this.picking!;
    if (picking.kind === 'gift') {
      const gifts = this.deps.pocket().filter((g) => g.count > 0);
      if (!gifts.length) return html`<p class="social-empty">Nothing in your pockets to give. Front Street’s shops sell croissants, flowers and treats.</p>`;
      const known = standing(id).known.length > 0 || standing(id).traitsKnown.length > 0;
      const card = findPerson(id);
      const rows = gifts.map((g) => {
        const hint = known ? (card?.likes?.includes(g.kind) ? '♥ loves' : card?.dislikes?.includes(g.kind) ? '✖ dislikes' : '') : '';
        return this.button(`${capitalise(giftName(g.kind))} ×${g.count}`, () => {
          if (!g.take()) return;
          this.act('giveGift', { gift: g.kind });
        }, { icon: 'gift', side: hint ? html`<span class="social-like${hint.startsWith('✖') ? ' social-like--no' : ''}">${hint}</span>` : '' });
      });
      return html`<section class="social-group"><h3>${icon('gift', 0.95)} Give…</h3><div class="social-group__list">${rows}</div></section>`;
    }
    if (picking.kind === 'game') {
      const games = [...this.deps.givable()]
        .map((game) => ({ game, fit: gameFit(id, { title: game.title, platform: game.platform, genres: game.genre ? [game.genre.toLowerCase()] : [], year: yearOf(game) }) }))
        .sort((a, b) => b.fit - a.fit)
        .slice(0, GAME_LIST);
      if (!games.length) return html`<p class="social-empty">No game you could give (lent ones and keepsakes stay).</p>`;
      const rows = games.map(({ game, fit }) =>
        this.button(game.title, () => {
          if (!this.deps.giveGame(game)) return;
          this.act('giveGame', { game: { title: game.title, platform: game.platform, genres: game.genre ? [game.genre.toLowerCase()] : [], year: yearOf(game) } });
        }, { icon: 'cart', side: fit >= 0.4 ? html`<span class="social-like">${fit >= 0.7 ? '♥♥ their kind of game' : '♥'}</span>` : '' }),
      );
      return html`<section class="social-group"><h3>${icon('cart', 0.95)} Give a game <small>it leaves your collection</small></h3><div class="social-group__list">${rows}</div></section>`;
    }
    const about = tiesOf(id).filter((t) => isMet(t.id)).slice(0, 8);
    if (!about.length) return html`<p class="social-empty">You don’t know anyone you both know yet.</p>`;
    const rows = about.map((t) => this.button(shortName(t.id), () => this.act('gossip', { about: t.id }), { icon: 'whisper', side: t.tie > 0.3 ? 'their friend' : t.tie < -0.2 ? 'no love lost' : '' }));
    return html`<section class="social-group"><h3>${icon('whisper', 0.95)} Gossip about…</h3><div class="social-group__list">${rows}</div></section>`;
  }
}

/** The chips under their line: what moved, what was learned. */
function chipsOf(id: PersonId, outcome: Outcome): string[] {
  const chips: string[] = [];
  const c = outcome.change;
  if (c && (c.warmth || c.trust)) {
    const parts = [c.warmth ? `${signed(c.warmth)} warmth` : '', c.trust ? `${signed(c.trust)} trust` : ''].filter(Boolean).join(', ');
    chips.push(`${parts}${c.why ? ` · ${c.why}` : ''}`);
  } else if (outcome.ok && !c) chips.push('Nice, but you’ve done that today');
  if (outcome.fact) chips.push(`Learned: ${outcome.fact.text}`);
  if (outcome.trait) chips.push(`${shortName(id)} is ${TRAITS[outcome.trait].name.toLowerCase()}`);
  if (outcome.number) chips.push('Number in your phone');
  return chips;
}

/** A change as the chip says it: whole points, "+<1" for a sliver (a friend of long standing barely moves). */
function signed(value: number): string {
  if (Math.abs(value) < 1) return value > 0 ? '+<1' : '−<1';
  const n = Math.round(value);
  return n > 0 ? `+${n}` : `${n}`;
}

function yearOf(game: Game): number | undefined {
  const y = Number(game.releaseDate?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : undefined;
}
