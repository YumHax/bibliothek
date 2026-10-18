import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { boxDimensionsOf } from '@/catalog/media';
import type { GameSource } from '@/collection/GameSource';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { unit01 } from '@/random';
import { formatCount } from '@/text/count';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { paint } from '../materials/palette';

/** Boxes drawn at most: past that the pile says how many more there are, it does not grow to the ceiling. */
const SHOWN = 12;
/** Two piles side by side, this far apart (m, centre to centre). */
const PILE_GAP = 0.3;
/** The white card a box's top shows when it lies flat (its spine's label band, near enough). */
const CARD = paint(0xe9e4d8, 0.85);

/**
 * The games no shelf has room for (the last bookcase's leftovers, docs/furnishing.md "Shelves"): stacked flat on the
 * floor by the bookcases, in two piles, each box at its real size in its platform's colour, until a bookcase is bought
 * for them. A click says what is in it; the pile is gone once they all fit. Built from `source` and rebuilt when it
 * changes; floor-standing (origin on the floor), decoration that never collides.
 */
export class BoxPile extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[] = [];
  private games: readonly Game[] = [];
  private readonly boxes = new THREE.Group();
  private readonly hitbox: THREE.Mesh;
  /** The source's listener off (a module-level list outlives every zone rebuild). */
  private readonly unsubscribe: () => void;

  constructor(private readonly source: GameSource, private readonly shown: () => boolean = () => true) {
    super();
    this.name = 'BoxPile';
    this.add(this.boxes);
    this.hitbox = invisibleHitbox(PILE_GAP + 0.25, 0.5, 0.3, { y: 0.25 });
    this.add(this.hitbox);
    this.hitboxes.push(this.hitbox);
    this.refresh();
    this.unsubscribe = source.subscribe(() => this.refresh());
  }

  dispose(): void {
    this.unsubscribe();
  }

  /** The games to show again (the source changed, or whether the pile shows: `shown`). */
  refresh(): void {
    this.games = this.shown() ? this.source.games : [];
    for (const child of [...this.boxes.children]) this.boxes.remove(child);
    const games = this.games.slice(0, SHOWN);
    const heights = [0, 0];
    games.forEach((game, i) => {
      const pile = i % 2;
      const { width, height, depth } = boxDimensionsOf(game);
      const accent = getPlatform(game.platform).accentColor;
      // Lying on its back: the cover's height along z, its thickness up; a little askew, the same way each time.
      const box = new THREE.Group();
      box.position.set((pile - 0.5) * PILE_GAP, heights[pile]!, 0);
      box.rotation.y = (unit01(game.id) - 0.5) * 0.35;
      part(box, width, depth, height, paint(accent, 0.7), { y: depth / 2 });
      part(box, width * 0.8, 0.001, height * 0.25, CARD, { y: depth + 0.0015, z: height * 0.3 }).castShadow = false; // convention-ok: the card's own millimetre, lying on the box's top
      this.boxes.add(box);
      heights[pile] = heights[pile]! + depth;
    });
    this.visible = games.length > 0;
    this.hitbox.scale.setScalar(games.length ? 1 : 1e-4);
  }

  /** Nothing to light up: the caption says what it is. */
  setHovered(): void {}

  label(): string | null {
    if (!this.games.length) return null;
    return `${formatCount(this.games.length, 'game')} with no shelf to go on · look`;
  }

  activate(session: SessionActions): void {
    const games = this.games;
    if (!games.length) return;
    const named = games.slice(0, 2).map((g) => g.title).join(' and ');
    const more = games.length > 2 ? `, and ${formatCount(games.length - 2, 'other')}` : '';
    session.react(`${named}${more}, waiting in their boxes: no bookcase has room for them yet.`);
  }
}
