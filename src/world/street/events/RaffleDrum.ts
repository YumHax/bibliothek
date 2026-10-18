import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { StockItem } from '@/economy/StockItem';
import type { Game } from '@/catalog/types';
import { RAFFLE, raffle } from '@/fair/raffle';
import { formatCoins } from '@/text/money';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';
import { ForSaleBox } from '../../market/ForSaleBox';
import { GameBox } from '../../GameBox';
import { disposeTree } from '../../materials/sharedResources';
import { cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { METAL, paint } from '../../materials/palette';

interface RaffleDrumOptions {
  /** The game day and hour. */
  day: () => number;
  hours: () => number;
  /** Who sells the tickets and reads the number out (the overflow stall's keeper). */
  keeper: Walker;
  /** The camera: the number is read out only to a player near enough to hear it. */
  viewer: THREE.Object3D;
  /** Today's prize: a boxed game, drawn once (null when there is none to give). */
  prize: () => Promise<StockItem | null>;
  /** Where the prize waits for its winner (zone-local, on the stall's table), and its turn. */
  prizeAt: THREE.Vector3;
  prizeYaw: number;
  host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void };
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** The crowd round the drum when the number is read out (`StreetCues.cheer`). */
  cheer?: () => void;
}

/** The Fair of game day `day`'s raffle prize: a boxed game, the same whenever it is drawn (the drum's, the kiosk's). */
export function rafflePrize(stock: { randomGames(seed: string, count: number): Promise<Game[]> }, day: number): Promise<StockItem | null> {
  return stock.randomGames(`raffle:${day}`, 1).then(([game]) => (game ? new StockItem(game, 'complete', 'bin', { list: 0, final: true }) : null));
}

/** The drum's radius and length, its axle's height over the table. */
const DRUM = { radius: 0.13, length: 0.26, axle: 0.2 };
/** The number is read out to a player this near (m). */
const HEARD_WITHIN = 25;
const SOLD = ['Good luck, love. It’s drawn at six.', 'In it goes. Fingers crossed.', 'Another one? Somebody wants that prize.'];

/**
 * The Grand Flea Fair's raffle drum on the overflow stall (`fair/raffle`): a wire drum on a stand with a crank. Before
 * `RAFFLE.drawAt` a click buys a ticket (a few a day at most); at the hour the keeper turns it and reads the number out
 * to anyone in earshot. Won, the prize (a boxed game) waits on the table, free to take (a `free` `ForSaleBox`), until
 * it is taken. Stall-top origin, local +z the buyers' side.
 */
