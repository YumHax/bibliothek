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
  /** Told once the player is awake again: a night's dream, some mornings (`household/dreams`); true when its card shows. */
  dreams?: { afterSleep(): Promise<boolean> };
}

/** A dream's card stays up this long (ms, `DreamCard`): the tip to get up waits for it, one thing at a time. */
const DREAM_CARD_MS = 8000;

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
    const player = this.parts.player;
    this.host.prompt(`[${actionKeyLabel('standUp')}] stand up · or move`, { id: 'seated', until: () => !player.isSeated });
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
      this.host.refuse('Not sleepy');
      return;
    }
    if (sleep.isAsleep) return;
    // Asked before anything else: by day the hands keep what they hold and nothing freezes.
    if (!sleep.sleepy) {
      this.host.refuse('Not sleepy yet: bedtime is after 8 pm');
      return;
    }
    this.host.putBack();
    this.host.setFrozen(true);
    void sleep.untilMorning().then(async (slept) => {
      this.host.setFrozen(false);
      const player = this.parts.player;
      const getUp = (): void => {
        if (player.isSeated) this.host.prompt(`[${actionKeyLabel('standUp')}] get up · or move`, { id: 'seated', until: () => !player.isSeated });
      };
      if (!slept) {
        this.host.refuse('Not sleepy: bedtime is after 8 pm');
        getUp();
        return;
      }
      // One thing at a time on waking: the dream's card when there is one (then the tip), else a good morning.
      const dreamt = (await this.parts.dreams?.afterSleep()) ?? false;
      if (dreamt) {
        window.setTimeout(getUp, DREAM_CARD_MS);
        return;
      }
      this.host.react('Good morning!');
      getUp();
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
