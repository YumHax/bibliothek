import type { Vec2 } from '../streetPlan';

/*
 * Front Street's secrets (`secrets/StreetSecrets`), street-local metres: the TO LET window under our own building on
 * Park Street with GAME OVER in its dust, the children's chalk on Park Street's pavement by the courtyard's workshop
 * (ten squares, read in the right order), and the initials cut into the park's railing at the Front Street end.
 * Data only.
 */
export const SECRETS_PLAN = {
  /**
   * The dusty pane: its middle a little out from the glass (Park Street's building line), its height, facing the street
   * (-x); `glass`, how far behind that the glass is (the dust is drawn on it).
   */
  dust: { at: [-19.32, -23.05] as Vec2, y: 1.35, yaw: -Math.PI / 2, size: [0.55, 0.7] as [number, number], glass: 0.06 },
  /** Where a fished-out cartridge lands: on the pavement under the door's letterbox. */
  dustFind: { at: [-19.62, -21.95] as Vec2, yaw: -Math.PI / 2 },
  /** The chalk: the first square's middle, the step to the next (along Park Street, southwards), each square's side. */
  chalk: { at: [-19.95, -27.2] as Vec2, step: [0, -0.44] as Vec2, side: 0.38 },
  /** The carving on the railing's top rail: where, how high, facing Park Street (+x). */
  carving: { at: [-39.7, -3.2] as Vec2, y: 1.1, yaw: Math.PI / 2 },
};
