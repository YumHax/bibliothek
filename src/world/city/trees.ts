import { STREET_PLAN, type Vec2 } from '../street/streetPlan';
import { inFlatFrame } from './frontage';
import { offPaths, onLawn } from './park';
import { lcg } from '@/random';

/*
 * Every tree of the neighbourhood the walkable street plants (`street/StreetTrees`), with its final
 * size: the street trees on the pavements (`STREET_PLAN.trees`) and those scattered over the park
 * behind the hedge (`STREET_PLAN.park`, clear of its pond, beds, playground and paths). The window
 * view paints these very trees (`props/outdoors/Street`, `Park`) at their size; only the park beyond
 * the walkable street's reach draws its own.
 */

/**
 * The kinds of tree out here: the lime (the default: a linden's round crown, dark furrowed bark), the London plane of
 * the pavements (a broad, flatter crown of paler leaves, its bark peeling in cream and olive patches), the horse
 * chestnut of the park (dense and tall, the darkest green, white candles in spring, rust in autumn).
 */
export type TreeSpecies = 'lime' | 'plane' | 'chestnut';

/** A tree: where it stands (zone-local), how big it is (1 = a street tree `TREE_FORM` tall), its kind (default lime). */
export interface PlantedTree {
  at: Vec2;
  scale: number;
  species?: TreeSpecies;
}

/** A tree of scale 1: its trunk up to the crown, the crown's radius (squashed to 0.85 of it upright). */
export const TREE_FORM = { trunk: 4.6, crown: 2.3 } as const;

/** How tall a tree of `scale` stands, to the top of its crown. */
export function treeHeight(scale: number): number {
  return scale * (TREE_FORM.trunk + 0.6 + TREE_FORM.crown * 0.85);
}

/** The street trees, each a little bigger or smaller than the next. */
export const STREET_TREES: readonly PlantedTree[] = (() => {
  const random = lcg(3301);
  return STREET_PLAN.trees.map((at) => ({ at, scale: 0.85 + random() * 0.3, species: 'plane' as const }));
})();

/** The park's trees: seeded over its rectangle, on free lawn off the paths (checked in the flat's frame, where the park is drawn). */
export const PARK_TREES: readonly PlantedTree[] = (() => {
  const { from, to, trees, seed } = STREET_PLAN.park;
  const random = lcg(seed);
  const planted: PlantedTree[] = [];
  for (let attempt = 0; planted.length < trees && attempt < trees * 30; attempt++) {
    const at: Vec2 = [from[0] + random() * (to[0] - from[0]), from[1] + random() * (to[1] - from[1])];
    const scale = (1.3 + random() * 0.6) * (0.85 + random() * 0.3);
    const [x, z] = inFlatFrame(at);
    // The park's own random stream decides where; its kind is the spot's (the seeded layout stays as it was).
    if (onLawn(x, z, 3) && offPaths(x, z, 2)) planted.push({ at, scale, species: (Math.floor(at[0] * 7.3 + at[1] * 3.1) & 1) === 0 ? 'lime' : 'chestnut' });
  }
  return planted;
})();
