import type { Updatable } from '@/core/Engine';

/** The machine the player stands at, as far as the HUD cares. */
interface MachineLike {
  readonly aimsWithView?: boolean;
}

/**
 * At an arcade machine the view is parked on its glass, so whatever sits in the middle of the screen sits on the game.
 * While the player stands there, `body.at-machine` (`styles.css`) hides the crosshair (`at-machine-aims` keeps it for a
 * machine aimed by looking, the hoops), moves the crosshair's column (reaction, slip, tip) to the side and the reward
 * banner to the top edge; the speech layer draws no bubble over the middle (`SpeechLayer.keepClear`).
 */
export class MachineHud implements Updatable {
  private at: MachineLike | null = null;

  constructor(
    private readonly machine: () => MachineLike | null,
    private readonly speech: { keepClear(on: boolean): void },
  ) {}

  update(): void {
    const at = this.machine();
    if (at === this.at) return;
    this.at = at;
    document.body.classList.toggle('at-machine', at !== null);
    document.body.classList.toggle('at-machine-aims', at?.aimsWithView === true);
    this.speech.keepClear(at !== null);
  }
}
