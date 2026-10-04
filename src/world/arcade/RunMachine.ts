import * as THREE from 'three';
import type { ArcadeBonus } from '@/game/SessionActions';
import type { MachineRun } from './MachineRun';
import type { Occupant } from './Station';

/**
 * A machine whose play cycle is a `MachineRun` (the cabinets, the pinball, the ticket machines): what `Station` and
 * `ArcadeMachineLike` ask that only reads or forwards to the run, so each machine builds its body and plays its own
 * game. The run is the subclass's: a field made in its constructor, or made on first use (`TicketMachine`).
 */
export abstract class RunMachine extends THREE.Group {
  protected abstract readonly run: MachineRun;

  /** From the coin to the last initial: a click or E walks away. */
  get isPlaying(): boolean {
    return this.run.isPlaying;
  }

  get occupant(): Occupant {
    return this.run.occupant;
  }

  get outOfOrder(): boolean {
    return this.run.outOfOrder;
  }

  get canReplay(): boolean {
    return this.run.canReplay;
  }

  pause(paused: boolean): void {
    this.run.setPaused(paused);
  }

  showBonus(bonuses: readonly ArcadeBonus[]): void {
    this.run.showBonus(bonuses);
  }
}
