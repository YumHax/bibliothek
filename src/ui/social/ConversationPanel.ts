import type { Game } from '@/catalog/types';
import { playUiSound } from '@/audio/uiSounds';
import { conversing, type NoticeActions } from '@/notices';
import { farewell, optionsFor, opening, perform, playerLine, type OptionView, type InteractionExtra, type TalkContext } from '@/social/conversation';
import { extrasFor } from '@/social/extras';
import { gameFit, giftName, tasteOf, type GameGift } from '@/social/gifts';
import { tiesOf } from '@/social/gossip';
import { isBirthday, moodInfo, moodOf } from '@/social/mood';
import { firstConversation, noteOffered, offeredBefore } from '@/social/noticed';
import { findPerson, shortName } from '@/social/people';
import { COIN_GIFT, INTERACTIONS, TRAITS } from '@/social/socialPlan';
import { isMet, standing, talkLeft, tier } from '@/social/standing';
import type { ConversationPanelLike, SocialAnchor, TalkExtra, TalkSession } from '@/social/talk';
import { BOND_NAMES, bondOf, tierInfo, tierOf, tierRank, warmthTier } from '@/social/tiers';
import type { GiftKind, InteractionId, PersonId, Trait } from '@/social/types';
import { unit01 } from '@/random';
import { Arming, armedLine } from '../confirmTwice';
import { ModalPanel } from '../ModalPanel';
import { attr, html, paint, type Html } from '../panel/html';
import { coverImg } from '../panel/widgets';
import { rememberFocus } from '../rememberFocus';
import { GIFT_ICONS, GROUP_ICONS, icon, INTERACTION_ICONS, MOOD_ICONS, type IconName } from './icons';
import { meterVars, relationMeter } from './meters';
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

/** What the panel needs of the game: the clock, the wallet, the collection, the pocket, the view of the room. */
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
  notices: Pick<NoticeActions, 'refuse' | 'tip'>;
  /** A game's box art (the list of games to give shows it). */
  coverUrl(game: Game): string | undefined;
  /** Where `anchor` is on the screen, `lift` metres above it (negative: below); null when it is behind the view. */
  whereOnScreen?(anchor: SocialAnchor, lift: number): { x: number; y: number } | null;
  /** Turns the view gently to `anchor`, `lift` metres above it (their face, under it). */
  frame?(anchor: SocialAnchor, lift: number): void;
  /** Narrows the view by `factor` (1: the player's own), eased, as a film's close shot does while they talk. */
  zoom?(factor: number): void;
  /** Opens `id`'s page in the People book. */
  openPerson?(id: PersonId): void;
}

/** What the menu shows: the conversation's own list, or one of its sub-lists. */
type View = 'main' | 'give' | 'ask' | 'mean' | 'gossip' | 'game';

/** A sub-list's heading. */
const VIEW_TITLES: Record<Exclude<View, 'main'>, string> = {
  give: 'Give',
  ask: 'Ask',
  mean: 'Be mean',
  gossip: 'Gossip about…',
  game: 'Give which game?',
};

/** The talk on its chips, short (what the player then says is the full line, above the menu). */
const TOPICS: Partial<Record<InteractionId, string>> = {
  chat: 'Chat',
  askDay: 'Their day',
  talkGames: 'Talk games',
  compliment: 'Compliment',
  joke: 'A joke',
  gossip: 'Gossip…',
  complain: 'Complain',
  apologise: 'Apologise',
};

/** One row of the menu: what it says, what it does, the words beside it. */
interface Row {
  /** Stable across repaints (`data-id`): the focus comes back to it, and what was offered is kept by it. */
  key: string;
  label: string;
  icon: IconName;
  run: () => void;
  /** Words beside it: a found-out trait of theirs that suits it, "news", "new", how they take a gift. */
  tags?: Html[];
  /** It opens a list or a panel of its own ("›"). */
  more?: boolean;
  /** `place`: the place's own entries, first; `topic`: the talk's chips; `sub`: a sub-list's button; `leave`: Goodbye or Back. */
  tone?: 'place' | 'topic' | 'sub' | 'leave' | 'mean' | 'armed';
  /** What they would like to talk about (their thought): it glows until it is talked about. */
  wished?: boolean;
  cover?: Html;
}

/** How many of the player's games the game list shows (the best fits first). */
const GAME_LIST = 12;

/** Their talk left today under which they show they are getting restless (`standing.talkLeft`). */
const RESTLESS = 2;

/** From the point their words come from down to their face (m): where the hearts and the thought appear, for a body that does not say. */
const FACE = -0.45;
/** How much the view narrows on the face while talking (70 degrees to about 50). */
const CLOSE_SHOT = 1.4;

/**
 * From `anchor` down to their eyes (m): the body's own measure when it gives one (`userData.faceLift`: a child, a
 * seated friend, someone tall), else `FACE`.
 */
function faceLift(anchor: SocialAnchor): number {
  const lift = anchor.userData.faceLift as (() => number) | undefined;
  return typeof lift === 'function' ? lift() : FACE;
}

