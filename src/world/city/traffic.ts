import { gaussian } from '@/math/scalar';
import { STREET_PLAN } from '../street/streetPlan';
import type { Weekday } from '@/time/wakefulness';

/*
 * What the neighbourhood's traffic keeps to, read by both simulations of it: the walkable street's
 * (`street/traffic/`, 3D) and the window view's (`props/outdoors/LifeTraffic.ts`, sprites). Each
 * drives its own way; they agree on these.
 */

/** Cruising speeds, m/s: a car on the open road, the bus, the delivery van, the bin lorry on its round. */
export const CRUISE = { car: STREET_PLAN.traffic.speed, bus: 7, van: 7, lorry: 4 } as const;

/** Seconds the bus stands at its stop with the doors open. */
export const BUS_DWELL = STREET_PLAN.bus.stop.dwell;

/** Game hours the bin lorry does its morning round between. */
export const BIN_ROUND_HOURS = STREET_PLAN.binLorry.hours;

/**
 * How many of the cars setting off are taxis (yellow, a sign on the roof lit while it is free), by day and late at
 * night (`nightHours`, when the buses thin out), and their paint.
 */
export const TAXI = { share: 0.18, nightShare: 0.38, nightHours: [22, 5] as [number, number], paint: 0xe8b820 } as const;

/**
 * How much busier than its waking level the road is at game hour `h` on `weekday` (Monday 0 .. Sunday 6; none: a
 * weekday): on a weekday the morning and evening rush (1 the rest of the day); on Saturday no rush but a busy
 * shopping middle of the day; on Sunday a quiet road with a stir after lunch. Cars come that much oftener.
 */
export function rushAt(h: number, weekday: Weekday = 0): number {
  // Each rush is a bell down to 1/e at `width` hours from its centre (a standard deviation of width / √2).
  const rush = (centre: number, width: number): number => gaussian(h, centre, width / Math.SQRT2);
  if (weekday === 6) return 0.55 + 0.25 * rush(15.5, 2.5);
  if (weekday === 5) return 0.85 + 0.45 * rush(12.5, 3);
  return 1 + 0.9 * rush(8.25, 1.1) + 0.75 * rush(17.75, 1.3);
}
