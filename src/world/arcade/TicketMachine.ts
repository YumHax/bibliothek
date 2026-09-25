import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import type { ChipSpeaker } from '@/audio/ChipSpeaker';
import type { Furniture } from '../Furniture';
import type { ArcadeControls } from './games/ArcadeGame';
import type { InitialsEntry } from './InitialsEntry';
import type { TicketStrip } from './TicketStrip';
import type { Occupant, Station, StationEvents } from './Station';
import type { ScoreTable } from './scoreTable';
import { MachineRun, type MachineRunOptions, type MachineState } from './MachineRun';

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

export type { MachineState } from './MachineRun';

const REGULAR_PAUSE = 3;

/**
 * A physical ticket machine (the alley, the hoops, the ticket wheel) over a `MachineRun`: the paid
 * play from coin to end card, the initials, the strip, a regular taking it (their final score to
 * the crowd), out-of-order days, the labels. A machine is only its play: `newGame`, `play` (one
 * frame, true when it is over), `demoControls` (a regular's hands), `score`, its display, and
 * where people stand. Subclasses build their model, `speaker`, `strip` and `note` in their
 * constructor, before anything reads the state (the run is made on first use, from them).
 */
export abstract class TicketMachine extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  abstract readonly hitboxes: THREE.Object3D[];
  abstract readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  abstract readonly standAt: THREE.Vector3;
  abstract readonly focus: THREE.Vector3;
  abstract readonly lean: number;
  readonly stationEvents: StationEvents = {};
  readonly freeWhenBroke = true;

  protected clock = 0;
  protected abstract readonly speaker: ChipSpeaker;
  protected abstract readonly strip: TicketStrip;
  /** The out-of-order note on its display, when it has one. */
  protected note: THREE.Object3D | null = null;
  private machineRun: MachineRun | null = null;

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

  /** The play cycle, made on first use from what the subclass's constructor built. */
  protected get run(): MachineRun {
    this.machineRun ??= new MachineRun({
      game: this.game,
      input: this.wiring.input,
      speaker: this.speaker,
      stationEvents: this.stationEvents,
      nextPlayCost: this.wiring.nextPlayCost,
      pointsPerTicket: this.wiring.pointsPerTicket,
      strip: this.strip,
      ...(this.wiring.scores ? { scores: this.wiring.scores } : {}),
      ...(this.wiring.outOfOrder ? { outOfOrder: this.wiring.outOfOrder } : {}),
      ...(this.note ? { note: this.note } : {}),
      ...this.runOptions(),
    });
    return this.machineRun;
  }

  get isPlaying(): boolean {
    return this.run.isPlaying;
  }

  get occupant(): Occupant {
    return this.run.occupant;
  }

  get outOfOrder(): boolean {
    return this.run.outOfOrder;
  }

  screenCentre(): THREE.Vector3 {
    return this.localToWorld(this.focus.clone());
  }

  start(onOver: (result: ArcadeResult) => void): void {
    this.run.start(onOver);
    this.newGame();
  }

  abort(): void {
    this.run.abort();
    this.newGame();
  }

  occupy(): boolean {
    if (!this.run.occupy()) return false;
    this.newGame();
    return true;
  }

  release(): void {
    if (this.run.release()) this.newGame();
  }

  label(): string {
    return this.run.label({ attract: this.attractLabel(this.run.priceText()), playing: this.playingLabel() });
  }

  labelPlacement(): LabelPlacement {
    return this.run.labelPlacement();
  }

  activate(session: SessionActions): void {
    this.run.activate(session, this, () => this.clickWhilePlaying());
  }

  update(dt: number): void {
    this.clock += dt;
    this.speaker.follow();
    this.strip.update(dt);
    const { run } = this;
    run.update(dt);
    if (run.state === 'playing') {
      if (this.play(dt, run.readControls())) this.finished(run.finish(this.score));
    } else if (run.state === 'demo') {
      if (run.regularDone) {
        if (run.regularPause(dt, REGULAR_PAUSE)) this.newGame();
      } else if (this.play(dt, this.demoControls(dt))) {
        run.regularResult(this.score);
        this.regularFinished(this.score);
      }
    }
    this.paint(dt);
  }

  dispose(): void {
    this.speaker.dispose();
  }

  // --- What the subclass reads of the run -------------------------------------------------------

  protected get state(): MachineState {
    return this.run.state;
  }

  protected get who(): Occupant {
    return this.run.occupant;
  }

  protected get entry(): InitialsEntry | null {
    return this.run.entry;
  }

  protected get last(): ArcadeResult {
    return this.run.last;
  }

  protected get lastRank(): number | null {
    return this.run.lastRank;
  }

  /** The count-up's progress on the end card, 0..1. */
  protected get countUp(): number {
    return this.run.countUp;
  }

  protected ticketsOf(score: number): number {
    return this.run.tickets(score);
  }

  protected priceText(): string {
    return this.run.priceText();
  }

  // --- Hooks ------------------------------------------------------------------------------------

  /** More of the run's options (the alley's fire only counting once let go). */
  protected runOptions(): Pick<MachineRunOptions, 'fireAfterRelease'> {
    return {};
  }

  /** The label while the player plays. */
  protected playingLabel(): string | undefined {
    return undefined;
  }

  /** A click on the machine mid-play: true when it means something to the play (the wheel's lever), false to walk away. */
  protected clickWhilePlaying(): boolean {
    return false;
  }

  /** The player's play ended (the alley sighs or cheers). */
  protected finished(_result: ArcadeResult): void {}

  /** A regular's play ended (the wheel pays its jackpot out to them). */
  protected regularFinished(_score: number): void {}
}
