import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, CollectionContext, HomeContext, HouseholdContext, ZoneHandle } from '../buildContext';
import type { Placer } from '../build/owned';
import type { GameBox } from '../GameBox';
import { ClickSpot } from '../props/ClickSpot';
import { AlarmClock } from './AlarmClock';
import { clockShort } from '@/text/clock';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight, placeStrayBox } from '../build/roomParts';
import { heardBy, pointSound } from '../build/hearing';
import { followDaylight, followUpgrades } from '../build/follow';
import { placerFor } from '../build/owned';
import { bookcasesIn, movableBookcases } from '../build/bookcases';
import { labelledBookcases } from '../labels/labelledBookcases';
import type { CatPerch } from '../cat/spots';
import { Bed } from './Bed';
import { Nightstand } from './Nightstand';
import { BedsideLamp } from './BedsideLamp';
import { Wardrobe } from './Wardrobe';
import { Dresser } from './Dresser';
import { BedroomChair } from './BedroomChair';
import { SideTable } from '../props/SideTable';
import { ReadingLamp } from './ReadingLamp';
import { Phone, duskDarkness } from './Phone';
import { UnseenSwap } from './UnseenSwap';
import { NightLight } from './NightLight';
import { placeLeaves, placeWith, floorPointsToWorld } from '../zone/attach';
import { Television } from '../Television';
import { FrostedWindow } from '../props/FrostedWindow';
import { BookcaseKit } from './BookcaseKit';
import { ANNEX_OVERFLOW } from '../annex/annexShelves';
import { onRouxPhase } from '@/building/rouxMove';
import { Shelving } from '../shelving/Shelving';
import { tellOutcome } from '@/household/tellOutcome';
import { playAlarmButton, playHangers } from '@/audio/householdSounds';
import { playAlarm } from '@/audio/alarm';
import { hear } from '@/audio/hearing';
import { resolvePlacement } from '../Placement';
import { BOOKCASE_PRICE } from '@/economy/pricing';
import { PrizeShelf } from '../prizes/PrizeShelf';
import { ArcadePoster } from '../prizes/ArcadePoster';
import { MoodLamp } from '../prizes/MoodLamp';
import { NeighbourVoices } from '@/audio/flatSounds';
import { BEDROOM_PLAN } from './bedroomPlan';
import { placeHomeArcade, type HomeArcade } from '../homeArcade/placeHomeArcade';
import { rugsUnderfoot } from '../build/rugsUnderfoot';
import { regionLockFor } from '@/economy/regionLock';

/** What the bedroom built that the rest of the game needs: its screen, the bed (a cat's napping spot), the overflow shelving. */
interface BedroomHandle extends ZoneHandle {
  tv: Television;
  /** The cat's napping spot on the bed (on the mattress, before the bed is bought). */
  bed: CatPerch;
  /** The bought bookcases; null when the build has no collection overflow to show. */
  shelving: Shelving | null;
  /** The home arcade cabinet (staged till bought): a games night hands its stick two to a guest. */
  homeArcade: HomeArcade;
}

/**
 * Builds the bedroom into its zone from `BEDROOM_PLAN`: shell (the hallway hangs the door),
 * ceiling light, the obscured window, the bed (the player gets into it, and sleeps there) with a
 * nightstand, its drawer and a lamp each side, a phone on charge and a night light, the wardrobe,
 * the dresser with a small TV facing the bed, the chair (sat on, clothes piling up by the day) and
 * the reading corner, the bought bookcases (or the kit to buy one), the shelf of arcade prizes,
 * then the rug, pictures and plant. The clock unmakes the bed until noon and lights the glows at night.
 */
