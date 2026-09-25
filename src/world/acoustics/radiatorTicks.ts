import type { Furniture } from '../Furniture';
import type { Zone } from '../zone/Zone';
import { Radiator } from '../props/Radiator';
import { placeWith } from '../zone/attach';
import { RadiatorTick } from '@/audio/flatSounds';
import { PointSound, type PointSoundOptions } from './PointSound';

/**
 * Gives every radiator among `placed` (a room's decor, as `placeDecor` returns it) its ticking, a
 * `PointSound` in the middle of its body heard across the room; returns the radiators (the cat
 * naps in front of them, or in a cradle on one).
 */
export function tickRadiators(zone: Zone, placed: readonly Furniture[], sound: Omit<PointSoundOptions, 'volume'>): Radiator[] {
  const radiators = placed.filter((item): item is Radiator => item instanceof Radiator);
  for (const radiator of radiators) {
    placeWith(zone, radiator, new PointSound(new RadiatorTick(), { ...sound, volume: { maxDistance: 5 } }), radiator.middle);
  }
  return radiators;
}
