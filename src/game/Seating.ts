import type { Seat } from '@/world/Seat';
import type { SeatLike } from './SessionActions';
import type { CatLike, CoreParts, SleepLike } from './SessionParts';
import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import type { KeyRoute, SessionHost } from './SessionHost';


export interface SeatingParts extends Pick<CoreParts, 'player'> {
  /** Told which armchair the player sits in (it comes to the lap there). */
  cat?: CatLike;
  /** A night's sleep from the bed (fade, clock to the next morning, fade back): `game/Sleep`. */
  sleep?: SleepLike;
}

/** Armchairs and the bed: sitting down, standing up (a movement key or E), and sleeping until morning. */
export class Seating implements KeyRoute {
  /** The seat last sat in through `sit()`; only meaningful while the player is seated. */
  private seat: SeatLike | null = null;

  constructor(private readonly parts: SeatingParts, private readonly host: SessionHost) {}

  /** What the player sits (or lies) in, while seated. */
  get current(): SeatLike | null {
    return this.parts.player.isSeated ? this.seat : null;
  }

  /** Nothing to do in the dark but wait for morning. */
  get asleep(): boolean {
    return this.parts.sleep?.isAsleep ?? false;
  }

  sit(seat: SeatLike): void {
    const { position, yaw } = seat.eyePose();
    this.parts.player.sit(position, yaw);
    this.seat = seat;
    // The cat only knows the armchairs (it comes to the lap there); in bed the player is simply not in one.
    this.parts.cat?.setPlayerSeat?.(isArmchair(seat) ? seat : null);
    this.host.hint(`Move or press ${actionKeyLabel('standUp')} to stand up`);
  }

  stand(): void {
    if (!this.parts.player.isSeated) return;
    this.parts.player.stand();
    this.parts.cat?.setPlayerSeat?.(null);
  }

  /** In bed: put down what is in hand, fade to black, wake at 7:00 still lying there. */
  sleep(): void {
    const { sleep } = this.parts;
    if (!sleep) {
      this.host.hint('Not sleepy');
      return;
    }
    if (sleep.isAsleep) return;
    this.host.putBack();
    this.host.setFrozen(true);
    void sleep.untilMorning().then(() => {
      this.host.setFrozen(false);
      this.host.notify(`Good morning!\nMove or press ${actionKeyLabel('standUp')} to get up`, 3000);
    });
  }

  /** Last in the route: a movement key or E (not taken by the hands) gets the seated player up. */
  onKey(code: string): boolean {
    if (!this.parts.player.isSeated || !isAction(code, 'forward', 'back', 'left', 'right', 'standUp')) return false;
    this.host.stand();
    return true;
  }
}

/** An armchair (a `Seat`: the cat knows its lap) rather than any other place to sit, such as the bed. */
function isArmchair(seat: SeatLike): seat is Seat {
  return typeof (seat as Partial<Seat>).lapSpot === 'function';
}
