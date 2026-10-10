import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, HouseholdContext, ZoneHandle } from '../buildContext';
import { presentWhile, onRise } from '../build/presence';
import { CleaningKit, MixingBowl, Cake, TreatJar, CatFind } from './HomeKitchenware';
import { furnishShell } from '../shell';
import { furnishDecor, placeClock, placeRoomLight, placeStrayBox } from '../build/roomParts';
import { heardBy, pointSound } from '../build/hearing';
import { curtainsToSkylight } from '../build/follow';
import { isOwned, placerFor, type Placer } from '../build/owned';
import { RoomWindow } from '../props/Window';
import { homeOutlook } from '../outlook/sharedOutlook';
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
import { LightPool } from '../lighting/LightPool';
import { WaterBowl } from '../cat/WaterBowl';
import { Television } from '../Television';
import { KITCHEN_PLAN } from './kitchenPlan';
import { tellOutcome } from '@/household/tellOutcome';
import { readMs } from '@/notices';
import { HOUSEHOLD } from '@/household/rules';
import { boxJob } from '../build/boxJob';
import { playCleaning, playJarRattle, playOven, playPaperRustle, playWhisk } from '@/audio/householdSounds';
import { playCoins } from '@/audio/coins';
import { rugsUnderfoot } from '../build/rugsUnderfoot';
import { addFlatNoise } from '@/building/flatNoise';
import { regionLockFor } from '@/economy/regionLock';
import { furnishKitchenRepair } from '../repair/furnishRepair';
import { rummageIn } from '../build/rummage';

/** The chronicle's card comes up this long after the jingle starts (ms). */
const CHRONICLE_AFTER_MS = 1500;
/** The radio on, as noise for the neighbours (`building/flatNoise`: a longplay is 0.7). */
const RADIO_NOISE = 0.45;

/** What the kitchen's builder reads of the `BuildContext`. */
type KitchenBuild = Pick<BuildContext, 'sky' | 'cssLayer' | 'listener' | 'acoustics' | 'home' | 'classifieds' | 'story' | 'today' | 'collection' | 'covers'>;

/**
 * Builds the kitchen into its zone from `KITCHEN_PLAN`: shell (the hallway hangs the door), the
 * ceiling light, the L of cabinets with the wall cupboards and hood over it, the fridge, the
 * window over the sink, the breakfast table and its chairs, what is left out on the worktop, the
 * clock, then the decoration.
 */
