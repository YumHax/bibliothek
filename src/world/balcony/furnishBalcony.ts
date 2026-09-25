import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { placeDecor } from '../props/decor';
import { BALCONY_PLAN as plan } from './balconyPlan';
import { BalconySlab } from './BalconySlab';
import { BalconyDoor } from './BalconyDoor';
import { BuildingFront } from './BuildingFront';
import { BistroSet } from './BistroSet';
import { OpenAir } from './OpenAir';

/** Always open to the eye: the door is glazed, so the room and the balcony see each other shut or open. */
const GLAZED = { openness: 1 };
/** Half-depth of the portal box through the wall. */
const PORTAL_HALF_DEPTH = 0.15;

/**
 * The balcony off the collection room: the stone slab and its railing, the glazed door in the
 * building's front (this zone hangs it; it opens into the room), the building's front all round the
 * door, a bistro set and pots; around it the open air (the painted view on a surround, the sun, the
 * sky's ambient while the player is out). No `Room`: the handle says how lit it is instead.
 */
export function furnishBalcony(zone: Zone, { sky }: BuildContext): ZoneHandle {
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
      pitch: f.pitch,
      door: { x: doorway.along, width: doorway.width, height: doorway.height },
      ourWindows: f.ourWindows.map((w) => ({ ...w, x: w.x - origin.x })),
      ours: [-3 - origin.x, 3 - origin.x],
    }),
    new THREE.Vector3(0, 0, -depth / 2),
  );
  zone.onUnload(sky.dayNight.onChange((state) => front.apply(state)));

  zone.place(new BistroSet(), new THREE.Vector3(plan.bistro.floor[0], 0, plan.bistro.floor[1]));
  placeDecor(zone, plan.decor);
  const air = zone.place(new OpenAir(sky.outdoors, { radius: plan.surround, sunDistance: plan.sun.distance, sunRadius: plan.sun.radius }), new THREE.Vector3(0, 1, 0));
  return { lightLevel: () => air.lightLevel };
}

/** World-space box of the doorway's opening through the building's front (the balcony's back side). */
function portalBounds(zone: Zone, along: number, width: number, height: number): THREE.Box3 {
  const z = -plan.room.depth / 2;
  return new THREE.Box3(new THREE.Vector3(along - width / 2, 0, z - PORTAL_HALF_DEPTH), new THREE.Vector3(along + width / 2, height, z + PORTAL_HALF_DEPTH)).applyMatrix4(zone.group.matrixWorld);
}
