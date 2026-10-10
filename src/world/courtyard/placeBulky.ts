import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { Furniture } from '../Furniture';
import type { BuildContext } from '../buildContext';
import type { Vec2 } from '../street/streetPlan';
import { getPlatform } from '@/catalog/platforms';
import { homeGood } from '@/economy/homeGoods';
import { StockItem } from '@/economy/StockItem';
import { FAULTS } from '@/repair/consoles';
import { bulkyTaken, takeFromBulky, type BulkyLot } from '@/building/bulkyWaste';
import { Prop } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { ForSaleBox } from '../market/ForSaleBox';
import { ConsoleProp } from '../repair/ConsoleProp';
import { NO_BENCH, hasBench } from '../repair/furnishRepair';
import { COURTYARD_PLAN } from './courtyardPlan';
import { cartonModel, junkModel, pieceModel, signModel, type PileModel } from './bulkyModels';

type BulkyContext = Pick<BuildContext, 'covers' | 'collection' | 'money' | 'market' | 'notices' | 'home' | 'classifieds'>;

/** Where a find off the pile comes from, for the receipt. */
const WHERE = 'the bulky waste in the courtyard';

/** A pile model the player can carry off: its caption and click are the builder's. */
class PileThing extends UsableProp {
  constructor(use: UseOptions, model: PileModel) {
    super(use);
    this.name = 'PileThing';
    this.add(model.object);
    const [w, h, d] = model.size;
    this.target(w, h, d, { y: h / 2 });
  }
}

/** What stops the player walking into the pile (the wall side of it): one box, nothing drawn. */
class PileBounds extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  readonly colliders: THREE.Box3[];

  constructor(area: { x0: number; x1: number; z0: number; z1: number }) {
    super();
    this.name = 'PileBounds';
    this.colliders = [new THREE.Box3(new THREE.Vector3(area.x0, 0, area.z0), new THREE.Vector3(area.x1, 1.2, area.z1))];
  }
}

/**
 * Lays bulky-waste day's pile out by the bins (`COURTYARD_PLAN.bulky`, `building/bulkyWaste`): the junk along the rear
 * building's wall, the owner's sign, the piece of furniture (a click carries it up to the flat: `HomeUpgrades.add`),
 * the console that does not switch on (a click takes it to the kitchen chair: `Workshop.add`), and the carton of loose
 * games (each a free `ForSaleBox`, as the cellars' finds). What was carried off is not laid out again that day. Returns
 * what it placed (the games come later, once the stock has drawn them, and are pushed onto the same list).
 */
export function placeBulky(zone: Zone, ctx: BulkyContext, lot: BulkyLot, at: (p: Vec2, y?: number) => THREE.Vector3): Furniture[] {
  const plan = COURTYARD_PLAN.bulky;
  const placed: Furniture[] = [];
  // `zone.isLoaded` stays true once the yard's code is fetched: only this says the yard went away before the games came.
  let unloaded = false;
  zone.onUnload(() => {
    unloaded = true;
  });
  const put = <F extends Furniture>(item: F, position: THREE.Vector3, yaw = 0): F => {
    placed.push(item);
    return zone.place(item, position, yaw);
  };
  const street = at([0, 0]).clone();
  put(new PileBounds(plan.area), street);

  lot.junk.forEach((kind) => {
    const spot = plan.junk[kind];
    const junk = new Prop();
    junk.name = `Junk:${kind}`;
    junk.add(junkModel(kind).object);
    put(junk, at(spot.at), spot.yaw);
  });
  const sign = new Prop();
  sign.name = 'PileSign';
  sign.add(signModel(lot.owner.name).object);
  put(sign, at(plan.sign.at), plan.sign.yaw);

  const { notices } = ctx;
  const upgrades = ctx.home.upgrades;
  if (lot.piece && upgrades && !bulkyTaken(lot.day, 'piece')) {
    const piece = lot.piece;
    const good = homeGood(piece);
    const name = good.name.toLowerCase();
    const thing: PileThing = put(
      new PileThing(
        {
          label: () => `A ${name}, put out for the lorry · carry it home`,
          use: (session) => {
            if (!upgrades.canBuy(piece)) {
              session.refuse(`No room for another ${name} at home.`);
              return;
            }
            upgrades.add(piece);
            takeFromBulky(lot, 'piece');
            zone.remove(thing);
            notices.reward({ title: `A ${name}, free`, detail: `Carried up from the courtyard. ${lot.owner.name} waves from a window.` });
          },
        },
        pieceModel(piece),
      ),
      at(plan.piece.at),
      plan.piece.yaw,
    );
  }

  const workshop = ctx.classifieds?.workshop;
  if (lot.console && workshop && !bulkyTaken(lot.day, 'console')) {
    const { platform, fault } = lot.console;
    const console_ = getPlatform(platform);
    const prop: ConsoleProp = put(
      new ConsoleProp({
        label: () => `A ${console_.shortName} that won’t switch on · take it`,
        use: (session) => {
          if (!hasBench(ctx)) {
            session.refuse(NO_BENCH);
            return;
          }
          workshop.add({ platform, fault, paid: 0, from: `${lot.owner.name}’s clear-out` });
          takeFromBulky(lot, 'console');
          zone.remove(prop);
          notices.reward({ title: `A broken ${console_.shortName}, free`, detail: `“${FAULTS[fault].symptom}” It waits on a kitchen chair at home.` });
        },
      }),
      at(plan.console.at),
      plan.console.yaw,
    );
    prop.show(console_, 'BROKEN');
  }

  // The carton, and its games once drawn (the same ones all day: seeded by the day).
  const carton = cartonModel();
  const box = new Prop();
  box.name = 'GamesCarton';
  box.add(carton.object);
  const cartonAt = at(plan.carton.at);
  put(box, cartonAt, plan.carton.yaw);
  void ctx.market.stock
    .randomGames(`bulky:${lot.day}`, lot.games + 4)
    .catch(() => [])
    .then((games) => {
      if (unloaded || !placed.includes(box)) return;
      // A game taken today is owned now: it keeps its slot (skipped below), or the next one would move in after it.
      const left = games.filter((g) => bulkyTaken(lot.day, `game:${g.id}`) || !ctx.collection.owns(g.id)).slice(0, lot.games);
      left.forEach((game, i) => {
        if (bulkyTaken(lot.day, `game:${game.id}`)) return;
        const item = new StockItem(game, 'worn', 'bin', { list: 0, final: true });
        const find = new ForSaleBox(item, ctx.covers, {
          pose: { kind: 'flat' },
          tag: false,
          wallet: ctx.money.wallet,
          where: WHERE,
          free: true,
          isWanted: () => ctx.collection.isWanted(game.id),
          thanks: () => `Out of ${lot.owner.name}’s cupboard.`,
        });
        find.onSold = () => {
          zone.remove(find);
          takeFromBulky(lot, `game:${game.id}`);
        };
        const [dx, dz] = plan.games[i % plan.games.length]!;
        const local = new THREE.Vector3(dx, carton.top + i * 0.028, dz).applyAxisAngle(UP, plan.carton.yaw).add(cartonAt);
        put(find, local, plan.carton.yaw + (i % 2 ? 0.25 : -0.2));
      });
    });
  return placed;
}

const UP = new THREE.Vector3(0, 1, 0);