export function furnishKitchen(zone: Zone, ctx: KitchenBuild): ZoneHandle {
  const { sky, cssLayer, home: { upgrades } } = ctx;
  const plan = KITCHEN_PLAN;

  // 0. Shell and ceiling light.
  const room = furnishShell(zone, sky, plan.room);
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  // 1. The fitted kitchen: base runs, wall cupboards with the extractor, the fridge past the end of the run.
  //    Their doors, drawers and the oven door open on a click: each leaf is placed beside its host.
  //    Each holds what the last tenant left, and now and then a find (docs/household.md "Doors and drawers").
  const household = ctx.home.household;
  plan.runs.forEach((run, i) => {
    const kitchenRun = zone.placeAt(new KitchenRun(run.options), run.at);
    placeLeaves(zone, kitchenRun);
    rummageIn(zone, household, kitchenRun.leaves, `kitchen.run${i}`, true);
  });
  const wallCabinets = zone.placeAt(new WallCabinets(plan.wallCabinets.options), plan.wallCabinets.at);
  placeLeaves(zone, wallCabinets);
  rummageIn(zone, household, wallCabinets.leaves, 'kitchen.wall', true);
  const fridge = zone.placeAt(new Fridge({ hinge: plan.fridge.hinge }), plan.fridge.at);
  placeLeaves(zone, fridge);
  rummageIn(zone, household, fridge.leaves, 'kitchen.fridge', true);
  // Its compressor hums low at the back, on and off.
  placeWith(zone, fridge, pointSound(ctx, new FridgeHum()), new THREE.Vector3(0, 0.3, 0.1));
  // One real light, always there (the scene's light count never changes), lent to the fridge's bulb
  // or the oven's lamp while its door is open (their `PooledLight`s, drawn only then).
  zone.place(new LightPool(1, ctx.listener), new THREE.Vector3());

  // 2. The window over the sink: the one sunlit window of the room, a roller blind instead of curtains (the skylight follows it).
  const { wall, along, width, height, sill, blind } = plan.window;
  const windows: RoomWindow[] = [];
  windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { width, height, blind, onCurtainsChange: curtainsToSkylight(room, windows), outlook: homeOutlook(sky.outdoors) }), { wall, along, y: RoomWindow.mountY(height) + sill }));

  // 3. Breakfast table and its two chairs, once bought (`build/owned.ts`: staged till then).
  const furnished = placerFor(zone, upgrades, plan.upgrades.table);
  const table = furnished.placeAt(new KitchenTable(), plan.table);
  // Moved by the player once bought (M): what is left on the table rides along.
  const furnishings = ctx.home.furnishings;
  furnishings?.register(zone, table, { key: 'kitchenTable', at: plan.table, owned: plan.upgrades.table });
  const chairs = plan.chairs.map((at, i) => {
    const chair = furnished.placeAt(new Chair(), at);
    furnishings?.register(zone, chair, { key: `kitchenChair#${i}`, at, owned: plan.upgrades.table, name: 'Chair' });
    return chair;
  });
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
  // On late, downstairs hears it (`building/noiseComplaints`).
  zone.onUnload(addFlatNoise('radio', () => (radio.sound.isOn ? RADIO_NOISE : 0)));
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
  ctx.home.furnishings?.register(zone, water, { key: 'catWater', at: plan.catWater, owned: plan.upgrades.catWater, name: 'Water bowl' });

  // 7. Home goods: the portable CRT on the fridge once bought. Its glow is a light: staged from the first frame
  //    (`build/owned.ts`), drawn, clickable and colliding only once bought.
  const crt = new Television(cssLayer, { ...heardBy(ctx), screenWidth: plan.homeGoods.crt.screenWidth });
  crt.regionLock = regionLockFor(ctx.home.upgrades); // a Japanese copy needs its converter (`economy/regionLock`)
  crt.mountOn(0);
  const top = new THREE.Vector3(0, fridge.footprint.max.y, fridge.footprint.max.z - 0.05 - plan.homeGoods.crt.setBack);
  placerFor(zone, upgrades, plan.upgrades.crt).place(crt, zone.toLocal(fridge.localToWorld(top)), fridge.rotation.y);

  // 8. What the kitchen is used for (docs/household.md): the cleaning kit, a cake, the cat's treats, the radio's chronicle.
  if (household) furnishKitchenLife(zone, ctx, household, { table, furnished, catThings, radio });
  // A console bought broken waits on the right-hand chair, to be mended on the table (docs/household.md "Repairing a console").
  if (ctx.classifieds && chairs.length) furnishKitchenRepair(zone, ctx.classifieds, { chair: chairs[chairs.length - 1]!, furnished });

  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits), catWaters: [water], surfaceAt: rugsUnderfoot(zone) };
}

/**
 * The kitchen's uses, wired to `HomeLife`: the cleaning kit on the table once fetched from the bathroom
 * (a worn box brought to it is cleaned up), the mixing bowl that bakes a cake for friends (on the table while
 * it lasts), the treat jar and whatever the cat leaves by its bowl the next day, and Radio Brocante's
 * chronicle when the radio is switched on in the morning.
 */
