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
