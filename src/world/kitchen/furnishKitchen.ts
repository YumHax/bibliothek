import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { furnishShell } from '../shell';
import { PendantLamp } from '../props/PendantLamp';
import { WallSwitch } from '../props/WallSwitch';
import { RoomWindow } from '../props/Window';
import { WallClock } from '../props/WallClock';
import { KitchenRun } from '../props/KitchenRun';
import { WallCabinets } from '../props/WallCabinets';
import { Fridge } from '../props/Fridge';
import { KitchenTable } from '../props/KitchenTable';
import { Chair } from '../props/Chair';
import { FruitBowl, ChoppingBoard, StorageJars, DishRack } from '../props/WorktopClutter';
import { Kettle } from '../props/Kettle';
import { Toaster } from '../props/Toaster';
import { Radio } from '../props/Radio';
import { placeDecor } from '../props/decor';
import { placeLeaves, placeWith, floorPointsToWorld } from '../zone/attach';
import { PointSound } from '../acoustics/PointSound';
import { ClockTick, FridgeHum } from '@/audio/ambient';
import { tickRadiators } from '../acoustics/radiatorTicks';
import { WaterBowl } from '../cat/WaterBowl';
import { Television } from '../Television';
import { StrayBox } from '../strays/StrayBox';
import { KITCHEN_PLAN } from './kitchenPlan';

/**
 * Builds the kitchen into its zone from `KITCHEN_PLAN`: shell (the hallway hangs the door), the
 * ceiling light, the L of cabinets with the wall cupboards and hood over it, the fridge, the
 * window over the sink, the breakfast table and its chairs, what is left out on the worktop, the
 * clock, then the decoration.
 */
export function furnishKitchen(zone: Zone, { sky, listener, acoustics, cssLayer, covers, upgrades, strays, market }: BuildContext): ZoneHandle {
  const plan = KITCHEN_PLAN;

  // 0. Shell and ceiling light.
  const room = furnishShell(zone, sky, plan.room);
  const pendant = zone.placeAt(new PendantLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.pendant);
  zone.placeAt(new WallSwitch({ lamp: pendant }), plan.lightSwitch);

  // 1. The fitted kitchen: base runs, wall cupboards with the extractor, the fridge past the end of the run.
  //    Their doors, drawers and the oven door open on a click: each leaf is placed beside its host.
  for (const run of plan.runs) placeLeaves(zone, zone.placeAt(new KitchenRun(run.options), run.at));
  placeLeaves(zone, zone.placeAt(new WallCabinets(plan.wallCabinets.options), plan.wallCabinets.at));
  const fridge = zone.placeAt(new Fridge({ hinge: plan.fridge.hinge }), plan.fridge.at);
  placeLeaves(zone, fridge);
  // Its compressor hums low at the back, on and off.
  placeWith(zone, fridge, new PointSound(new FridgeHum(), { listener, occlusion: acoustics }), new THREE.Vector3(0, 0.3, 0.1));

  // 2. The window over the sink: the one sunlit window of the room, a roller blind instead of curtains (the skylight follows it).
  const { wall, along, width, height, sill, blind } = plan.window;
  const windows: RoomWindow[] = [];
  const onCurtainsChange = (): void => room.setSkylight(windows.reduce((sum, w) => sum + w.curtainOpenness, 0) / windows.length);
  windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { width, height, blind, onCurtainsChange }), { wall, along, y: RoomWindow.mountY(height) + sill }));

  // 3. Breakfast table and its two chairs.
  const table = zone.placeAt(new KitchenTable(), plan.table);
  for (const at of plan.chairs) zone.placeAt(new Chair(), at);
  // A game from the shelves left on the table, a different one each day.
  if (strays) {
    const stray = new StrayBox({ strays, slot: 'kitchenTable', covers });
    stray.position.set(plan.strayBox.at[0], table.topHeight, plan.strayBox.at[1]);
    stray.rotation.y = plan.strayBox.yaw;
    placeWith(zone, table, stray);
    zone.onUnload(sky.dayNight.onChange(() => stray.setDay(market.day)));
  }

  // 4. Left out on the worktop. The kettle, the toaster and the radio work: each has its voice placed beside it.
  const kettle = zone.placeAt(new Kettle(), plan.kettle);
  placeWith(zone, kettle, new PointSound(kettle.sound, { listener, occlusion: acoustics }), new THREE.Vector3(0, 0.15, 0));
  const toaster = zone.placeAt(new Toaster(), plan.toaster);
  placeWith(zone, toaster, new PointSound(toaster.sound, { listener, occlusion: acoustics }), new THREE.Vector3(0, 0.12, 0));
  const radio = zone.placeAt(new Radio(), plan.radio);
  placeWith(zone, radio, new PointSound(radio.sound, { listener, occlusion: acoustics, volume: { maxDistance: 9 } }), new THREE.Vector3(-0.05, 0.08, 0.04));
  zone.placeAt(new ChoppingBoard(), plan.choppingBoard);
  zone.placeAt(new FruitBowl(), plan.fruitBowl);
  zone.placeAt(new StorageJars(), plan.storageJars);
  zone.placeAt(new DishRack(), plan.dishRack);

  // 5. The clock (reads the room's time) and the decoration: runner, plants, the print, shelves, calendar and spice rack.
  const clock = zone.placeAt(new WallClock(sky.dayNight), plan.clock);
  placeWith(zone, clock, new PointSound(new ClockTick(), { listener, occlusion: acoustics, volume: { maxDistance: 5 } }), new THREE.Vector3(0, 0, 0.03));
  tickRadiators(zone, placeDecor(zone, plan.decor), { listener, occlusion: acoustics });

  // 6. The cat's second water bowl, so a thirsty cat in this end of the flat need not go home.
  const water = zone.placeAt(new WaterBowl({ finish: 'ceramic', glaze: 0xb3623b }), plan.catWater);

  // 7. Home goods: the portable CRT on the fridge once bought. Its glow is a light, and lights must exist from the start
  //    (one added mid-game recompiles every shader): the set hangs in the zone from the first frame, drawn, clickable
  //    and colliding only once bought.
  if (upgrades) {
    const crt = new Television(cssLayer, { listener, occlusion: acoustics, screenWidth: plan.homeGoods.crt.screenWidth });
    crt.mountOn(0);
    const top = new THREE.Vector3(0, fridge.footprint.max.y, fridge.footprint.max.z - 0.05 - plan.homeGoods.crt.setBack);
    crt.position.copy(zone.toLocal(fridge.localToWorld(top)));
    crt.rotation.y = fridge.rotation.y;
    const meshes: THREE.Object3D[] = [];
    crt.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.visible) meshes.push(obj);
    });
    for (const mesh of meshes) mesh.visible = false;
    zone.group.add(crt);
    let bought = false;
    const refresh = (): void => {
      if (bought || upgrades.count('crt') <= 0) return;
      bought = true;
      for (const mesh of meshes) mesh.visible = true;
      zone.place(crt, crt.position.clone(), crt.rotation.y);
    };
    refresh();
    zone.onUnload(upgrades.subscribe(refresh));
  }

  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits), catWaters: [water] };
}
