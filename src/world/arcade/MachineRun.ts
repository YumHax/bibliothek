import type * as THREE from 'three';
import type { Input } from '@/core/Input';
import type { LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import type { ChipSpeaker } from '@/audio/ChipSpeaker';
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
  /** Score points per ticket; none: the machine pays no tickets (the claw). */
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

/**
 * The paid play every arcade machine goes through, from the coin to the end card, as a part the
 * machine holds and forwards to: who is on it (`occupant`, a regular taking it with `occupy` until
 * `release`), the Session's play (`start` / `abort`, `activate` asking for it), the keys read
 * straight from `Input` (`readControls`: fire's press edge, a click standing in for the trigger),
 * `finish` with the play's score (the initials for one that makes the table, the result to the
 * Session and the crowd), the end card's tickets counted up with a tick each (the strip feeding
 * out), the labels, the regulars' results, and out-of-order days (it says so, a note shows, nobody
 * plays it). The machine keeps its play, its display and where people stand; each frame it calls
 * `update` (the initials and the end card) and runs its own play in 'playing' and 'demo'.
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
  private lastFire = false;
  private latched = false;
  private clicked = false;
  private reported = false;
  private pause = 0;

  constructor(private readonly options: MachineRunOptions) {}

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

  /** The end card's count-up, 0..1. */
  get countUp(): number {
    return Math.min(1, this.clock / COUNT_UP_SECONDS);
  }

  /** The tickets the end card shows so far. */
  get shownTickets(): number {
    return Math.floor(this.tickets(this.result.score) * this.countUp);
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
    const { speaker, strip, stationEvents } = this.options;
    this.onOver = onOver;
    this.current = 'playing';
    speaker.level = 1;
    speaker.play('coin');
    strip?.tear();
    this.counted = 0;
    // The click or Space that started it must not count as a fire press.
    this.lastFire = true;
    this.latched = this.options.fireAfterRelease ?? false;
    this.clicked = false;
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

  /** The play is over with `score` (and a prize, for the claw): the table's initials first when it makes it, else the end card. */
  finish(score: number, prize?: string): ArcadeResult {
    const { scores, game } = this.options;
    this.result = { score, best: !!scores && score > 0 && score > scores.bestOf(game.id), ...(prize ? { prize } : {}) };
    this.rank = null;
    this.counted = 0;
    if (scores?.qualifies(game.id, score)) {
      const rank = Math.max(0, scores.table(game.id).findIndex((e) => score > e.score));
      this.initials = new InitialsEntry(scores.initials, rank, score);
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
    if (this.who === 'regular') session.hint(TAKEN_LINE);
    else if (this.outOfOrder) session.hint(OUT_OF_ORDER_LINE);
    else if (this.current === 'playing' && clickWhilePlaying?.()) return;
    else session.playArcade(machine);
  }

  /** A click counts as a fire press on the next `readControls` (a light gun's trigger). */
  click(): void {
    this.clicked = true;
  }

  /** The player's keys this frame, with fire's press edge. */
  readControls(): ArcadeControls {
    const { input } = this.options;
    let fire = input.isDown(...ARCADE_KEYS.fire) || this.clicked;
    this.clicked = false;
    if (this.latched) {
      if (!fire) this.latched = false;
      fire = false;
    }
    const controls: ArcadeControls = {
      left: input.isDown(...ARCADE_KEYS.left),
      right: input.isDown(...ARCADE_KEYS.right),
      up: input.isDown(...ARCADE_KEYS.up),
      down: input.isDown(...ARCADE_KEYS.down),
      fire,
      firePressed: fire && !this.lastFire,
    };
    this.lastFire = fire;
    return controls;
  }

  /**
   * One frame of the parts it runs: the out-of-order note, the initials (letters from the keys,
   * signed when done) and the end card (the tickets counted up, a tick each, the strip feeding
   * out). Returns the keys it read (the initials'), for a machine whose stick follows them.
   */
  update(dt: number): ArcadeControls {
    const { note, speaker, strip } = this.options;
    if (note) note.visible = this.outOfOrder;
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
      }
      return controls;
    }
    if (this.current === 'over') {
      this.clock += dt;
      const tickets = this.tickets(this.result.score);
      const shown = this.shownTickets;
      // One tick per ticket paid out, as many as the ear can take.
      if (shown > this.counted && shown - this.counted >= Math.max(1, tickets / 30)) {
        this.counted = shown;
        speaker.play('ticket');
      }
      strip?.setTickets(shown);
    }
    return NO_CONTROLS;
  }

  private sign(initials: string): void {
    const { scores, game, onSign } = this.options;
    this.rank = scores?.submit(game.id, this.result.score, initials).rank ?? null;
    onSign?.(initials, this.result);
  }
}
