import { COURTYARD, FLAT_IN_STREET, FRONT, KERB_HEIGHT, PARK_STREET, STREET_ENDS, STREET_PLAN, type Vec2 } from '../street/streetPlan';

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

/** How far to the right of the cars' line a rider keeps (the road's outer lane, towards the kerb). */
export const CYCLE_OFFSET = 2.2;

const [eastbound, westbound] = STREET_PLAN.traffic.routes as readonly Vec2[][];
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
 * building line (the kitchen wing's outer face), our kerb, the far kerb, the park's hedge.
 */
export const PARK_SECTION = {
  ourLine: along(PARK_STREET.line),
  nearKerb: along(PARK_STREET.nearKerb),
  farKerb: along(PARK_STREET.farKerb),
  hedge: along(PARK_STREET.hedge),
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
export const STREET_LAMPS = STREET_PLAN.lamps.map((lamp) => ({ at: inFlatFrame(lamp.at), yaw: lamp.yaw }));
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
