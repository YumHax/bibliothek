import type { Vec2 } from '@/world/measures/street';

/*
 * FRONT STREET'S PLACES AND EVENTS, zone-local like `STREET_PLAN` (docs/zones.md "The street"): the post box and the
 * phone box, the park's gardens (the ducks on the pond's near bank, the wish over the fence, Sunday's concert on the
 * lawn, the kids at the playground), the Grand Flea Fair's stalls on the pavements, the Christmas stall and the doors
 * that answer on Halloween. Kept out of `streetPlan.ts` so what happens there and what stands there can be read alone;
 * every spot is clear of the crowd's lanes (z about ±10.1..10.6) and of `STREET_PLAN`'s fixtures.
 */

/** A spot on the ground and the way its front (local +z) faces. */
interface PlaceSpot {
  at: Vec2;
  yaw: number;
}

/** A residents' door that answers a knock on Halloween's evenings: its middle on the facade, the way out of it. */
export interface HalloweenDoor extends PlaceSpot {
  id: string;
  /** Who answers, for the line in the bubble ("Mrs Ward at number 4"). */
  who: string;
  /** Only once the roadworks have moved on and the stretch it is on can be walked (`frontWorksMoved`). */
  opened?: boolean;
}

export const STREET_PLACES = {
  /**
   * The pillar box on our pavement's kerb side, between the bin by the arcade and the florist's lamp (its slot facing
   * the building line, where people walk), and the phone box on the far pavement's kerb, west of the crossing's
   * bollards (its door to the pavement).
   */
  postBox: { at: [22.2, -8.95], yaw: Math.PI } as PlaceSpot,
  phoneBox: { at: [-2.7, 9.15], yaw: 0 } as PlaceSpot,
  /**
   * Now and then the phone box rings (`PhoneBox`): every `every` s or so while the street is walked, for up to `for` s,
   * a double ring each `bell` s; picked up, somebody who dialled the wrong number (one of `wrongNumbers`).
   */
  phoneRings: {
    every: [240, 520] as const,
    for: 24,
    bell: 3,
    wrongNumbers: [
      '“Is that Pizza Roma? … No? Then who orders forty pizzas from a phone box?” Click.',
      '“Is Kevin there? Tell him his mum says tea’s ready.”',
      'Heavy breathing, then a tiny chiptune played down the line. Somebody hangs up laughing.',
      '“This is a recorded message: you have won a holiday for two. Press—” You hang up.',
      '“Hello? Is that the launderette? Machine 4 ate my jumper.” Click.',
    ] as readonly string[],
    /**
     * The calls that are not quite wrong numbers: once, an old friend of Félix's asking for him (Mémé knows who:
     * `grandma/storyLines` 'roger'); while the trail is on the collector (`StoryStage` 'arcade'), somebody arranging
     * to swap old carts outside RETRO GAMES.
     */
    felix: '“Félix? Félix, is that you? … No? It’s Roger. From the radio shop, years ago. He hasn’t rung me in months… Oh. Oh, I see. I didn’t know. I’m so sorry, love.” A long breath. “Tell Odette I rang, would you?” Click.',
    collector: '“I’ve got the cartridges. The Hana box, the lot. Same place, same time: outside RETRO GAMES.” Click. Somebody is selling old carts on Front Street.',
  },

  /** The park's gardens (`PARK_WALK`): what the player does there. */
  park: {
    /**
     * The pond's near bank over the hoop fence (x -85, the pond's kerb 2.7 m beyond it): where the ducks are fed and a
     * coin is tossed; `length` along the fence (z).
     */
    bank: { at: [-85.25, -40.3] as Vec2, length: 9 },
    /** The ducks: how many, where they paddle about (a box of the pond's water, x0..x1, z0..z1), how close they come when fed. */
    ducks: { count: 5, water: { x0: -101, x1: -90, z0: -50, z1: -31 }, fedAt: [-89.6, -40.3] as Vec2 },
    /**
     * Sunday afternoons' concert on the lawn by the path from the gate (the bandstand's boards are not to be trusted,
     * the band plays on the grass): the stage's middle and the way it faces, the band on it (stage-local x), the folding chairs before it.
     */
    concert: {
      stage: { at: [-64, -32.4], yaw: Math.PI } as PlaceSpot,
      band: [-1, 0.15, 1.1],
      chairs: [[-65.6, -35.6], [-64.6, -35.9], [-63.4, -35.9], [-62.4, -35.6]] as Vec2[],
      /** The game weekday (6: Sunday), its hours, and dry weather only. */
      weekday: 6,
      hours: [15, 18] as [number, number],
    },
    /**
     * The bandstand at the end of its lane (`BANDSTAND_WALK`, its middle at -100.7, 38.7): its steps up to the
     * railing's gap, sat on looking out north-west (the upper tread 0.4 m up), and the plaque on the plinth's face
     * towards the lane.
     */
    bandstand: {
      steps: { at: [-103.18, 41.18], yaw: -Math.PI / 4 } as PlaceSpot,
      seat: 0.4,
      plaque: { at: [-97.89, 37.54], yaw: Math.PI * 0.625 } as PlaceSpot,
    },
    /**
     * The building's kids at the playground on Sundays (`building/kids`): on the swings (the seat's top 0.5 m up), one
     * leaning on its frame, one on the sandpit's rim.
     */
    kids: {
      hugo: { at: [-71.9, -65.3] as Vec2, yaw: 0, seat: 0.5 },
      mai: { at: [-70.5, -65.3] as Vec2, yaw: 0, seat: 0.5 },
      tuan: { at: [-69.55, -64.75] as Vec2, yaw: -2.16, seat: null, lean: 0.35 },
      lina: { at: [-63.5, -61.25] as Vec2, yaw: 0, seat: 0.3 },
    },
  },

  /**
   * The Grand Flea Fair's day on the pavements (`events/FairStalls`): the overflow stall by the butcher's on the far
   * pavement (its keeper sells the raffle's tickets too), the imports trader who only comes on the Fair's day on ours
   * between the arcade and the newsstand, and the crêpe cart by RETRO GAMES.
   */
  fair: {
    overflow: { at: [-4.7, 11.3], yaw: Math.PI } as PlaceSpot,
    imports: { at: [11.35, -11.3], yaw: 0 } as PlaceSpot,
    crepes: { at: [7.15, 11.25], yaw: Math.PI } as PlaceSpot,
    /** The game hours the stalls are out. */
    hours: [8, 19] as [number, number],
  },

  /** December's stall on our pavement by CORNER BOOKS: gift wrapping and hot chestnuts (`events/ChristmasStall`). */
  christmas: { at: [-13.3, -11.4], yaw: 0, hours: [10, 20] as [number, number] } as PlaceSpot & { hours: [number, number] },

  /** The residents' doors that answer on Halloween (`events/HalloweenDoors`), a pumpkin on each step. */
  halloween: [
    { id: 'mansions', who: 'Park Corner Mansions', at: [-37, 11.95], yaw: Math.PI },
    { id: 'parkStreet', who: 'number 2, Park Street', at: [-19.21, -19.0], yaw: -Math.PI / 2 },
    { id: 'f6', who: 'number 31', at: [53.5, 11.95], yaw: Math.PI, opened: true },
    { id: 'n6', who: 'number 40', at: [60.5, -11.95], yaw: 0, opened: true },
  ] as HalloweenDoor[],
};
