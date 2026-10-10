/**
 * Every zone of the world by id: what a doorway's `to`, a travel door's `to`, the travel menu and
 * `World.zone()` may name, so a typo fails to compile. `WORLD_PLAN` (worldPlan.ts) is checked
 * against it both ways: one entry per id, and no entry without one. A leaf file (no imports) so the
 * classes that name zones (Room, TravelDoor) do not import the plan and every room plan with it.
 */
export type ZoneId = 'living' | 'hallway' | 'bathroom' | 'bedroom' | 'kitchen' | 'balcony' | 'stairwell' | 'arcade' | 'market' | 'street' | 'furnitureShop' | 'tvShop' | 'petShop' | 'flowerShop' | 'annex' | 'annexStudy' | 'neighbourFlat' | 'courtyard' | 'saleroom' | 'sellerFlat' | 'grandmaFlat' | 'cellar' | 'attic' | 'roof';

/**
 * The zones that are the flat (the stairwell included: its door is the flat's front door). Every one is every other's
 * neighbour in `WORLD_PLAN`, and what goes dark in a power cut or is "home" to go back to reads the list here, not the plan.
 */
export const FLAT = ['living', 'hallway', 'bathroom', 'bedroom', 'kitchen', 'balcony', 'annex', 'annexStudy', 'stairwell'] as const satisfies readonly ZoneId[];
