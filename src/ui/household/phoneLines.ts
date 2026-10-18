/** One thing heard on the line: someone's words (in quotes, after their name or the callee's), or a plain note. */
export type PhoneLine = { kind: 'said'; who: string | null; words: string } | { kind: 'note'; words: string };

/** A name and a colon right before the quote: "Gégé: “…”", "Alex and Sam: “…”". */
const SPEAKER = /([^.!?:()“”]+):\s*$/;

/**
 * What the far end's answer says, split for the call screen: each quote a balloon (its speaker named before it, or
 * null for the one rung), the words around them notes ("(Your visit to … is off.)", "Not today: …"). The rules'
 * answers are written as one line ("Sam: “See you at 19:00!” Bo: “Busy tonight.”"); this reads them back.
 */
export function phoneLines(text: string): PhoneLine[] {
  const lines: PhoneLine[] = [];
  const note = (words: string): void => {
    const trimmed = words.trim();
    // An aside the rules put in brackets reads as a plain note on the screen.
    const clean = trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1).trim() : trimmed;
    if (/[\p{L}\p{N}]/u.test(clean)) lines.push({ kind: 'note', words: clean });
  };
  for (const row of text.split('\n')) {
    let rest = row;
    for (;;) {
      const open = rest.indexOf('“');
      const close = open < 0 ? -1 : rest.indexOf('”', open + 1);
      if (close < 0) break;
      const before = rest.slice(0, open);
      const named = SPEAKER.exec(before);
      note(named ? before.slice(0, named.index) : before);
      lines.push({ kind: 'said', who: named ? named[1]!.trim() : null, words: rest.slice(open + 1, close).trim() });
      rest = rest.slice(close + 1);
    }
    note(rest);
  }
  return lines;
}
