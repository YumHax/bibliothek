/**
 * Every zone of the world by id: what a doorway's `to`, a travel door's `to`, the travel menu and
 * `World.zone()` may name, so a typo fails to compile. `WORLD_PLAN` (worldPlan.ts) is checked
 * against it both ways: one entry per id, and no entry without one. A leaf file (no imports) so the
 * classes that name zones (Room, TravelDoor) do not import the plan and every room plan with it.
 */
export type ZoneId = 'living' | 'hallway' | 'bathroom' | 'bedroom' | 'kitchen' | 'balcony' | 'stairwell' | 'arcade' | 'market' | 'street';
