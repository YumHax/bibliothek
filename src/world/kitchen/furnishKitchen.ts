import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, HouseholdContext, ZoneHandle } from '../buildContext';
import { presentWhile, onRise } from '../build/presence';
import { CleaningKit, MixingBowl, Cake, TreatJar, CatFind } from './HomeKitchenware';
import { furnishShell } from '../shell';
import { furnishDecor, placeClock, placeRoomLight, placeStrayBox } from '../build/roomParts';
import { heardBy, pointSound } from '../build/hearing';
import { curtainsToSkylight } from '../build/follow';
import { placerFor, type Placer } from '../build/owned';
import { RoomWindow } from '../props/Window';
import { KitchenRun } from './KitchenRun';
import { WallCabinets } from './WallCabinets';
import { Fridge } from './Fridge';
import { KitchenTable } from './KitchenTable';
import { Chair } from './Chair';
import { FruitBowl, ChoppingBoard, StorageJars, DishRack } from './WorktopClutter';
import { Kettle } from './Kettle';
import { Toaster } from './Toaster';
import { Radio } from './Radio';
import { placeLeaves, placeWith, floorPointsToWorld } from '../zone/attach';
import { FridgeHum } from '@/audio/ambient';
import { WaterBowl } from '../cat/WaterBowl';
import { Television } from '../Television';
import { KITCHEN_PLAN } from './kitchenPlan';
import { tellOutcome } from '@/household/tellOutcome';

/**
 * Builds the kitchen into its zone from `KITCHEN_PLAN`: shell (the hallway hangs the door), the
 * ceiling light, the L of cabinets with the wall cupboards and hood over it, the fridge, the
 * window over the sink, the breakfast table and its chairs, what is left out on the worktop, the
 * clock, then the decoration.
 */
export function furnishKitchen(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, cssLayer, home: { upgrades } } = ctx;
  const plan = KITCHEN_PLAN;

  // 0. Shell and ceiling light.
  const room = furnishShell(zone, sky, plan.room);
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  // 1. The fitted kitchen: base runs, wall cupboards with the extractor, the fridge past the end of the run.
  //    Their doors, drawers and the oven door open on a click: each leaf is placed beside its host.
  for (const run of plan.runs) placeLeaves(zone, zone.placeAt(new KitchenRun(run.options), run.at));
  placeLeaves(zone, zone.placeAt(new WallCabinets(plan.wallCabinets.options), plan.wallCabinets.at));
  const fridge = zone.placeAt(new Fridge({ hinge: plan.fridge.hinge }), plan.fridge.at);
  placeLeaves(zone, fridge);
  // Its compressor hums low at the back, on and off.
  placeWith(zone, fridge, pointSound(ctx, new FridgeHum()), new THREE.Vector3(0, 0.3, 0.1));

  // 2. The window over the sink: the one sunlit window of the room, a roller blind instead of curtains (the skylight follows it).
  const { wall, along, width, height, sill, blind } = plan.window;
  const windows: RoomWindow[] = [];
  windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { width, height, blind, onCurtainsChange: curtainsToSkylight(room, windows) }), { wall, along, y: RoomWindow.mountY(height) + sill }));

  // 3. Breakfast table and its two chairs, once bought (`build/owned.ts`: staged till then).
  const furnished = placerFor(zone, upgrades, plan.upgrades.table);
  const table = furnished.placeAt(new KitchenTable(), plan.table);
  for (const at of plan.chairs) furnished.placeAt(new Chair(), at);
  // A game from the shelves left on the table, a different one each day.
  furnished.onOwned(() => placeStrayBox(zone, ctx, 'kitchenTable', table, plan.strayBox));

  // 4. Left out on the worktop. The kettle, the toaster and the radio work (once bought): each has its voice placed beside it.
  const appliances = placerFor(zone, upgrades, plan.upgrades.appliances);
  const kettle = appliances.placeAt(new Kettle(), plan.kettle);
  appliances.placeWith(kettle, pointSound(ctx, kettle.sound), new THREE.Vector3(0, 0.15, 0));
  const toaster = appliances.placeAt(new Toaster(), plan.toaster);
  appliances.placeWith(toaster, pointSound(ctx, toaster.sound), new THREE.Vector3(0, 0.12, 0));
  const tuner = placerFor(zone, upgrades, plan.upgrades.radio);
  const radio = tuner.placeAt(new Radio(), plan.radio);
  tuner.placeWith(radio, pointSound(ctx, radio.sound, { maxDistance: 9 }), new THREE.Vector3(-0.05, 0.08, 0.04));
  zone.placeAt(new ChoppingBoard(), plan.choppingBoard);
  zone.placeAt(new FruitBowl(), plan.fruitBowl);
  zone.placeAt(new StorageJars(), plan.storageJars);
  zone.placeAt(new DishRack(), plan.dishRack);

  // 5. The clock (reads the room's time) and the decoration: runner, plants, the print, shelves, calendar and spice rack.
  placeClock(zone, ctx, plan.clock);
  furnishDecor(zone, ctx, plan.decor);

  // 6. The cat's second water bowl (once there is a cat), so a thirsty cat in this end of the flat need not go home.
  const catThings = placerFor(zone, upgrades, plan.upgrades.catWater);
  const water = catThings.placeAt(new WaterBowl({ finish: 'ceramic', glaze: 0xb3623b }), plan.catWater);

  // 7. Home goods: the portable CRT on the fridge once bought. Its glow is a light: staged from the first frame
  //    (`build/owned.ts`), drawn, clickable and colliding only once bought.
  const crt = new Television(cssLayer, { ...heardBy(ctx), screenWidth: plan.homeGoods.crt.screenWidth });
  crt.mountOn(0);
  const top = new THREE.Vector3(0, fridge.footprint.max.y, fridge.footprint.max.z - 0.05 - plan.homeGoods.crt.setBack);
  placerFor(zone, upgrades, plan.upgrades.crt).place(crt, zone.toLocal(fridge.localToWorld(top)), fridge.rotation.y);

  // 8. What the kitchen is used for (docs/household.md): the cleaning kit, a cake, the cat's treats, the radio's chronicle.
  if (ctx.home.household) furnishKitchenLife(zone, ctx, ctx.home.household, { table, furnished, catThings, radio });

  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits), catWaters: [water] };
}

