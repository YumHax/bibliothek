import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Game } from '@/catalog/types';
import type { SealedLots } from '@/economy/SealedLots';
import type { Transactions } from '@/economy/Transactions';
import { shareOf } from '@/economy/boxLots';
import { SEALED_LOT, SEALED_WHERE } from '@/economy/pricing';
import { playBoxClack } from '@/audio/boxClack';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { HoverGlint } from '../props/hoverGlint';
import { SealedCartonModel } from '../props/SealedCartonModel';
import { plural } from '@/text/count';

interface CartonAtHomeOptions {
  sealed: SealedLots;
  tx: Transactions;
}

/**
 * A sealed carton the player bought (the flea market's corner, the saleroom), carried home: it waits on the hallway
 * floor until everything is out of it. Each click takes one thing out (`Transactions.unpackCarton`): a game goes into
 * the collection (into the parcel with the rest, its receipt its share of the carton's price), one the player has
 * already is sold on for a few coins, odds and ends are read about (loose coins pocketed). Gone once empty; the next
 * carton, if any, takes its place. Origin on the floor against the wall, +z into the corridor.
 */
export class CartonAtHome extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private model: SealedCartonModel | null = null;
  private glint: HoverGlint | null = null;
  private shownId: string | null = null;
  private readonly hitbox: THREE.Mesh;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: CartonAtHomeOptions) {
    super();
    this.name = 'CartonAtHome';
    this.hitbox = invisibleHitbox(0.6, 0.45, 0.5, { y: 0.225, z: 0.25 });
    this.add(this.hitbox);
    this.hitboxes = [this.hitbox];
    this.unsubscribe = options.sealed.subscribe(() => this.refresh());
    this.refresh();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(hovered: boolean): void {
    this.glint?.set(hovered);
  }

  label(): string | null {
    const carton = this.options.sealed.current;
    if (!carton) return null;
    const left = carton.lot.items.length - carton.opened;
    return carton.opened ? `The carton “${carton.lot.label}” · take the next thing out (${left} left)` : `A sealed carton “${carton.lot.label}” · open it`;
  }

  activate(session: SessionActions): void {
    const { sealed, tx } = this.options;
    const result = tx.unpackCarton(
      () => sealed.takeNext(),
      (taken) => ({ price: shareOf({ price: taken.carton.paid, items: taken.carton.lot.items }), where: SEALED_WHERE }),
      (_game: Game, taken) => Math.round(shareOf({ price: taken.carton.paid, items: taken.carton.lot.items }) * SEALED_LOT.duplicateShare),
    );
    if (!result.ok) return;
    playBoxClack(false);
    const { taken, game, coins, duplicate } = result;
    const { item, left } = taken;
    const end = left ? '' : ' That was the last thing in it: the carton goes out with the recycling.';
    if (item.kind === 'junk') {
      session.read({ title: item.name, text: item.line, ...(left ? {} : { effect: 'The carton is empty.' }) });
      if (coins) session.reward({ title: `${coins} loose ${plural(coins, 'coin')}`, detail: 'Found at the bottom of the carton.', coins });
      return;
    }
    if (duplicate) {
      session.reward({ title: `${item.game.title}: you have it already`, detail: `The buyer at the flea market takes it off your hands.${end}`, coins });
      return;
    }
    const gem = item.gem ? ' A gem, under all that!' : '';
    session.reward({ title: `Out of the carton: ${game?.title ?? item.game.title}`, detail: `${gem} It goes in the parcel with the rest.${end}`.trim(), big: item.gem === true });
  }

  dispose(): void {
    this.unsubscribe();
    this.drop();
  }

  /** The current carton's model (a new one when the carton changes), or nothing with none waiting. */
  private refresh(): void {
    const carton = this.options.sealed.current;
    const id = carton?.lot.id ?? null;
    if (id === this.shownId) return;
    this.drop();
    this.shownId = id;
    this.hitbox.scale.setScalar(carton ? 1 : 1e-4);
    if (!carton) return;
    const model = new SealedCartonModel({ label: carton.lot.label, items: carton.lot.items.length });
    model.position.z = model.size.z / 2 + 0.01;
    this.add(model);
    this.model = model;
    this.glint = HoverGlint.of(...model.tape);
  }

  private drop(): void {
    if (!this.model) return;
    this.remove(this.model);
    this.model.dispose();
    this.model = null;
    this.glint = null;
  }
}
