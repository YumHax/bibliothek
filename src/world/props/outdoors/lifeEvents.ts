/**
 * What the street is doing that can be heard, read by `StreetAmbience` every frame. Counters only
 * ever go up: a listener remembers the last value it saw and reacts when it changes. Positions are
 * metres from the eye in the panorama's frame (x along Front Street, z out of the front wall).
 */
export interface LifeEvents {
  /** The bus pulling up at the shelter (air brakes), and pulling away. */
  busStops: number;
  busDepartures: number;
  /** A dog out with its walker barked; where the last one was. */
  barks: number;
  bark: { x: number; z: number };
  /** The ambulance, while it is on the streets: where it is, its siren on. */
  siren: { active: boolean; x: number; z: number };
  /** The dustcart: out on its round, and working (stopped, the compactor running) right now. */
  garbage: { active: boolean; working: boolean; x: number; z: number };
  garbageWorking: boolean;
  /** The park's fountain is playing. */
  fountain: boolean;
}

/** A quiet street: nothing heard yet. */
export function quietStreet(): LifeEvents {
  return {
    busStops: 0,
    busDepartures: 0,
    barks: 0,
    bark: { x: 0, z: 0 },
    siren: { active: false, x: 0, z: 0 },
    garbage: { active: false, working: false, x: 0, z: 0 },
    garbageWorking: false,
    fountain: false,
  };
}
