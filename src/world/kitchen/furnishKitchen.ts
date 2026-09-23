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
import { Kettle, Toaster, FruitBowl, ChoppingBoard, StorageJars, DishRack } from '../props/WorktopClutter';
import { placeDecor } from '../props/decor';
import { KITCHEN_PLAN } from './kitchenPlan';

/**
 * Builds the kitchen into its zone from `KITCHEN_PLAN`: shell (the hallway hangs the door), the
 * ceiling light, the L of cabinets with the wall cupboards and hood over it, the fridge, the
 * window over the sink, the breakfast table and its chairs, what is left out on the worktop, the
 * clock, then the decoration.
 */
export function furnishKitchen(zone: Zone, { sky }: BuildContext): ZoneHandle {
  const plan = KITCHEN_PLAN;

  // 0. Shell and ceiling light.
  const room = furnishShell(zone, sky, plan.room);
  const pendant = zone.placeAt(new PendantLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.pendant);
  zone.placeAt(new WallSwitch({ lamp: pendant }), plan.lightSwitch);

  // 1. The fitted kitchen: base runs, wall cupboards with the extractor, the fridge past the end of the run.
  for (const run of plan.runs) zone.placeAt(new KitchenRun(run.options), run.at);
  zone.placeAt(new WallCabinets(plan.wallCabinets.options), plan.wallCabinets.at);
  zone.placeAt(new Fridge(), plan.fridge);

  // 2. The window over the sink: the one sunlit window of the room, no curtains (its skylight still follows them, like every room).
  const { wall, along, width, height, sill } = plan.window;
  const windows: RoomWindow[] = [];
  const onCurtainsChange = (): void => room.setSkylight(windows.reduce((sum, w) => sum + w.curtainOpenness, 0) / windows.length);
  windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { width, height, curtains: false, onCurtainsChange }), { wall, along, y: RoomWindow.mountY(height) + sill }));

  // 3. Breakfast table and its two chairs.
  zone.placeAt(new KitchenTable(), plan.table);
  for (const at of plan.chairs) zone.placeAt(new Chair(), at);

  // 4. Left out on the worktop.
  zone.placeAt(new Kettle(), plan.kettle);
  zone.placeAt(new Toaster(), plan.toaster);
  zone.placeAt(new ChoppingBoard(), plan.choppingBoard);
  zone.placeAt(new FruitBowl(), plan.fruitBowl);
  zone.placeAt(new StorageJars(), plan.storageJars);
  zone.placeAt(new DishRack(), plan.dishRack);

  // 5. The clock (reads the room's time) and the decoration: runner, plants, the print over the table.
  zone.placeAt(new WallClock(sky.dayNight), plan.clock);
  placeDecor(zone, plan.decor);

  return { room };
}
