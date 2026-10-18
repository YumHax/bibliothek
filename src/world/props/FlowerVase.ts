import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { SeasonName } from '@/time/season';
import { frozenRng } from '@/random';
import { capitalise } from '@/text/strings';
import { paint } from '../materials/palette';
import { cylinderMesh } from '../meshUtils';
import { LEAF_GREENS, LeafBatch, addBunch, headGeometry } from '../shop/florist/greenery';
import { disposeTree } from './Prop';
import { UsableProp } from './UsableProp';

/** The stoneware vase's size (m). */
const VASE = { radius: 0.042, neck: 0.03, height: 0.17, water: 0.15 };

/** The heads of each season's flowers (`errands/SEASON_FLOWERS`): tulips, sunflowers, dahlias, hellebores. */
const HEADS: Readonly<Record<SeasonName, { colors: readonly number[]; head: number; stems: number }>> = {
  spring: { colors: [0xd23a4a, 0xf0a030, 0xe86a9a], head: 0.022, stems: 7 },
  summer: { colors: [0xf2c12e, 0xe8a91f], head: 0.034, stems: 5 },
  autumn: { colors: [0xc0392b, 0xe06a2c, 0x8e2c5a], head: 0.03, stems: 6 },
  winter: { colors: [0xe9e4dc, 0xb07a9a, 0xd8c8d8], head: 0.024, stems: 7 },
};

interface FlowerVaseOptions {
  /** What stands in it today (`errands/vase.on`), or null. */
  flowers(): { flowers: SeasonName; drooping: boolean } | null;
  /** The florist's name for this season's flowers. */
  name(season: SeasonName): string;
  /** Whether a bunch from the florist is in the pocket. */
  carried(): boolean;
  /** Puts the carried bunch in (takes it from the pocket); false when none is. */
  fill(): boolean;
}

/**
 * The vase on the kitchen table (`errands/vase`): empty until a bunch from the florist goes in it, then the season's
 * flowers for a few game days, drooping on the last. A click with a bunch in the pocket puts it in; with flowers in it,
 * a breath of them. Origin on the table under its foot. Never collides.
 */
export class FlowerVase extends UsableProp implements Updatable {
  private bunch: THREE.Group | null = null;
  private shown = '';

  constructor(private readonly options: FlowerVaseOptions) {
    super({
      label: () => {
        const now = options.flowers();
        if (options.carried()) return now ? 'The vase · fresh flowers in' : 'The vase · put the flowers in';
        return now ? `${capitalise(options.name(now.flowers))} in the vase · smell them` : null;
      },
      use: (session) => this.handle(session),
    });
    this.name = 'FlowerVase';
    const glaze = paint(0x4f6f8a, 0.35);
    this.add(cylinderMesh(VASE.neck, VASE.height, glaze, { y: VASE.height / 2 }, { radiusBottom: VASE.radius, segments: 22 }));
    this.target(VASE.radius * 2 + 0.06, 0.4, VASE.radius * 2 + 0.06, { y: 0.2 });
    this.refresh();
  }

  update(): void {
    this.refresh();
  }

  private handle(session: SessionActions): void {
    const now = this.options.flowers();
    if (this.options.carried() && this.options.fill()) {
      const fresh = this.options.flowers();
      session.react(now ? 'Out with the old bunch, in with the new. The kitchen smells of a garden again.' : `Into the vase, a splash of water: ${fresh ? this.options.name(fresh.flowers) : 'flowers'} on the kitchen table.`);
      this.refresh();
      return;
    }
    if (now) session.react(now.drooping ? 'They’re going over. One more day, maybe.' : 'You bury your nose in them. The kitchen smells of a garden.');
  }

  /** The flowers as they stand today, rebuilt only when that changes. */
  private refresh(): void {
    const now = this.options.flowers();
    const key = now ? `${now.flowers}:${now.drooping}` : '';
    if (key === this.shown) return;
    this.shown = key;
    if (this.bunch) {
      this.remove(this.bunch);
      disposeTree(this.bunch);
      this.bunch = null;
    }
    if (!now) return;
    const look = HEADS[now.flowers];
    const group = new THREE.Group();
    const leaves = new LeafBatch();
    addBunch(group, leaves, headGeometry(), new THREE.Vector3(0, VASE.water, 0), {
      colors: look.colors,
      stems: look.stems,
      head: look.head,
      height: now.drooping ? 0.16 : 0.22,
      spread: now.drooping ? 0.09 : 0.06,
      green: LEAF_GREENS.classic[1],
    }, frozenRng(`vase:${now.flowers}`));
    leaves.addTo(group);
    group.traverse((o) => (o.castShadow = false));
    this.bunch = group;
    this.add(group);
  }
}