export class RaffleDrum extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly drum = new THREE.Group();
  private spin = 0;
  private wasDrawn: boolean;
  private prizeBox: ForSaleBox | null = null;
  private fetching = false;
  /** The prize on show before the draw (a plain box, nobody's yet), and its title for the caption. */
  private shown: THREE.Group | null = null;
  private showing = false;
  private shownTitle = '';
  private line = 0;
  private readonly eye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();

  constructor(private readonly options: RaffleDrumOptions) {
    super();
    this.name = 'RaffleDrum';
    this.wasDrawn = raffle.drawn(options.hours());
    const wire = METAL.chrome();
    const { radius, length, axle } = DRUM;
    // The stand: two uprights, the axle between them, the crank on one end.
    for (const x of [-length / 2 - 0.03, length / 2 + 0.03]) this.add(cylinderMesh(0.008, axle + 0.04, wire, { x, y: (axle + 0.04) / 2 }, { segments: 6 }));
    this.drum.position.y = axle;
    // The drum: rings round its axle, bars along it, a few tickets inside.
    for (const x of [-length / 2, 0, length / 2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.004, 4, 20), wire);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      this.drum.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = cylinderMesh(0.004, length, wire, { y: Math.sin(a) * radius, z: Math.cos(a) * radius }, { segments: 4 });
      bar.rotation.z = Math.PI / 2;
      this.drum.add(bar);
    }
    const ticket = paint(0xe8c040, 0.8);
    for (let i = 0; i < 6; i++) {
      const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), ticket);
      slip.position.set((i / 6 - 0.5) * length * 0.8, -radius * 0.6 + (i % 2) * 0.02, (i % 3) * 0.03 - 0.03);
      slip.rotation.set(i, i * 0.7, 0);
      this.drum.add(slip);
    }
    const crank = cylinderMesh(0.006, 0.09, paint(0x8a1e1e, 0.5), { x: length / 2 + 0.07, y: -0.04 }, { segments: 6 });
    this.drum.add(crank);
    this.add(this.drum);
    const hitbox = invisibleHitbox(length + 0.2, axle + radius + 0.05, radius * 2 + 0.1, { y: (axle + radius + 0.05) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    this.prizeBox?.dispose();
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    const day = this.options.day();
    const hours = this.options.hours();
    if (!raffle.drawn(hours)) {
      const prize = this.shownTitle ? `, ${this.shownTitle} to win` : '';
      return raffle.canBuy(day, hours) ? `Raffle · buy a ticket (${formatCoins(RAFFLE.price)})${prize}` : `Raffle · your tickets are in the drum${prize}`;
    }
    if (raffle.waiting(day, hours)) return 'Raffle · your number came up!';
    return `Raffle · drawn: number ${raffle.number(day)}`;
  }

  activate(session: SessionActions): void {
    const { day, hours, keeper } = this.options;
    const today = day();
    const now = hours();
    if (raffle.drawn(now)) {
      if (raffle.waiting(today, now)) keeper.speak(`Number ${raffle.number(today)}, that’s you! The prize is on the table, it’s yours.`);
      else if (raffle.tickets(today)) keeper.speak(`Number ${raffle.number(today)} won it. Not yours this time, love. Next Fair!`);
      else keeper.speak(`Drawn at six: number ${raffle.number(today)}. Next Fair, there’s always another prize.`);
      return;
    }
    if (!raffle.canBuy(today, now)) {
      session.react('That’s as many tickets as they will sell anyone. The drum turns at six.');
      return;
    }
    session.pay({
      price: RAFFLE.price,
      title: 'A raffle ticket',
      paid: () => {
        const n = raffle.buy(today);
        this.spin = 1.5;
        keeper.speak(SOLD[this.line++ % SOLD.length]!);
        return `A pink ticket, number ${raffle.ticketNumber(today, n)}, its stub torn off for you. The other half goes in the drum.`;
      },
    });
  }

  update(dt: number): void {
    const { day, hours, keeper, viewer } = this.options;
    const today = day();
    const now = hours();
    const drawn = raffle.drawn(now);
    if (drawn && !this.wasDrawn) {
      // Six o'clock: the drum turns, the number is read out to whoever is near.
      this.spin = 3;
      viewer.getWorldPosition(this.eye);
      this.getWorldPosition(this.here);
      if (this.eye.distanceTo(this.here) < HEARD_WITHIN) {
        keeper.speak(`And the winner is… number ${raffle.number(today)}!`);
        keeper.gesture('clap');
        this.options.cheer?.();
      }
    }
    this.wasDrawn = drawn;
    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt);
      this.drum.rotation.x += dt * 6 * Math.min(1, this.spin);
    }
    if (raffle.waiting(today, now) && !this.prizeBox && !this.fetching) this.layPrize(today);
    this.showPrize(drawn);
  }

  /**
   * Before the draw the prize lies face up on the table for all to see (not to take); once drawn, it is the winner's:
   * the player's own `ForSaleBox` (`layPrize`), or gone home with somebody else.
   */
  private showPrize(drawn: boolean): void {
    if (drawn) {
      if (this.shown) {
        this.remove(this.shown);
        disposeTree(this.shown);
        this.shown = null;
      }
      return;
    }
    if (this.shown || this.showing || !this.parent) return;
    this.showing = true;
    void this.options.prize().then((item) => {
      if (!item || !this.parent || raffle.drawn(this.options.hours())) return;
      const box = new GameBox(item.game, this.options.covers);
      const { depth } = box.dimensions;
      // Face up, as the winner's copy will lie (`ForSaleBox`'s flat pose), where it will wait: zone-local `prizeAt`.
      const holder = new THREE.Group();
      const face = new THREE.Group();
      face.rotation.x = -Math.PI / 2;
      box.position.set(0, 0, depth / 2);
      face.add(box);
      holder.add(face);
      this.updateMatrixWorld(true);
      holder.position.copy(this.worldToLocal(this.parent.localToWorld(this.options.prizeAt.clone())));
      holder.rotation.y = this.options.prizeYaw - this.rotation.y;
      this.add(holder);
      this.shown = holder;
      this.shownTitle = item.game.title;
    });
  }

  /** The prize on the table, free to its winner. */
  private layPrize(today: number): void {
    this.fetching = true;
    void this.options.prize().then((item) => {
      if (!item || this.prizeBox) return;
      const { host, covers, wallet, prizeAt, prizeYaw } = this.options;
      const box = new ForSaleBox(item, covers, { pose: { kind: 'flat' }, tag: false, wallet, where: 'the Grand Flea Fair’s raffle', free: true, thanks: () => 'Enjoy it! Proper boxed, that one.' });
      box.onSold = () => {
        host.remove(box);
        box.dispose();
        this.prizeBox = null;
        raffle.takePrize(today);
      };
      this.prizeBox = host.place(box, prizeAt, prizeYaw);
    });
  }
}
