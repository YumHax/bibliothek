import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { SealedLot } from '@/economy/boxLots';
import { purchaseClinks } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { Arming } from '@/ui/confirmTwice';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import { SealedCartonModel } from '../props/SealedCartonModel';
import { formatCoins } from '@/text/money';

interface CartonCornerOptions {
  /** Today's carton, once drawn (null: none today, or not yet). */
  lot: Promise<SealedLot | null>;
  /** Whether today's carton is already sold (bought earlier today, a reload). */
  sold: () => boolean;
  /** Buys it (the coins, the carton home, in one save); false when refused (the session was told why). */
  buy: (lot: SealedLot, session: SessionActions) => boolean;
}

const PALLET = { width: 0.8, depth: 0.6, height: 0.12 };
const PALLET_WOOD = paint(0x8a6a44, 0.9);

/**
 * The flea market's sealed carton of the day, by the job lot: a taped carton on a pallet, a price tag on its front,
 * a sign SOLD AS SEEN, NO PEEKING. Its caption says what can be told from outside (its label, its weight, whether it
 * rattles); a first click arms it, the second (within `CONFIRM_MS`) buys it: carried home, it waits in the hallway
 * (`economy/SealedLots`). Gone once sold, until tomorrow's. Origin on the floor at the pallet's middle, +z its front.
 */
export class CartonCorner extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private carton: SealedCartonModel | null = null;
  private glint: HoverGlint | null = null;
  private lot: SealedLot | null = null;
  /** A first click arms the carton (its caption says again to buy) until the second within `CONFIRM_MS` takes it home. */
  private readonly arming = new Arming<'buy'>(() => {});
  private live = true;

  constructor(private readonly options: CartonCornerOptions) {
    super();
    this.name = 'CartonCorner';
    // The pallet: three runners under five boards.
    for (const x of [-0.32, 0, 0.32]) part(this, 0.08, PALLET.height - 0.02, PALLET.depth, PALLET_WOOD, { x, y: (PALLET.height - 0.02) / 2 });
    for (let i = 0; i < 5; i++) part(this, PALLET.width, 0.02, 0.1, PALLET_WOOD, { y: PALLET.height - 0.01, z: -PALLET.depth / 2 + 0.05 + i * ((PALLET.depth - 0.1) / 4) });
    const hitbox = invisibleHitbox(PALLET.width, 0.6, PALLET.depth, { y: 0.3 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    void options.lot.then((lot) => {
      if (!this.live || !lot) return;
      this.lot = lot;
      if (!options.sold()) this.show(lot);
    }, () => undefined);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-PALLET.width / 2, 0, -PALLET.depth / 2), new THREE.Vector3(PALLET.width / 2, PALLET.height, PALLET.depth / 2));
  }

  setHovered(hovered: boolean): void {
    this.glint?.set(hovered);
  }

  label(): string | null {
    const lot = this.lot;
    if (!lot) return null;
    if (!this.carton) return 'The sealed carton: sold today. Another tomorrow';
    if (this.arming.isArmed('buy')) return `Sealed carton, ${formatCoins(lot.price)} · again to buy it`;
    return `Sealed carton “${lot.label}”: ${lot.hint} · ${formatCoins(lot.price)}, sold as seen`;
  }

  activate(session: SessionActions): void {
    const lot = this.lot;
    if (!lot || !this.carton) return;
    if (!this.arming.press('buy')) {
      session.react(`${formatCoins(lot.price)}, unopened, no returns. Click again to take it home.`);
      return;
    }
    if (!this.options.buy(lot, session)) return;
    playCoins(purchaseClinks(lot.price));
    this.hide();
  }

  dispose(): void {
    this.live = false;
    this.hide();
  }

  private show(lot: SealedLot): void {
    this.carton = new SealedCartonModel({ label: lot.label, items: lot.items.length, tag: `${lot.price}` });
    this.carton.position.y = PALLET.height;
    this.add(this.carton);
    this.glint = HoverGlint.of(...this.carton.tape);
  }

  private hide(): void {
    if (!this.carton) return;
    this.remove(this.carton);
    this.carton.dispose();
    this.carton = null;
    this.glint = null;
  }
}
