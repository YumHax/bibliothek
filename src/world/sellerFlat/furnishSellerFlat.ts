import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { getPlatform } from '@/catalog/platforms';
import type { Ad } from '@/classifieds/ads';
import { SellerDealer } from '@/classifieds/dealer';
import type { ConsoleOffer } from '@/classifieds/sellerLot';
import type { StockItem } from '@/economy/StockItem';
import { FAULTS } from '@/repair/consoles';
import { playBoxClack } from '@/audio/boxClack';
import type { BuildContext, ClassifiedsContext, ZoneHandle } from '../buildContext';
import type { Furniture } from '../Furniture';
import type { Zone } from '../zone/Zone';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { curtainsToSkylight } from '../build/follow';
import { placeWith } from '../zone/attach';
import { placeDecor } from '../props/decor';
import { Prop, disposeTree } from '../props/Prop';
import { TravelDoor } from '../travel/TravelDoor';
import { RoomWindow } from '../props/Window';
import { KitchenTable } from '../kitchen/KitchenTable';
import { Chair } from '../kitchen/Chair';
import { Seat } from '../Seat';
import { Cushion } from '../props/Cushion';
import { Sideboard } from '../props/Sideboard';
import { Crate } from '../props/Crate';
import { PortableTv } from '../shop/shopModels';
import { ForSaleBox } from '../market/ForSaleBox';
import { ConsoleProp } from '../repair/ConsoleProp';
import { NO_BENCH, hasBench } from '../repair/furnishRepair';
import { NoteCard } from './NoteCard';
import { Seller } from './Seller';
import { SELLER_TALK } from './sellerTalk';
import { SELLER_FLAT_PLAN as PLAN } from './sellerFlatPlan';

/** A copy on the seller's table: a market box whose haggle and sale are the seller's own (`ForSaleLike.dealer`). */
class SellerBox extends ForSaleBox {
  dealer?: SellerDealer;
}

/** Seconds after the player is in before the seller says hello (the curtain is still lifting). */
const GREET_AFTER = 1;

/**
 * Builds the seller's flat (docs/economy.md "Small ads and the seller's flat"): a living room in Park Corner Mansions,
 * its window on Front Street, the landing door back down. Who lives here is whoever's ad the player was let up to
 * (`Classifieds.host`): a `Visit` dresses the room for them each time the host changes (the zone may wake up dormant,
 * kept from an earlier visit): their kind's things (`SELLER_FLAT_PLAN.decorBy`), the seller behind the dining table,
 * their lot on it once drawn (market boxes whose haggle and sale go through the seller, `SellerDealer`), their broken
 * console on the box of spares, a scripted ad's note on the sideboard.
 */
export function furnishSellerFlat(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener } = ctx;
  const room = furnishShell(zone, sky, PLAN.room);
  placeRoomLight(zone, room, 'pendant', PLAN.pendant, PLAN.lightSwitch);
  zone.placeAt(new TravelDoor({ style: 'panelled', label: 'Front Street · go out', to: 'street', leafColor: 0x5a3a2a }), PLAN.exit);
  const windows: RoomWindow[] = [];
  const { wall, along, width, height } = PLAN.window;
  windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { width, height, sunlight: false, onCurtainsChange: curtainsToSkylight(room, windows) }), { wall, along, y: RoomWindow.mountY(height) }));

  // The living corner: two armchairs facing the set on the sideboard.
  const sideboard = zone.placeAt(new Sideboard({ width: 1.4 }), PLAN.sideboard.at);
  placeWith(zone, sideboard, new PortableTv({ width: 0.3, case: 0x4a4a4e }), new THREE.Vector3(PLAN.tvAt, sideboard.topHeight, 0));
  for (const at of PLAN.armchairs) {
    const seat = new Seat();
    seat.mountCushion(new Cushion({ color: 0x8fa383, tilt: 0.15 }));
    zone.placeAt(seat, at);
  }
  // The dining table and its chairs, the box of spares by the window.
  const table = zone.placeAt(new KitchenTable({ width: PLAN.table.width, depth: PLAN.table.depth, breakfast: false, wood: 0x8a6440, paint: 0x6a4a32 }), PLAN.table.at);
  for (const at of PLAN.chairs) zone.placeAt(new Chair(), at);
  const spares = zone.placeAt(new Crate(PLAN.spares.crate), PLAN.spares.at);
  furnishDecor(zone, { listener, acoustics: ctx.acoustics }, PLAN.decor);

  const classifieds = ctx.classifieds;
  if (classifieds) zone.place(new Visit(zone, ctx, classifieds, { table, sideboard, spares }), new THREE.Vector3());
  return { room };
}

/** What the visit's things stand on. */
interface Hosts {
  table: KitchenTable;
  sideboard: Sideboard;
  spares: Crate;
}

/**
 * Who is in the flat: ticked only while the zone is active, it lays out the host's things the first frame it sees a
 * host it has not dressed the room for, taking the last one's away (`zone.remove` and freed).
 */
class Visit extends Prop implements Updatable {
  private shown: string | null = null;
  private readonly placed = new Set<Furniture>();
  private generation = 0;

  constructor(private readonly zone: Zone, private readonly ctx: BuildContext, private readonly classifieds: ClassifiedsContext, private readonly hosts: Hosts) {
    super();
    this.name = 'SellerVisit';
    zone.onUnload(() => this.generation++);
  }

