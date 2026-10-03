import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { placeDecor } from '../props/decor';
import { followUpgrades } from '../build/follow';
import { placerFor } from '../build/owned';
import { Plant } from '../props/Plant';
import { BALCONY_PLAN as plan } from './balconyPlan';
import { BalconySlab } from './BalconySlab';
import { BalconyDoor } from './BalconyDoor';
import { BuildingFront } from './BuildingFront';
import { BistroSet } from './BistroSet';
import { OpenAir } from './OpenAir';
import { Precipitation } from '../street/Precipitation';

/** Always open to the eye: the door is glazed, so the room and the balcony see each other shut or open. */
const GLAZED = { openness: 1 };
/** Half-depth of the portal box through the wall. */
const PORTAL_HALF_DEPTH = 0.15;

/**
 * The balcony off the collection room: the stone slab and its railing, the glazed door in the
 * building's front (this zone hangs it; it opens into the room), the building's front all round the
 * door, a bistro set and pots (and the florist's, once bought); around it the open air (the
 * painted view on a surround, the sun, the sky's ambient while the player is out). No `Room`: the
 * handle says how lit it is instead.
 */
export function furnishBalcony(zone: Zone, { sky, home: { upgrades, furnishings } }: BuildContext): ZoneHandle {
  const { width, depth } = plan.room;
  const doorway = plan.room.doorways![0];
  zone.place(new BalconySlab({ width, depth, thickness: plan.slab.thickness, lip: plan.slab.lip, railHeight: plan.railing.height, barSpacing: plan.railing.barSpacing }), new THREE.Vector3());

  zone.placeAt(new BalconyDoor({ width: doorway.width, height: doorway.height, collisions: zone.collisions }), { wall: 'back', along: doorway.along, y: 0 });
  zone.addPortal({ to: doorway.to!, bounds: portalBounds(zone, doorway.along, doorway.width, doorway.height), door: GLAZED });

  // The building's front, in this zone's frame (its plan is in world metres): on the balcony's back line.
  const origin = zone.group.position;
  const f = plan.front;
  const front = zone.place(
    new BuildingFront({
      x: [f.x[0] - origin.x, f.x[1] - origin.x],
      street: f.street,
      top: f.top,
      storey: f.storey,
      groundFloor: f.groundFloor,
      pitch: f.pitch,
      door: { x: doorway.along, width: doorway.width, height: doorway.height },
      ourWindows: f.ourWindows.map((w) => ({ ...w, x: w.x - origin.x })),
      ours: [f.ours[0] - origin.x, f.ours[1] - origin.x],
    }),
    new THREE.Vector3(0, 0, -depth / 2),
  );
  zone.onUnload(sky.dayNight.onChange((state) => front.apply(state)));

  const bistro = placerFor(zone, upgrades, plan.bistro.upgrade).place(new BistroSet(), new THREE.Vector3(plan.bistro.floor[0], 0, plan.bistro.floor[1]));
  furnishings?.register(zone, bistro, { key: 'bistroSet', owned: plan.bistro.upgrade });
  placeDecor(zone, plan.decor, upgrades, furnishings);
  // The florist's potted plants, as many as have been bought (they stand clear of the way: no colliders).
  if (upgrades) {
    const pots = plan.boughtPlants.map((spot) => zone.place(new Plant({ kind: spot.kind, pot: spot.pot, seed: spot.seed, scale: 'scale' in spot ? spot.scale : 1, collides: false }), new THREE.Vector3(spot.floor[0], 0, spot.floor[1])));
    pots.forEach((pot, nth) => furnishings?.register(zone, pot, { key: `plant#${nth}`, owned: { good: 'plant', nth } }));
    followUpgrades(zone, upgrades, () => pots.forEach((pot, i) => (pot.visible = i < upgrades.count('plant'))));
  }
  // Out here the plants sway in the weather's wind, not a room's draught.
  const wind = (): number => sky.dayNight.state.wind;
  zone.group.traverse((obj) => {
    if (obj instanceof Plant) obj.setWind(wind);
  });
  // The rain and snow fall on the balcony as on the street, but not through the building's front behind it
  // (the box of drops follows the eye, into the room too while this zone is loaded).
  zone.place(new Precipitation(sky.dayNight, { shelters: [behindFront(depth)], splashes: false }), new THREE.Vector3());
  const air = zone.place(new OpenAir(sky.outdoors, { radius: plan.surround, sunDistance: plan.sun.distance, sunRadius: plan.sun.radius }), new THREE.Vector3(0, 1, 0));
  return { lightLevel: () => air.lightLevel };
}

/** Zone-local box of everything behind the building's front (the flat, the neighbours): nothing falls in it. */
function behindFront(depth: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(-1000, -1000, -1000), new THREE.Vector3(1000, 1000, -depth / 2));
}

/** World-space box of the doorway's opening through the building's front (the balcony's back side). */
function portalBounds(zone: Zone, along: number, width: number, height: number): THREE.Box3 {
  const z = -plan.room.depth / 2;
  return new THREE.Box3(new THREE.Vector3(along - width / 2, 0, z - PORTAL_HALF_DEPTH), new THREE.Vector3(along + width / 2, height, z + PORTAL_HALF_DEPTH)).applyMatrix4(zone.group.matrixWorld);
}
