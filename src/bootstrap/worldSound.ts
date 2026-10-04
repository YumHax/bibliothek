import type { Object3D } from 'three';
import type { Engine } from '@/core/Engine';
import { StreetAmbience } from '@/audio/StreetAmbience';
import { setEars } from '@/audio/hearing';
import { getPlatform } from '@/catalog/platforms';
import type { PlatformId } from '@/catalog/types';
import type { MarketStock } from '@/economy/MarketStock';
import { SoundOcclusion } from '@/world/acoustics/SoundOcclusion';
import { BalconyDoor } from '@/world/balcony/BalconyDoor';
import { RetroShopLure } from '@/world/props/outdoors/RetroShopLure';
import type { Sky } from '@/world/Sky';
import type { World } from '@/world/World';
import type { ZoneManager } from '@/world/zone';
import type { ZoneId } from '@/world/zoneIds';
import type { Late } from './late';

/**
 * The one count of the walls between the ears and a sound (`audio/hearing`), with the routes the zones add (the flat
 * to the stairwell): the street through the windows, the flat's one-shots, and every zone's placed sounds share it.
 * The flat's one-shots with no listener of their own (a door's latch) are heard from the camera, through the walls.
 */
export function wireHearing(engine: Engine, world: Pick<World, 'occluders'>): SoundOcclusion {
  const acoustics = new SoundOcclusion(() => world.occluders);
  setEars(engine.camera, (a, b) => acoustics.wallsBetween(a, b));
  return acoustics;
}

/**
 * The street heard through the nearest window (through the shut windows a murmur; at the full level with the balcony
 * door open or out on the balcony), and the retro games shop across it, which shows the market's stock once drawn
 * and, on a new market day until the player has been, a banner and a queue.
 */
export function wireStreetSound(engine: Engine, sky: Sky, acoustics: SoundOcclusion, zones: Late<ZoneManager<ZoneId>>, market: MarketStock): void {
  engine.addUpdatable(new StreetAmbience({
    listener: engine.camera,
    panes: () => sky.outdoors.panesIn(engine.scene),
    openings: () => balconyDoorsIn(engine.scene),
    outside: () => zones.isSet && zones.get().current.id === 'balcony',
    open: () => zones.isSet && zones.get().current.id === 'street',
    underRoof: () => zones.isSet && zones.get().current.id === 'market',
    sky: () => sky.dayNight.state,
    wallsBetween: (a, b) => acoustics.wallsBetween(a, b),
    life: () => sky.outdoors.life.events,
  }));
  new RetroShopLure(sky.outdoors, market, {
    colorOf: (platform) => `#${getPlatform(platform as PlatformId).accentColor.toString(16).padStart(6, '0')}`,
    here: () => (zones.isSet ? zones.get().current.id : ''),
  });
}

/** The balcony doors in the scene (the street is heard through them, full once open). */
function balconyDoorsIn(root: Object3D): BalconyDoor[] {
  const doors: BalconyDoor[] = [];
  root.traverse((object) => void (object instanceof BalconyDoor && doors.push(object)));
  return doors;
}