  update(): void {
    const ad = this.classifieds.book.host;
    if ((ad?.id ?? null) === this.shown) return;
    this.takeDown();
    this.shown = ad?.id ?? null;
    if (ad) this.dress(ad);
  }

  private takeDown(): void {
    this.generation++;
    for (const item of this.placed) {
      this.zone.remove(item);
      item.dispose?.();
      disposeTree(item);
    }
    this.placed.clear();
  }

  private place<F extends Furniture>(item: F): F {
    this.placed.add(item);
    return item;
  }

  private dress(ad: Ad): void {
    const { zone, ctx, classifieds, hosts } = this;
    const { book } = classifieds;
    const generation = this.generation;
    for (const item of placeDecor(zone, PLAN.decorBy[ad.kind])) this.place(item);

    // The seller, behind the table, says hello once the player is in.
    const talk = SELLER_TALK[ad.kind];
    const [sx, sz] = PLAN.seller.at;
    const seller = this.place(zone.place(new Seller({ viewer: ctx.listener, seed: ad.seed % 997, name: ad.name, talk }), new THREE.Vector3(sx, 0, sz), PLAN.seller.yaw));
    seller.stand(PLAN.seller.yaw, ad.kind === 'collector' ? 'crossed' : 'stand', 'viewer');
    window.setTimeout(() => {
      if (this.generation === generation) seller.greet(ad.scripted?.greeting);
    }, GREET_AFTER * 1000);

    // A scripted ad's note on the sideboard (a quest's clue).
    const clue = ad.scripted?.clue;
    if (clue) this.place(placeWith(zone, hosts.sideboard, new NoteCard(clue), new THREE.Vector3(PLAN.sideboard.clueAt[0], hosts.sideboard.topHeight, PLAN.sideboard.clueAt[1])));

    // The lot, once drawn: market boxes on the table, the seller's rules behind them.
    const dealer = new SellerDealer(ad, book, () => ctx.today.gameDay);
    const where = `${ad.name}’s flat (a small ad)`;
    const onTable = new Set<SellerBox>();
    const lay = (item: StockItem, spot: readonly [number, number]): void => {
      const box = new SellerBox(item, ctx.covers, {
        pose: { kind: 'flat' },
        wallet: ctx.money.wallet,
        isWanted: () => ctx.collection.isWanted(item.game.id),
        where,
        thanks: () => seller.thanks(),
        react: (reaction) => {
          if (reaction === 'pickUp' || reaction === 'putBack') playBoxClack(reaction === 'putBack');
          seller.reactTo(reaction);
        },
        speak: (line) => seller.speak(line),
      });
      box.dealer = dealer;
      box.onSold = () => {
        onTable.delete(box);
        this.placed.delete(box);
        zone.remove(box);
        box.dispose();
        if (!onTable.size) seller.speak(talk.cleared);
      };
      // Handed back at once (U): a fresh box of the same copy where it lay.
      box.restock = () => {
        if (this.generation === generation) lay(item, spot);
      };
      onTable.add(box);
      hosts.table.updateMatrixWorld(true);
      this.place(zone.place(box, zone.toLocal(hosts.table.localToWorld(new THREE.Vector3(spot[0], hosts.table.topHeight, spot[1]))), hosts.table.rotation.y));
    };
    void classifieds.lot(ad).then((lot) => {
      if (this.generation !== generation) return;
      const items = lot.items.filter((item) => !ctx.collection.owns(item.game.id) && !book.boughtFrom(ad.id).includes(item.game.id));
      items.slice(0, PLAN.spots.length).forEach((item, i) => {
        const agreed = book.haggleOf(ad.id, item.game.id);
        if (agreed !== undefined) item.setHaggle(agreed);
        lay(item, PLAN.spots[i]!);
      });
      if (lot.console && !book.consoleSold(ad.id)) this.placeConsole(ad, lot.console, seller);
    });
  }

  /** The seller's broken console on the box of spares: a click buys it (it goes home, to the kitchen). */
  private placeConsole(ad: Ad, offer: ConsoleOffer, seller: Seller): void {
    const { zone, classifieds, hosts } = this;
    const platform = getPlatform(offer.platform);
    const fault = FAULTS[offer.fault];
    const talk = SELLER_TALK[ad.kind];
    let pitched = false;
    const prop: ConsoleProp = new ConsoleProp({
      label: () => `A broken ${platform.shortName} · ${offer.price} coins`,
      use: (session) => {
        if (!pitched) {
          pitched = true;
          seller.speak(`${talk.console.pitch} “${fault.symptom}”`);
        }
        if (!hasBench(this.ctx)) {
          session.refuse(NO_BENCH);
          return;
        }
        session.buyUpgrade({
          title: `A broken ${platform.shortName}`,
          price: offer.price,
          detail: `It waits on a kitchen chair at home: open it up at the kitchen table.\nTV REPAIR on Park Street buys working consoles.`,
          bought: () => {
            classifieds.workshop.add({ platform: offer.platform, fault: offer.fault, paid: offer.price, from: `${ad.name}’s flat` });
            classifieds.book.recordConsole(ad.id);
            seller.speak(talk.console.sold);
            this.placed.delete(prop);
            zone.remove(prop);
            prop.dispose();
          },
        });
      },
    });
    prop.show(platform, 'SPARES OR\nREPAIR');
    this.place(placeWith(zone, hosts.spares, prop, new THREE.Vector3(0, PLAN.spares.crate.height, 0)));
  }
}
