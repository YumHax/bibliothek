import { STREET_PLAN } from '../street/streetPlan';

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

/** How many of the cars setting off are taxis (yellow, a lit sign on the roof), and their paint. */
export const TAXI = { share: 0.18, paint: 0xe8b820 } as const;

/**
 * How much busier than its waking level the road is at game hour `h`: the morning and evening rush
 * (1 the rest of the day). Cars come that much oftener on both pictures of the street.
 */
export function rushAt(h: number): number {
  const bump = (centre: number, width: number): number => Math.exp(-(((h - centre) / width) ** 2));
  return 1 + 0.9 * bump(8.25, 1.1) + 0.75 * bump(17.75, 1.3);
}
