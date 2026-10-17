import type { Game } from '@/catalog/types';
import { playUiSound } from '@/audio/uiSounds';
import { lastDevice, onDeviceChange } from '@/input/lastDevice';
import { conversing, muteSpeech, type NoticeActions } from '@/notices';
import { beginConversation, choicesFor, endConversation, farewell, leavingLine, opening, playerLine, say, type Choice, type Conversation, type InteractionExtra, type OpeningKind, type Outcome, type Reaction, type TalkContext } from '@/social/conversation';
import type { LabState } from '@/cheats/socialLab';
import { BIRTHDAY_LINES, CALLBACK_LINES, COLD_LINES, HELD_LINES, HELLO_LINES, HOSTILE_LINES, MOOD_OPENINGS, SOCIAL_LINES } from '@/social/socialLines';
import { TALK, TIERS } from '@/social/socialPlan';
import { extrasFor } from '@/social/extras';
import { gameFit, giftName, tasteOf } from '@/social/gifts';
import { firstConversation, noteOffered, offeredBefore } from '@/social/noticed';
import { findPerson, shortName } from '@/social/people';
import { openTopics } from '@/social/conversation';
import { COIN_GIFT, INTERACTIONS, TRAITS } from '@/social/socialPlan';
import { isMet, standing, tier } from '@/social/standing';
import type { ConversationPanelLike, SocialAnchor, TalkExtra, TalkSession } from '@/social/talk';
import { setTalking } from '@/social/talkState';
import { atLeast, stampsOf, tierChangeLine, tierInfo, tierOf, tierRank } from '@/social/tiers';
import type { Fit, GiftKind, InteractionId, PersonId, Trait } from '@/social/types';
import { unit01 } from '@/random';
import { reduceMotion } from '@/settings/motion';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';
import { frameSubject, releaseFrame } from '@/graphics/framing';
import { isActionKey } from '../keys';
import { isNavClick, panelOpen } from '../menu/MenuNav';
import { ModalPanel } from '../ModalPanel';
import { html, paint } from '../panel/html';
import { coverImg } from '../panel/widgets';
import { rememberFocus } from '../rememberFocus';
import type { Expression } from './face';
import { GIFT_ICONS, GROUP_ICONS, icon, iconNamed } from './icons';
import { meterShare } from './meters';
import { portrait } from './portrait';
import { REACTION_WORDS, expressionOf, flyBalloon, flyFact, hearts, rememberMark, speakingMs } from './conversation/feedback';
import { gameGift, tag, tasteTags } from './conversation/gameGifts';
import { HoldPress } from './conversation/hold';
import { rowOfDigit, spoken, stageHtml, type Row } from './conversation/menu';
import { tagHtml } from './conversation/nameTag';
import { CLOSE_SHOT, FRAMING_MS, SHOT_BELOW_EYES, faceLift, placeSay } from './conversation/placement';
import './social.css';

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
  /** A game of the collection by id (a piece of news's cover), if the player has it. */
  findGame?(id: string): Game | undefined;
  /** What is in the pocket to give. */
  pocket(): readonly PocketGift[];
  notices: Pick<NoticeActions, 'refuse' | 'tip'>;
  /** A game's box art (the list of games to give shows it, and a piece of news about a game). */
  coverUrl(game: Game): string | undefined;
  /** Where `anchor` is on the screen, `lift` metres above it (negative: below); null when it is behind the view. */
  whereOnScreen?(anchor: SocialAnchor, lift: number): { x: number; y: number } | null;
  /** Turns the view gently to `anchor`, `lift` metres above it (their face, under it). */
  frame?(anchor: SocialAnchor, lift: number): void;
  /** Narrows the view by `factor` (1: the player's own), eased, as a film's close shot does while they talk. */
  zoom?(factor: number): void;
  /** Opens `id`'s page in the People book over the conversation; `back` when the book closes (the conversation comes back). */
  openPerson?(id: PersonId, back: () => void): void;
  /** The controller: its presses (Y opens their page) and whether A is still held (a long press). */
  pad?: { onPress(handler: (code: string) => void): () => void; isDown(code: string): boolean };
}

/** What the stage shows: the conversation's own balloons, or one of its lists. */
type View = 'main' | 'give' | 'ask' | 'promise' | 'more' | 'game';

/** A list's heading. */
const VIEW_TITLES: Record<Exclude<View, 'main'>, string> = {
  give: 'Give',
  ask: 'Ask',
  promise: 'Promise',
  more: 'More',
  game: 'Give which game?',
};

/** At most this many balloons of things to say at once (the rest under More…). */
const SAY_ROWS = 4;
/** How many of the player's games the game list shows (the best fits first). */
const GAME_LIST = 8;

/** The groups of the place's entries that live behind a chip, not among the balloons. */
const BEHIND: readonly string[] = ['give', 'ask', 'promise', 'mean'];

/** What may be marked new: what a tier opens or the place offers now and then. */
function notable(key: string): boolean {
  return key.startsWith('topic:') || key.startsWith('extra:');
}

/** What a choice did, as the panel acts it: an outcome of the rules, or a place's entry's answer. */
type Landing = Pick<Outcome, 'line' | 'reaction' | 'strength'> & Partial<Pick<Outcome, 'remembered' | 'fact' | 'leaving'>>;

/**
 * Talking to someone (docs/social.md "The panel"): no card, the person is the show. The view turns to their face; their
 * words are in their balloon over their head, a name tag pinned on top of it (who they are to you: their face in the
 * tier's ring, the tier's word, the bar to the next tier, the stamps of trust). What the player can say rises from the
 * bottom of the screen as the player's own balloons, four at most; pointed at, their face already shows how they would
 * take it; picked, the balloon flies up to them and their answer takes their balloon. What is done sits under it as
 * chips: Give…, Ask…, Promise…, More…, Goodbye. Hearts burst from their balloon's tail when they warm to you (a cracked
 * one falls when they cool), your small face pops by the tag when they will remember it, a fact learned flies into the
 * tag's book. What is done for good is held, never clicked. When their talk is done they say so and wait for your goodbye.
 */
