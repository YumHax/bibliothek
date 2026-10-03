/*
 * The day's post is collected once: from our flap in the hall's mailboxes (`stairwell/OurMailbox`) on the way past, or
 * found on the mat at home (`hallway/furnishHallway`, the homecoming), whichever comes first. Not saved, as the mat's
 * day never was: a reload may bring the day's flyers again.
 */

let collectedOn = -1;

/** Whether game day `day`'s post is still to be collected; true marks it collected. */
export function collectPost(day: number): boolean {
  if (collectedOn === day) return false;
  collectedOn = day;
  return true;
}

/** Whether game day `day`'s post was collected already (the flap's caption). */
export function postCollected(day: number): boolean {
  return collectedOn === day;
}
