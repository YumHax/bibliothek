/** Time for the eyes to find the text. */
const BASE_MS = 1200;
/** About 16 characters a second: an unhurried reader, in a game, with other things going on. */
const PER_CHAR_MS = 62;
const MIN_MS = 2200;
const MAX_MS = 15000;

/** How long `text` stays up so that it can be read: a floor for the short ones, a ceiling for the long ones. */
export function readMs(text: string): number {
  const chars = text.replace(/\s+/g, ' ').trim().length;
  return Math.min(MAX_MS, Math.max(MIN_MS, BASE_MS + chars * PER_CHAR_MS));
}