export function furnishBedroom(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'cssLayer' | 'covers' | 'listener' | 'acoustics' | 'input' | 'collection' | 'home' | 'arcade' | 'today'>): BedroomHandle {
  const { sky, cssLayer, covers, collection: { overflow }, home: { upgrades, furnishings }, arcade: { prizes }, today } = ctx;
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
  // What is bought may be moved by the player (M); what stands on it rides along.
  furnishings?.register(zone, bed, { key: 'bed', at: plan.bed, owned: own.bed });
  let mattress: Bed | null = frame.owned ? null : zone.placeAt(new Bed({ frame: false }), plan.bed);
  frame.onOwned(() => {
    if (mattress) zone.remove(mattress);
    mattress = null;
  });
  const stands = placerFor(zone, upgrades, own.nightstands);
  const nightstands = plan.nightstands.map((at, i) => {
    const stand = stands.placeAt(new Nightstand({ drawer: plan.nightstandDrawers[i] }), at);
    furnishings?.register(zone, stand, { key: `nightstand#${i}`, at, owned: own.nightstands, name: 'Nightstand' });
    // Turned as it always stood (square to the room), whichever way the stand faces.
    const lamp = new BedsideLamp();
    lamp.rotation.y = -stand.rotation.y;
    stands.placeWith(stand, lamp, stand.lampAnchor.clone());
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
  furnishings?.register(zone, dresser, { key: 'dresser', at: plan.dresser.at, owned: own.dresser });
  const tv = new Television(cssLayer, { ...heardBy(ctx), screenWidth: plan.tv.screenWidth });
  tv.regionLock = regionLockFor(upgrades); // a Japanese copy needs its converter (`economy/regionLock`)
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
      // Seated either way: nothing to read is said, not refused.
      const outcome = household.life.readManual(box.game);
      if (!outcome.done && outcome.line) household.notices.react(outcome.line);
      else tellOutcome(household.notices, outcome, `${box.game.title}: the manual`);
    },
  };
  const chair = reading.placeAt(new BedroomChair({ reading: manual || undefined }), plan.chair);
  const corner = plan.readingCorner;
  const table = reading.placeAt(new SideTable({ radius: corner.tableRadius }), corner.table);
  furnishings?.register(zone, chair, { key: 'readingChair', at: plan.chair, owned: own.readingCorner, name: 'Reading chair' });
  furnishings?.register(zone, table, { key: 'readingTable', at: corner.table, owned: own.readingCorner, name: 'Reading table' });
  const readingLamp = new ReadingLamp();
  readingLamp.position.set(corner.lamp.at[0], table.topHeight, corner.lamp.at[1]);
  readingLamp.rotation.y = corner.lamp.yaw;
  reading.placeWith(table, readingLamp);

  // What the clock changes: the bed slept in until noon, the glows with the dusk, the day's clothes on the chair.
  // The bed and the chair change only unseen: at once while the player is elsewhere, else once they look away.
  const bedSwap = zone.place(new UnseenSwap(ctx.listener, bed), new THREE.Vector3());
  const chairSwap = zone.place(new UnseenSwap(ctx.listener, chair), new THREE.Vector3());
  let wasMade: boolean | null = null;
  let wasDay: number | null = null;
  zone.onUnload(
    sky.dayNight.onChange((state) => {
      const made = !(state.hours >= plan.bedUnmade.from && state.hours < plan.bedUnmade.until);
      if (made !== wasMade) {
        wasMade = made;
        bedSwap.defer(() => {
          bed.setMade(made);
          mattress?.setMade(made);
        });
      }
      const dark = duskDarkness(state.sunHeight);
      phone.setDark(dark);
      nightLight.setDark(dark);
      const day = today.gameDay;
      if (day !== wasDay) {
        wasDay = day;
        chairSwap.defer(() => chair.setDay(day));
      }
    }),
  );

  const shelving = overflow && upgrades ? furnishBookcases(zone, covers, overflow, upgrades, ctx.collection, furnishings, ctx.home.shelfLabels) : null;
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
  // The home arcade cabinet by the door, once bought (`world/homeArcade`).
  const homeArcade = placeHomeArcade(zone, ctx, plan.homeArcade, own.homeArcade);
  return { room, tv, bed: sleeper, shelving, homeArcade, catVisits: floorPointsToWorld(zone, plan.catVisits), surfaceAt: rugsUnderfoot(zone) };
}

/**
 * The bookcase slot: a Shelving over the games the collection room had no room for, standing as
 * many bookcases as were bought (one slot today), and until then the kit that buys one.
 */
