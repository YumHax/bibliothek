import { STREET_PLAN, type Vec2 } from '../street/streetPlan';
import { COURTYARD, FLAT_IN_STREET, FRONT, KERB_HEIGHT, PARK_PARKING, PARK_STREET, STREET_ENDS, WORKS, WORKS_LIFT } from '@/world/measures/street';
import { frontWorksMoved } from '../street/details/roadworks';

/*
 * The neighbourhood's ground plan in the flat's frame: metres from the collection room's floor
 * centre (the painted view's eye), +z out of the front windows, -x out of the left ones. Worked out
 * from the walkable street's plan (`street/streetPlan.ts`) through `FLAT_IN_STREET`, so what the
 * window view paints (`props/outdoors/plan.ts`) stands where the player finds it down there.
 */

/** A zone-local point of the street in the flat's frame. */
export function inFlatFrame([x, z]: readonly [number, number]): Vec2 {
  return [x - FLAT_IN_STREET.x, z - FLAT_IN_STREET.z];
}

/** How far out of the front windows a line of Front Street (zone-local z) runs. */
const out = (z: number): number => z - FLAT_IN_STREET.z;
/** How far along Front Street (flat frame x) a zone-local x is. */
const along = (x: number): number => x - FLAT_IN_STREET.x;

/** The z where a car route runs along Front Street (its point at the street's x 0). */
function laneOf(route: readonly Vec2[]): number {
  const point = route.find(([x, z]) => x === 0 && Math.abs(z) < FRONT.farKerb);
  if (!point) throw new Error('[city] a traffic route does not run along Front Street');
  return point[1];
}

/** The x where a car route runs down Park Street (its point well south of Front Street). */
function parkLaneOf(route: readonly Vec2[]): number {
  const point = route.find(([x, z]) => z < FRONT.ourLine - 10 && x < PARK_STREET.line);
  if (!point) throw new Error('[city] a traffic route does not run along Park Street');
  return point[0];
}

/** How far to the right of the cars' line a rider keeps (the road's outer lane, towards the kerb). */
export const CYCLE_OFFSET = 2.2;

const [eastbound, westbound] = STREET_PLAN.traffic.routes as readonly Vec2[][];
if (!eastbound || !westbound) throw new Error('[city] Front Street needs its two traffic routes (streetPlan.traffic.routes)');
const farParked = STREET_PLAN.parked.find((car) => car.yaw === 0)!;
const nearParked = STREET_PLAN.parked.find((car) => car.yaw === Math.PI)!;

/**
 * Front Street's cross-section, metres out of the front windows: our building line (the front
 * wall's outer face), our kerb, the parking lines, the lane dashes, the centre line, the far kerb
 * and the far building line; where the cars drive each way (`nearLane` westbound, `farLane`
 * eastbound), where the riders ride, where the parked cars' middles stand, and the kerb's height.
 */
export const FRONT_SECTION = {
  ourLine: out(FRONT.ourLine),
  nearKerb: out(FRONT.nearKerb),
  nearParking: out(-STREET_PLAN.parkingLine),
  nearDash: out(-STREET_PLAN.laneDash),
  centre: out(0),
  farDash: out(STREET_PLAN.laneDash),
  farParking: out(STREET_PLAN.parkingLine),
  farKerb: out(FRONT.farKerb),
  farLine: out(FRONT.farLine),
  nearLane: out(laneOf(westbound)),
  farLane: out(laneOf(eastbound)),
  nearCycle: out(laneOf(westbound) - CYCLE_OFFSET),
  farCycle: out(laneOf(eastbound) + CYCLE_OFFSET),
  nearParked: out(nearParked.at[1]),
  farParked: out(farParked.at[1]),
  kerbHeight: KERB_HEIGHT,
} as const;

/**
 * Park Street's cross-section, x in the flat's frame (negative: out of the left windows): our
 * building line (the kitchen wing's outer face), our kerb, the far kerb, the park's hedge; where the
 * cars drive down it (`nearLane`, coming from Front Street) and up it (`farLane`).
 */
export const PARK_SECTION = {
  ourLine: along(PARK_STREET.line),
  nearKerb: along(PARK_STREET.nearKerb),
  farKerb: along(PARK_STREET.farKerb),
  hedge: along(PARK_STREET.hedge),
  nearLane: along(parkLaneOf(westbound)),
  farLane: along(parkLaneOf(eastbound)),
} as const;

/** Where the buildings standing across the streets' far ends are: Front Street's at x `front`, Park Street's at z -`park`. */
export const STREET_END = { front: along(STREET_ENDS.east), park: -out(STREET_ENDS.south) } as const;

/** Our block's courtyard: the neighbour's wing at x `east`, the rear building across its back at z -`back`. */
export const COURT = { east: along(COURTYARD.east), back: -out(COURTYARD.far) } as const;

/** The bus stop on Front Street's far pavement: the shelter's middle, and where the bus pulls up. */
export const BUS_STOP = { shelter: inFlatFrame(STREET_PLAN.shelter.at), stop: inFlatFrame(STREET_PLAN.bus.stop.at) } as const;

