import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { pocket } from '@/errands/pocket';
import { parkVisits } from '@/park/parkVisits';
import { inTurn, random } from '@/random';
import { formatCoins } from '@/text/money';
import type { Furniture } from '../../Furniture';
import { invisibleHitbox } from '../../meshUtils';
import type { ParkDucks } from './ParkDucks';

interface PondBankOptions {
  /** Along the hoop fence (z), the stretch that answers a click. */
  length: number;
  ducks: ParkDucks;
  /** The game day: a feed and a wish count once a day. */
  day: () => number;
  /** Tickets for the old token fished out of the shallows. */
  wallet: { addTickets(tickets: number): void };
  /** Something into the water (a coin, the crumbs), heard there (`StreetCues.plop`). */
  plop?: () => void;
}

/** A wish: a coin. */
const WISH_PRICE = 1;
/** What the old arcade token is worth at the counter. */
const TOKEN_TICKETS = 30;
const WISHES = ['The coin skips once and sinks. You wish for something rare in a bargain bin.', 'Plop. A ring spreads towards the fountain. You wish for a mint copy, still sealed.', 'The coin goes down glinting. You wish, and do not say what for.'];
/** Crumbling a croissant for the ducks, said in turn. */
const FEEDING = inTurn(random, [
  'You crumble the croissant over the water. The ducks come paddling over, all elbows.',
  'Crumbs on the water: a drake gets there first and lets everyone know.',
  'The croissant goes in flakes. The ducks fight over the big ones and ignore the rest.',
  'A hen takes a crumb from your fingers, very politely, and then bites.',
]);
const WATCHING = ['A drake upends himself, tail to the sky.', 'Two hens bicker over nothing at all.', 'The ducks drift by, unhurried, eyeing your pockets.'];

/**
 * The pond's near bank over the gardens' hoop fence (`STREET_PLACES.park.bank`): an invisible stretch of the fence to
 * click. A croissant in the pocket (`errands/pocket`) is crumbled for the ducks, who come paddling (`ParkDucks.feed`);
 * else a coin tossed towards the fountain makes a wish, one a game day (`park/parkVisits`); after enough of them, an
 * old arcade token glints in the shallows, worth tickets. Origin on the fence's line, local +z out over the water.
 */
export class PondBank extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private line = 0;

  constructor(private readonly options: PondBankOptions) {
    super();
    this.name = 'PondBank';
    const hitbox = invisibleHitbox(options.length, 1.1, 0.5, { y: 0.55 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // The water does not glow.
  }

  label(): string {
    if (pocket.count('croissant') > 0) return 'Pond · feed the ducks a croissant';
    if (!parkVisits.wishedToday(this.options.day())) return `Pond · toss a coin and make a wish (${formatCoins(WISH_PRICE)})`;
    return 'Pond · watch the ducks';
  }

  activate(session: SessionActions): void {
    const { ducks, day, wallet } = this.options;
    if (pocket.take('croissant')) {
      ducks.feed();
      this.options.plop?.();
      parkVisits.feed(day());
      session.react(FEEDING());
      return;
    }
    if (parkVisits.wishedToday(day())) {
      session.react(WATCHING[this.line++ % WATCHING.length]!);
      return;
    }
    session.pay({
      price: WISH_PRICE,
      title: 'A coin in the pond',
      paid: () => {
        this.options.plop?.();
        if (parkVisits.wish(day())) {
          wallet.addTickets(TOKEN_TICKETS);
          session.reward({ title: 'An old arcade token', detail: 'Something glinted in the shallows: a brass token from the arcade, years old. The counter takes it.', tickets: TOKEN_TICKETS });
          return 'Your coin lands by something else down there, glinting. You fish it out.';
        }
        return WISHES[Math.floor(random() * WISHES.length)]!;
      },
    });
  }
}