function furnishBookcases(
  zone: Zone,
  covers: BuildContext['covers'],
  overflow: NonNullable<CollectionContext['overflow']>,
  upgrades: NonNullable<HomeContext['upgrades']>,
  { arrangement, boxes, shelved }: Pick<CollectionContext, 'arrangement' | 'boxes' | 'shelved'>,
  furnishings: HomeContext['furnishings'],
  labels: HomeContext['shelfLabels'],
): Shelving {
  const plan = BEDROOM_PLAN;
  const { position, rotationY } = resolvePlacement(plan.room, plan.bookcase.at);
  const slot = { position, rotationY, facing: new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)) };
  // The collection room takes the bought bookcases first (`bookcasesIn`): this slot gets what its walls cannot.
  const here = (bought = upgrades.count('bookcase')) => bookcasesIn(bought).bedroom;
  const shelving = new Shelving(zone, covers, overflow, {
    id: 'bedroom',
    // What this one has no room for goes next door once Mrs Roux's rooms are the flat's (`world/annex`).
    overflow: ANNEX_OVERFLOW,
    ...labelledBookcases(movableBookcases(zone, furnishings), labels, 'bedroom'),
    ...(arrangement ? { arrangement } : {}),
    ...(boxes ? { pool: boxes } : {}),
    ...(shelved ? { rowsFrom: shelved } : {}),
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
  const refresh = (): void => {
    shelving.setCapacity(here());
    kit.setAvailable(here() < 1 && here(upgrades.count('bookcase') + 1) > 0);
  };
  followUpgrades(zone, upgrades, refresh);
  // The wall to Mrs Roux's rooms knocked through: the bookcases shift along (`bookcasesIn`).
  zone.onUnload(onRouxPhase(refresh));
  return shelving;
}

/**
 * The bedroom's uses, wired to `HomeLife` and the panels: the alarm clock (a click sets the hour the bed's
 * night ends at) and the phone on the nightstands, once they stand; the wardrobe's rail behind its doors
 * (what to wear). The reading chair is the chair's own click.
 */
function furnishBedroomLife(zone: Zone, household: HouseholdContext, parts: { stands: Placer; nightstands: readonly Nightstand[]; phone: Phone; wardrobe: Wardrobe }): void {
  const { life, notices } = household;
  const { alarm: alarmAt, phoneSpot, rail } = BEDROOM_PLAN.household;
  const { stands, nightstands } = parts;
  const alarmStand = nightstands[alarmAt.stand]!;
  const alarm = new AlarmClock({
    label: () => `Alarm clock (${clockShort(life.household.wakeHour)}) · change the hour`,
    use: () => {
      playAlarmButton();
      const hour = life.household.cycleAlarm();
      alarm.setAlarm(hour);
      notices.react(`The alarm will wake you at ${clockShort(hour)}.`);
    },
  });
  alarm.setAlarm(life.household.wakeHour);
  alarm.position.set(alarmAt.at[0], alarmStand.topHeight, alarmAt.at[1]);
  alarm.rotation.y = alarmAt.yaw;
  stands.placeWith(alarmStand, alarm);
  // The morning after a night in the bed, it rings for a moment on the fade-in (`Sleep.onWake`), once it stands.
  life.setAlarmRinger(() => {
    if (!stands.owned) return;
    // Two groups of beeps, then the slap on the button that stops it.
    const heard = hear(alarm.getWorldPosition(new THREE.Vector3()));
    if (heard.gain <= 0) return;
    const rang = playAlarm(0.05 * heard.gain, 2, heard.spatial);
    if (rang > 0) zone.after(rang + 0.12, () => playAlarmButton(0.08));
  });

  const call = new ClickSpot({ size: phoneSpot, label: () => 'Phone · make a call', onClick: () => undefined });
  call.activate = (session) => session.openPanel(household.phone);
  const { phone } = parts;
  stands.placeWith(nightstands[BEDROOM_PLAN.phone.stand]!, call, phone.position.clone().setY(phone.position.y + phoneSpot[1] / 2));

  // Behind the doors: only reached with one open.
  const clothes = new ClickSpot({ size: rail.size, label: () => 'Wardrobe · choose what to wear', onClick: () => undefined });
  clothes.activate = (session) => {
    playHangers();
    session.openPanel(household.wardrobe);
  };
  placeWith(zone, parts.wardrobe, clothes, new THREE.Vector3(...rail.at));
}