export class ConversationPanel extends ModalPanel implements ConversationPanelLike {
  /** E never ends a conversation, even with the focus away from the balloons (`ModalStack.onKey`): Goodbye and Esc do. */
  readonly keepsOnUse = true;
  private talk: TalkSession | null = null;
  private convo: Conversation | null = null;
  /** The place's entries already said or done in this conversation: each is offered once (nobody says the same thing twice running). */
  private usedExtras = new Set<string>();
  private view: View = 'main';
  /** The lists opened, each with the balloon or chip that opened it (Back returns there). */
  private trail: { view: View; from: string }[] = [];
  /** Their line in their balloon now. */
  private line = '';
  /** What they would like to talk about this time (their thought: a topic's key), until it is said. */
  private wish: string | null = null;
  /** What they offered before this conversation (null: nothing kept yet, so nothing is new), and what they offer in it. */
  private offeredEarlier: ReadonlySet<string> | null = null;
  private offered = new Set<string>();
  /** Closing says goodbye (not when an entry opens a panel of its own). */
  private farewell = true;
  /** Their page in the book is open over the conversation: it comes back when the book closes. */
  private suspended = false;
  private resuming = false;
  /** `?debug`'s lab: the first word this conversation opens with, instead of the rules'. */
  private labOpening: string | null = null;
  /** The balloons and chips on show, in order (a click's `data-choice`, a digit's place). */
  private rows: Row[] = [];
  /** A voice's painted face: what they made of the last choice. */
  private expression: Expression = 'rest';
  /** What waits for the end of their line (their body's reaction, the hearts): run at once if the player goes on. */
  private pending: (() => void) | null = null;
  private pendingTimer = 0;
  private follow = 0;
  /** Where their balloon's tail is on screen (the hearts burst there, the player's balloon flies there). */
  private tailAt: { x: number; y: number } | null = null;
  /** The balloon their face is showing (`anticipate`). */
  private anticipated: string | null = null;
  /** The key held for a long press (its keyup lets go). */
  private keyHold: string | null = null;
  private readonly hold = new HoldPress();
  private readonly say: HTMLElement;
  private readonly tagEl: HTMLElement;
  private readonly balloon: HTMLElement;
  private readonly lineEl: HTMLElement;
  private readonly tail: HTMLElement;
  private readonly burst: HTMLElement;
  private readonly stage: HTMLElement;

