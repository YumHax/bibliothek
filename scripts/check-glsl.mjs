// The shaders, parsed: every `.glsl` file under src/ must be GLSL ES that parses (the browser would only tell at the
// first draw, as a black material and a console error), and every one must be imported by some module (a `.glsl`
// file is invisible to knip). Run on every `npm run typecheck`.
//
//   node scripts/check-glsl.mjs            every .glsl under src
//   node scripts/check-glsl.mjs --list     name each file and its size
//
// A shader lives in a `.glsl` file beside the code that compiles it and is imported as its text
// (`import frag from './Foo.frag.glsl?raw'`); what the file cannot hold statically (a value from TypeScript, a
// chunk shared with other shaders) comes in through `assemble()` (src/graphics/glslAssemble.ts) as `#define` lines and
// `#include <name>` replacements, so the file stays a parseable program. `#include <...>` lines (three.js chunks and
// the project's) are dropped before parsing; `*.part.glsl` files are fragments spliced into other shaders and are not
// parsed on their own.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parser } from '@shaderfrog/glsl-parser/index.js';
import preprocess from '@shaderfrog/glsl-parser/preprocessor/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const LIST = process.argv.includes('--list');

/** Every file under src, repository-relative with forward slashes. */
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
})(SRC);
const shaders = files.filter((f) => f.endsWith('.glsl'));
const sources = files.filter((f) => /\.(ts|mjs)$/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));

const problems = [];
let parsed = 0;
for (const file of shaders) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (LIST) console.log(`  ${file}: ${text.split('\n').length} lines${file.endsWith('.part.glsl') ? ' (fragment, not parsed)' : ''}`);
  // Imported somewhere: `from './Foo.frag.glsl?raw'`.
  const base = path.basename(file);
  if (!sources.some((s) => s.includes(`${base}?raw`))) problems.push(`${file}: no module imports it (import it as './${base}?raw', or delete it)`);
  if (file.endsWith('.part.glsl')) continue;
  // Includes are resolved by three.js (its chunks) or by assemble() (ours) before the program compiles.
  const standalone = text.replace(/^[ \t]*#include\s*<[^>]*>.*$/gm, '');
  try {
    parser.parse(preprocess(standalone, { preserveComments: false }), { quiet: true });
    parsed++;
  } catch (error) {
    const at = error?.location?.start;
    problems.push(`${file}${at ? `:${at.line}:${at.column}` : ''}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
}

if (problems.length) {
  console.error(`[glsl] ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`[glsl] ${shaders.length} shader file${shaders.length === 1 ? '' : 's'}, ${parsed} parsed, all imported`);
