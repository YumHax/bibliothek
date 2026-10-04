import type { PersonLook } from '@/world/people/looks';
import type { PersonId } from './types';

/*
 * The look each person was last built with (their body's, set by whoever builds it: `rememberLook`), so the People
 * book's portrait is the face the player met. Not saved: before a body is built, the portrait draws from the card's
 * seed (`ui/social/portrait`).
 */
const looks = new Map<PersonId, PersonLook>();

/** `id`'s body was built with `look`. */
export function rememberLook(id: PersonId, look: PersonLook): void {
  looks.set(id, look);
}

/** The look `id` was built with, or null when no body of theirs was built yet. */
export function rememberedLook(id: PersonId): PersonLook | null {
  return looks.get(id) ?? null;
}
