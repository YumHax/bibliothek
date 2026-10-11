/*
 * The mouth shapes of a line, read off its text: letters and the usual pairs (French and English
 * alike: "ou", "eau", "ch", "th", "ee") to a handful of shapes: open "a", "e" and "i" drawn back,
 * rounded "o" and "ou", the lips shut on m, b, p, the lower lip on the teeth for f, v, and the
 * rest between. Spaces let the mouth half close, punctuation makes a pause. Each shape lasts a
 * number of beats (`BEAT` seconds at a speaking pace); the face's springs blend one into the next,
 * as speech runs its sounds together.
 */

/** One mouth shape: the jaw's opening, the lips rounded ("oo"), drawn back ("ee"), pressed together (m, b, p; f, v on the teeth). */
type Viseme = readonly [jaw: number, pucker: number, ee: number, press: number];

/** Seconds per beat at a speaking pace (about thirteen sounds a second). */
export const BEAT = 0.068;
/** Values per shape in a track: the viseme's four, then its length in beats. */
export const STRIDE = 5;

const A: Viseme = [0.6, 0, 0.1, 0];
const E: Viseme = [0.36, 0, 0.35, 0];
const I: Viseme = [0.16, 0, 0.6, 0];
const O: Viseme = [0.42, 0.55, 0, 0];
const OU: Viseme = [0.13, 0.9, 0, 0];
const U: Viseme = [0.24, 0.5, 0, 0];
const SHUT: Viseme = [0, 0, 0, 1];
const BITE: Viseme = [0.07, 0, 0.12, 0.55];
const SH: Viseme = [0.15, 0.45, 0, 0];
const S: Viseme = [0.1, 0, 0.35, 0];
const TH: Viseme = [0.18, 0, 0.1, 0];
const T: Viseme = [0.2, 0, 0.1, 0];
const K: Viseme = [0.26, 0, 0, 0];
const REST: Viseme = [0.04, 0, 0, 0];
const NUMBER: Viseme = [0.3, 0, 0.12, 0];

/** Groups of letters read as one sound, longest first. */
const PAIRS: ReadonlyArray<readonly [string, Viseme, number]> = [
  ['eau', O, 1],
  ['ou', OU, 1],
  ['oo', OU, 1],
  ['au', O, 1],
  ['oi', OU, 0.5],
  ['ai', E, 1],
  ['ei', E, 1],
  ['ee', I, 1],
  ['ie', I, 1],
  ['ch', SH, 0.7],
  ['sh', SH, 0.7],
  ['th', TH, 0.6],
  ['ph', BITE, 0.7],
  ['qu', K, 0.6],
];

/** Single letters. */
const LETTERS: Readonly<Record<string, readonly [Viseme, number]>> = {
  a: [A, 1],
  e: [E, 0.9],
  i: [I, 0.9],
  y: [I, 0.9],
  o: [O, 1],
  u: [U, 0.9],
  w: [OU, 0.7],
  m: [SHUT, 0.8],
  b: [SHUT, 0.7],
  p: [SHUT, 0.7],
  f: [BITE, 0.7],
  v: [BITE, 0.7],
  j: [SH, 0.7],
  s: [S, 0.6],
  z: [S, 0.6],
  x: [S, 0.7],
  c: [K, 0.6],
  t: [T, 0.5],
  d: [T, 0.5],
  n: [T, 0.6],
  l: [T, 0.6],
  k: [K, 0.6],
  g: [K, 0.6],
  q: [K, 0.6],
  r: [K, 0.5],
  h: [REST, 0.3],
};

/** Beats of a pause: between words, after a comma, at the end of a sentence. */
const SPACE = 0.5;
const COMMA = 2.5;
const STOP = 3.5;

const VOWELS = 'aeiouy';

/** A line's mouth shapes: `data` holds `STRIDE` values per shape (the viseme, its beats), `beats` their sum. */
interface VisemeTrack {
  readonly data: Float32Array;
  readonly beats: number;
}

/** The mouth shapes of `text`, in order (none when it has nothing to say: a symbol, an ellipsis alone). */
export function visemeTrack(text: string): VisemeTrack {
  // Accents off (a "ç" is an "s" first).
  const s = text.toLowerCase().replace(/ç/g, 's').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const out: number[] = [];
  let beats = 0;
  let spoken = false;
  const push = (v: Viseme, length: number): void => {
    // A doubled sound ("mm", "ll") is one.
    const n = out.length;
    if (n >= STRIDE && out[n - 5] === v[0] && out[n - 4] === v[1] && out[n - 3] === v[2] && out[n - 2] === v[3] && v !== REST) return;
    out.push(v[0], v[1], v[2], v[3], length);
    beats += length;
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === ' ' || c === '\n' || c === '\t') {
      push(REST, SPACE);
      i++;
      continue;
    }
    if (c === ',' || c === ';' || c === ':' || c === '-') {
      push(REST, c === '-' ? SPACE * 1.5 : COMMA);
      i++;
      continue;
    }
    if (c === '.' || c === '!' || c === '?') {
      push(REST, STOP);
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      push(NUMBER, 1.6);
      spoken = true;
      i++;
      continue;
    }
    // A word's silent final "e" (a long word's, after a consonant): "rouge", "game".
    if (c === 'e' && i >= 3 && !isLetter(s[i + 1]) && isLetter(s[i - 1]) && isLetter(s[i - 2]) && isLetter(s[i - 3]) && !VOWELS.includes(s[i - 1]!)) {
      i++;
      continue;
    }
    const pair = PAIRS.find(([letters]) => s.startsWith(letters, i));
    if (pair) {
      push(pair[1], pair[2]);
      if (pair[0] === 'oi') push(A, 0.8);
      spoken = true;
      i += pair[0].length;
      continue;
    }
    // A soft "c" (before e, i, y) is an "s".
    const soft = c === 'c' && s[i + 1] !== undefined && 'eiy'.includes(s[i + 1]!);
    const letter = soft ? ([S, 0.6] as const) : LETTERS[c];
    if (letter) {
      push(letter[0], letter[1]);
      spoken = true;
    }
    i++;
  }
  // The mouth closes at the end.
  if (spoken) push(REST, SPACE);
  return spoken ? { data: Float32Array.from(out), beats } : { data: new Float32Array(0), beats: 0 };
}

function isLetter(c: string | undefined): boolean {
  return c !== undefined && c >= 'a' && c <= 'z';
}
