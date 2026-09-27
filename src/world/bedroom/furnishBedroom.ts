import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, CollectionContext, HomeContext, HouseholdContext, ZoneHandle } from '../buildContext';
import type { Placer } from '../build/owned';
import type { GameBox } from '../GameBox';
import { ClickSpot } from '../props/ClickSpot';
import { AlarmClock } from './AlarmClock';
import { clockTime } from '../street/shops/shopHours';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight, placeStrayBox } from '../build/roomParts';
import { heardBy, pointSound } from '../build/hearing';
import { followDaylight, followUpgrades } from '../build/follow';
import { placerFor } from '../build/owned';
import { bookcasesIn } from '../build/bookcases';
import type { CatPerch } from '../cat/spots';
import { Bed } from './Bed';
import { Nightstand } from './Nightstand';
import { BedsideLamp } from './BedsideLamp';
import { Wardrobe } from './Wardrobe';
import { Dresser } from './Dresser';
import { BedroomChair } from './BedroomChair';
import { SideTable } from '../props/SideTable';
import { ReadingLamp } from './ReadingLamp';
import { Phone } from './Phone';
import { NightLight } from './NightLight';
import { placeLeaves, placeWith, floorPointsToWorld } from '../zone/attach';
import { Television } from '../Television';
import { FrostedWindow } from '../props/FrostedWindow';
import { BookcaseKit } from './BookcaseKit';
import { Shelving } from '../shelving/Shelving';
import { resolvePlacement } from '../Placement';
import { BOOKCASE_PRICE } from '@/economy/pricing';
import { PrizeShelf } from '../prizes/PrizeShelf';
import { ArcadePoster } from '../prizes/ArcadePoster';
import { MoodLamp } from '../prizes/MoodLamp';
import { NeighbourVoices } from '@/audio/flatSounds';
import { BEDROOM_PLAN } from './bedroomPlan';

/** What the bedroom built that the rest of the game needs: its screen, the bed (a cat's napping spot), the overflow shelving. */
export interface BedroomHandle extends ZoneHandle {
  tv: Television;
  /** The cat's napping spot on the bed (on the mattress, before the bed is bought). */
  bed: CatPerch;
  /** The bought bookcases; null when the build has no collection overflow to show. */
  shelving: Shelving | null;
}

/**
 * Builds the bedroom into its zone from `BEDROOM_PLAN`: shell (the hallway hangs the door),
 * ceiling light, the obscured window, the bed (the player gets into it, and sleeps there) with a
 * nightstand, its drawer and a lamp each side, a phone on charge and a night light, the wardrobe,
 * the dresser with a small TV facing the bed, the chair (sat on, clothes piling up by the day) and
 * the reading corner, the bought bookcases (or the kit to buy one), the shelf of arcade prizes,
 * then the rug, pictures and plant. The clock unmakes the bed until noon and lights the glows at night.
 */