/**
 * The kitchen's uses, wired to `HomeLife`: the cleaning kit on the table once fetched from the bathroom
 * (a worn box brought to it is cleaned up), the mixing bowl that bakes a cake for friends (on the table while
 * it lasts), the treat jar and whatever the cat leaves by its bowl the next day, and Radio Brocante's
 * chronicle when the radio is switched on in the morning.
 */
function furnishKitchenLife(zone: Zone, ctx: BuildContext, { life, notices, catName, callCat }: HouseholdContext, parts: { table: KitchenTable; furnished: Placer; catThings: Placer; radio: Radio }): void {
  const plan = KITCHEN_PLAN.household;
  const { household } = life;
  const { table, furnished, catThings, radio } = parts;
  // The household's changes and the clock's (a cake goes stale, a gift turns up the next day).
  const follow = (cb: () => void): (() => void) => {
    const offHome = household.subscribe(cb);
    const offClock = ctx.sky.dayNight.onChange(cb);
    return () => {
      offHome();
      offClock();
    };
  };
  const onTable = (at: readonly [number, number]) => new THREE.Vector3(at[0], table.topHeight, at[1]);

  const kit = new CleaningKit({
    label: (player) => life.cleanLabel(player.held?.game ?? null),
    use: (session) => {
      const game = session.held?.game;
      if (game) tellOutcome(notices, life.cleanBox(game, () => session.putBack()));
      else notices.refuse(life.cleanLabel(null));
    },
  });
  kit.rotation.y = plan.kit.yaw;
  const cake = new Cake();
  // On the table, once there is one.
  furnished.onOwned(() => {
    placeWith(zone, table, kit, onTable(plan.kit.at));
    presentWhile(zone, kit, () => household.hasKit, (cb) => household.subscribe(cb));
    placeWith(zone, table, cake, onTable(plan.cake.at));
    presentWhile(zone, cake, () => household.cakeOut, follow);
  });
  zone.placeAt(new MixingBowl({ label: () => life.bakeLabel, use: () => tellOutcome(notices, life.bake()) }), plan.mixingBowl);

  // The treats and what the cat leaves: with the cat's own things (once there is a cat).
  catThings.placeAt(new TreatJar({ label: () => life.treatLabel, use: () => tellOutcome(notices, life.giveTreat(callCat)) }), plan.treatJar);
  const find = new CatFind({ label: () => life.giftLabel, use: () => tellOutcome(notices, life.takeGift(catName())) });
  catThings.onOwned(() => {
    zone.placeAt(find, plan.catFind);
    presentWhile(zone, find, () => household.gift !== null, follow);
    zone.onUnload(follow(() => find.show(household.gift?.kind ?? null)));
    find.show(household.gift?.kind ?? null);
  });

  // Switched on in the morning, the radio has the market's news (once a day), a moment after the jingle.
  onRise(zone, () => radio.sound.isOn, () => {
    const lines = life.chronicle();
    if (lines) window.setTimeout(() => notices.read({ title: 'Radio Brocante · the morning chronicle', text: lines.join('\n'), look: 'radio' }), 1500);
  });
}
