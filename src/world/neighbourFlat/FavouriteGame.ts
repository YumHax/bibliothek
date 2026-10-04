import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import type { VideoScreen } from '../screen';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';

interface FavouriteGameOptions {
  covers: BoxArtLoader;
  /** Their TV: the longplay goes on it. */
  screen: VideoScreen;
  /** Whose game it is, for the caption (whoever lives here now). */
  who: () => string;
  /** The longplay is starting: they say something about it, they sit down to watch, the friendship counts it. */
  onWatch: (game: Game) => void;
}

/**
 * The host's own favourite game, lying by their TV (never for sale): clicked, its longplay goes on their TV and they
 * watch it with the player (`onWatch`); clicked again while it plays, the TV goes off. Origin under the box's middle
 * on the table top, the cover up. `setGame` swaps it (the flat dressed for someone else; null: nothing there).
 */
export class FavouriteGame extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  hitboxes: THREE.Object3D[] = [];
  private box: GameBox | null = null;

  constructor(private readonly options: FavouriteGameOptions) {
    super();
    this.name = 'FavouriteGame';
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setGame(game: Game | null): void {
    if (this.box) {
      this.remove(this.box);
      this.box.dispose();
      this.box = null;
    }
    this.hitboxes.length = 0;
    if (!game) return;
    const box = new GameBox(game, this.options.covers);
    box.rotation.set(-Math.PI / 2, 0, 0.35);
    box.position.y = box.dimensions.depth / 2 + 0.001;
    box.saveRestPose();
    this.add(box);
    this.box = box;
    this.hitboxes.push(box);
  }

  setHovered(hovered: boolean): void {
    this.box?.setHovered(hovered);
  }

  label(): string | null {
    if (!this.box) return null;
    return this.options.screen.state !== 'off' ? `${this.box.game.title} · switch the TV off` : `${this.box.game.title} · watch it with ${this.options.who()}`;
  }

  activate(session: SessionActions): void {
    if (!this.box) return;
    if (this.options.screen.state !== 'off') {
      session.stopScreen(this.options.screen);
      return;
    }
    void session.playOn(this.options.screen, this.box);
    this.options.onWatch(this.box.game);
  }

  dispose(): void {
    this.setGame(null);
  }
}