export function furnishBedroom(zone: Zone, ctx: BuildContext): BedroomHandle {
  const { sky, cssLayer, covers, collection: { overflow }, home: { upgrades }, arcade: { prizes }, today } = ctx;
  const plan = BEDROOM_PLAN;
  const room = furnishShell(zone, sky, plan.room);
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  // The window onto the courtyard: frosted, glowing with the sky.
  followDaylight(zone, sky, zone.placeAt(new FrostedWindow({ width: plan.window.width, height: plan.window.height }), plan.window.at));

  // The mattress on the floor, where the bed will stand; the bed once bought (the mattress goes then). Either side,
  // once bought, a nightstand with its lamp standing on the top and its drawer. What is bought stands only then,
  // staged till then (`build/owned.ts`).
  const own = plan.upgrades;
  const frame = placerFor(zone, upgrades, own.bed);
  const bed = frame.placeAt(new Bed(), plan.bed);
  let mattress: Bed | null = frame.owned ? null : zone.placeAt(new Bed({ frame: false }), plan.bed);
  frame.onOwned(() => {
    if (mattress) zone.remove(mattress);
    mattress = null;
  });
  const stands = placerFor(zone, upgrades, own.nightstands);
  const nightstands = plan.nightstands.map((at, i) => {
    const stand = stands.placeAt(new Nightstand({ drawer: plan.nightstandDrawers[i] }), at);
    stands.place(new BedsideLamp(), zone.toLocal(stand.localToWorld(stand.lampAnchor.clone())));
    for (const drawer of stand.drawers) stands.placeWith(stand, drawer);
    return stand;
  });
  // A phone on charge and a night light on the nightstands' tops.
  const phoneStand = nightstands[plan.phone.stand]!;
  const phone = new Phone({ cableRun: plan.phone.cableRun });
  phone.position.set(plan.phone.at[0], phoneStand.topHeight, plan.phone.at[1]);
  phone.rotation.y = plan.phone.yaw;
  stands.placeWith(phoneStand, phone);
  const lightStand = nightstands[plan.nightLight.stand]!;
  const nightLight = new NightLight();
  nightLight.position.set(plan.nightLight.at[0], lightStand.topHeight, plan.nightLight.at[1]);
  stands.placeWith(lightStand, nightLight);
  // A game from the shelves left on the sleeper's nightstand, a different one each day.
  stands.onOwned(() => placeStrayBox(zone, ctx, 'nightstand', nightstands[plan.strayBox.stand]!, plan.strayBox));
  const wardrobe = zone.placeAt(new Wardrobe({ depth: plan.wardrobe.depth }), plan.wardrobe.at);
  placeLeaves(zone, wardrobe);
  // The dresser, and on it the portable TV, set straight on its top (no cabinet of its own).
  const drawers = placerFor(zone, upgrades, own.dresser);
  const dresser = drawers.placeAt(new Dresser({ width: plan.dresser.width, tray: false }), plan.dresser.at);
  const tv = new Television(cssLayer, { ...heardBy(ctx), screenWidth: plan.tv.screenWidth });
  tv.position.set(plan.tv.along, dresser.topHeight, dresser.topCentreZ);
  tv.mountOn(0);
  placerFor(zone, upgrades, own.tv).placeWith(dresser, tv);
  // The reading corner: the chair, a side table by it, and on it a reading lamp leaning towards it.
  const reading = placerFor(zone, upgrades, own.readingCorner);
  // With a box in hand, the chair is where its manual gets read (docs/household.md).
  const household = ctx.home.household;
  const manual = household && {
    label: (box: GameBox) => household.life.readLabel(box.game),
    read: (box: GameBox) => {
      const { line } = household.life.readManual(box.game);
      if (line) household.say(line, 6000);
    },
  };
  const chair = reading.placeAt(new BedroomChair({ reading: manual || undefined }), plan.chair);
  const corner = plan.readingCorner;
  const table = reading.placeAt(new SideTable({ radius: corner.tableRadius }), corner.table);
  const readingLamp = new ReadingLamp();
  readingLamp.position.set(corner.lamp.at[0], table.topHeight, corner.lamp.at[1]);
  readingLamp.rotation.y = corner.lamp.yaw;
  reading.placeWith(table, readingLamp);

  // What the clock changes: the bed slept in until noon, the glows after dark, the day's clothes on the chair.
  zone.onUnload(
    sky.dayNight.onChange((state) => {
      const made = !(state.hours >= plan.bedUnmade.from && state.hours < plan.bedUnmade.until);
      bed.setMade(made);
      mattress?.setMade(made);
      phone.setNight(state.night);
      nightLight.setNight(state.night);
      chair.setDay(today.gameDay);
    }),
  );

  const shelving = overflow && upgrades ? furnishBookcases(zone, covers, overflow, upgrades) : null;
  // What the arcade paid out, on the bare right wall.
  if (prizes) zone.placeAt(new PrizeShelf({ prizes, width: plan.prizeShelf.width }), plan.prizeShelf.at);
  // Prizes that live at home, hidden until won: the arcade poster on the wall, the mood lamp on the dresser's books.
  if (prizes) {
    zone.placeAt(new ArcadePoster({ prizes, width: plan.arcadePoster.width, height: plan.arcadePoster.height }), plan.arcadePoster.at);
    const moodLamp = new MoodLamp({ prizes });
    moodLamp.position.set(plan.moodLamp.along, dresser.topHeight + plan.moodLamp.above, dresser.topCentreZ);
    drawers.placeWith(dresser, moodLamp);
  }

  if (household) furnishBedroomLife(zone, household, { stands, nightstands, phone, wardrobe });
  furnishDecor(zone, ctx, plan.decor);
  // The neighbours through the party wall, talking now and then (rarely at night).
  zone.placeAt(pointSound(ctx, new NeighbourVoices({ night: () => sky.dayNight.state.night }), { maxDistance: 6 }), plan.neighbours);
  // Where the cat naps in here: on the bed, or on the mattress before it.
  const sleeper: CatPerch = {
    restingSpot: (out) => (mattress ?? bed).restingSpot(out),
    approachPoint: (out) => (mattress ?? bed).approachPoint(out),
  };
  return { room, tv, bed: sleeper, shelving, catVisits: floorPointsToWorld(zone, plan.catVisits) };
}

