import type { PersonCard, PersonId } from '../types';
import { BUILDING_PEOPLE } from './building';
import { FRIEND_PEOPLE } from './friends';
import { MARKET_STALL_PEOPLE } from './market';
import { ARCADE_PEOPLE, MARKET_PEOPLE, RIVAL_PEOPLE, STREET_PEOPLE } from './town';

/*
 * Everyone the player can know, by id (docs/social.md "People"). The fixed cast comes from the group files; a
 * person met only once (a small ad's seller, a stallholder of the day) is added at run time with `addPerson`.
 */

const CAST: readonly PersonCard[] = [...FRIEND_PEOPLE, ...BUILDING_PEOPLE, ...STREET_PEOPLE, ...MARKET_PEOPLE, ...MARKET_STALL_PEOPLE, ...ARCADE_PEOPLE, ...RIVAL_PEOPLE];

const byId = new Map<PersonId, PersonCard>(CAST.map((p) => [p.id, p]));
const byDoor = new Map<string, PersonId>(CAST.filter((p) => p.door).map((p) => [p.door!, p.id]));

/** Everyone known to the game now (the cast, then whoever was added). */
export function everyone(): PersonCard[] {
  return [...byId.values()];
}

/** The card of `id`, or null. */
export function findPerson(id: PersonId): PersonCard | null {
  return byId.get(id) ?? null;
}

/**
 * Adds someone met at run time (a small ad's seller, a stallholder whose card is built from their stall), or
 * replaces their card. Their standing is saved like anyone's.
 */
export function addPerson(card: PersonCard): void {
  byId.set(card.id, card);
  if (card.door) byDoor.set(card.door, card.id);
}

/** Who lives behind door `key` on the stairs (`stairwell/building.doorKey`), or null. */
export function personAtDoor(key: string): PersonId | null {
  return byDoor.get(key) ?? null;
}

/** Their everyday name: "Mrs Roux", "Victor". */
export function shortName(id: PersonId): string {
  const card = byId.get(id);
  return card ? (card.short ?? card.name) : id;
}
