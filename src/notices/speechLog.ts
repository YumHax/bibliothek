/** How many lines said to the player are kept to read again. */
const KEEP = 30;

/** A line someone said to the player: who (when named) and what. */
interface SaidLine {
  name?: string;
  text: string;
}

const lines: SaidLine[] = [];

/** A line said to the player (`SpeechLayer`), kept for "What was said" (the oldest goes past `KEEP`). */
export function noteSaid(line: SaidLine): void {
  const last = lines[lines.length - 1];
  if (last && last.text === line.text && last.name === line.name) return; // a line said again is one line
  lines.push(line);
  if (lines.length > KEEP) lines.shift();
}

/** The lines said to the player, newest first. */
export function saidLines(): readonly SaidLine[] {
  return lines.slice().reverse();
}