/** A click on the room this far from the card (px) ends the conversation; nearer, it is a missed row. */
const MISSED_CLICK = 56;

/** A label phrased as the player's words ("Any news?", "Race you up!") is said; else it is something done. */
function spoken(label: string): boolean {
  return /[?!…]$/.test(label);
}

/** What may be marked new: what a tier opens or the place offers now and then (not a gift, a game, a name). */
function notable(key: string): boolean {
  return key.startsWith('talk:') || key.startsWith('extra:');
}

function tag(text: string, kind = ''): Html {
  return html`<span class="social-tag${kind ? ` social-tag--${kind}` : ''}">${text}</span>`;
}

/**
 * Talking to someone (docs/social.md "Talking"), the way The Sims does it: the person is the show. The view turns to
 * their face; their answer comes over their head, their body takes what was said, hearts rise by their face when they
 * warm to you (a cracked one falls when they cool, a word when their trust moves) with a chime. The panel is a card
 * beside them, clear of the bubble over their head, its foot fixed so the rows under the pointer never move: the line
 * you just said, who they are to you (name, role, tier in a word, one bar, their mood and ways), and what you can do:
 * the place's own entries first (words in quotes are said, the rest done), the talk on chips (one they would like to
 * talk about glows after their thought), Give…, Ask… and Be mean…, Goodbye. No odds, numbers or rules: a trait you
 * found out tags what suits them, what is new since last time says so. Talked out, they look at their watch, then
 * leave. Only a voice or a call shows their face and says their lines in the card.
 */
export class ConversationPanel extends ModalPanel implements ConversationPanelLike {
  private talk: TalkSession | null = null;
  private view: View = 'main';
  /** The sub-lists opened, each with the row that opened it (Back returns there). */
  private trail: { view: View; from: string }[] = [];
  /** Their last line (the card says it only when they are not in the room), and the player's (said, or done). */
  private said = '';
  private mine: { text: string; spoken: boolean } | null = null;
  /** The standing before the last try: the bar eases from it, the hearts say which way it went. */
  private before: { warmth: number; trust: number } | null = null;
  /** A trait the last try found out: its tag glows once. */
  private found: Trait | null = null;
  /** What they would like to talk about this time (their thought), until it is talked about. */
  private wish: InteractionId | null = null;
  /** What they offered before this conversation (null: nothing kept yet, so nothing is new), and what they offer in it. */
  private offeredEarlier: ReadonlySet<string> | null = null;
  private offered = new Set<string>();
  /** Closing says goodbye (not when an entry opens a panel of its own, or they leave by themselves). */
  private farewell = true;
  /** The rows on show, in order (a click's `data-choice`, a number key's place). */
  private rows: Row[] = [];
  /** Timers: their leaving (talked out), their look at the watch, the line typed out; the frame loop. */
  private ending = 0;
  private fidget = 0;
  private reveal = 0;
  private follow = 0;
  /** When the card was last placed beside them (the frame loop's clock). */
  private placedAt = 0;
  /** A press on the room, where it was (a click there ends the conversation unless it was near the card). */
  private pressed: { x: number; y: number } | null = null;
  private readonly arming = new Arming(() => this.refreshMenu());
  private readonly over: HTMLElement;
  private readonly card: HTMLElement;
  private readonly mineEl: HTMLElement;
  private readonly their: HTMLElement;
  private readonly who: HTMLElement;
  private readonly menu: HTMLElement;

  constructor(container: HTMLElement, private readonly deps: ConversationDeps) {
    super(container, { className: 'ui-panel social-talk', label: 'Conversation' });
    // Focusable, so a click on the card's text keeps the keys (1-9, Backspace) in the panel.
    paint(
      this.root,
      html`<div class="social-talk__over" aria-hidden="true"></div>
        <aside class="social-talk__card ui-card" tabindex="-1">
          <p class="social-talk__mine" hidden></p>
          <figure class="social-talk__their" hidden></figure>
          <header class="social-talk__who"></header>
          <div class="social-talk__menu"></div>
        </aside>`,
    );
    const part = (selector: string): HTMLElement => this.root.querySelector<HTMLElement>(selector)!;
    this.over = part('.social-talk__over');
    this.card = part('.social-talk__card');
    this.mineEl = part('.social-talk__mine');
    this.their = part('.social-talk__their');
    this.who = part('.social-talk__who');
    this.menu = part('.social-talk__menu');
    // The number keys' digits show only while the keys are in use: a hand back on the mouse hides them.
    this.listen(this.root, 'pointermove', () => this.root.classList.remove('social-talk--keys'));
    // A click on the room leaves, unless it only just missed the card.
    this.listen(this.root, 'pointerdown', (e) => {
      this.pressed = e.target === this.root ? { x: e.clientX, y: e.clientY } : null;
    });
    this.listen(this.root, 'click', (e) => {
      if (e.target !== this.root || !this.pressed) return;
      const r = this.card.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      if (Math.hypot(dx, dy) > MISSED_CLICK) this.close();
    });
  }

