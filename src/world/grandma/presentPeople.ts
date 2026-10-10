import type * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import { Walker } from '../people/Walker';
import { Vendor } from '../people/Vendor';
import { SpeechBubble } from '../people/SpeechBubble';

/** Someone of today: a passer-by, a regular, a bidder (`Walker`), or someone behind a counter (`Vendor`). */
type Person = Walker | Vendor;

/**
 * The people of today in a zone a memory is filmed in (the arcade's regulars and attendant, the saleroom's bidders
 * and auctioneer, the neighbours on the landing), kept out of the picture and hushed while it plays: nothing they say
 * reaches the bubbles or the subtitles (a live sale's auctioneer goes on calling lots). `hold`, from the scene's
 * `beat`, hides them again every frame and takes in anyone of today who walks in mid-film (the past's own people,
 * placed through the `MemorySet`, carry `userData.memoryCast` and are left alone); `release`, from its `strike`, shows
 * them again (a `Walker` only if still about) with their voices back.
 */
export function presentPeople(zone: Zone): { hold(): void; release(): void } {
  const people = new Set<Person>();
  const hush = (person: Person, on: boolean): void => {
    person.traverse((obj) => {
      if (obj instanceof SpeechBubble) obj.hushed = on;
    });
  };
  /** Gathers today's people under `obj`, not looking inside a person. */
  const gather = (obj: THREE.Object3D): void => {
    if (obj instanceof Walker || obj instanceof Vendor) {
      if (!obj.userData.memoryCast && !people.has(obj)) {
        people.add(obj);
        hush(obj, true);
      }
      return;
    }
    for (const child of obj.children) gather(child);
  };
  const hold = (): void => {
    gather(zone.group);
    for (const person of people) person.visible = false;
  };
  hold();
  return {
    hold,
    release: () => {
      for (const person of people) {
        person.visible = person instanceof Walker ? person.isPresent : true;
        hush(person, false);
      }
      people.clear();
    },
  };
}
