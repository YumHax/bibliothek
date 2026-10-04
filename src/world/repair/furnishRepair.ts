import * as THREE from 'three';
import { getPlatform } from '@/catalog/platforms';
import { FAULTS, REPAIR, brokenOf } from '@/repair/consoles';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { BuildContext, ClassifiedsContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import type { Placer } from '../build/owned';
import { presentWhile } from '../build/presence';
import { placeWith } from '../zone/attach';
import { Crate } from '../props/Crate';
import { ConsoleProp } from './ConsoleProp';
import { CounterCard } from './CounterCard';
import { REPAIR_PLAN } from './repairPlan';
import { dayStream } from '@/time/daily';
import { formatCoins } from '@/text/money';

/**
 * The kitchen's part in mending consoles (docs/household.md "Repairing a console"): whatever console the player bought
 * broken sits on a kitchen chair by the table (once the table is bought, the bench being its top), the next broken
 * one first, else a mended one waiting to be sold; a click opens the repair on the table (`RepairPanel`), or says the
 * mended one goes to TV REPAIR.
 */
export function furnishKitchenRepair(zone: Zone, classifieds: ClassifiedsContext, parts: { chair: THREE.Object3D; furnished: Placer }): void {
  const { workshop, repairPanel } = classifieds;
  const shown = () => workshop.nextBroken ?? workshop.working[0] ?? null;
  const prop = new ConsoleProp({
    label: () => {
      const next = shown();
      if (!next) return null;
      const name = getPlatform(next.platform).shortName;
      return next.fixed ? `The ${name} you mended · for TV REPAIR` : `A broken ${name} · open it up on the table`;
    },
    use: (session) => {
      const next = shown();
      if (!next) return;
      if (next.fixed) {
        session.react(`It works. TV REPAIR on Park Street buys working consoles: take it to the counter there.`);
        return;
      }
      repairPanel.prepare(next);
      session.openPanel(repairPanel);
    },
  });
  const refresh = (): void => {
    const next = shown();
    prop.show(next ? getPlatform(next.platform) : null, next?.fixed ? 'WORKS!' : 'TO FIX');
  };
  parts.furnished.onOwned(() => {
    const [x, y, z] = REPAIR_PLAN.kitchenChair.at;
    prop.rotation.y = REPAIR_PLAN.kitchenChair.yaw;
    placeWith(zone, parts.chair, prop, new THREE.Vector3(x, y, z));
    refresh();
    presentWhile(zone, prop, () => shown() !== null, (cb) => workshop.subscribe(cb));
    zone.onUnload(workshop.subscribe(refresh));
  });
}

/**
 * TV REPAIR's part (docs/household.md "Repairing a console"): the crate of spares-or-repair inside the door, a broken
 * console on it some game days (`REPAIR.crateOdds`, one a day), and the card on the counter that opens the desk where
 * the repairer buys working consoles back (`ConsoleDeskPanel`).
 */
export function furnishRepairCorner(zone: Zone, ctx: Pick<BuildContext, 'classifieds' | 'today' | 'home'>, counter: THREE.Object3D): void {
  const classifieds = ctx.classifieds;
  if (!classifieds) return;
  const { workshop } = classifieds;
  const plan = REPAIR_PLAN.tvShop;
  const crate = zone.placeAt(new Crate(plan.crate.options), plan.crate.at);
  placeWith(zone, counter, new CounterCard({ lines: ['WE BUY', 'working consoles'], open: (session) => session.openPanel(classifieds.consoleDesk) }), new THREE.Vector3(...plan.card));

  // Today's console in the crate, drawn from the game day.
  const day = ctx.today.gameDay;
  const rng = dayStream(`${day}:repairCrate`);
  if (rng() >= REPAIR.crateOdds) return;
  const platform = PLATFORM_LIST[Math.floor(rng() * PLATFORM_LIST.length)]!.id;
  const offer = brokenOf(platform, rng(), rng());
  const name = getPlatform(platform).shortName;
  const prop = new ConsoleProp({
    label: () => `A broken ${name}, sold as seen · ${formatCoins(offer.price)}`,
    use: (session) => {
      if (!hasBench(ctx)) {
        session.refuse(NO_BENCH);
        return;
      }
      session.buyUpgrade({
        title: `A broken ${name}`,
        price: offer.price,
        detail: `“${FAULTS[offer.fault].symptom}” It waits on a kitchen chair at home: open it up at the kitchen table, then bring it back working.`,
        bought: () => {
          workshop.add({ platform, fault: offer.fault, paid: offer.price, from: 'TV REPAIR’s crate' });
          workshop.markCrate(day);
        },
      });
    },
  });
  prop.show(getPlatform(platform), 'SOLD AS\nSEEN');
  placeWith(zone, crate, prop, new THREE.Vector3(0, plan.crate.options.height, 0));
  presentWhile(zone, prop, () => !workshop.crateBought(day), (cb) => workshop.subscribe(cb));
}

/** Said when a broken console is offered and the flat has no kitchen table yet (the bench it is mended on). */
export const NO_BENCH = 'Nowhere to open it up at home yet: a console is mended on the kitchen table (SECOND HOME sells one).';

/** Whether the flat has its kitchen table: a broken console waits by it and is mended on it (`furnishKitchenRepair`). */
export function hasBench(ctx: Pick<BuildContext, 'home'>): boolean {
  return ctx.home.upgrades?.has('kitchenTable') ?? true;
}
