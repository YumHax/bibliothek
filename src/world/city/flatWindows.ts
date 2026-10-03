import type { ZoneId } from '../zoneIds';

/** The flat's rooms whose windows the street sees (the collection room's front, its bay, the kitchen, the bedroom, the bathroom, Mrs Roux's front room). */
export type FlatRoomId = Extract<ZoneId, 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'annex'>;

/** What the street sees of a room of the flat at night: its lamp's level (0..1) and how open its curtains are (0..1). */
export interface FlatRoomLight {
  readonly lampShown: number;
  readonly curtainsOpen: number;
}

const FLAT_ROOMS: readonly string[] = ['living', 'kitchen', 'bedroom', 'bathroom', 'annex'] satisfies readonly FlatRoomId[];
const rooms = new Map<FlatRoomId, FlatRoomLight>();

/**
 * The thin link between the flat and the walkable street's facade (`street/Buildings`): each room
 * of the flat reports itself when built (`furnishShell`), the street reads it while the player is
 * out (the rooms are dormant then, so they hold the state they were left in: a lamp left on is lit
 * from the street, drawn curtains dim it). A room not built yet reads as null (painted default).
 */
export function reportFlatRoom(zone: string, room: FlatRoomLight): void {
  if (FLAT_ROOMS.includes(zone)) rooms.set(zone as FlatRoomId, room);
}

export function flatRoomLight(id: FlatRoomId): FlatRoomLight | null {
  return rooms.get(id) ?? null;
}
