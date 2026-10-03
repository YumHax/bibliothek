import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { StreetLighting } from '../street/StreetLighting';
import { SkyDome } from '../street/SkyDome';
import { StreetGround } from '../street/StreetGround';
import { LAWN_REACH, LAWN_Y } from '../street/StreetGround';
import { StreetPark } from '../street/StreetPark';
import { Buildings } from '../street/Buildings';
import { Precipitation } from '../street/Precipitation';
import { FACADES } from '../street/streetPlan';
import { buildingWindowLife } from '@/building/rearWindows';
import { pointSound } from '../build/hearing';
import { arriveAtHatch } from '../attic/hatchArrival';
import { ROOF_PLAN as plan } from './roofPlan';
import { RoofTop } from './RoofTop';
import { Roofscape } from './Roofscape';
import { RoofHatch } from './RoofHatch';
import { Aerial } from './Aerial';
import { RoofPigeons } from './RoofPigeons';
import { Fireworks } from './Fireworks';
import { RoofWind } from './RoofWind';

const ANISOTROPY = 8;

/**
 * Builds the roof from `ROOF_PLAN`: the zinc top of our mansard with its railing, chimney stacks,
 * duckboards and gable (`RoofTop`), the hatch back down into the attic, the old TV aerial and its
 * signal meter (turned, it finds the old channels for the flat's TV: `roof/channels`), the pigeons
 * on the chimneys, the fireworks over the park on their nights; and round it the city as it is down
 * there, laid in the street's frame: Front Street's ground and the park's, every facade with its
 * roof (`Buildings`), the tops of the blocks behind them (`Roofscape`), the street's sky, sun and air
 * (`StreetLighting`: one sun shadow, a hemisphere while the player is up here), the rain and snow,
 * the wind. A zone reached by travel only (the attic's ladder).
 */
export function furnishRoof(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, acoustics, today } = ctx;
  const { dayNight } = sky;
  const origin = new THREE.Vector3();
  const street = new THREE.Vector3(...plan.street);

  // The light and the sky, centred on the player up here; the city in the street's frame under it.
  const lighting = zone.place(new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2) }), origin);
  zone.place(new SkyDome(dayNight, listener), origin);
  zone.place(new StreetGround(dayNight, ANISOTROPY), street.clone());
  zone.place(new StreetPark({ anisotropy: ANISOTROPY, lawnY: LAWN_Y, reach: LAWN_REACH.x }), street.clone());
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours: () => dayNight.state.hours });
  zone.place(new Buildings(FACADES, dayNight, { detailScale: QUALITY.level === 'low' ? 0.5 : 0.8, anisotropy: ANISOTROPY, shopGoods: null, nightScale: 0.25, windowLife }), street.clone());
  zone.place(new Roofscape(), street.clone());

  // Our roof.
  zone.place(new RoofTop(), origin);
  const [hx, hz] = plan.hatch.at;
  zone.place(
    new RoofHatch(plan.hatch.size, (session) => {
      arriveAtHatch();
      session.travel('attic');
    }),
    new THREE.Vector3(hx, 0, hz),
  );
  zone.place(new Aerial(plan.aerial.height), new THREE.Vector3(plan.aerial.at[0], 0, plan.aerial.at[1]));
  zone.place(new RoofPigeons(plan.pigeons, dayNight, listener), origin);
  const show = zone.place(new Fireworks(dayNight, () => today.realDate(), plan.fireworks.spread, Math.hypot(...plan.fireworks.at)), new THREE.Vector3(...plan.fireworks.at));
  zone.place(new Precipitation(dayNight, { splashes: false }), origin);
  zone.place(pointSound({ listener, acoustics }, new RoofWind(() => dayNight.state.wind), { referenceDistance: 4, rolloff: 0.2, maxDistance: 40 }), new THREE.Vector3(0, 1.5, 0));

  return {
    lightLevel: () => Math.max(lighting.lightLevel(), show.visible ? 0.3 : 0),
    surfaceAt: (local) => (Math.abs(local.z - plan.walk.z) < plan.walk.width / 2 ? 'wood' : 'concrete'),
  };
}
