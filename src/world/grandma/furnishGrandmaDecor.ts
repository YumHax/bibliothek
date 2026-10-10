import * as THREE from 'three';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import type { Room } from '../Room';
import type { Furniture } from '../Furniture';
import { curtainsToSkylight } from '../build/follow';
import { heardBy, pointSound } from '../build/hearing';
import { placeWith } from '../zone/attach';
import { placeDecor } from '../props/decor';
import { tickRadiators } from '../acoustics/radiatorTicks';
import { RoomWindow } from '../props/Window';
import { Sideboard } from '../props/Sideboard';
import { SideTable } from '../props/SideTable';
import { SweetsBowl } from '../props/SweetsBowl';
import { PictureFrame } from '../props/PictureFrame';
import { Prop } from '../props/Prop';
import { LightPool } from '../lighting/LightPool';
import { DistantAvenue } from '@/audio/grandmaSounds';
import { inHours } from '@/time/clock';
import { streetBusyAt, SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';
import { Doily, DOILY_THICKNESS } from './Doily';
import { TableCloth } from './TableCloth';
import { SundayTable } from './SundayTable';
import { ChinaCabinet } from './ChinaCabinet';
import { LongcaseClock } from './LongcaseClock';
import { KitchenDresser } from './KitchenDresser';
import { EnamelCooker } from './EnamelCooker';
import { WhistlingKettle } from './WhistlingKettle';
import { OldTelevision } from './OldTelevision';
import { PhoneTable } from './PhoneTable';
import { TeaTray } from './TeaTray';
import { Footstool } from './Footstool';
import { MagazineRack } from './MagazineRack';
import { CrochetThrow } from './CrochetThrow';
import { Figurine } from './Figurine';
import { StandingPhoto } from './StandingPhoto';
import { BirdCage } from './BirdCage';
import { CreakyBoards } from './CreakyBoards';
import { LindenView } from './LindenView';
import { FAMILY_PHOTOS } from './familyPhotos';
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';

/** Seconds after she hears the door before the kettle goes on (she gets up for it). */
const KETTLE_AFTER = 4;
/** The armchair's back, in the chair's frame: the middle of its top, and how thick it is there (`Seat`). */
const ARMCHAIR_BACK = { y: 1.05, z: -0.27, edge: 0.17 };

/** What the builder reads. */
type DecorContext = Pick<BuildContext, 'sky' | 'listener' | 'acoustics' | 'today' | 'memories'>;

/** What the rest of the flat's wiring may want of her things. */
interface GrandmaDressing {
  /** The room's 2020s things (the smoke detector, the calendar, the sockets): a memory puts them aside while it plays. */
  modern: THREE.Object3D[];
  /** The cloth over the dining table: what stands on the table stands on it (`topHeight`, riding the table). */
  table: TableCloth;
  /** Her kettle, to put on (`whistle()`) when she makes tea. */
  kettle: WhistlingKettle;
  /** Her set (`setOn`, `isOn`): on by itself in her afternoon and evening hours. */
  tv: OldTelevision;
}

/**
 * Dresses Mémé's flat (docs/story.md "Mémé"): the window onto Linden Avenue (`LindenView`, its traffic heard far
 * below), the decor list (`PLAN.decor`, the 2020s things kept aside as `modern`), the sideboard with her old set on its
 * runner, a photo and the sweets, the longcase clock, the china cabinet and its bibelots, the kitchenette (the dresser
 * and the cooker, the kettle that whistles when a visitor comes by day), the telephone table, the family's photos, the
 * tea on the side table, the footstool, the magazine rack, the crocheted throw on her armchair, the canary, the cloth on
 * the dining table and Sunday's lunch laid on it, the loose boards. `armchair` and `table` are the builder's.
 */
export function furnishGrandmaDecor(zone: Zone, ctx: DecorContext, { room, armchair, table }: { room: Room; armchair: THREE.Object3D; table: THREE.Object3D & { readonly topHeight: number } }): GrandmaDressing {
  const { sky, listener } = ctx;
  const hearing = { listener, acoustics: ctx.acoustics };
  const dayNight = sky.dayNight;
  const hours = (): number => dayNight.state.hours;
  const d = PLAN.dressing;
  // One light lent to the set's glow (`OldTelevision`'s `PooledLight`).
  zone.place(new LightPool(1, listener), new THREE.Vector3());

  // The window onto Linden Avenue, and the avenue heard through it.
  const { wall, along, width, height } = PLAN.window;
  const view = zone.place(new LindenView(dayNight, { width, height, paneOverFloor: RoomWindow.mountY(height) }), new THREE.Vector3());
  const windows: RoomWindow[] = [];
  const pane = zone.placeAt(new RoomWindow(sky.outdoors, { width, height, sunlight: false, glass: view.glass, onCurtainsChange: curtainsToSkylight(room, windows) }), { wall, along, y: RoomWindow.mountY(height) });
  windows.push(pane);
  const avenue = new DistantAvenue(() => streetBusyAt(hours(), weekdayOf(ctx.today.gameDay)), () => dayNight.state.daylight);
  placeWith(zone, pane, pointSound(hearing, avenue, { maxDistance: 8 }), new THREE.Vector3(0, 0, 0.1));

  // The decor list; what 1995 did not have, kept aside for the memories.
  const modern: THREE.Object3D[] = [];
  const placed: Furniture[] = [];
  for (const entry of PLAN.decor) {
    for (const item of placeDecor(zone, [entry])) {
      placed.push(item);
      if (PLAN.modernKinds.includes(entry.kind)) modern.push(item);
    }
  }
  tickRadiators(zone, placed, heardBy(hearing));

  // The sideboard (no turntable: her records are in the cupboard), the set on its runner, a photo, the sweets, a figurine.
  const sideboard = zone.placeAt(new Sideboard({ width: PLAN.sideboard.width, turntable: false, records: [] }), PLAN.sideboard.at);
  const top = sideboard.topHeight;
  const on = d.onSideboard;
  const onSideboard = <F extends Furniture>(item: F, [x, z]: readonly [number, number], lift = 0, yaw = 0): F => {
    item.rotation.y = yaw;
    return placeWith(zone, sideboard, item, new THREE.Vector3(x, top + lift, z));
  };
  onSideboard(new Doily(0.17, 1.9), on.tv);
  const tv = onSideboard(new OldTelevision(), on.tv, DOILY_THICKNESS);
  placeWith(zone, tv, pointSound(hearing, tv.sound, { maxDistance: 7 }), tv.screenAt);
  // The photo of that Christmas: put aside while the memory of it plays.
  modern.push(onSideboard(new StandingPhoto('christmas95'), [on.photo[0], on.photo[1]], 0, on.photo[2]));
  onSideboard(new Doily(0.11), on.sweets);
  onSideboard(new SweetsBowl({ radius: 0.085, color: 0xe8e2d4, seed: 31 }), on.sweets, DOILY_THICKNESS);
  onSideboard(new Figurine('lady'), on.figurine);
  // Her set: on in her afternoon and evening; a click switches it until her next change of hours.
  let scheduled = inHours(hours(), d.tvHours);
  tv.setOn(scheduled);
  zone.onUnload(
    dayNight.onChange((s) => {
      const now = inHours(s.hours, d.tvHours);
      if (now === scheduled) return;
      scheduled = now;
      tv.setOn(now);
    }),
  );

  // The longcase clock, ticking and striking.
  const clock = zone.placeAt(new LongcaseClock(dayNight), PLAN.clock);
  placeWith(zone, clock, pointSound(hearing, clock.tick, { maxDistance: 6 }), clock.voiceAt);
  placeWith(zone, clock, pointSound(hearing, clock.chime, { maxDistance: 12 }), clock.voiceAt.clone());

  // The china cabinet, a figurine and a vase on its cornice.
  const cabinet = zone.placeAt(new ChinaCabinet(d.chinaCabinet.width), d.chinaCabinet.at);
  for (const [kind, [x, z]] of [
    ['dog', d.onCabinet.dog],
    ['vase', d.onCabinet.vase],
  ] as const) {
    placeWith(zone, cabinet, new Figurine(kind), new THREE.Vector3(x, cabinet.topHeight, z));
  }

  // The kitchenette: the dresser, the cooker and the kettle on its front burner.
  zone.placeAt(new KitchenDresser(d.dresser.width), d.dresser.at);
  const cooker = zone.placeAt(new EnamelCooker(), d.cooker);
  const kettle = placeWith(zone, cooker, new WhistlingKettle(), cooker.hob);
  placeWith(zone, kettle, pointSound(hearing, kettle.sound, { maxDistance: 9 }), new THREE.Vector3(0, 0.15, 0));

  // The telephone table, the family on the walls.
  zone.placeAt(new PhoneTable(), d.phoneTable);
  d.photos.forEach(({ photo, at, width: w, height: h, frame }, i) => {
    zone.placeAt(new PictureFrame({ width: w, height: h, frameColor: frame, matWidth: 0.025, seed: 70 + i }, { painter: FAMILY_PHOTOS[photo], canvasWidth: 384 }), at);
  });

  // The sitting corner: tea on the side table, the footstool, the magazine rack, the throw on her armchair.
  const sideTable = zone.placeAt(new SideTable({ radius: d.sideTable.radius, wood: 0x5a3a22, mug: null, covers: [] }), d.sideTable.at);
  placeWith(zone, sideTable, new Doily(0.2), new THREE.Vector3(0, sideTable.topHeight, 0));
  const tray = new TeaTray();
  tray.rotation.y = 0.4;
  placeWith(zone, sideTable, tray, new THREE.Vector3(0, sideTable.topHeight + DOILY_THICKNESS, 0));
  zone.placeAt(new Footstool(), d.footstool);
  zone.placeAt(new MagazineRack(), d.magazineRack);
  placeWith(zone, armchair, new CrochetThrow({ edge: ARMCHAIR_BACK.edge }), new THREE.Vector3(0, ARMCHAIR_BACK.y, ARMCHAIR_BACK.z));

  // The canary by the window, singing in its hours.
  const cage = zone.placeAt(new BirdCage(() => inHours(hours(), d.canaryHours)), d.birdCage);
  placeWith(zone, cage, pointSound(hearing, cage.song, { maxDistance: 9 }), cage.cageAt);

  // The dining table: its cloth, and on a Sunday lunch laid for two (else the fruit bowl), set as the player comes in.
  const cloth = placeWith(zone, table, new TableCloth({ width: PLAN.table.width, depth: PLAN.table.depth, top: table.topHeight }), new THREE.Vector3());
  const lunch = placeWith(zone, table, new SundayTable(d.lunch), new THREE.Vector3(0, cloth.topHeight, 0));

  // The loose boards; on the way in, the table for the day and the kettle on for a visitor by day.
  zone.place(new CreakyBoards(listener, d.creaks, () => ctx.memories?.filming ?? false), new THREE.Vector3());
  zone.place(
    new OnArrival(() => {
      // The camera coming back from a memory filmed elsewhere is no visit.
      if (ctx.memories?.filming) return;
      lunch.setSunday(weekdayOf(ctx.today.gameDay) === SUNDAY_WEEKDAY);
      if (inHours(hours(), d.kettleHours)) zone.after(KETTLE_AFTER, () => kettle.whistle());
    }),
    new THREE.Vector3(),
  );
  return { modern, table: cloth, kettle, tv };
}

/** Hears the player come in (the zone occupied), once a visit. */
class OnArrival extends Prop {
  private inside = false;

  constructor(private readonly arrived: () => void) {
    super();
    this.name = 'GrandmaDecorArrival';
  }

  setOccupied(occupied: boolean): void {
    if (occupied && !this.inside) this.arrived();
    this.inside = occupied;
  }
}
