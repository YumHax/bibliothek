import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import type { ChipSpeaker } from '@/audio/ChipSpeaker';
import type { Furniture } from '../Furniture';
import { type ArcadeControls, NO_CONTROLS } from './games/ArcadeGame';
import { InitialsEntry } from './InitialsEntry';
import type { TicketStrip } from './TicketStrip';
import { TAKEN_LINE, type Occupant, type Station, type StationEvents } from './Station';
import type { ScoreTable } from './scoreTable';

/** What every physical ticket machine is wired to. */
export interface TicketMachineWiring {
  input: Input;
  /** The camera: the speaker follows it. */
  listener: THREE.Object3D;
  /** What the next play costs right now (0: on the house). */
  nextPlayCost: () => number;
  pointsPerTicket: number;
  /** The hall of fame, for a machine that keeps a table (the wheel does not: luck is not a score). */
  scores?: ScoreTable;
  /** Whether it is out of order today. */
  outOfOrder?: () => boolean;
}

export type MachineState = 'attract' | 'playing' | 'initials' | 'over' | 'demo';

const COUNT_UP_SECONDS = 1.2;
const REGULAR_PAUSE = 3;
const OUT_OF_ORDER_LINE = 'OUT OF ORDER. Sorry. — the management';
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const FIRE_KEYS = ['Space', 'Enter', 'NumpadEnter'];

/**
 * What the hall's newer physical machines share (the ticket wheel, the hoops): the paid play from
 * coin to end card through the Session (`playArcade`), the keys read straight from `Input`, the
 * initials for a score that makes the table, the tickets counted out of the strip, a regular
 * taking it (`occupy`: it plays itself until `release`, their final score going to the crowd),
 * out-of-order days, the labels. A machine is only its play: `newGame`, `play` (one frame, true
 * when it is over), `demoControls` (a regular's hands), `score`, its display, and where people
 * stand. Subclasses build their model, `speaker` and `strip` in their constructor.
 */
