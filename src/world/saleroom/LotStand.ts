import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { AuctionLot } from '@/economy/AuctionHouse';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';
import { invisibleHitbox } from '../meshUtils';
import { cloth, timber } from '../materials/palette';
import { part } from '../props/Prop';
import { SealedCartonModel } from '../props/SealedCartonModel';

interface LotStandOptions {
  covers: BoxArtLoader;
  label: () => string | null;
  /** A click: a bid on the lot shown, when it is being called. */
  onActivate: (session: SessionActions) => void;
}

const WIDTH = 0.56;
const DEPTH = 0.42;
const HEIGHT = 0.9;
const BASE = timber(0x3a1a10, 0.5);
const VELVET = cloth(0x5a1220, 1);

/**
 * The stand the lot being sold is shown on: a dark plinth with a red velvet top, the game's box standing on it facing
 * the room (a sealed carton sat on it). `show(lot)` puts the next lot up (null: nothing). Clicking it bids, like the
 * rostrum. Origin on the floor at its middle, +z its front.
 */
export class LotStand extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private shown: { object: THREE.Object3D; dispose(): void } | null = null;

  constructor(private readonly options: LotStandOptions) {
    super();
    this.name = 'LotStand';
    part(this, WIDTH, HEIGHT - 0.03, DEPTH, BASE, { y: (HEIGHT - 0.03) / 2 });
    part(this, WIDTH + 0.03, 0.03, DEPTH + 0.03, VELVET, { y: HEIGHT - 0.015 });
    const hitbox = invisibleHitbox(WIDTH + 0.1, HEIGHT + 0.45, DEPTH + 0.1, { y: (HEIGHT + 0.45) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, HEIGHT, DEPTH / 2));
  }

  show(lot: AuctionLot | null): void {
    this.takeDown();
    if (!lot) return;
    if (lot.game) {
      const box = new GameBox(lot.game, this.options.covers);
      const { height } = box.dimensions;
      box.position.set(0, HEIGHT + height / 2 + 0.001, 0);
      this.add(box);
      this.shown = { object: box, dispose: () => box.dispose() };
    } else if (lot.sealed) {
      const carton = new SealedCartonModel({ label: lot.sealed.label, items: lot.sealed.items.length, tag: `LOT ${lot.number}` });
      carton.position.y = HEIGHT;
      carton.scale.setScalar(0.85);
      this.add(carton);
      this.shown = { object: carton, dispose: () => carton.dispose() };
    }
  }

  setHovered(): void {
    // The lot itself is what is looked at; the caption says what a click does.
  }

  label(): string | null {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.onActivate(session);
  }

  dispose(): void {
    this.takeDown();
  }

  private takeDown(): void {
    if (!this.shown) return;
    this.remove(this.shown.object);
    this.shown.dispose();
    this.shown = null;
  }
}
