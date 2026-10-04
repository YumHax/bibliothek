import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Pastime } from '@/household/pastime';
import type { StoryStage } from '@/story/prototype';
import { catSitter, type CatSitting } from './catSitter';
import { claireReturns } from './claire';
import { wireHaddad } from './haddad';
import { wireMartin } from './martin';
import { wireMeals } from './meals';
import type { PerkDeps } from './perkDeps';
import { wireRoux } from './roux';
import { wireSmallPerks } from './smallPerks';
import { StairsRace } from './stairsRace';
import { wireStudent } from './student';

/** What the building's perks need beyond `PerkDeps`: the story, the beats in the dark, the post, the clock, the camera, the cat. */
interface BuildingPerksOptions extends PerkDeps {
  story: { readonly stage: StoryStage };
  beats: { run<T>(pastime: Pastime, change: () => T): Promise<T | null> };
  post?: { readonly count: number; due(): readonly unknown[] };
  onNewGameDay(cb: (day: number) => void): unknown;
  /** The camera (the player's eye), for the race up the stairs. */
  camera: THREE.Object3D;
  addUpdatable(updatable: Updatable): void;
  cat: CatSitting;
  /** Calls back with whether the player is in the flat, on every change of zone. */
  onFlat(cb: (inFlat: boolean) => void): unknown;
}

/**
 * The building's perks that give the player something (docs/social.md "The building's perks"): wired once from
 * `bootstrap/world` when the flat, the cat and the stairwell exist. Each adds its entries to the conversations
 * (`social/extras`) or listens for what it needs.
 */
export function wireBuildingPerks(options: BuildingPerksOptions): void {
  wireRoux(options, options.story);
  wireMartin(options);
  wireStudent(options);
  wireHaddad(options);
  wireMeals(options, options.beats);
  wireSmallPerks(options.post);
  options.addUpdatable(new StairsRace(options, options.camera));
  options.onFlat(catSitter(options, options.cat));
  claireReturns(options);
  options.onNewGameDay(() => claireReturns(options));
}
