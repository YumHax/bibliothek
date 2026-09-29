/**
 * The hover caption's parts. The convention is `Name` or `Name · verb` (the verb lowercase, no "Click
 * to"): the Overlay draws the name, then the device's key cap and the verb. Captions not converted yet
 * are read the same way: "Click to sit down" is the verb "sit down"; "The cat is sleeping — click to
 * pet" is "The cat is sleeping" and "pet"; "Door release · click to go out" is "Door release" and "go
 * out". A caption the reading cannot split cleanly ("Space or click to spin") is shown as it is.
 */
export interface Caption {
  name: string;
  verb: string | null;
}

const SEPARATOR = ' · ';
/** "click to" / "tap to" / "press to", with what leads into it: a dash, a colon, a full stop, a bracket, the start. */
const LEGACY = /^(.*?)(?:\s*[—–:(-]\s*|\.\s+|^)(?:click|tap) to (.+?)\)?$/i;

export function parseCaption(text: string): Caption {
  const parts = text.split(SEPARATOR);
  const last = parts[parts.length - 1]!.trim();
  // The legacy form, in the last part.
  const legacy = LEGACY.exec(last);
  if (legacy) {
    const lead = legacy[1]!.trim();
    if (/\b(or|and)$/i.test(lead)) return { name: text, verb: null };
    const name = [...parts.slice(0, -1), lead].filter(Boolean).join(SEPARATOR);
    let verb = legacy[2]!.trim();
    if (verb.includes('(') && !verb.includes(')')) verb += ')';
    return { name, verb };
  }
  // `Name · verb`: a last part starting lowercase is the verb (unless an older part still says "click to").
  if (parts.length > 1 && /^[a-z]/.test(last) && !/\b(click|tap) to\b/i.test(text)) return { name: parts.slice(0, -1).join(SEPARATOR), verb: last };
  return { name: text, verb: null };
}