export abstract class TicketMachine extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  abstract readonly hitboxes: THREE.Object3D[];
  abstract readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  abstract readonly standAt: THREE.Vector3;
  abstract readonly focus: THREE.Vector3;
  abstract readonly lean: number;
  readonly stationEvents: StationEvents = {};
  readonly freeWhenBroke = true;

  protected state: MachineState = 'attract';
  protected who: Occupant = null;
  protected entry: InitialsEntry | null = null;
  protected last: ArcadeResult = { score: 0, best: false };
  protected lastRank: number | null = null;
  protected overClock = 0;
  protected clock = 0;
  protected abstract readonly speaker: ChipSpeaker;
  protected abstract readonly strip: TicketStrip;
  private onOver: ((result: ArcadeResult) => void) | null = null;
  private lastFire = false;
  private demoDone = false;
  private demoPause = 0;
  private counted = 0;

  protected constructor(protected readonly wiring: TicketMachineWiring) {
    super();
  }

  abstract get footprint(): THREE.Box3;
  abstract eyePose(): { position: THREE.Vector3; yaw: number };
  abstract handsAt(): readonly [THREE.Vector3, THREE.Vector3];
  /** The play's score so far (the wheel's: the tickets it landed on). */
  protected abstract get score(): number;
  protected abstract newGame(): void;
  /** One frame of a play, by the player or a regular; true once the play is over. */
  protected abstract play(dt: number, controls: ArcadeControls): boolean;
  protected abstract demoControls(dt: number): ArcadeControls;
  /** The label when nobody is at it. */
  protected abstract attractLabel(price: string): string;
  /** Paints the machine's own display for the current state; called every frame. */
  protected abstract paint(dt: number): void;
  abstract setHovered(hovered: boolean): void;

  get isPlaying(): boolean {
    return this.state === 'playing' || this.state === 'initials';
  }

  get occupant(): Occupant {
    return this.who;
  }

  get outOfOrder(): boolean {
    return this.who === null && (this.wiring.outOfOrder?.() ?? false);
  }

  screenCentre(): THREE.Vector3 {
    return this.localToWorld(this.focus.clone());
  }

  start(onOver: (result: ArcadeResult) => void): void {
    this.onOver = onOver;
    this.state = 'playing';
    this.newGame();
    this.speaker.level = 1;
    this.speaker.play('coin');
    this.strip.tear();
    this.counted = 0;
    this.lastFire = true;
    if (this.who !== 'player') {
      this.who = 'player';
      this.stationEvents.onPlayerStart?.();
    }
  }

  abort(): void {
    if (this.state === 'initials' && this.entry) this.sign(this.entry.value);
    this.onOver = null;
    this.entry = null;
    this.state = 'attract';
    this.who = null;
    this.strip.tear();
    this.newGame();
    this.stationEvents.onPlayerLeave?.();
  }

  occupy(): boolean {
    if (this.who || this.outOfOrder) return false;
    this.who = 'regular';
    this.state = 'demo';
    this.speaker.level = 0.45;
    this.demoDone = false;
    this.demoPause = 0;
    this.newGame();
    return true;
  }

  release(): void {
    if (this.who !== 'regular') return;
    this.who = null;
    this.state = 'attract';
    this.newGame();
  }

  label(): string {
    if (this.who === 'regular') return TAKEN_LINE;
    if (this.outOfOrder) return OUT_OF_ORDER_LINE;
    if (this.state === 'playing') return this.playingLabel();
    if (this.state === 'initials') return 'Sign the hall of fame · E to walk away';
    if (this.state === 'over') return `Space or click to play again (${this.priceText()}) · E to walk away`;
    return this.attractLabel(this.priceText());
  }

  labelPlacement(): LabelPlacement {
    return this.state === 'attract' || this.who === 'regular' ? 'crosshair' : 'edge';
  }

  activate(session: SessionActions): void {
    if (this.who === 'regular') session.hint(TAKEN_LINE);
    else if (this.outOfOrder) session.hint(OUT_OF_ORDER_LINE);
    else if (this.state === 'playing' && this.clickWhilePlaying()) return;
    else session.playArcade(this);
  }

  update(dt: number): void {
    this.clock += dt;
    this.speaker.follow();
    this.strip.update(dt);
    switch (this.state) {
      case 'playing':
        if (this.play(dt, this.readControls())) this.finish();
        break;
      case 'demo':
        if (this.demoDone) {
          this.demoPause += dt;
          if (this.demoPause > REGULAR_PAUSE) {
            this.demoDone = false;
            this.demoPause = 0;
            this.speaker.play('coin');
            this.newGame();
          }
        } else if (this.play(dt, this.demoControls(dt))) {
          this.demoDone = true;
          this.stationEvents.onRegularResult?.(this.score);
          this.regularFinished(this.score);
        }
        break;
      case 'initials': {
        const sfx = this.entry?.update(dt, this.readControls());
        if (sfx) this.speaker.play(sfx);
        if (this.entry?.done) {
          this.sign(this.entry.value);
          this.entry = null;
          this.state = 'over';
          this.overClock = 0;
        }
        break;
      }
      case 'over': {
        this.overClock += dt;
        const tickets = this.ticketsOf(this.last.score);
        const shown = Math.floor(tickets * Math.min(1, this.overClock / COUNT_UP_SECONDS));
        if (shown > this.counted && shown - this.counted >= Math.max(1, tickets / 30)) {
          this.counted = shown;
          this.speaker.play('ticket');
        }
        this.strip.setTickets(shown);
        break;
      }
      case 'attract':
        break;
    }
    this.paint(dt);
  }

  dispose(): void {
    this.speaker.dispose();
  }

  /** The label while the player plays. */
  protected playingLabel(): string {
    return 'Press E or click to walk away (the play is lost)';
  }

  /** A click on the machine mid-play: true when it means something to the play (the wheel's lever), false to walk away. */
  protected clickWhilePlaying(): boolean {
    return false;
  }

  /** A regular's play ended (the wheel pays its jackpot out to them). */
  protected regularFinished(_score: number): void {}

  protected priceText(): string {
    const cost = this.wiring.nextPlayCost();
    return cost === 0 ? 'free play' : `${cost} coin${cost > 1 ? 's' : ''}`;
  }

  protected ticketsOf(score: number): number {
    return Math.floor(score / this.wiring.pointsPerTicket);
  }

  /** The count-up's progress on the end card, 0..1. */
  protected get countUp(): number {
    return Math.min(1, this.overClock / COUNT_UP_SECONDS);
  }

  private finish(): void {
    const { scores } = this.wiring;
    const score = this.score;
    this.last = { score, best: !!scores && score > 0 && score > scores.bestOf(this.game.id) };
    this.lastRank = null;
    this.counted = 0;
    if (scores?.qualifies(this.game.id, score)) {
      const rank = Math.max(0, scores.table(this.game.id).findIndex((e) => score > e.score));
      this.entry = new InitialsEntry(scores.initials, rank, score);
      this.state = 'initials';
    } else {
      if (scores) this.sign(scores.initials);
      this.state = 'over';
      this.overClock = 0;
    }
    const handler = this.onOver;
    this.onOver = null;
    handler?.(this.last);
    this.stationEvents.onPlayerResult?.(this.last);
  }

  private sign(initials: string): void {
    this.lastRank = this.wiring.scores?.submit(this.game.id, this.last.score, initials).rank ?? null;
  }

  protected readControls(): ArcadeControls {
    const { input } = this.wiring;
    const fire = input.isDown(...FIRE_KEYS);
    const controls: ArcadeControls = {
      ...NO_CONTROLS,
      left: input.isDown(...LEFT_KEYS),
      right: input.isDown(...RIGHT_KEYS),
      up: input.isDown(...UP_KEYS),
      down: input.isDown(...DOWN_KEYS),
      fire,
      firePressed: fire && !this.lastFire,
    };
    this.lastFire = fire;
    return controls;
  }
}
