import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { StockItem } from '@/economy/StockItem';
import { TRICK_OR_TREAT_HOURS, trickOrTreat } from '@/holidays/trickOrTreat';
import { inHours } from '@/time/clock';
import { fnv1a, lcg } from '@/random';
import type { Furniture } from '../../Furniture';
import { ForSaleBox } from '../../market/ForSaleBox';
import { invisibleHitbox } from '../../meshUtils';
import type { HalloweenDoor } from '../streetPlacesPlan';

interface DoorKnockOptions {
  door: HalloweenDoor;
  /** The game hour now; the real year (one treat a door a year). */
  hours: () => number;
  year: () => number;
  /** Coins for a treat in coin (`BuildContext.money.purse`). */
  purse?: { earnCoins(coins: number): void };
  /** The old game one door of the year hands out (drawn for the year), or null. */
  game: () => Promise<StockItem | null>;
  /** Whether this door is the year's door with a game. */
  givesGame: boolean;
  host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void; toLocal(point: THREE.Vector3): THREE.Vector3 };
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
}

/** The door's size, as a click target. */
const DOOR = { width: 1.1, height: 2.3 };
const ANSWERS = ['“Trick or treat? Go on then, take a handful.”', '“Oh, you gave me a fright! Here, sweets.”', '“We’ve run out of the good ones. Have a toffee.”'];
const KNOCKED = ['Nobody comes: they gave you their sweets already.', 'The pumpkin grins. You have had your treat here.'];
/** A treat in coin: how many. */
const TREAT_COINS = 2;

/**
 * A residents' door on Front Street that answers on Halloween's evenings (`STREET_PLACES.halloween`, the holiday's days
 * of the real calendar, `TRICK_OR_TREAT_HOURS`): a knock, and whoever lives there comes to the door with a treat, once
 * a year (`holidays/trickOrTreat`): sweets, a couple of coins, and at one door of the year an old game out of a loft,
 * left on the step for the player to take (a free `ForSaleBox`). The door is the facade's; this is its click target
 * (and a pumpkin on its step, placed by the builder). Origin at the door's foot, local +z out of it.
 */
export class DoorKnock extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private line = 0;
  private gift: ForSaleBox | null = null;

  constructor(private readonly options: DoorKnockOptions) {
    super();
    this.name = 'DoorKnock';
    const hitbox = invisibleHitbox(DOOR.width, DOOR.height, 0.2, { y: DOOR.height / 2, z: 0.1 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    this.gift?.dispose();
  }

  setHovered(): void {
    // The caption says it.
  }

  private get answering(): boolean {
    return inHours(this.options.hours(), TRICK_OR_TREAT_HOURS);
  }

  label(): string | null {
    if (!this.answering) return null;
    return trickOrTreat.knocked(this.options.door.id, this.options.year()) ? `${this.options.door.who} · a pumpkin on the step` : `${this.options.door.who} · knock, trick or treat`;
  }

  activate(session: SessionActions): void {
    const { door, year } = this.options;
    if (!this.answering) return;
    if (trickOrTreat.knocked(door.id, year())) {
      session.react(KNOCKED[this.line++ % KNOCKED.length]!);
      return;
    }
    trickOrTreat.knock(door.id, year());
    const random = lcg(fnv1a(`trick:${door.id}:${year()}`));
    if (this.options.givesGame) {
      session.say('“Trick or treat? I’ve something better than sweets. My son’s, from the loft. Go on, it’s on the step.”', door.who);
      void this.options.game().then((item) => (item ? this.leave(item) : undefined));
      return;
    }
    if (random() < 0.35 && this.options.purse) {
      this.options.purse.earnCoins(TREAT_COINS);
      session.say('“No sweets left, I’m afraid. Here, for the arcade.”', door.who);
      session.reward({ title: 'Trick or treat', detail: `${door.who} had no sweets left.`, coins: TREAT_COINS });
      return;
    }
    session.say(ANSWERS[Math.floor(random() * ANSWERS.length)]!, door.who);
  }

  /** The old game, left lying on the step for the player to take. */
  private leave(item: StockItem): void {
    const { host, covers, wallet } = this.options;
    const box = new ForSaleBox(item, covers, { pose: { kind: 'flat' }, tag: false, wallet, where: 'a Halloween door on Front Street', free: true, thanks: () => '“Happy Halloween!”' });
    box.onSold = () => {
      host.remove(box);
      box.dispose();
      this.gift = null;
    };
    this.updateMatrixWorld(true);
    this.gift = host.place(box, host.toLocal(this.localToWorld(new THREE.Vector3(0.25, 0.01, 0.55))), this.rotation.y + 0.3);
  }
}
