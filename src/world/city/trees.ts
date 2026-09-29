import { seededRandom } from '@/covers/generated/canvasUtils';
import { STREET_PLAN, type Vec2 } from '../street/streetPlan';
import { inFlatFrame } from './frontage';
import { offPaths, onLawn } from './park';

/*
 * Every tree of the neighbourhood the walkable street plants (`street/StreetTrees`), with its final
 * size: the street trees on the pavements (`STREET_PLAN.trees`) and those scattered over the park
 * behind the hedge (`STREET_PLAN.park`, clear of its pond, beds, playground and paths). The window
 * view paints these very trees (`props/outdoors/Street`, `Park`) at their size; only the park beyond
 * the walkable street's reach draws its own.
 */

/** A tree: where it stands (zone-local) and how big it is (1 = a street tree `TREE_FORM` tall). */
export interface PlantedTree {
  at: Vec2;
  scale: number;
}

/** A tree of scale 1: its trunk up to the crown, the crown's radius (squashed to 0.85 of it upright). */
export const TREE_FORM = { trunk: 4.6, crown: 2.3 } as const;

/** How tall a tree of `scale` stands, to the top of its crown. */
export function treeHeight(scale: number): number {
  return scale * (TREE_FORM.trunk + 0.6 + TREE_FORM.crown * 0.85);
}

/** The street trees, each a little bigger or smaller than the next. */
export const STREET_TREES: readonly PlantedTree[] = (() => {
  const random = seededRandom(3301);
  return STREET_PLAN.trees.map((at) => ({ at, scale: 0.85 + random() * 0.3 }));
})();

/** The park's trees: seeded over its rectangle, on free lawn off the paths (checked in the flat's frame, where the park is drawn). */
export const PARK_TREES: readonly PlantedTree[] = (() => {
  const { from, to, trees, seed } = STREET_PLAN.park;
  const random = seededRandom(seed);
  const planted: PlantedTree[] = [];
  for (let attempt = 0; planted.length < trees && attempt < trees * 30; attempt++) {
    const at: Vec2 = [from[0] + random() * (to[0] - from[0]), from[1] + random() * (to[1] - from[1])];
    const scale = (1.3 + random() * 0.6) * (0.85 + random() * 0.3);
    const [x, z] = inFlatFrame(at);
    if (onLawn(x, z, 3) && offPaths(x, z, 2)) planted.push({ at, scale });
  }
  return planted;
})();
