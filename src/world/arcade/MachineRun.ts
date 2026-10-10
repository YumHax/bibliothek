import type * as THREE from 'three';
import type { Input } from '@/core/Input';
import type { LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeBonus, ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import type { ChipSpeaker } from '@/audio/ChipSpeaker';
import { GameInput } from '@/input/GameInput';
import { placeOf } from '@/economy/scoreTable';
import { countUpEase } from '@/ui/countUp';
import { reduceMotion } from '@/settings/motion';
import { type ArcadeControls, NO_CONTROLS } from './games/ArcadeGame';
import { InitialsEntry } from './InitialsEntry';
import type { TicketStrip } from './TicketStrip';
import type { Occupant, StationEvents } from './Station';
import type { ScoreTable } from './scoreTable';
import { ARCADE_KEYS } from './arcadeKeys';
import { OUT_OF_ORDER_LINE, TAKEN_LINE, againLine, initialsLine, priceText, walkAwayLine } from './machineLines';

/** Where a machine is in its cycle: idle, the player's play, their initials, the end card, a regular on it. */
export type MachineState = 'attract' | 'playing' | 'initials' | 'over' | 'demo';

export interface MachineRunOptions {
  game: { readonly id: string };
  input: Input;
  speaker: ChipSpeaker;
  /** The machine's own (the crowd listens to it). */
  stationEvents: StationEvents;
  /** What the next play costs right now (0: on the house). */
  nextPlayCost: () => number;
  /** Score points per ticket; none: the machine pays no tickets (the claw, a cabinet at home). */
  pointsPerTicket?: number;
  /** The hall of fame, for a machine that keeps a table. */
  scores?: ScoreTable;
  /** The ticket strip the end card feeds out. */
  strip?: TicketStrip;
  /** Whether it is out of order today, and the note taped on it then. */
  outOfOrder?: () => boolean;
  note?: THREE.Object3D;
  /** The play went on the table under `initials` (a cabinet keeps a new best's run then). */
  onSign?: (initials: string, result: ArcadeResult) => void;
  /** The fire press that started a play only counts once let go (the alley: Space held from the end card must not start the swing). */
  fireAfterRelease?: boolean;
}

const COUNT_UP_SECONDS = 1.2;
/** Each bonus line (challenge, medal...) counts up on the end card this long after the score's tickets. */
const BONUS_SECONDS = 0.55;

/**
 * The paid play every arcade machine goes through, from the coin to the end card, as a part the
 * machine holds and forwards to: who is on it (`occupant`, a regular taking it with `occupy` until
 * `release`), the Session's play (`start` / `abort`, `activate` asking for it), the keys read
 * through one `GameInput` (`readControls`: fire's press edge, a click standing in for the trigger),
 * `finish` with the play's score (the initials for one that makes the table, the result to the
 * Session and the crowd), the end card's tickets counted up with a tick each (the strip feeding
 * out), the labels, the regulars' results, out-of-order days (it says so, a note shows, nobody
 * plays it), and the NEW BEST sting the moment a live score passes the best (`noteScore`; the
 * cabinet games raise their own banner instead). Every sound the speaker makes is news to the
 * crowd (`stationEvents.onSound`, wired here once). The machine keeps its play, its display and
 * where people stand; each frame it calls `update` (the initials and the end card) and runs its
 * own play in 'playing' and 'demo'.
 */
export class MachineRun {
  private current: MachineState = 'attract';
  private who: Occupant = null;
  private initials: InitialsEntry | null = null;
  private result: ArcadeResult = { score: 0, best: false };
  private rank: number | null = null;
  private clock = 0;
  private counted = 0;
  private onOver: ((result: ArcadeResult) => void) | null = null;
  private readonly keys: GameInput;
  private reported = false;
  private pause = 0;
  /** The pointer was unlocked mid-play: nothing moves until it is locked again. */
  private held = false;
  /** Fire was up at some point on the end card (a finger still on Space from the play does not replay). */
  private fireReleased = false;
  private bonusLines: readonly ArcadeBonus[] = [];
  /** What the Session settled the score's tickets at (the floor folded in), once it has; until then the score's own. */
  private settledTickets: number | null = null;
  private bonusTicked = 0;
  /** The best to beat when the play started, and whether the live score has passed it (the sting plays once). */
  private startBest = 0;
  private bestBeaten = false;

  constructor(private readonly options: MachineRunOptions) {
    this.keys = new GameInput(ARCADE_KEYS, options.input);
    // Every sound it makes is news to whoever plays or watches it.
    options.speaker.onPlay ??= (sfx) => options.stationEvents.onSound?.(sfx);
  }

  get state(): MachineState {
    return this.current;
  }

  get occupant(): Occupant {
    return this.who;
  }

  /** From the coin to the last initial: a click or E walks away. */
  get isPlaying(): boolean {
    return this.current === 'playing' || this.current === 'initials';
  }

  /** Out of order today (and nobody on it: a machine breaks between plays). */
  get outOfOrder(): boolean {
    return this.who === null && (this.options.outOfOrder?.() ?? false);
  }

  /** The initials being entered, while the state is 'initials'. */
  get entry(): InitialsEntry | null {
    return this.initials;
  }

  /** The player's last play, and its place on the table once signed (null: not on it). */
  get last(): ArcadeResult {
    return this.result;
  }

  get lastRank(): number | null {
    return this.rank;
  }

  /** Seconds on the end card. */
  get overClock(): number {
    return this.clock;
  }

  /** The end card's count-up, 0..1 (eased like every count in the game, `ui/countUp`). */
  get countUp(): number {
    return countUpEase(Math.min(1, this.clock / COUNT_UP_SECONDS));
  }

  /** The tickets the end card counts for the score: what the Session settled (never under the floor of a paid play), else the score's own. */
  get scoreTickets(): number {
    return this.settledTickets ?? this.tickets(this.result.score);
  }

  /** The tickets the end card shows so far. */
  get shownTickets(): number {
    return Math.floor(this.scoreTickets * this.countUp);
  }

  /** The play's bonuses (challenge, medal, streak...), counted up on the end card after the score's tickets. */
  get bonuses(): readonly ArcadeBonus[] {
    return this.bonusLines;
  }

  /** How far bonus `i`'s count-up is, 0..1 (it starts once the one before it is done). */
  bonusCountUp(i: number): number {
    return countUpEase(Math.max(0, Math.min(1, (this.clock - COUNT_UP_SECONDS - i * BONUS_SECONDS) / BONUS_SECONDS)));
  }

  /** Every ticket the end card has counted so far, the bonuses' too (what the strip feeds out). */
  get shownTotal(): number {
    return this.shownTickets + this.bonusLines.reduce((sum, b, i) => sum + Math.floor(b.tickets * this.bonusCountUp(i)), 0);
  }

  /** When the end card has counted everything up (seconds on it). */
  private get countEnd(): number {
    return COUNT_UP_SECONDS + this.bonusLines.length * BONUS_SECONDS;
  }

  /** The end card has counted everything up. */
  get countDone(): boolean {
    return this.clock >= this.countEnd;
  }

  /** On the end card, done counting, and fire let go since: a press or a click now plays again. */
  get canReplay(): boolean {
    return this.current === 'over' && this.countDone && this.fireReleased;
  }

  /** Whether the play is held still (the pointer unlocked). */
  get paused(): boolean {
    return this.held;
  }

  /** Holds the play still, or lets it go on (fire must be let go first: the click that locked the pointer is not a shot). */
  setPaused(paused: boolean): void {
    if (this.held === paused) return;
    this.held = paused;
    if (!paused) this.keys.latch();
  }

  /** What the play earned besides its score, and what the score itself counts for, shown on the end card and fed out on the strip. */
  showBonus(bonuses: readonly ArcadeBonus[], counted?: number): void {
    this.bonusLines = bonuses.filter((b) => b.tickets > 0);
    this.settledTickets = counted ?? null;
  }

  tickets(score: number): number {
    const { pointsPerTicket } = this.options;
    return pointsPerTicket ? Math.floor(score / pointsPerTicket) : 0;
  }

  /** What the next play costs, for a label or a screen: "free play", "1 coin". */
  priceText(): string {
    return priceText(this.options.nextPlayCost());
  }

  /** Whether the next play is on the house. */
  get free(): boolean {
    return this.options.nextPlayCost() === 0;
  }

  /** The Session took the coin: a paid play starts (the machine resets its board after this); `onOver` is told the result once. */
  start(onOver: (result: ArcadeResult) => void): void {
    const { speaker, strip, stationEvents, scores, game } = this.options;
    this.onOver = onOver;
    this.current = 'playing';
    speaker.level = 1;
    speaker.play('coin');
    strip?.tear();
    this.counted = 0;
    this.held = false;
    this.bonusLines = [];
    this.settledTickets = null;
    this.startBest = scores?.bestOf(game.id) ?? 0;
    this.bestBeaten = false;
    // The click or Space that started it must not count as a fire press.
    this.keys.reset(true);
    if (this.options.fireAfterRelease) this.keys.latch();
    if (this.who !== 'player') {
      this.who = 'player';
      stationEvents.onPlayerStart?.();
    }
  }

  /** The player walked away: a running play is lost without payout; initials half-entered are signed as they stand. */
  abort(): void {
    if (this.current === 'initials' && this.initials) this.sign(this.initials.value);
    this.onOver = null;
    this.initials = null;
    this.current = 'attract';
    this.who = null;
    this.held = false;
    this.bonusLines = [];
    this.settledTickets = null;
    this.options.strip?.tear();
    this.options.stationEvents.onPlayerLeave?.();
  }

  /** A regular steps up (the machine then starts their game); false when taken or out of order. */
  occupy(): boolean {
    if (this.who || this.outOfOrder) return false;
    this.who = 'regular';
    this.current = 'demo';
    this.options.speaker.level = 0.45;
    this.reported = false;
    this.pause = 0;
    return true;
  }

  /** The regular left: true when one was on it (the machine then goes back to its attract mode). */
  release(): boolean {
    if (this.who !== 'regular') return false;
    this.who = null;
    this.current = 'attract';
    return true;
  }

  /**
   * The live score of the player's play: the first time it passes the best there was to beat, the
   * NEW BEST sting plays (the physical machines; a cabinet game raises its own banner, `BaseGame`).
   */
  noteScore(score: number): void {
    if (this.current !== 'playing' || this.bestBeaten || this.startBest <= 0 || score <= this.startBest) return;
    this.bestBeaten = true;
    this.options.speaker.play('best');
  }

  /**
   * The play is over with `score` (and a prize, for the claw; `refund` when it reported nothing through
   * no fault of the player's): the table's initials first when it makes it, else the end card. A best
   * is only a best when there was one to beat; the first score on a machine is just `first`.
   */
  finish(score: number, prize?: string, refund = false): ArcadeResult {
    const { scores, game } = this.options;
    const before = scores?.bestOf(game.id) ?? 0;
    const scored = !!scores && score > 0;
    this.result = { score, best: scored && before > 0 && score > before, ...(scored && before <= 0 ? { first: true } : {}), ...(prize ? { prize } : {}), ...(refund ? { refund: true } : {}) };
    this.rank = null;
    this.counted = 0;
    this.bonusLines = [];
    this.settledTickets = null;
    this.bonusTicked = 0;
    this.fireReleased = false;
    if (scores?.qualifies(game.id, score)) {
      this.initials = new InitialsEntry(scores.initials, placeOf(scores.table(game.id), score), score);
      this.current = 'initials';
    } else {
      if (scores) this.sign(scores.initials);
      this.current = 'over';
      this.clock = 0;
    }
    const handler = this.onOver;
    this.onOver = null;
    handler?.(this.result);
    this.options.stationEvents.onPlayerResult?.(this.result);
    return this.result;
  }

  /** A regular's game ended with `score`: the crowd hears of it once (until their next game). */
  regularResult(score: number): void {
    if (this.reported) return;
    this.reported = true;
    this.options.stationEvents.onRegularResult?.(score);
  }

  /** Whether the regular's game has ended (and they are between games). */
  get regularDone(): boolean {
    return this.reported;
  }

  /** The pause after a regular's game: true once `seconds` have gone and they put the next coin in (the machine starts it). */
  regularPause(dt: number, seconds: number): boolean {
    this.pause += dt;
    if (this.pause < seconds) return false;
    this.pause = 0;
    this.reported = false;
    this.options.speaker.play('coin');
    return true;
  }

  /** The label for the machine's state; `attract` when idle, `playing` / `over` to say something else than the usual. */
  label(lines: { attract: string; playing?: string; over?: string }): string {
    if (this.who === 'regular') return TAKEN_LINE;
    if (this.outOfOrder) return OUT_OF_ORDER_LINE;
    if (this.current === 'playing') return lines.playing ?? walkAwayLine();
    if (this.current === 'initials') return initialsLine();
    if (this.current === 'over') return lines.over ?? againLine(this.priceText());
    return lines.attract;
  }

  labelPlacement(): LabelPlacement {
    return this.current === 'attract' || this.who === 'regular' ? 'crosshair' : 'edge';
  }

  /** A click on the machine: taken or broken, it says so; mid-play `clickWhilePlaying` may use it (true: it did), else the Session plays or walks away. */
  activate(session: SessionActions, machine: ArcadeMachineLike, clickWhilePlaying?: () => boolean): void {
    if (this.who === 'regular') session.refuse(TAKEN_LINE);
    else if (this.outOfOrder) session.refuse(OUT_OF_ORDER_LINE);
    else if (this.current === 'playing' && clickWhilePlaying?.()) return;
    // A click on the end card while it counts: the count jumps to its end (the next click plays again).
    else if (this.current === 'over' && !this.countDone && this.who === 'player') this.skipCount();
    else session.playArcade(machine);
  }

  /** The end card's count-up jumps to its end (every ticket and bonus shown, the strip fed out); fire must be let go before it replays. */
  private skipCount(): void {
    this.clock = Math.max(this.clock, this.countEnd);
    this.fireReleased = false;
  }

  /** A click counts as a fire press on the next `readControls` (a light gun's trigger). */
  click(): void {
    this.keys.click();
  }

  /** The player's keys this frame, with fire's press edge. */
  readControls(): ArcadeControls {
    return this.keys.read();
  }

  /**
   * One frame of the parts it runs: the out-of-order note, the initials (letters from the keys,
   * signed when done) and the end card (the tickets counted up, a tick each, the strip feeding
   * out). Returns the keys it read (the initials'), for a machine whose stick follows them.
   */
  update(dt: number): ArcadeControls {
    const { note, speaker, strip } = this.options;
    if (note) note.visible = this.outOfOrder;
    if (this.held) return NO_CONTROLS;
    if (this.current === 'initials') {
      const controls = this.readControls();
      const sfx = this.initials?.update(dt, controls);
      if (sfx) speaker.play(sfx);
      if (this.initials?.done) {
        this.sign(this.initials.value);
        this.initials = null;
        this.current = 'over';
        this.clock = 0;
        this.counted = 0;
        this.fireReleased = false;
      }
      return controls;
    }
    if (this.current === 'over') {
      this.clock += dt;
      // Under reduced motion the card shows everything at once (the bonuses may arrive a frame after the result).
      if (reduceMotion()) this.clock = Math.max(this.clock, this.countEnd);
      // Fire let go since the play: a fresh press while the card still counts skips to its end; the next one replays.
      if (!this.options.input.isDown(...ARCADE_KEYS.fire)) this.fireReleased = true;
      else if (this.fireReleased && !this.countDone && this.who === 'player') this.skipCount();
      const tickets = this.scoreTickets;
      const shown = this.shownTickets;
      // One tick per ticket paid out, as many as the ear can take.
      if (shown > this.counted && shown - this.counted >= Math.max(1, tickets / 30)) {
        this.counted = shown;
        speaker.play('ticket');
      }
      // The bonuses land after it, a chime each.
      const started = this.bonusLines.filter((_, i) => this.bonusCountUp(i) > 0).length;
      if (started > this.bonusTicked) {
        this.bonusTicked = started;
        speaker.play('bonus');
      }
      strip?.setTickets(this.shownTotal);
    }
    return NO_CONTROLS;
  }

  private sign(initials: string): void {
    const { scores, game, onSign } = this.options;
    this.rank = scores?.submit(game.id, this.result.score, initials).rank ?? null;
    onSign?.(initials, this.result);
  }
}
