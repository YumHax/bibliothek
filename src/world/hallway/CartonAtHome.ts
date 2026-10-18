import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Game } from '@/catalog/types';
import type { SealedLots } from '@/economy/SealedLots';
import type { Transactions } from '@/economy/Transactions';
import { BARE_CART_JUNK, BROKEN_CONSOLE_JUNK, MANUALS_JUNK, shareOf } from '@/economy/boxLots';
import { HOMEBREW_CARTS } from '@/emulator/homebrew';
import type { Workshop } from '@/repair/Workshop';
import { brokenOf } from '@/repair/consoles';
import { random } from '@/random';
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
  /** The consoles to mend at the kitchen table: a broken one found in a carton goes there. */
  workshop?: Workshop;
  /** Whether the kitchen table is bought (where a console is mended): without one a broken console waits in the hall. */
  bench?: () => boolean;
  /** The copies the player has (a manual out of the carton may be the one a copy of theirs lacks). */
  games?: () => readonly Game[];
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
    const end = left ? '' : ' The carton is empty now.';
    if (item.kind === 'junk') {
      // A broken console is a job for the kitchen table: it goes there with the others to mend.
      const toMend = item.name === BROKEN_CONSOLE_JUNK && this.options.workshop;
      if (toMend) this.options.workshop!.add({ platform: 'megadrive', fault: brokenOf('megadrive', random(), random()).fault, paid: 0, from: 'a sealed carton' });
      const found = this.oddFind(item.name);
      const mendHere = toMend && (this.options.bench?.() ?? true);
      const effect = toMend ? (mendHere ? 'It goes on the kitchen table, to mend.' : 'It waits by the kitchen door until there’s a table to mend it on.') : found?.effect ?? (left ? undefined : 'The carton is empty.');
      session.read({ title: item.name, text: found?.text ?? item.line, ...(effect ? { effect } : {}) });
      if (coins) session.reward({ title: `${coins} ${plural(coins, 'coin')}`, detail: item.name === 'A shoebox of tokens' ? 'What Gus gives for old tokens, as good as in your pocket.' : 'Found at the bottom of the carton.', coins });
      return;
    }
    if (duplicate) {
      session.reward({ title: 'Had it already', detail: `${item.game.title} goes to the buyer at the flea market.${end}`, coins });
      return;
    }
    const gem = item.gem ? ' A gem, under all that!' : '';
    const found = { title: game?.title ?? item.game.title, detail: `${gem} Out of the carton, into the parcel.${end}`.trim() };
    if (item.gem === true) session.reward({ ...found, big: true });
    else session.slip(found);
  }

  /**
   * Odds and ends that turn out to be something: a manual in the bag for a copy of the player's that lacks one (it
   * goes in its box), the bare cart a homebrew game someone burnt onto it (the NES plays it). Null: just junk.
   */
  private oddFind(name: string): { text: string; effect: string } | null {
    const { tx, games } = this.options;
    if (name === MANUALS_JUNK) {
      const lacking = games?.().filter((g) => g.status !== 'wishlist' && g.condition === 'noManual') ?? [];
      const copy = lacking[Math.floor(random() * lacking.length)];
      if (!copy || !tx.fillManual(copy.id).ok) return null;
      return { text: `Manuals for games nobody has ever heard of, and then, halfway down the pile: ${copy.title}. The very one your copy is missing.`, effect: `${copy.title} has its manual again.` };
    }
    if (name === BARE_CART_JUNK) {
      const brew = HOMEBREW_CARTS.find((c) => !games?.().some((g) => g.id === c.game.id));
      if (!brew || !tx.keepFound(brew.game, SEALED_WHERE).ok) return null;
      return { text: `Bare plastic, a bit of tape that says "MIKE". Not a shop cart: someone burnt their own game onto it. ${brew.game.title}, says the scrawl on the back.`, effect: 'Into the parcel: it plays in the NES.' };
    }
    return null;
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
