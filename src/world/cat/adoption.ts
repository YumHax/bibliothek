import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import type { Zone } from '../zone/Zone';
import { placerFor, type Placer } from '../build/owned';
import type { Cat } from './Cat';

/**
 * Who places the cat's things (`furnishCat`'s `placers`): the cat, its bowls and its bed once adopted at the pet shop,
 * the scratching post and the ball once bought there. Till then they wait staged, unseen (`build/owned.ts`).
 */
export function catPlacers(zone: Zone, upgrades: HomeUpgrades | undefined): { cat: Placer; scratcher: Placer; toy: Placer } {
  return {
    cat: placerFor(zone, upgrades, 'cat'),
    scratcher: placerFor(zone, upgrades, 'scratcher'),
    toy: placerFor(zone, upgrades, 'catToy'),
  };
}

/** Keeps `cat.adopted` true once the cat has been adopted (C, the feather wand and the visitors leave it alone till then). */
export function followAdoption(cat: Cat, upgrades: HomeUpgrades | undefined): void {
  if (!upgrades) return;
  const apply = (): void => {
    cat.adopted = upgrades.has('cat');
  };
  apply();
  upgrades.subscribe(apply);
}
