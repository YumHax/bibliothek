import { findPerson } from '@/social/people';
import type { PersonId } from '@/social/types';
import type { Dress } from './looks';

/*
 * Who a known person is, for the look their body is drawn with (docs/people.md "Looks"): their card's sex and age
 * (`PersonCard.look`) go into the `Dress` of `randomLook`, so a woman is drawn a woman, an old man old, a kid a kid,
 * whatever the seed, and the People book's portrait (`ui/social/portrait`, from the same card) matches the body.
 */

/** `dress` with `person`'s sex and age from their card (the card's age wins: Mrs Hall is old whatever the crowd draws); unchanged for someone unknown. */
export function castDress(person: PersonId | null | undefined, dress: Dress = {}): Dress {
  const look = person ? findPerson(person)?.look : undefined;
  if (!look?.sex && !look?.age) return dress;
  return { ...dress, sex: look.sex, age: look.age ?? dress.age };
}