  prepare(talk: TalkSession): void {
    this.talk = talk;
    this.view = 'main';
    this.trail = [];
    this.said = '';
    this.mine = null;
    this.before = null;
    this.found = null;
    this.wish = null;
    this.offered = new Set();
    this.arming.reset();
  }

  protected override onOpened(): void {
    const talk = this.talk;
    if (!talk) return;
    conversing(true);
    this.farewell = true;
    const ctx = this.context();
    const { line, introduced } = opening(talk.person, ctx);
    const own = !introduced && tierRank(tier(talk.person)) > tierRank('cold') ? talk.opening?.() : null;
    // Met just now, or never kept: what they offer today is the baseline, nothing is new.
    this.offeredEarlier = introduced ? null : offeredBefore(talk.person);
    this.say(own ?? line);
    // The view turns to their face; the card waits for it before placing itself beside them.
    const anchor = this.anchor();
    const framing = !!anchor && !!this.deps.frame;
    if (anchor && this.deps.frame) this.deps.frame(anchor, faceLift(anchor));
    if (anchor) this.deps.zoom?.(CLOSE_SHOT);
    this.wish = !introduced && anchor ? wishOf(talk.person, ctx) : null;
    this.card.style.left = '';
    this.placedAt = framing ? performance.now() + 120 : -Infinity;
    this.paintAll();
    this.focusFirst();
    if (this.wish) window.setTimeout(() => this.think(), framing ? 450 : 150);
    this.restlessLater(1400);
    if (firstConversation()) this.deps.notices.tip('Watch their face, and the bar under their name.', { id: 'talking', head: 'Talking', until: () => !this.isOpen });
    this.follow = requestAnimationFrame(this.track);
  }

  protected override onClosed(): void {
    const talk = this.talk;
    window.clearTimeout(this.ending);
    window.clearTimeout(this.fidget);
    window.clearInterval(this.reveal);
    cancelAnimationFrame(this.follow);
    this.ending = 0;
    this.arming.reset();
    this.root.classList.remove('social-talk--keys', 'social-talk--ending');
    this.card.style.left = '';
    paint(this.over, html``);
    if (talk) {
      // Their goodbye, said while the conversation still holds their bubble.
      if (this.farewell && talk.body && talk.place !== 'phone') {
        talk.body.speak(farewell(talk.person));
        talk.body.react?.('bye');
      }
      // What they offered is not new next time; a first conversation keeps all they offer now, looked at or not.
      noteOffered(talk.person, this.offeredEarlier ? this.offered : [...this.offered, ...this.availableKeys(talk.person)]);
    }
    conversing(false);
    this.deps.zoom?.(1);
    this.talk = null;
    talk?.onClose?.();
  }

  protected override repaint(): void {
    this.paintAll();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (this.ending) return;
    if (action === 'choose') this.rows[Number(el.dataset.choice)]?.run();
    else if (action === 'person' && this.talk) {
      const id = this.talk.person;
      this.farewell = false;
      this.close();
      this.deps.openPerson?.(id);
    }
  }

  /** From a sub-list, Esc and B come back a step; from the conversation's own list they leave. */
  protected override onBack(): boolean {
    if (!this.trail.length) return false;
    this.back();
    return true;
  }