/** The pedestrian crossings over Front Street (x from, x to), the one with lights flagged. */
export const CROSSINGS = STREET_PLAN.crossings.map((c) => ({ from: along(c.from), to: along(c.to), signals: c.signals }));

/** The signalled crossing's two posts (our kerb's, the far kerb's), and how far before it the stop lines are. */
export const SIGNAL_POSTS = STREET_PLAN.signals.posts.map((post) => inFlatFrame(post.at));
export const STOP_LINE = STREET_PLAN.stopLine;

/** The litter bins on the pavements, and the bike racks (the way each faces, how many bikes are locked to it). */
export const STREET_BINS = STREET_PLAN.bins.map(inFlatFrame);
export const BIKE_RACKS = STREET_PLAN.bikes.racks.map((rack) => ({ at: inFlatFrame(rack.at), yaw: rack.yaw, bikes: rack.bikes }));

/** The street lamps, and the way each arm reaches (0 = +z: our side's, which reach out over the road). */
export const STREET_LAMPS = STREET_PLAN.lamps.map((lamp) => ({ at: inFlatFrame(lamp.at), yaw: lamp.yaw, design: lamp.design ?? ('arm' as const) }));
/** The lamp heads' height over the pavement. */
export const LAMP_HEIGHT = STREET_PLAN.lampHeight;

/** How far out of the front windows the delivery van stands while double-parked (on the far lane's side of the road). */
export const DELIVERY_OUT = out(STREET_PLAN.delivery.at[1]);

/**
 * The strings of lights slung across Front Street at Christmas: where each crosses (x), how high
 * its ends are made fast, how far it sags and the spacing of its bulbs (`STREET_PLAN.decor`).
 */
export const LIGHT_STRINGS = STREET_PLAN.decor.flatMap((entry) =>
  entry.kind === 'fairyLights' && 'floor' in entry.at
    ? [{ x: along(entry.at.floor[0]), height: entry.options?.height ?? 0, sag: entry.options?.sag ?? 0, spacing: entry.options?.spacing ?? 0 }]
    : [],
);

/** Something standing on the pavement: where, and the way it faces (yaw 0 = +z, the plan's). */
interface PlacedThing {
  at: Vec2;
  yaw: number;
}

/** The benches and the newsstand. */
export const BENCHES: readonly PlacedThing[] = STREET_PLAN.benches.map((bench) => ({ at: inFlatFrame(bench.at), yaw: bench.yaw }));
export const KIOSK: PlacedThing = { at: inFlatFrame(STREET_PLAN.kiosk.at), yaw: STREET_PLAN.kiosk.yaw };

/** The café and bar terraces: from x to x along the line of their tables (z), all on Front Street's pavements. */
export const TERRACES = STREET_PLAN.terraces.map((terrace) => {
  const [x0, z] = inFlatFrame(terrace.from);
  const [x1] = inFlatFrame(terrace.to);
  return { from: Math.min(x0, x1), to: Math.max(x0, x1), z };
});

/** The street's small print: manhole covers, hydrants, bollards, the Morris column. */
export const STREET_DETAILS = {
  manholes: STREET_PLAN.details.manholes.map(inFlatFrame),
  hydrants: STREET_PLAN.details.hydrants.map(inFlatFrame),
  bollards: STREET_PLAN.details.bollards.map(inFlatFrame),
  column: { ...STREET_PLAN.details.column, at: inFlatFrame(STREET_PLAN.details.column.at) },
} as const;

/** Where a span across a street runs (low, high), in the flat's frame. */
type Span = readonly [number, number];
const span = (a: number, b: number): Span => [Math.min(a, b), Math.max(a, b)];

/**
 * The two roadworks closing the walkable street now (`street/details/roadworks` `closures()`: Front Street's move on
 * past the first stretch after a fortnight of market days): across Front Street at x `front.x` (spans in z), across
 * Park Street at z `park.z` (spans in x); a hoarding over each pavement, barriers over the parking lanes, the traffic
 * lanes between them open to a roadworker.
 */
export function roadworks() {
  return {
    front: {
      x: along(frontWorksMoved() ? WORKS_LIFT.front : WORKS.front),
      pavements: [span(out(FRONT.ourLine), out(FRONT.nearKerb)), span(out(FRONT.farKerb), out(FRONT.farLine))],
      parking: [span(out(FRONT.nearKerb), out(-STREET_PLAN.parkingLine)), span(out(STREET_PLAN.parkingLine), out(FRONT.farKerb))],
    },
    park: {
      z: out(WORKS.park),
      pavements: [span(along(PARK_STREET.line), along(PARK_STREET.nearKerb)), span(along(PARK_STREET.farKerb), along(PARK_STREET.hedge))],
      parking: [span(along(PARK_STREET.nearKerb), along(PARK_STREET.nearKerb - PARK_PARKING)), span(along(PARK_STREET.farKerb + PARK_PARKING), along(PARK_STREET.farKerb))],
    },
  } as const;
}