/**
 * The bookcase slot: a Shelving over the games the collection room had no room for, standing as
 * many bookcases as were bought (one slot today), and until then the kit that buys one.
 */
function furnishBookcases(zone: Zone, covers: BuildContext['covers'], overflow: NonNullable<CollectionContext['overflow']>, upgrades: NonNullable<HomeContext['upgrades']>): Shelving {
  const plan = BEDROOM_PLAN;
  const { position, rotationY } = resolvePlacement(plan.room, plan.bookcase.at);
  const slot = { position, rotationY, facing: new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)) };
  // The collection room takes the bought bookcases first (`bookcasesIn`): this slot gets what its walls cannot.
  const here = (bought = upgrades.count('bookcase')) => bookcasesIn(bought).bedroom;
  const shelving = new Shelving(zone, covers, overflow, {
    room: plan.room,
    layout: { slots: [slot], width: plan.bookcase.width },
    capacity: here(),
    minBookcases: here(),
    // A spot added mid-game would recompile every shader: the room's own lamps light it.
    lamps: false,
  });
  zone.onUnload(() => shelving.dispose());
  // The kit leans there once the next bookcase bought would stand in here.
  const kit = zone.placeAt(new BookcaseKit({ price: BOOKCASE_PRICE, onBought: () => upgrades.add('bookcase') }), plan.bookcaseKit);
  followUpgrades(zone, upgrades, () => {
    shelving.setCapacity(here());
    kit.setAvailable(here() < 1 && here(upgrades.count('bookcase') + 1) > 0);
  });
  return shelving;
}

/**
 * The bedroom's uses, wired to `HomeLife` and the panels: the alarm clock (a click sets the hour the bed's
 * night ends at) and the phone on the nightstands, once they stand; the wardrobe's rail behind its doors
 * (what to wear). The reading chair is the chair's own click.
 */
function furnishBedroomLife(zone: Zone, household: HouseholdContext, parts: { stands: Placer; nightstands: readonly Nightstand[]; phone: Phone; wardrobe: Wardrobe }): void {
  const { life, say } = household;
  const { alarm: alarmAt, phoneSpot, rail } = BEDROOM_PLAN.household;
  const { stands, nightstands } = parts;
  const alarmStand = nightstands[alarmAt.stand]!;
  const alarm = new AlarmClock({
    label: () => `Alarm set for ${clockTime(life.household.wakeHour)}: click to change`,
    use: () => {
      const hour = life.household.cycleAlarm();
      alarm.setAlarm(hour);
      say(`The alarm will wake you at ${clockTime(hour)}.`, 2000);
    },
  });
  alarm.setAlarm(life.household.wakeHour);
  alarm.position.set(alarmAt.at[0], alarmStand.topHeight, alarmAt.at[1]);
  alarm.rotation.y = alarmAt.yaw;
  stands.placeWith(alarmStand, alarm);

  const call = new ClickSpot({ size: phoneSpot, label: () => 'Click to make a call', onClick: () => undefined });
  call.activate = (session) => session.openPanel(household.phone);
  const { phone } = parts;
  stands.placeWith(nightstands[BEDROOM_PLAN.phone.stand]!, call, phone.position.clone().setY(phone.position.y + phoneSpot[1] / 2));

  // Behind the doors: only reached with one open.
  const clothes = new ClickSpot({ size: rail.size, label: () => 'Click to choose what to wear', onClick: () => undefined });
  clothes.activate = (session) => session.openPanel(household.wardrobe);
  placeWith(zone, parts.wardrobe, clothes, new THREE.Vector3(...rail.at));
}
