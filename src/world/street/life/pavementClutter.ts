import { STREET_PLAN, type Vec2 } from '../streetPlan';
import type { Clear } from './crowdTrips';

/**
 * What stands on the pavements, from the plan, as discs a window-shopper does not stop in (`crowdTrips.windowStops`):
 * the terraces' tables, what the shops put out, the busker's pitch, the trader's and the garage sale's tables, the
 * giveaway box's spots, the queues, the benches, bins, kiosk, shelter and its pole, the bike racks, lamps, trees,
 * hydrants, bollards and the Morris column, the snowman, the standing people's spots, the groups'.
 */
export function pavementClutter(): Clear[] {
  const plan = STREET_PLAN;
  const clear: Clear[] = [];
  const add = (at: Vec2, r: number): void => {
    clear.push({ at, r });
  };
  for (const t of plan.terraces) {
    const [x0, z] = t.from;
    const [x1] = t.to;
    for (let x = Math.min(x0, x1) - 0.6; x <= Math.max(x0, x1) + 0.6; x += 0.8) add([x, z], 1.0);
  }
  for (const s of plan.shopSpill) add(s.at, 1.0);
  add(plan.busker.at, 1.6);
  add(plan.trader.at, 1.8);
  add(plan.garageSale.at, 1.6);
  for (const g of plan.giveaway.spots) add(g.at, 0.9);
  for (const q of plan.retroLure.queue) add(q, 0.7);
  for (const q of plan.shopQueues) for (let i = 0; i < q.spots + 1; i++) add([q.door[0] + q.dir * (0.75 + i * 0.65), q.z], 0.8);
  for (const b of plan.benches) add(b.at, 1.2);
  for (const b of plan.bins) add(b, 0.6);
  add(plan.kiosk.at, 2.2);
  add(plan.shelter.at, plan.shelter.length / 2 + 0.6);
  add(plan.busRide.pole.at, 0.6);
  for (const r of plan.bikes.racks) add(r.at, 1.2);
  for (const l of plan.lamps) add(l.at, 0.5);
  for (const t of plan.trees) add(t, 0.9);
  for (const h of plan.details.hydrants) add(h, 0.5);
  for (const b of plan.details.bollards) add(b, 0.4);
  add(plan.details.column.at, plan.details.column.radius + 0.6);
  add(plan.snowman.at, 1.0);
  add(plan.standing.phone.at as Vec2, 1.8);
  add(plan.standing.bench.at as Vec2, 1.2);
  add(plan.standing.busStop.at as Vec2, 1.0);
  for (const b of plan.standing.busQueue) add(b, 0.8);
  for (const l of plan.loiterers) for (const at of l.at) add(at, 0.9);
  add(plan.mansionBell.at, 0.6);
  for (const p of plan.signals.posts) add(p.at, 0.5);
  return clear;
}