  constructor(container: HTMLElement, private readonly deps: ConversationDeps) {
    super(container, { className: 'ui-panel social-talk', label: 'Conversation' });
    paint(
      this.root,
      html`<div class="social-shade" aria-hidden="true"></div>
        <div class="social-say">
          <div class="social-say__tag"></div>
          <div class="social-say__balloon" aria-hidden="true"><p class="social-say__line"></p><span class="social-say__tail"></span></div>
          <div class="social-say__burst" aria-hidden="true"></div>
        </div>
        <div class="social-stage" tabindex="-1"></div>`,
    );
    const part = (selector: string): HTMLElement => this.root.querySelector<HTMLElement>(selector)!;
    this.say = part('.social-say');
    this.tagEl = part('.social-say__tag');
    this.balloon = part('.social-say__balloon');
    this.lineEl = part('.social-say__line');
    this.tail = part('.social-say__tail');
    this.burst = part('.social-say__burst');
    this.stage = part('.social-stage');
    // Their answer and how they take it, in words, for a screen reader (the frame's status line: `setStatus`).
    const live = document.createElement('p');
    live.className = 'visually-hidden';
    live.setAttribute('role', 'status');
    this.root.appendChild(live);
    this.statusEl = live;
    // The keys' badges brighten while the keys are in use (they are always drawn: nothing moves).
    this.listen(this.root, 'pointermove', () => this.root.classList.remove('social-talk--keys'));
    // Their face before the click: the balloon pointed at or focused.
    this.listen(this.stage, 'pointerover', (e) => this.anticipateRow(e.target));
    this.listen(this.stage, 'pointerleave', () => this.anticipateRow(null));
    // The focus shows it only when the keys or the controller moved it (not the panel's own focus on opening).
    this.listen(this.stage, 'focusin', (e) => {
      if (this.root.matches('.social-talk--keys, .social-talk--pad')) this.anticipateRow(e.target);
    });
    this.listen(this.stage, 'focusout', (e) => {
      if (!this.stage.contains(e.relatedTarget as Node | null)) this.anticipateRow(null);
    });
    // What is done for good is held: the mouse's press, a key's (`onKey`), the controller's A (`onAction`).
    this.listen(this.stage, 'pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.social-balloon--once');
      const row = el ? this.rows[Number(el.dataset.choice)] : undefined;
      if (el && row && e.button === 0) this.hold.start(row.key, el, () => this.runRow(row));
    });
    this.listen(window, 'pointerup', () => this.hold.release());
    this.listen(window, 'pointercancel', () => this.hold.release());
    this.listen(this.stage, 'pointerout', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.social-balloon--once');
      if (el && !el.contains(e.relatedTarget as Node | null)) this.hold.release(el.dataset.id);
    });
    this.listen(this.root, 'keyup', (e) => {
      if (e.code === this.keyHold) {
        this.keyHold = null;
        this.hold.release();
      }
    });
    const pad = (device: string): void => void this.root.classList.toggle('social-talk--pad', device === 'gamepad');
    pad(lastDevice());
    const offDevice = onDeviceChange(pad);
    this.signal.addEventListener('abort', offDevice);
    if (deps.pad) {
      const offPad = deps.pad.onPress((code) => {
        if (this.isOpen && code === 'GamepadY') this.openPage();
      });
      this.signal.addEventListener('abort', offPad);
    }
  }

  prepare(talk: TalkSession): void {
    // A conversation left for the book and not come back to ends now.
    if (this.suspended) this.finish(false);
    this.talk = talk;
    this.convo = null;
    this.view = 'main';
    this.trail = [];
    this.line = '';
    this.wish = null;
    this.offered = new Set();
    this.expression = 'rest';
    this.hold.cancel();
  }

  protected override onOpened(): void {
    const talk = this.talk;
    if (!talk) return;
    const resumed = this.resuming;
    this.resuming = false;
    conversing(true);
    this.farewell = true;
    const ctx = this.context();
    const anchor = this.anchor();
    // Their balloon is this panel's: the speech layer draws none over their head meanwhile (their mouth still moves).
    muteSpeech(anchor);
    this.root.classList.toggle('social-talk--voice', !this.inRoom());
    this.root.classList.toggle('social-talk--phone', talk.place === 'phone');
    if (!resumed || !this.convo) {
      this.convo = beginConversation(talk.person, ctx);
      this.usedExtras.clear();
      setTalking(talk.person);
      talk.body?.hold?.(true);
      const lab = this.labOpening;
      this.labOpening = null;
      const { line, introduced } = lab !== null ? { line: lab, introduced: false } : opening(talk.person, ctx);
      const own = !introduced && tierRank(tier(talk.person)) > tierRank('cold') ? talk.opening?.() : null;
      // Met just now, or never kept: what they offer today is the baseline, nothing is new.
      this.offeredEarlier = introduced ? null : offeredBefore(talk.person);
      this.speak(own ?? line);
      this.wish = !introduced ? wishOf(talk.person, ctx) : null;
    } else this.showLine(this.line);
    const card = findPerson(talk.person);
    this.root.setAttribute('aria-label', `Conversation with ${isMet(talk.person) ? (card?.short ?? card?.name ?? talk.person) : capitalise(card?.role ?? 'someone')}`);
    // The view turns to their face; their balloon follows their head from the first frame.
    if (anchor) {
      this.deps.frame?.(anchor, faceLift(anchor) - SHOT_BELOW_EYES);
      this.deps.zoom?.(CLOSE_SHOT);
      // The depth of field holds on their face and they take a soft portrait light (`graphics/framing`).
      frameSubject(anchor, faceLift(anchor));
    }
    this.paintAll();
    this.place();
    this.focusFirst();
    if (this.wish && !resumed) window.setTimeout(() => this.think(), anchor ? FRAMING_MS : 150);
    if (!resumed && firstConversation()) this.deps.notices.tip('Watch their face as you point at what to say.', { id: 'talking', head: 'Talking', until: () => !this.isOpen });
    this.follow = requestAnimationFrame(this.track);
  }

  protected override onClosed(): void {
    this.flushPending();
    cancelAnimationFrame(this.follow);
    this.hold.cancel();
    this.keyHold = null;
    this.root.classList.remove('social-talk--keys', 'social-talk--leaving');
    paint(this.burst, html``);
    this.say.querySelector('.social-thought')?.remove();
    this.talk?.body?.anticipate?.(null);
    this.anticipated = null;
    muteSpeech(null);
    conversing(false);
    this.deps.zoom?.(1);
    releaseFrame();
    // Their page in the book over the conversation: everything else waits for it to come back.
    if (this.suspended) return;
    this.finish(true);
  }

  protected override repaint(): void {
    this.paintAll();
  }

  protected override onAction(action: string, el: HTMLElement): void {
    if (action === 'person') {
      this.openPage();
      return;
    }
    if (action !== 'choose') return;
    const row = this.rows[Number(el.dataset.choice)];
    if (!row) return;
    if (row.once) {
      // A controller's A holds it (released, it stops); the mouse and the keys hold it themselves.
      if (isNavClick()) this.hold.start(row.key, el, () => this.runRow(row), this.deps.pad ? () => this.deps.pad!.isDown('GamepadA') : undefined);
      return;
    }
    this.runRow(row);
  }

  /** From a list, Esc, B and Backspace come back a step; from the conversation's own balloons Esc leaves. */
  protected override onBack(): boolean {
    if (!this.trail.length) return false;
    this.back();
    return true;
  }

  /** Left and right go along the balloons and the chips, in order. */
  protected override onSide(direction: 1 | -1): boolean {
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || !this.stage.contains(focused)) return false;
    const all = [...this.stage.querySelectorAll<HTMLElement>('button[data-action="choose"]')];
    const next = all[all.indexOf(focused) + direction];
    next?.focus({ preventScroll: true });
    return true;
  }

  protected override onKey(e: KeyboardEvent): void {
    // The room's use key never ends a conversation (Goodbye and Esc do).
    if (isActionKey(e.code, 'putBack')) {
      e.preventDefault();
      return;
    }
    if (/^(Digit|Numpad)[0-9]$|^Arrow|^Tab$/.test(e.code)) this.root.classList.add('social-talk--keys');
    // A key held down says nothing again and again (the key's repeat): one press, one choice.
    if (e.repeat && /^(Digit|Numpad)[0-9]$|^(Numpad)?Enter$|^Space$/.test(e.code)) {
      e.preventDefault();
      return;
    }
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      e.preventDefault();
      const n = rowOfDigit(this.rows, Number(digit[1]));
      if (n !== null) this.pressRow(n, e);
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.social-balloon--once');
      if (el && this.stage.contains(el)) {
        e.preventDefault();
        this.pressRow(Number(el.dataset.choice), e);
      }
      return;
    }
    if (e.code === 'Backspace' && this.trail.length) {
      e.preventDefault();
      this.back();
    }
  }

  /** A key on row `n`: done, or held for one done for good. */
  private pressRow(n: number, e: KeyboardEvent): void {
    const row = this.rows[n];
    if (!row) return;
    if (!row.once) {
      this.runRow(row);
      return;
    }
    if (e.repeat) return;
    const el = this.elOf(row.key);
    if (!el) return;
    el.focus({ preventScroll: true });
    this.keyHold = e.code;
    this.hold.start(row.key, el, () => this.runRow(row));
  }

  /** Runs a balloon or a chip: a balloon said flies up to them first. */
  private runRow(row: Row): void {
    if (row.tone === 'say' || row.tone === 'place') {
      const el = this.elOf(row.key);
      if (el && !row.more) flyBalloon(this.root, el, this.tailAt);
    }
    row.run();
  }

  private elOf(key: string): HTMLElement | null {
    return this.stage.querySelector<HTMLElement>(`[data-id="${CSS.escape(key)}"]`);
  }

  private context(): TalkContext {
    return { day: this.deps.day(), hour: this.deps.hour(), place: this.talk?.place ?? 'elsewhere' };
  }

  /** They stand in the room (their body reacts): their balloon is over their head. */
  private inRoom(): boolean {
    return typeof this.talk?.body?.react === 'function';
  }

  /** The point over their head, when they stand in the room. */
  private anchor(): SocialAnchor | null {
    return this.inRoom() ? (this.talk?.body?.anchor ?? null) : null;
  }

  /** Their line: in their balloon (their mouth says it too when they are in the room). */
  private speak(line: string): void {
    if (this.inRoom()) this.talk?.body?.speak(line);
    this.showLine(line);
  }

  /** `line` in their balloon, popping in as a new line does. */
  private showLine(line: string): void {
    this.line = line;
    this.lineEl.textContent = line;
    this.balloon.hidden = !line;
    this.balloon.classList.remove('social-say__balloon--new');
    void this.balloon.offsetWidth;
    this.balloon.classList.add('social-say__balloon--new');
    this.place();
  }

  // --- the person's page, over the conversation ------------------------------------------------------------------

  private openPage(): void {
    const talk = this.talk;
    if (!talk || !this.deps.openPerson || !isMet(talk.person)) return;
    this.suspended = true;
    this.close();
    this.deps.openPerson(talk.person, () => this.resume());
    // The book did not open (another panel's turn): the conversation comes straight back rather than hang suspended.
    if (!panelOpen()) this.resume();
  }

  /** The book closed: back to the conversation where it was (unless another panel took the screen meanwhile). */
  private resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    const session = this.talk?.session;
    if (!this.talk || !session || panelOpen()) {
      this.finish(false);
      return;
    }
    this.resuming = true;
    session.openPanel(this);
  }

  /** The conversation is over: their goodbye, the good talk counted, what they offered kept, the rest let go. */
  private finish(sayBye: boolean): void {
    const talk = this.talk;
    this.suspended = false;
    if (!talk) return;
    if (sayBye && this.farewell && talk.body && talk.place !== 'phone') {
      talk.body.speak(farewell(talk.person));
      talk.body.react?.('bye', 0.6);
    }
    talk.body?.anticipate?.(null);
    talk.body?.hold?.(false);
    if (this.convo) endConversation(talk.person, this.context(), this.convo);
    // What they offered is not new next time; a first conversation keeps all they offer now, looked at or not.
    noteOffered(talk.person, this.offeredEarlier ? this.offered : [...this.offered, ...this.availableKeys(talk.person)]);
    setTalking(null);
    this.talk = null;
    this.convo = null;
    talk.onClose?.();
  }

  // --- what the player does ----------------------------------------------------------------------------------------

  /** Says one of the rules' choices. */
  private choose(choice: Choice): void {
    const talk = this.talk;
    const convo = this.convo;
    if (!talk || !convo || convo.leaving) return;
    if (this.wish === choice.key) {
      this.wish = null;
      this.say.querySelector('.social-thought')?.remove();
    }
    this.setStatus(`You: “${choice.label}”`);
    this.exchange(() => say(talk.person, choice, this.context(), convo));
  }

  /** Gives something (`interaction` with `extra`): the player's words for it, then the rules. */
  private give(interaction: Extract<InteractionId, 'giveGift' | 'giveGame' | 'giveCoins'>, extra: InteractionExtra, key: string): void {
    const talk = this.talk;
    const convo = this.convo;
    if (!talk || !convo) return;
    this.setStatus(`You: “${playerLine(talk.person, interaction, extra)}”`);
    this.exchange(() => say(talk.person, { key, interaction }, this.context(), convo, extra));
  }

  /** One exchange: their answer in their balloon at once, the rest (their body, the hearts, the bar) at the end of their line. */
  private exchange(run: () => Landing & { trait?: Trait }): void {
    const talk = this.talk;
    if (!talk) return;
    this.flushPending();
    talk.body?.anticipate?.(null);
    this.anticipated = null;
    const before = this.snapshot(talk.person);
    const promises = (): string[] => this.extras(talk.person).filter((x) => x.group === 'promise' && x.once).map((x) => x.id);
    const promisedBefore = new Set(promises());
    // Back to the conversation's own balloons, on the one the lists were opened from.
    const opener = this.trail[0]?.from ?? null;
    this.view = 'main';
    this.trail = [];
    const landing = run();
    // They just asked something of the player (a favour, a vote): the answer is offered at once, under Promise….
    if (this.talk && !this.convo?.leaving && promises().some((id) => !promisedBefore.has(id))) {
      this.view = 'promise';
      this.trail = [{ view: 'main', from: 'more:promise' }];
    }
    if (landing.line) this.speak(landing.line);
    this.paintStage(this.view === 'main' ? opener : null);
    this.later(landing.line, () => this.landed(before, landing));
  }

  /** Runs `then` at the end of their saying `line` (at once for a voice, or when the player goes on). */
  private later(line: string, then: () => void): void {
    this.pending = then;
    this.pendingTimer = window.setTimeout(() => this.flushPending(), this.inRoom() && line ? speakingMs(line) : 250);
  }

  private flushPending(): void {
    window.clearTimeout(this.pendingTimer);
    const run = this.pending;
    this.pending = null;
    run?.();
  }

  /** What a choice made of them, shown on them: their body's reaction, the hearts, a memory kept, a fact learned, the bar. */
  private landed(before: Snapshot, landing: Landing): void {
    const talk = this.talk;
    if (!talk || !this.isOpen) return;
    talk.body?.react?.(landing.reaction, landing.strength);
    if (!this.inRoom()) this.expression = expressionOf(landing.reaction);
    const now = standing(talk.person);
    hearts(this.burst, now.warmth - before.warmth);
    const tierNow = tierOf(now.warmth, now.trust);
    const changed = tierNow !== before.tier;
    if (changed && tierRank(tierNow) > tierRank(before.tier)) playUiSound('tierUp');
    if (stampsOf(now.trust) > stampsOf(before.trust)) playUiSound('promise');
    this.paintTag();
    if (landing.remembered) rememberMark(this.tagEl);
    this.easeBar(before, changed);
    if (landing.fact) flyFact(this.root, this.tailAt, this.tagEl.querySelector('.social-tag__book'), landing.fact.text);
    const name = shortName(talk.person);
    const words = [landing.line ? `${name}: “${landing.line}”` : '', `${name} ${REACTION_WORDS[landing.reaction]}.`, landing.remembered ? `${name} will remember that.` : '', changed ? `${tierChangeLine(name, before.tier, tierNow)}.` : ''];
    this.setStatus(words.filter(Boolean).join(' '));
    // Hurt, they say nothing nice on their way out: only the place's entries and Goodbye stay.
    if (landing.leaving && landing.reaction === 'hurt') this.paintStage();
    else if (landing.leaving) this.leaving();
  }

  /** Their talk is done: they say so and look at their watch; the balloons fold away, Goodbye stays. */
  private leaving(): void {
    const talk = this.talk;
    if (!talk) return;
    const line = leavingLine(talk.person);
    this.speak(line);
    this.root.classList.add('social-talk--leaving');
    this.paintStage();
    this.later(line, () => this.talk?.body?.react?.('restless' satisfies Reaction, 0.6));
  }

  /** A place's entry: said or done, their answer if any, what it moved shown the same way. */
  private runExtra(extra: TalkExtra): void {
    if (extra.opensPanel) {
      // A panel of its own opens for it (the swap, the haggle): this one makes way first, no goodbye.
      this.farewell = false;
      this.close();
      extra.run();
      return;
    }
    const talk = this.talk;
    if (!talk) return;
    this.usedExtras.add(extra.id);
    let closing = false;
    if (extra.group === 'promise' && extra.once) playUiSound('promise');
    this.setStatus(`You: ${spoken(extra.label) ? `“${extra.label}”` : extra.label}`);
    this.exchange(() => {
      const was = standing(talk.person).warmth;
      const result = extra.run() ?? {};
      closing = result.close === true;
      const moved = standing(talk.person).warmth - was;
      const reaction: Reaction = moved >= 3 ? 'pleased' : moved > 0 ? 'nod' : moved < 0 ? 'annoyed' : 'nod';
      return { line: result.line ?? '', reaction, strength: moved > 0 ? 0.6 : 0.4 };
    });
    if (closing) {
      this.flushPending();
      this.farewell = false;
      this.close();
    }
  }

  /** Opens a list from the balloon or chip `from` (Back returns to it). */
  private openList(view: View, from: string): void {
    this.trail.push({ view: this.view, from });
    this.view = view;
    this.hold.cancel();
    this.anticipateRow(null);
    this.paintStage();
    this.focusFirst();
  }

  private back(): void {
    const step = this.trail.pop();
    if (!step) return;
    this.view = step.view;
    this.hold.cancel();
    this.anticipateRow(null);
    this.paintStage(step.from);
  }

  // --- their balloon and what shows by it ---------------------------------------------------------------------------

  /** Their balloon follows their head (in the room); a voice's stays at the top of the screen (social.css). */
  private place(): void {
    if (!this.isOpen) return;
    const anchor = this.anchor();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const head = anchor && this.deps.whereOnScreen ? this.deps.whereOnScreen(anchor, 0) : null;
    if (head) {
      this.tailAt = placeSay(this.say, this.tail, head, vw, vh);
      this.burst.style.left = this.tail.style.left;
    }
    else if (!anchor) {
      this.say.style.translate = '';
      const r = this.balloon.getBoundingClientRect();
      this.tailAt = { x: r.left + r.width / 2, y: r.bottom };
    }
    // Their thought sits beside the balloon, on the side with room, never over it.
    const thought = this.say.querySelector<HTMLElement>('.social-thought');
    if (thought) thought.classList.toggle('social-thought--left', this.say.getBoundingClientRect().right + thought.offsetWidth + 12 > vw);
  }

  /** Each frame: their balloon (and what shows by it) follows their head. */
  private readonly track = (): void => {
    if (!this.isOpen) return;
    this.place();
    this.follow = requestAnimationFrame(this.track);
  };

  /** Their face shows how they would take the balloon pointed at or focused (`SocialBody.anticipate`). */
  private anticipateRow(target: EventTarget | Element | null): void {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-choice]') : null;
    const row = el && this.stage.contains(el) ? this.rows[Number(el.dataset.choice)] : undefined;
    const key = row?.fit ? row.key : null;
    if (key === this.anticipated) return;
    this.anticipated = key;
    this.talk?.body?.anticipate?.(row?.fit ?? null);
  }

  /** Their thought beside their balloon: a topic they love that the player has not found out yet, its icon and name. */
  private think(): void {
    const talk = this.talk;
    if (!this.isOpen || !this.wish || !talk) return;
    const topic = openTopics(talk.person).find((t) => `topic:${t.id}` === this.wish);
    if (!topic) return;
    this.say.querySelector('.social-thought')?.remove();
    const thought = document.createElement('div');
    thought.className = 'social-thought';
    thought.setAttribute('aria-hidden', 'true');
    paint(thought, html`${icon(iconNamed(topic.icon), 1.2)}<span>${topic.name}</span><i></i><i></i>`);
    this.say.appendChild(thought);
    this.place();
    window.setTimeout(() => thought.remove(), 6000);
  }

  // --- `?debug`'s social lab (cheats/socialLab) ------------------------------------------------------------------

  /** Opens a conversation with `person` as a voice (no body needed), its first word one of `kind`'s. */
  labOpen(session: { openPanel(panel: ConversationPanel): void }, person: PersonId, kind: OpeningKind): boolean {
    const card = findPerson(person);
    if (!card) return false;
    if (this.isOpen) this.close();
    this.prepare({ person, place: 'elsewhere' });
    const first = (list: readonly string[]): string => list[0] ?? '…';
    const lines: Record<OpeningKind, string> = {
      intro: card.intro,
      hostile: first(HOSTILE_LINES),
      cold: first(COLD_LINES),
      birthday: first(BIRTHDAY_LINES),
      held: first(HELD_LINES),
      memory: first(CALLBACK_LINES).replace('{memory}', 'you lent me Zelda'),
      mood: first(MOOD_OPENINGS.low),
      hello: first(HELLO_LINES),
    };
    this.labOpening = lines[kind];
    session.openPanel(this);
    return this.isOpen;
  }

  /** Plays `state` in the open conversation as if a choice had led to it (the standing is not touched). */
  labPlay(state: LabState): boolean {
    const talk = this.talk;
    const convo = this.convo;
    if (!talk || !convo || !this.isOpen) return false;
    const fits = { loves: 'delighted', likes: 'pleased', meh: 'bored', dislikes: 'annoyed' } as const;
    if (state === 'loves' || state === 'likes' || state === 'meh' || state === 'dislikes') {
      const line = SOCIAL_LINES.chat[state][0] ?? '…';
      this.speak(line);
      this.later(line, () => {
        talk.body?.react?.(fits[state], state === 'loves' ? 1 : 0.6);
        if (!this.inRoom()) {
          this.expression = expressionOf(fits[state]);
          this.paintTag();
        }
        hearts(this.burst, TALK.fit[state]);
      });
    } else if (state === 'remembered') rememberMark(this.tagEl);
    else if (state === 'fact') flyFact(this.root, this.tailAt, this.tagEl.querySelector('.social-tag__book'), 'Plays the piano every evening');
    else if (state === 'promise') {
      const ticket: TalkExtra = { id: 'lab-promise', group: 'promise', label: 'I’ll bring your parcel up', due: 'by Thursday evening', once: true, fit: 'loves', run: () => ({ line: 'Thank you! I knew I could count on you.' }) };
      this.talk = { ...talk, extras: [...(talk.extras ?? []).filter((x) => x.id !== ticket.id), ticket] };
      this.view = 'main';
      this.trail = [];
      this.openList('promise', 'more:promise');
    } else if (state === 'tierUp') {
      const now = tier(talk.person);
      const below = TIERS[Math.max(0, tierRank(now) - 1)]!.id;
      playUiSound('tierUp');
      this.paintTag();
      this.easeBar({ warmth: 0, trust: 0, share: 0.85, tier: below }, true);
    } else if (state === 'leaving') {
      convo.leaving = true;
      this.leaving();
    }
    return true;
  }

  // --- painting ------------------------------------------------------------------------------------------------

  private snapshot(id: PersonId): Snapshot {
    const s = standing(id);
    return { warmth: s.warmth, trust: s.trust, share: meterShare(s), tier: tierOf(s.warmth, s.trust) };
  }

  /** Everything (`focus`: the balloon or chip to put the focus on). */
  private paintAll(focus: string | null = null): void {
    if (!this.talk) return;
    this.paintTag();
    this.paintStage(focus);
  }

  private paintTag(): void {
    const talk = this.talk!;
    const voice = !this.inRoom();
    paint(this.tagEl, tagHtml(talk.person, this.context(), { voice, phone: talk.place === 'phone', canOpen: !!this.deps.openPerson, pad: this.root.classList.contains('social-talk--pad') }));
    const face = this.tagEl.querySelector('.social-tag__face');
    if (face) face.prepend(portrait(talk.person, voice ? 96 : 44, tierInfo(tier(talk.person)).colour, this.expression));
  }

  /**
   * The bar eases from where it stood before the choice to where it stands now; a tier crossed fills it (or empties it)
   * in the old colour first, then it starts again in the new one, and the badge turns over.
   */
  private easeBar(before: Snapshot, changed: boolean): void {
    const meter = this.tagEl.querySelector<HTMLElement>('.social-meter');
    if (!meter || reduceMotion()) return;
    const now = meter.style.getPropertyValue('--share');
    const nowTier = meter.style.getPropertyValue('--tier');
    const set = (share: string, colour: string, animate: boolean): void => {
      meter.classList.toggle('social-meter--still', !animate);
      meter.style.setProperty('--share', share);
      meter.style.setProperty('--tier', colour);
    };
    set(`${(before.share * 100).toFixed(1)}%`, tierInfo(before.tier).colour, false);
    void meter.offsetWidth;
    if (!changed) {
      requestAnimationFrame(() => set(now, nowTier, true));
      return;
    }
    this.tagEl.querySelector('.social-badge')?.classList.add('social-badge--turn');
    const up = tierRank(tierOf(standing(this.talk!.person).warmth, standing(this.talk!.person).trust)) > tierRank(before.tier);
    requestAnimationFrame(() => set(up ? '100%' : '0%', tierInfo(before.tier).colour, true));
    window.setTimeout(() => {
      set(up ? '0%' : '100%', nowTier, false);
      void meter.offsetWidth;
      requestAnimationFrame(() => set(now, nowTier, true));
    }, 520);
  }

  /** The stage of the view on show; what it offers is kept (not new next time). */
  private paintStage(focus: string | null = null): void {
    const talk = this.talk;
    if (!talk) return;
    const restore = rememberFocus(this.stage);
    this.rows = this.view === 'main' ? this.mainRows(talk.person) : this.subRows(talk.person);
    for (const row of this.rows) if (notable(row.key)) this.offered.add(row.key);
    const listed = this.rows.filter((r) => r.tone !== 'leave').length;
    const heading = this.view === 'main' ? null : listed ? VIEW_TITLES[this.view] : this.view === 'game' ? 'No game you could give' : 'Nothing here now';
    paint(this.stage, stageHtml(this.rows, heading));
    const el = focus ? this.elOf(focus) : null;
    if (el) el.focus({ preventScroll: true });
    else restore();
    if (!this.stage.contains(document.activeElement)) this.focusFirst();
  }

  /** A "new" word for a balloon they did not offer before (a tier reached, a perk come into force), else nothing. */
  private newTag(key: string): ReturnType<typeof tag>[] {
    return this.offeredEarlier && notable(key) && !this.offeredEarlier.has(key) ? [tag('new', 'new')] : [];
  }

  /** The place's entries open now (`TalkSession.extras` and the features': `social/extras`). */
  private extras(id: PersonId): TalkExtra[] {
    const ctx = this.context();
    return [...(this.talk?.extras ?? []), ...extrasFor({ person: id, place: ctx.place, day: ctx.day, hour: ctx.hour, session: this.talk?.session ?? null })].filter((x) => !x.disabled?.() && !this.usedExtras.has(x.id));
  }

  /** Every entry `id` offers now, in any list (a first conversation keeps them all as seen). */
  private availableKeys(id: PersonId): string[] {
    const convo = this.convo ?? beginConversation(id, this.context());
    return [...this.extras(id).map((x) => `extra:${x.id}`), ...choicesFor(id, this.context(), convo).map((c) => c.key)];
  }

  /** Whether `interaction` is offered here at their tier (`INTERACTIONS`' `from` and `notAt`). */
  private offers(id: PersonId, interaction: InteractionId): boolean {
    const rule = INTERACTIONS[interaction];
    if (rule.notAt?.includes(this.context().place)) return false;
    return !rule.from || atLeast(tier(id), rule.from);
  }

  private extraRow(extra: TalkExtra): Row {
    const key = `extra:${extra.id}`;
    const said = spoken(extra.label);
    // A promise to make is a ticket, held to say yes; saying no is a plain word (it costs nothing).
    const promise = extra.group === 'promise' && extra.once === true;
    return {
      key,
      label: said ? `“${extra.label}”` : extra.label,
      icon: extra.icon ? iconNamed(extra.icon, GROUP_ICONS[extra.group]) : GROUP_ICONS[extra.group],
      run: () => this.runExtra(extra),
      tags: [...(extra.tag ? [tag(extra.tag, 'news')] : []), ...this.newTag(key)],
      more: extra.opensPanel,
      tone: 'place',
      once: extra.once === true,
      promise,
      due: extra.due,
      fit: extra.fit ?? 'likes',
      danger: extra.group === 'mean',
    };
  }

  /** A choice of the rules as a balloon: the player's words, its icon (a news's game cover), what is known of how they take it. */
  private choiceRow(choice: Choice): Row {
    const talk = this.talk!;
    const id = talk.person;
    const s = standing(id);
    const tags: ReturnType<typeof tag>[] = [];
    if (choice.topic && s.known.includes(`fit:${choice.topic.id}`)) {
      if (choice.topic.fit === 'loves') tags.push(tag('a favourite', 'trait'));
      else if (choice.topic.fit === 'dislikes') tags.push(tag('not for them', 'no'));
    }
    if (choice.interaction === 'chat' || choice.interaction === 'joke' || choice.interaction === 'tease') {
      const hour = this.context().hour;
      const suited = s.traitsKnown.find((t) => {
        const bend = TRAITS[t].bends[choice.interaction as 'chat'];
        return bend?.fit === 'loves' && (!bend.hours || (hour >= bend.hours[0] && hour < bend.hours[1]));
      });
      if (suited) tags.push(tag(TRAITS[suited].name, 'trait'));
    }
    tags.push(...this.newTag(choice.key));
    const game = choice.news?.game ? this.deps.findGame?.(choice.news.game.id) : undefined;
    return {
      key: choice.key,
      label: choice.label,
      icon: iconNamed(choice.icon),
      cover: game ? coverImg(this.deps.coverUrl(game), game, 'social-balloon__cover') : undefined,
      run: () => this.choose(choice),
      tags,
      tone: 'say',
      wished: choice.key === this.wish,
      once: choice.once,
      fit: choice.fit,
      danger: choice.group === 'mean',
    };
  }

  /** The conversation's own stage: the place's entries and what to say (four balloons), the chips, Goodbye. */
  private mainRows(id: PersonId): Row[] {
    const ctx = this.context();
    const convo = this.convo ?? beginConversation(id, ctx);
    const extras = this.extras(id);
    const place = extras.filter((x) => !BEHIND.includes(x.group)).map((x) => this.extraRow(x));
    const bye: Row = { key: 'leave', label: 'Goodbye', icon: 'wave', run: () => this.close(), tone: 'leave' };
    // Their talk is done: what the place offers, and Goodbye.
    if (convo.leaving) return [...place, bye];
    const choices = choicesFor(id, ctx, convo);
    const says = [...place, ...choices.filter((c) => c.group === 'talk').map((c) => this.choiceRow(c))];
    const rows: Row[] = says.slice(0, SAY_ROWS);
    const overflow = says.slice(SAY_ROWS);
    const chip = (view: View, label: string, glyph: Row['icon'], inside: number): void => {
      if (inside) rows.push({ key: `more:${view}`, label, icon: glyph, run: () => this.openList(view, `more:${view}`), tone: 'button' });
    };
    chip('give', 'Give…', 'gift', this.giveRows(id).length);
    chip('ask', 'Ask…', 'hand', choices.filter((c) => c.group === 'ask').length + extras.filter((x) => x.group === 'ask').length);
    chip('promise', 'Promise…', 'ticket', extras.filter((x) => x.group === 'promise').length);
    const more = choices.filter((c) => c.group === 'mean').length + extras.filter((x) => x.group === 'mean').length + overflow.length;
    if (more) rows.push({ key: 'more:more', label: 'More…', icon: 'more', run: () => this.openList('more', 'more:more'), tone: 'quiet' });
    rows.push(bye);
    return rows;
  }

  /** What can be given here: the pocket, a game, a few coins, and the place's own (a favour's parcel, a lent game). */
  private giveRows(id: PersonId): Row[] {
    const rows: Row[] = [];
    if (this.offers(id, 'giveGift')) {
      for (const g of this.deps.pocket().filter((p) => p.count > 0)) {
        const taste = tasteOf(id, g.kind);
        rows.push({
          key: `gift:${g.kind}`,
          label: `${capitalise(giftName(g.kind))}${g.count > 1 ? ` ×${g.count}` : ''}`,
          icon: GIFT_ICONS[g.kind] ?? 'gift',
          run: () => {
            if (g.take()) this.give('giveGift', { gift: g.kind }, `gift:${g.kind}`);
          },
          tags: tasteTags(id, g.kind),
          tone: 'say',
          fit: taste === 'loves' ? 'loves' : taste === 'dislikes' ? 'dislikes' : 'likes',
        });
      }
    }
    if (this.offers(id, 'giveGame') && this.deps.givable().length) rows.push({ key: 'list:game', label: 'A game…', icon: 'cart', run: () => this.openList('game', 'list:game'), more: true, tone: 'say', fit: 'likes' });
    if (this.offers(id, 'giveCoins')) {
      rows.push({
        key: 'give:coins',
        label: `A few coins (${formatCoins(COIN_GIFT)})`,
        icon: 'coin',
        run: () => {
          if (this.deps.wallet.coins < COIN_GIFT) {
            this.deps.notices.refuse(`${formatCoins(COIN_GIFT)} to give, you have ${formatCoins(this.deps.wallet.coins)}`);
            return;
          }
          if (this.deps.wallet.spend(COIN_GIFT)) this.give('giveCoins', {}, 'give:coins');
        },
        tone: 'say',
        once: true,
        fit: 'likes',
      });
    }
    for (const extra of this.extras(id).filter((x) => x.group === 'give')) rows.push(this.extraRow(extra));
    return rows;
  }

  /** A list's balloons, Back last. */
  private subRows(id: PersonId): Row[] {
    const ctx = this.context();
    const convo = this.convo ?? beginConversation(id, ctx);
    const choices = choicesFor(id, ctx, convo);
    const extras = this.extras(id);
    let rows: Row[] = [];
    if (this.view === 'give') rows = this.giveRows(id);
    else if (this.view === 'ask') rows = [...choices.filter((c) => c.group === 'ask').map((c) => this.choiceRow(c)), ...extras.filter((x) => x.group === 'ask').map((x) => this.extraRow(x))];
    else if (this.view === 'promise') rows = extras.filter((x) => x.group === 'promise').map((x) => this.extraRow(x));
    else if (this.view === 'more') {
      const place = extras.filter((x) => !BEHIND.includes(x.group)).map((x) => this.extraRow(x));
      const says = [...place, ...choices.filter((c) => c.group === 'talk').map((c) => this.choiceRow(c))];
      rows = [...says.slice(SAY_ROWS), ...choices.filter((c) => c.group === 'mean').map((c) => this.choiceRow(c)), ...extras.filter((x) => x.group === 'mean').map((x) => this.extraRow(x))];
    } else if (this.view === 'game') {
      const games = [...this.deps.givable()]
        .map((g) => ({ game: g, gift: gameGift(g) }))
        .map((g) => ({ ...g, fit: gameFit(id, g.gift) }))
        // What was wrapped for giving comes first (`holidays/giftWrap`).
        .sort((a, b) => Number(!!b.gift.wrapped) - Number(!!a.gift.wrapped) || b.fit - a.fit)
        .slice(0, GAME_LIST);
      for (const { game, gift, fit } of games) {
        rows.push({
          key: `game:${game.id}`,
          label: gift.wrapped ? `${game.title} (wrapped)` : game.title,
          icon: 'cart',
          cover: coverImg(this.deps.coverUrl(game), game, 'social-balloon__cover'),
          run: () => {
            if (this.deps.giveGame(game)) this.give('giveGame', { game: gift }, `game:${game.id}`);
          },
          tone: 'say',
          once: true,
          fit: fitOfGame(fit),
        });
      }
    }
    rows.push({ key: 'back', label: 'Back', icon: 'arrowLeft', run: () => this.back(), tone: 'leave' });
    return rows;
  }

  /** The first balloon takes the focus. */
  private focusFirst(): void {
    this.stage.querySelector<HTMLElement>('button[data-action="choose"]')?.focus({ preventScroll: true });
  }
}

/** Where a standing was before a choice: the bar eases from it, the hearts and the tier change are read against it. */
interface Snapshot {
  warmth: number;
  trust: number;
  share: number;
  tier: ReturnType<typeof tierOf>;
}

/** How a game given would land, by how well it fits their tastes (their face before the press). */
function fitOfGame(fit: number): Fit {
  return fit >= 0.7 ? 'loves' : fit >= 0.3 ? 'likes' : 'meh';
}

/**
 * What `id` would like to talk about now (their thought): one of their open topics they love whose way the player has
 * not found out yet, the same all day; null when there is none, or for someone cross.
 */
function wishOf(id: PersonId, ctx: TalkContext): string | null {
  if (tierRank(tier(id)) <= tierRank('cold')) return null;
  const s = standing(id);
  const loved = openTopics(id).filter((t) => t.fit === 'loves' && !s.known.includes(`fit:${t.id}`));
  if (!loved.length) return null;
  const topic = loved[Math.floor(unit01(`${id}:${ctx.day}`) * loved.length)]!;
  return `topic:${topic.id}`;
}
