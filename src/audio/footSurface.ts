/**
 * What the player's feet land on, for the footsteps (`Footsteps`): a zone says it through
 * `ZoneHandle.surfaceAt`, else its room's floor finish decides. The outdoor ones (`OUTDOOR_SURFACES`)
 * splash when the ground is wet and crunch under snow.
 */
export type FootSurface = 'wood' | 'carpet' | 'tiles' | 'concrete' | 'stone' | 'asphalt' | 'grass';

export const OUTDOOR_SURFACES: ReadonlySet<FootSurface> = new Set<FootSurface>(['stone', 'asphalt', 'grass']);

/** A room's floor finish (`RoomFinish.floor`) as a surface to walk on; parquet when it names none. */
export function surfaceOfFloor(floor: 'parquet' | 'concrete' | 'carpet' | 'tiles' | undefined): FootSurface {
  switch (floor) {
    case 'concrete':
      return 'concrete';
    case 'carpet':
      return 'carpet';
    case 'tiles':
      return 'tiles';
    default:
      return 'wood';
  }
}

/** A zone's extent (its `RoomOptions`, when it is a room) as a surface: its finish's floor, parquet by default. */
export function surfaceOfRoom(extent: object): FootSurface {
  const finish = 'finish' in extent ? (extent as { finish?: { floor?: Parameters<typeof surfaceOfFloor>[0] } }).finish : undefined;
  return surfaceOfFloor(finish?.floor);
}