  protected override onKey(e: KeyboardEvent): void {
    if (/^(Digit|Numpad)[1-9]$|^Arrow|^Tab$/.test(e.code)) this.root.classList.add('social-talk--keys');
    if (this.ending) return;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      e.preventDefault();
      this.rows[Number(digit[2]) - 1]?.run();
      return;
    }
    if (e.code === 'Backspace' && this.trail.length) {
      e.preventDefault();
      this.back();
    }
  }

  private context(): TalkContext {
    return { day: this.deps.day(), hour: this.deps.hour(), place: this.talk?.place ?? 'elsewhere' };
  }

  /** They stand in the room (their body reacts): their words go over their head, the card shows no face nor line of theirs. */
  private inRoom(): boolean {
    return typeof this.talk?.body?.react === 'function';
  }

  /** The point over their head, when they stand in the room. */
  private anchor(): SocialAnchor | null {
    return this.inRoom() ? (this.talk?.body?.anchor ?? null) : null;
  }

  /** Their line: over their head when they are in the room, else in the card (a voice through a door, a call). */
  private say(line: string): void {
    this.said = line;
    if (this.inRoom()) this.talk?.body?.speak(line);
  }

  // --- what the player does -------------------------------------------------------------------------------------

  private choose(option: OptionView, key: string): void {
    if (option.id === 'gossip') return this.openList('gossip', key);
    if (option.id === 'giveGame') return this.openList('game', key);
    if (option.id === 'giveCoins') {
      if (this.deps.wallet.coins < COIN_GIFT) {
        this.deps.notices.refuse(`${formatCoins(COIN_GIFT)} to give, you have ${this.deps.wallet.coins}`);
        return;
      }
      if (!this.arming.press(key) || !this.deps.wallet.spend(COIN_GIFT)) return;
    }
    if (option.id === 'insult' && !this.arming.press(key)) return;
    this.act(option.id);
  }

  private act(id: InteractionId, extra: InteractionExtra = {}): void {
    const talk = this.talk;
    if (!talk || this.ending) return;
    const was = { warmth: standing(talk.person).warmth, trust: standing(talk.person).trust };
    this.before = was;
    this.mine = { text: playerLine(talk.person, id, extra), spoken: true };
    const outcome = perform(talk.person, id, this.context(), extra);
    // Back to the conversation's own list, on the row the sub-lists were opened from.
    const opener = this.trail[0]?.from ?? null;
    this.view = 'main';
    this.trail = [];
    this.found = outcome.trait ?? null;
    if (this.wish === id) this.wish = null;
    this.say(outcome.line);
    talk.body?.react?.(outcome.reaction);
    this.paintAll(opener);
    this.feedback(was);
    // Talked out: they look at their watch and go, rather than let the player spend more warmth.
    if (outcome.tired) this.leaveSoon();
    else this.restlessLater(1700);
  }

  private runExtra(extra: TalkExtra): void {
    if (this.ending) return;
    if (extra.opensPanel) {
      // A panel of its own opens for it (the swap, the haggle): this one makes way first, no goodbye.
      this.farewell = false;
      this.close();
      extra.run();
      return;
    }
    const talk = this.talk;
    if (!talk) return;
    const was = { warmth: standing(talk.person).warmth, trust: standing(talk.person).trust };
    this.before = was;
    this.mine = { text: extra.label, spoken: spoken(extra.label) };
    this.found = null;
    const result = extra.run() ?? {};
    if (result.line) this.say(result.line);
    if (result.close) {
      this.farewell = false;
      this.close();
      return;
    }
    this.paintAll();
    this.feedback(was);
  }

  /** Opens a sub-list from the row `from` (Back returns to it). */
  private openList(view: View, from: string): void {
    this.trail.push({ view: this.view, from });
    this.view = view;
    this.arming.reset();
    this.paintMenu();
    this.focusFirst();
  }

  private back(): void {
    const step = this.trail.pop();
    if (!step) return;
    this.view = step.view;
    this.arming.reset();
    this.paintMenu();
    const row = this.menu.querySelector<HTMLElement>(`[data-id="${CSS.escape(step.from)}"]`);
    if (row) row.focus({ preventScroll: true });
    else this.focusFirst();
  }

  /** They have talked enough: a look at the watch, a wave, and they go (the card closes by itself). */
  private leaveSoon(): void {
    window.clearTimeout(this.fidget);
    this.root.classList.add('social-talk--ending');
    this.ending = window.setTimeout(() => {
      this.ending = 0;
      this.talk?.body?.react?.('bye');
      this.farewell = false;
      this.close();
    }, 1700);
  }

  /** Their talk running out: after `ms`, a look at the watch (their body says it, not a label). */
  private restlessLater(ms: number): void {
    window.clearTimeout(this.fidget);
    const talk = this.talk;
    if (!talk || !this.inRoom() || talkLeft(talk.person, this.deps.day()) > RESTLESS) return;
    this.fidget = window.setTimeout(() => this.talk?.body?.react?.('restless'), ms);
  }

  // --- what shows by their face --------------------------------------------------------------------------------

  /** Each frame: the hearts and the thought follow their face; now and then the card keeps clear of their bubble. */
  private readonly track = (now: number): void => {
    if (!this.isOpen) return;
    const anchor = this.anchor();
    const face = anchor && this.deps.whereOnScreen ? this.deps.whereOnScreen(anchor, faceLift(anchor)) : null;
    if (face) this.over.style.translate = `${Math.round(face.x)}px ${Math.round(face.y)}px`;
    else {
      // No face in view (a voice, a call): by the bar instead.
      const bar = this.who.querySelector('.social-meter')?.getBoundingClientRect();
      if (bar) this.over.style.translate = `${Math.round(bar.left + bar.width / 2)}px ${Math.round(bar.top)}px`;
    }
    if (now - this.placedAt > 300) {
      this.placedAt = now;
      this.place(anchor);
    }
    this.follow = requestAnimationFrame(this.track);
  };

  /**
   * The card beside them, clear of the bubble over their head (at most `min(22rem, 60vw)` wide, centred on it:
   * notices.css): on its right, else on its left, else as far right as the screen goes. It moves only for a real
   * change (someone walking), never for a sway, so the rows stay put under the pointer.
   */
  private place(anchor: SocialAnchor | null): void {
    const vw = window.innerWidth;
    const head = anchor && this.deps.whereOnScreen && vw > 600 ? this.deps.whereOnScreen(anchor, 0) : null;
    if (!head) {
      this.card.style.left = '';
      return;
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = this.card.offsetWidth;
    const edge = 0.75 * rem;
    const half = Math.min(22 * rem, vw * 0.6) / 2 + edge;
    let left = head.x + half;
    if (left + width > vw - edge) left = head.x - half - width >= edge ? head.x - half - width : Math.max(edge, vw - width - edge);
    const now = parseFloat(this.card.style.left);
    if (Number.isNaN(now) || Math.abs(now - left) > 2.5 * rem) this.card.style.left = `${Math.round(left)}px`;
  }

  /** After a try: hearts rise by their face (warmer) or a cracked one falls (cooler), a word when their trust moved, a chime. */
  private feedback(was: { warmth: number; trust: number }): void {
    const talk = this.talk;
    if (!talk) return;
    const now = standing(talk.person);
    const warmth = now.warmth - was.warmth;
    const trust = now.trust - was.trust;
    const bits: Html[] = [];
    if (Math.abs(warmth) >= 0.05) {
      const up = warmth > 0;
      const n = Math.abs(warmth) < 3 ? 1 : Math.abs(warmth) < 8 ? 2 : 3;
      bits.push(html`<span class="social-burst__hearts social-burst__hearts--${up ? 'up' : 'down'}">${Array.from({ length: n }, (_, i) => html`<span style="--i:${i}">${icon(up ? 'heart' : 'heartCrack', 1.15)}</span>`)}</span>`);
      playUiSound(up ? 'warm' : 'cool');
    }
    if (Math.abs(trust) >= 0.5) bits.push(html`<span class="social-burst__trust social-burst__trust--${trust > 0 ? 'up' : 'down'}">${trust > 0 ? 'trusts you more' : 'trusts you less'}</span>`);
    if (!bits.length) return;
    const burst = document.createElement('div');
    burst.className = 'social-burst';
    paint(burst, html`${bits}`);
    this.over.appendChild(burst);
    window.setTimeout(() => burst.remove(), 2600);
  }

  /** Their thought by their face: what they would like to talk about, its icon (the same as its chip, which glows). */
  private think(): void {
    if (!this.isOpen || !this.wish) return;
    const thought = document.createElement('div');
    thought.className = 'social-thought';
    // The icon and its word under it, the chip's own (no symbol without words).
    paint(thought, html`${icon(INTERACTION_ICONS[this.wish], 1.35)}<span class="social-thought__word">${TOPICS[this.wish] ?? INTERACTIONS[this.wish].label}</span>`);
    this.over.appendChild(thought);
    window.setTimeout(() => thought.remove(), 5200);
  }

  // --- painting ------------------------------------------------------------------------------------------------

  /** Everything, after something was said (`focus`: the row to put the focus on). */
  private paintAll(focus: string | null = null): void {
    if (!this.talk) return;
    const restore = rememberFocus(this.card);
    this.paintMine();
    this.paintTheir();
    this.paintWho();
    this.paintMenu();
    const row = focus ? this.menu.querySelector<HTMLElement>(`[data-id="${CSS.escape(focus)}"]`) : null;
    if (row) row.focus({ preventScroll: true });
    else restore();
    if (!this.card.contains(document.activeElement)) this.focusFirst();
  }

  /**
   * Who they are to you: their name (their page in the People book), their role, their tier in a word, the bar, the
   * day (their mood, a birthday, the ways of theirs you found out); when trust is what holds them back, what the two
   * of you are in words. A voice or a call shows their face too.
   */
  private paintWho(): void {
    const talk = this.talk!;
    const id = talk.person;
    const card = findPerson(id);
    const s = standing(id);
    const tierId = tierOf(s.warmth, s.trust);
    const tierView = tierInfo(tierId);
    const met = isMet(id);
    const ctx = this.context();
    const { mood, why } = moodOf(id, ctx.day, ctx.hour);
    const today: Html[] = [];
    if (isBirthday(id, ctx.day)) today.push(html`<span class="social-today__cake">${icon('cake', 1)} Birthday</span>`);
    today.push(html`<span class="social-mood social-mood--${mood}">${icon(MOOD_ICONS[mood], 1)} ${moodInfo(mood).name}${why ? html`<small> · ${why}</small>` : ''}</span>`);
    // A trait just found out comes first, glowing once.
    const traits = [...s.traitsKnown].sort((a, b) => Number(b === this.found) - Number(a === this.found));
    for (const t of traits) today.push(html`<span class="social-today__trait${t === this.found ? ' social-today__trait--new' : ''}">${TRAITS[t].name}</span>`);
    const held = warmthTier(s.warmth) !== tierId;
    const face = !this.inRoom();
    const name = met ? (card?.name ?? id) : capitalise(card?.role ?? 'Someone');
    const title = met && this.deps.openPerson ? html`<button type="button" class="social-talk__name" data-action="person" aria-label="${name}, their page in the People book">${name}</button>` : html`<b class="social-talk__name">${name}</b>`;
    paint(
      this.who,
      html`${face
        ? html`<div class="social-medallion" style="--tier:${tierView.colour}">
            <div class="social-medallion__face"></div>
            ${talk.place === 'phone' ? html`<span class="social-medallion__badge" aria-label="On the phone">${icon('phone', 0.9)}</span>` : ''}
          </div>`
        : ''}
        <div class="social-talk__id">
          <p class="social-talk__title">${title}${met ? html`<span class="social-talk__level" style="--tier:${tierView.colour}">${tierView.name}</span>` : ''}</p>
          ${met && card?.role ? html`<p class="social-talk__role">${card.role}</p>` : ''}
          <span class="social-talk__meter">${relationMeter(s)}</span>
          <p class="social-today">${today}</p>
          ${held ? html`<p class="social-talk__bond">${BOND_NAMES[bondOf(s.warmth, s.trust)]}</p>` : ''}
        </div>`,
    );
    if (face) this.who.querySelector('.social-medallion__face')!.appendChild(portrait(id, 52, tierView.colour));
    this.easeMeter(s.warmth);
    this.found = null;
  }

  /** The bar eases from the warmth before the try to the one now. */
  private easeMeter(warmth: number): void {
    const before = this.before?.warmth ?? null;
    this.before = null;
    if (before === null || before === warmth || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const meter = this.who.querySelector<HTMLElement>('.social-meter');
    if (!meter) return;
    const set = (w: number) => {
      for (const [k, v] of Object.entries(meterVars(w))) meter.style.setProperty(k, v);
    };
    set(before);
    void meter.offsetWidth;
    requestAnimationFrame(() => set(warmth));
  }

  /** What the player just said (in quotes) or did (a stage direction), at the top of the card, by their bubble. */
  private paintMine(): void {
    const el = this.mineEl;
    const mine = this.mine;
    el.hidden = !mine;
    if (!mine) return;
    paint(el, html`<span class="social-talk__you">You</span>${mine.spoken ? html`<span class="social-talk__said">“${mine.text}”</span>` : html`<span class="social-talk__did">${mine.text}</span>`}`);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  /**
   * Their line in the card, when they are not in the room: laid out whole from the first letter (the part not typed
   * yet is there, unseen), so the card never grows while it types.
   */
  private paintTheir(): void {
    window.clearInterval(this.reveal);
    const text = this.said;
    this.their.hidden = this.inRoom() || !text;
    if (this.their.hidden) return;
    const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.their.classList.toggle('social-talk__their--phone', this.talk?.place === 'phone');
    paint(
      this.their,
      html`<blockquote class="social-talk__line" aria-hidden="true"><span class="social-talk__typed">${quiet ? text : ''}</span><span class="social-talk__rest">${quiet ? '' : text}</span></blockquote>
        <figcaption class="visually-hidden">${this.talk ? shortName(this.talk.person) : ''}: ${text}</figcaption>`,
    );
    if (quiet || text.length < 2) return;
    const typed = this.their.querySelector<HTMLElement>('.social-talk__typed')!;
    const rest = this.their.querySelector<HTMLElement>('.social-talk__rest')!;
    let shown = 0;
    const step = Math.max(1, Math.ceil(text.length / 45));
    this.reveal = window.setInterval(() => {
      shown = Math.min(text.length, shown + step);
      typed.textContent = text.slice(0, shown);
      rest.textContent = text.slice(shown);
      if (shown >= text.length) window.clearInterval(this.reveal);
    }, 16);
  }

  /** The menu of the view on show; what it offers is kept (not new next time). */
  private paintMenu(): void {
    const talk = this.talk;
    if (!talk) return;
    this.rows = this.view === 'main' ? this.mainRows(talk.person) : this.subRows(talk.person);
    for (const row of this.rows) if (notable(row.key)) this.offered.add(row.key);
    const heading = this.view === 'main' ? '' : html`<p class="social-menu__heading">${VIEW_TITLES[this.view]}</p>`;
    const empty = this.view !== 'main' && this.rows.length === 1 ? html`<p class="social-menu__empty">${this.view === 'game' ? 'No game you could give.' : this.view === 'gossip' ? 'Nobody you both know yet.' : 'Nothing to give.'}</p>` : '';
    paint(this.menu, html`${heading}${empty}${this.rowsHtml()}`);
  }

  /** `paintMenu` keeping the focus on the same row (an arming, its time running out). */
  private refreshMenu(): void {
    if (!this.talk) return;
    const restore = rememberFocus(this.card);
    this.paintMenu();
    restore();
  }

  /** The rows' markup: the talk's chips two by two, the sub-lists' buttons side by side, every row its digit (shown while the keys are in use). */
  private rowsHtml(): Html {
    const out: Html[] = [];
    let group: { tone: Row['tone']; rows: Html[] } | null = null;
    const flush = () => {
      if (group) out.push(html`<div class="social-menu__${group.tone === 'topic' ? 'topics' : 'subs'}">${group.rows}</div>`);
      group = null;
    };
    this.rows.forEach((row, n) => {
      const tone = row.tone ? ` social-row--${row.tone}` : '';
      // The talk after the place's own entries starts a part of its own.
      const split = n > 0 && this.rows[n - 1]!.tone === 'place' && row.tone !== 'place' ? ' social-row--split' : '';
      const wished = row.wished ? ' social-row--wished' : '';
      // The base's focus on opening goes to the first row.
      const button = html`<button type="button" class="social-row${tone}${split}${wished}" data-action="choose" data-choice="${n}" data-id="${row.key}"${attr('data-autofocus', n === 0)}>
        ${row.cover ?? html`<span class="social-row__icon">${icon(row.icon)}</span>`}<span class="social-row__label">${row.label}</span>${row.tags?.length ? html`<span class="social-row__tags">${row.tags}</span>` : ''}${row.more ? html`<span class="social-row__more" aria-hidden="true">›</span>` : ''}${n < 9 ? html`<kbd class="social-row__key">${n + 1}</kbd>` : ''}
      </button>`;
      if (row.tone === 'topic' || row.tone === 'sub') {
        if (group && group.tone !== row.tone) flush();
        group ??= { tone: row.tone, rows: [] };
        group.rows.push(button);
      } else {
        flush();
        out.push(button);
      }
    });
    flush();
    return html`${out}`;
  }

  /** A "new" word for a row they did not offer before (a tier reached, a perk come into force), else nothing. */
  private newTag(key: string): Html[] {
    return this.offeredEarlier && notable(key) && !this.offeredEarlier.has(key) ? [tag('new', 'new')] : [];
  }

  /** Every entry `id` offers now, in any list (a first conversation keeps them all as seen). */
  private availableKeys(id: PersonId): string[] {
    const ctx = this.context();
    const extras = [...(this.talk?.extras ?? []), ...extrasFor({ person: id, place: ctx.place, day: ctx.day, hour: ctx.hour, session: this.talk?.session ?? null })].filter((x) => !x.disabled?.());
    return [...extras.map((x) => `extra:${x.id}`), ...optionsFor(id, ctx).filter((o) => !o.needs).map((o) => `talk:${o.id}`)];
  }

  /** The conversation's own list: the place's entries that are open now, the talk's chips, the sub-lists, Goodbye. */
  private mainRows(id: PersonId): Row[] {
    const ctx = this.context();
    const rows: Row[] = [];
    const extras = [...(this.talk?.extras ?? []), ...extrasFor({ person: id, place: ctx.place, day: ctx.day, hour: ctx.hour, session: this.talk?.session ?? null })];
    // What is not open now is not offered (it shows when it is): no locks, no reasons. Words in quotes are said.
    for (const extra of extras.filter((x) => !x.disabled?.())) {
      const key = `extra:${extra.id}`;
      rows.push({ key, label: spoken(extra.label) ? `“${extra.label}”` : extra.label, icon: GROUP_ICONS[extra.group], run: () => this.runExtra(extra), tags: [...(extra.tag ? [tag(extra.tag, 'news')] : []), ...this.newTag(key)], more: extra.opensPanel, tone: 'place' });
    }
    const options = optionsFor(id, ctx).filter((o) => !o.needs);
    for (const option of options.filter((o) => o.group === 'talk')) rows.push({ ...this.optionRow(id, option, TOPICS[option.id]), tone: 'topic', wished: option.id === this.wish });
    const subs: [View, string, IconName][] = [
      ['give', 'Give…', 'gift'],
      ['ask', 'Ask…', 'hand'],
      ['mean', 'Be mean…', 'horns'],
    ];
    for (const [view, label, glyph] of subs) {
      const inside = options.filter((o) => o.group === view);
      if (!inside.length) continue;
      const fresh = inside.some((o) => this.newTag(`talk:${o.id}`).length);
      rows.push({ key: `more:${view}`, label, icon: glyph, run: () => this.openList(view, `more:${view}`), tags: fresh ? [tag('new', 'new')] : [], tone: 'sub' });
    }
    rows.push({ key: 'leave', label: 'Goodbye', icon: 'wave', run: () => this.close(), tone: 'leave' });
    return rows;
  }

  /** A sub-list's rows, Back last. */
  private subRows(id: PersonId): Row[] {
    const ctx = this.context();
    const options = optionsFor(id, ctx).filter((o) => !o.needs);
    const rows: Row[] = [];
    if (this.view === 'give') {
      if (options.some((o) => o.id === 'giveGift')) {
        for (const g of this.deps.pocket().filter((p) => p.count > 0)) {
          rows.push({
            key: `gift:${g.kind}`,
            label: `${capitalise(giftName(g.kind))}${g.count > 1 ? ` ×${g.count}` : ''}`,
            icon: GIFT_ICONS[g.kind] ?? 'gift',
            run: () => {
              if (!g.take()) return;
              this.act('giveGift', { gift: g.kind });
            },
            tags: tasteTags(id, g.kind),
          });
        }
      }
      const game = options.find((o) => o.id === 'giveGame');
      if (game) rows.push({ key: 'talk:giveGame', label: 'A game…', icon: 'cart', run: () => this.choose(game, 'talk:giveGame'), tags: this.newTag('talk:giveGame'), more: true });
      const coins = options.find((o) => o.id === 'giveCoins');
      if (coins) rows.push(this.optionRow(id, coins, 'A few coins'));
    } else if (this.view === 'ask' || this.view === 'mean') {
      for (const option of options.filter((o) => o.group === this.view)) rows.push(this.optionRow(id, option));
    } else if (this.view === 'gossip') {
      for (const t of tiesOf(id).filter((x) => isMet(x.id)).slice(0, 8)) rows.push({ key: `about:${t.id}`, label: shortName(t.id), icon: 'whisper', run: () => this.act('gossip', { about: t.id }) });
    } else if (this.view === 'game') {
      const games = [...this.deps.givable()]
        .map((g) => ({ game: g, gift: gameGift(g) }))
        .map((g) => ({ ...g, fit: gameFit(id, g.gift) }))
        .sort((a, b) => b.fit - a.fit)
        .slice(0, GAME_LIST);
      for (const { game, gift } of games) {
        const key = `game:${game.id}`;
        const armed = this.arming.isArmed(key);
        rows.push({
          key,
          label: armed ? armedLine('give it away for good') : game.title,
          icon: 'cart',
          cover: coverImg(this.deps.coverUrl(game), game, 'social-row__cover'),
          run: () => {
            if (!this.arming.press(key) || !this.deps.giveGame(game)) return;
            this.act('giveGame', { game: gift });
          },
          tone: armed ? 'armed' : undefined,
        });
      }
    }
    rows.push({ key: 'back', label: 'Back', icon: 'arrowLeft', run: () => this.back(), tone: 'leave' });
    return rows;
  }

  /** An interaction's row: its label (or what a second press does, armed), a found-out trait of theirs that suits it, "new". */
  private optionRow(id: PersonId, option: OptionView, label = option.label): Row {
    const key = `talk:${option.id}`;
    const armed = this.arming.isArmed(key);
    const suited = suits(id, option.id, this.context().hour);
    return {
      key,
      label: armed ? armedLine(option.id === 'insult' ? 'insult them' : `give ${formatCoins(COIN_GIFT)}`) : label,
      icon: INTERACTION_ICONS[option.id],
      run: () => this.choose(option, key),
      tags: armed ? [] : [...(suited ? [tag(TRAITS[suited].name, 'trait')] : []), ...this.newTag(key)],
      more: option.id === 'gossip',
      tone: armed ? 'armed' : option.group === 'mean' ? 'mean' : undefined,
    };
  }

  /** The first row takes the focus. */
  private focusFirst(): void {
    this.menu.querySelector<HTMLElement>('button[data-action="choose"]')?.focus({ preventScroll: true });
  }
}

/** A trait of theirs the player found out that makes `interaction` go down well at `hour` (the row's tag), or null. */
function suits(id: PersonId, interaction: InteractionId, hour: number): Trait | null {
  for (const t of standing(id).traitsKnown) {
    const bend = TRAITS[t].bends[interaction];
    if (!bend?.odds || bend.odds <= 1) continue;
    if (bend.hours && !(hour >= bend.hours[0] && hour < bend.hours[1])) continue;
    return t;
  }
  return null;
}

/**
 * What `id` would like to talk about now, their thought (a talk their ways make welcome at this hour, found out or
 * not: trying it is how the player finds out why), the same all day; null for nothing in particular, or someone cross.
 */
function wishOf(id: PersonId, ctx: TalkContext): InteractionId | null {
  const s = standing(id);
  if (tierRank(tierOf(s.warmth, s.trust)) <= tierRank('cold')) return null;
  const open = new Set(optionsFor(id, ctx).filter((o) => !o.needs && o.group === 'talk').map((o) => o.id));
  const welcome = new Set<InteractionId>();
  for (const t of findPerson(id)?.traits ?? []) {
    for (const [interaction, bend] of Object.entries(TRAITS[t].bends) as [InteractionId, { odds?: number; hours?: [number, number] }][]) {
      if (!open.has(interaction) || INTERACTIONS[interaction].group !== 'talk' || !bend.odds || bend.odds <= 1) continue;
      if (bend.hours && !(ctx.hour >= bend.hours[0] && ctx.hour < bend.hours[1])) continue;
      welcome.add(interaction);
    }
  }
  const list = [...welcome];
  return list.length ? list[Math.floor(unit01(`${id}:${ctx.day}`) * list.length)]! : null;
}

/** How they take a gift of `kind`, once a gift of it told the player: a favourite, or not for them. */
function tasteTags(id: PersonId, kind: GiftKind): Html[] {
  const taste = tasteOf(id, kind);
  if (taste === 'loves') return [tag('a favourite', 'trait')];
  if (taste === 'dislikes') return [tag('not for them', 'no')];
  return [];
}

/** A game of the collection as a gift is weighed. */
function gameGift(game: Game): GameGift {
  return { title: game.title, platform: game.platform, genres: game.genre ? [game.genre.toLowerCase()] : [], year: yearOf(game) };
}

function yearOf(game: Game): number | undefined {
  const y = Number(game.releaseDate?.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : undefined;
}
