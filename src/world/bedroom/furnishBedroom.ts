import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, CollectionContext, HomeContext, ZoneHandle } from '../buildContext';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight, placeStrayBox } from '../build/roomParts';
import { heardBy, pointSound } from '../build/hearing';
import { followDaylight, followUpgrades } from '../build/follow';
import { Bed } from '../props/Bed';
import { Nightstand } from '../props/Nightstand';
import { BedsideLamp } from '../props/BedsideLamp';
import { Wardrobe } from '../props/Wardrobe';
import { Dresser } from '../props/Dresser';
import { BedroomChair } from '../props/BedroomChair';
import { SideTable } from '../props/SideTable';
import { ReadingLamp } from '../props/ReadingLamp';
import { Phone } from '../props/Phone';
import { NightLight } from '../props/NightLight';
import { placeLeaves, placeWith, floorPointsToWorld } from '../zone/attach';
import { Television } from '../Television';
import { FrostedWindow } from '../props/FrostedWindow';
import { BookcaseKit } from '../props/BookcaseKit';
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
  bed: Bed;
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
  const { sky, cssLayer, covers, collection: { overflow }, home: { upgrades }, arcade: { prizes }, market: { stock: market } } = ctx;
  const plan = BEDROOM_PLAN;
  const room = furnishShell(zone, sky, plan.room);
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  // The window onto the courtyard: frosted, glowing with the sky.
  followDaylight(zone, sky, zone.placeAt(new FrostedWindow({ width: plan.window.width, height: plan.window.height }), plan.window.at));

  // The bed and, either side, a nightstand with its lamp standing on the top and its drawer.
  const bed = zone.placeAt(new Bed(), plan.bed);
  const stands = plan.nightstands.map((at, i) => {
    const stand = zone.placeAt(new Nightstand({ drawer: plan.nightstandDrawers[i] }), at);
    zone.place(new BedsideLamp(), zone.toLocal(stand.localToWorld(stand.lampAnchor.clone())));
    for (const drawer of stand.drawers) placeWith(zone, stand, drawer);
    return stand;
  });
  // A phone on charge and a night light on the nightstands' tops.
  const phoneStand = stands[plan.phone.stand]!;
  const phone = new Phone({ cableRun: plan.phone.cableRun });
  phone.position.set(plan.phone.at[0], phoneStand.topHeight, plan.phone.at[1]);
  phone.rotation.y = plan.phone.yaw;
  placeWith(zone, phoneStand, phone);
  const lightStand = stands[plan.nightLight.stand]!;
  const nightLight = new NightLight();
  nightLight.position.set(plan.nightLight.at[0], lightStand.topHeight, plan.nightLight.at[1]);
  placeWith(zone, lightStand, nightLight);
  // A game from the shelves left on the sleeper's nightstand, a different one each day.
  placeStrayBox(zone, ctx, 'nightstand', stands[plan.strayBox.stand]!, plan.strayBox);
  placeLeaves(zone, zone.placeAt(new Wardrobe({ depth: plan.wardrobe.depth }), plan.wardrobe.at));
  // The dresser, and on it the portable TV, set straight on its top (no cabinet of its own).
  const dresser = zone.placeAt(new Dresser({ width: plan.dresser.width, tray: false }), plan.dresser.at);
  const tv = new Television(cssLayer, { ...heardBy(ctx), screenWidth: plan.tv.screenWidth });
  tv.position.set(plan.tv.along, dresser.topHeight, dresser.topCentreZ);
  tv.mountOn(0);
  placeWith(zone, dresser, tv);
  const chair = zone.placeAt(new BedroomChair(), plan.chair);
  // The reading corner: a side table by the chair, and on it a reading lamp leaning towards it.
  const corner = plan.readingCorner;
  const table = zone.placeAt(new SideTable({ radius: corner.tableRadius }), corner.table);
  const readingLamp = new ReadingLamp();
  readingLamp.position.set(corner.lamp.at[0], table.topHeight, corner.lamp.at[1]);
  readingLamp.rotation.y = corner.lamp.yaw;
  placeWith(zone, table, readingLamp);

  // What the clock changes: the bed slept in until noon, the glows after dark, the day's clothes on the chair.
  zone.onUnload(
    sky.dayNight.onChange((state) => {
      bed.setMade(!(state.hours >= plan.bedUnmade.from && state.hours < plan.bedUnmade.until));
      phone.setNight(state.night);
      nightLight.setNight(state.night);
      chair.setDay(market.day);
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
    placeWith(zone, dresser, moodLamp);
  }

  furnishDecor(zone, ctx, plan.decor);
  // The neighbours through the party wall, talking now and then (rarely at night).
  zone.placeAt(pointSound(ctx, new NeighbourVoices({ night: () => sky.dayNight.state.night }), { maxDistance: 6 }), plan.neighbours);
  return { room, tv, bed, shelving, catVisits: floorPointsToWorld(zone, plan.catVisits) };
}

/**
 * The bookcase slot: a Shelving over the games the collection room had no room for, standing as
 * many bookcases as were bought (one slot today), and until then the kit that buys one.
 */
function furnishBookcases(zone: Zone, covers: BuildContext['covers'], overflow: NonNullable<CollectionContext['overflow']>, upgrades: NonNullable<HomeContext['upgrades']>): Shelving {
  const plan = BEDROOM_PLAN;
  const { position, rotationY } = resolvePlacement(plan.room, plan.bookcase.at);
  const slot = { position, rotationY, facing: new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)) };
  const bought = () => upgrades.count('bookcase');
  const shelving = new Shelving(zone, covers, overflow, {
    room: plan.room,
    layout: { slots: [slot], width: plan.bookcase.width },
    capacity: bought(),
    minBookcases: bought(),
    // A spot added mid-game would recompile every shader: the room's own lamps light it.
    lamps: false,
  });
  zone.onUnload(() => shelving.dispose());
  const kit = zone.placeAt(new BookcaseKit({ price: BOOKCASE_PRICE, onBought: () => upgrades.add('bookcase') }), plan.bookcaseKit);
  followUpgrades(zone, upgrades, () => {
    shelving.setCapacity(bought());
    kit.setAvailable(bought() < 1);
  });
  return shelving;
}