function furnishKitchenLife(zone: Zone, ctx: KitchenBuild, householdCtx: HouseholdContext, parts: { table: KitchenTable; furnished: Placer; catThings: Placer; radio: Radio }): void {
  const { life, notices, catName, callCat, pastimes } = householdCtx;
  const plan = KITCHEN_PLAN.household;
  const { household } = life;
  const { table, furnished, catThings, radio } = parts;
  // Without the table, the kit stays in the bathroom cabinet and no cake is baked (nowhere to put either).
  life.setKitchenTable(() => isOwned(ctx.home.upgrades, KITCHEN_PLAN.upgrades.table));
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
      if (!game) {
        // A help click, not a mistake: said under the crosshair, never with the refusal buzzer.
        notices.react('Bring a worn box here to clean it up.');
        return;
      }
      // An hour with cotton buds: the cloth and the buds over a fade, the clock on an hour, the box back in hand bright.
      boxJob(householdCtx, session, game, {
        refusal: life.mayClean(game),
        pastime: { ...HOUSEHOLD.pastime.clean, start: () => playCleaning(2.6) },
        change: (before) => life.cleanBox(game, before),
      });
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
  zone.placeAt(new MixingBowl({ label: () => life.bakeLabel, use: () => bake() }), plan.mixingBowl);
  // Forty minutes in the oven, in a beat: the whisk as the view goes, the oven door in the dark, its timer on the way back.
  const bake = (): void => {
    const refusal = life.mayBake();
    if (refusal || !pastimes) {
      tellOutcome(notices, refusal ?? life.bake());
      return;
    }
    const beat = HOUSEHOLD.pastime.bake;
    void pastimes.run({ ...beat, start: () => playWhisk(beat.outMs / 1000 + 0.4), dark: () => playOven(), end: () => playOven(true) }, () => life.bake()).then((outcome) => {
      if (outcome) tellOutcome(notices, outcome);
    });
  };

  // The treats and what the cat leaves: with the cat's own things (once there is a cat).
  catThings.placeAt(new TreatJar({
    label: () => life.treatLabel,
    use: () => {
      const shaken = !household.treatedToday;
      const outcome = life.giveTreat(callCat);
      if (shaken) playJarRattle();
      // Shaken for a cat that did not come: a shrug, not a refusal (the treat stays in the jar).
      if (shaken && !outcome.done) notices.react(outcome.line.split('\n').pop() ?? outcome.line);
      else tellOutcome(notices, outcome);
    },
  }), plan.treatJar);
  const find = new CatFind({
    label: () => life.giftLabel,
    use: () => {
      const coins = household.gift?.kind === 'coins';
      const outcome = life.takeGift(catName());
      if (outcome.done) {
        if (coins) playCoins(4);
        else playPaperRustle();
      }
      tellOutcome(notices, outcome);
    },
  });
  catThings.onOwned(() => {
    zone.placeAt(find, plan.catFind);
    presentWhile(zone, find, () => household.gift !== null, follow);
    zone.onUnload(follow(() => find.show(household.gift?.kind ?? null)));
    find.show(household.gift?.kind ?? null);
  });

  // Switched on in the morning, the radio has the market's news (once a day), a moment after the station's
  // jingle; the music stays ducked under the announcer while the card is up. A radio left on since before 6
  // gives it when the hour comes, if the player is in earshot; the caption says it is on the air.
  radio.note = () => (life.chronicleDue ? ', morning news on the air' : null);
  const radioAt = new THREE.Vector3();
  const earAt = new THREE.Vector3();
  const inEarshot = (): boolean => radio.getWorldPosition(radioAt).distanceTo(ctx.listener.getWorldPosition(earAt)) < KITCHEN_PLAN.household.chronicleEarshot;
  onRise(zone, () => radio.sound.isOn && life.chronicleDue && inEarshot(), () => {
    const lines = life.chronicle();
    if (!lines) return;
    // A caller about a story the player follows (the lost prototype), when the trail has reached the radio.
    const caller = ctx.story?.onRadio();
    const text = (caller ? [...lines.filter((l) => !l.includes('Nothing on the grapevine')), caller] : lines).join('\n');
    radio.sound.announce((CHRONICLE_AFTER_MS + readMs(text)) / 1000);
    zone.after(CHRONICLE_AFTER_MS / 1000, () => notices.read({ title: 'Radio Brocante · the morning chronicle', text, look: 'radio' }));
  });
}
