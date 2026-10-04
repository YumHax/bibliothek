// The convention checks, run on every `npm run typecheck` (there is no test suite: this and tsc are the check).
// The rules are data, one module per concern in `scripts/conventions/` (surface, random, maths, text...), each
// rule saying where the right way lives; this script only loads and runs them. A line may opt out with a trailing
// `// convention-ok: <why>`.
//
// A rule module exports `rules` (on one code line at a time) and/or `fileRules` (on a file's code lines at once):
//   { name, test(line | lines) -> boolean, hint,
//     except?: ['exact/file.ts', 'folder/'],   // files or folders (trailing slash) the rule skips, relative to src/
//     within?: ['folder/'],                     // only files under these folders are checked (default: all)
//     files?: 'ts' | 'css' }                    // which files the rule reads (default ts)
//
// Besides the line rules, a ratchet: hand-picked small offsets (`+ 0.002`, `z: 0.004`) are how z-fighting came back
// every time, so each file's count of them may not grow past `scripts/offset-baseline.json`. New code takes a layer
// (`world/surface/layers`: onSurface / layMesh / decal) or a real gap (`gapAt`). `--write-baseline` rewrites the
// baseline from the tree as it is (after a cleanup that lowered counts, or to accept reviewed ones).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS, '..', 'src');
const BASELINE = path.join(SCRIPTS, 'offset-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');

/** A small literal offset: plus or minus a few millimetres, or a coordinate of a few millimetres. */
const SMALL_OFFSET = /[+-]\s*0\.00[1-9]\d*\b|\b[xyz]\s*:\s*-?0\.00[1-9]\d*\b/g;

// --- The rules, from every module of scripts/conventions/ --------------------------------------------------------

const RULES = [];
const FILE_RULES = [];
const modulesDir = path.join(SCRIPTS, 'conventions');
for (const name of fs.readdirSync(modulesDir).filter((f) => f.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(modulesDir, name)).href);
  for (const rule of mod.rules ?? []) RULES.push({ ...rule, module: name });
  for (const rule of mod.fileRules ?? []) FILE_RULES.push({ ...rule, module: name });
}

/** Whether `rule` reads the file at `rel` (its `within` folders, its `except` files and folders, its file kind). */
function applies(rule, rel, kind) {
  if ((rule.files ?? 'ts') !== kind) return false;
  if (rule.within && !rule.within.some((folder) => rel.startsWith(folder))) return false;
  if (rule.except?.some((e) => (e.endsWith('/') ? rel.startsWith(e) : rel === e))) return false;
  return true;
}

// --- The walk ---------------------------------------------------------------------------------------------------

const problems = [];
/** Small literal offsets per file (`SMALL_OFFSET`), for the ratchet. */
const offsets = {};
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) check(full, 'ts');
    else if (entry.name.endsWith('.css')) check(full, 'css');
  }
})(ROOT);

function check(file, kind) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const rules = RULES.filter((rule) => applies(rule, rel, kind));
  const fileRules = FILE_RULES.filter((rule) => applies(rule, rel, kind));
  const code = [];
  let small = 0;
  lines.forEach((line, i) => {
    if (/\/[/*] convention-ok\b/.test(line)) return;
    // Comments carry no code: a line comment's tail, a block comment's lines (CSS only has the block kind).
    const stripped = kind === 'css' ? line.replace(/\/\*.*?\*\//g, '') : line.replace(/\/\/.*$/, '');
    if (/^\s*(\*|\/\*)/.test(stripped)) return;
    code.push(stripped);
    if (kind === 'ts') small += (stripped.match(SMALL_OFFSET) ?? []).length;
    for (const rule of rules) {
      if (rule.test(stripped)) problems.push(`src/${rel}:${i + 1}: ${rule.name}: ${rule.hint}\n    ${line.trim()}`);
    }
  });
  for (const rule of fileRules) {
    if (rule.test(code)) problems.push(`src/${rel}: ${rule.name}: ${rule.hint}`);
  }
  // Only what builds 3D things (a sound's 0.005 s is no depth).
  const builds3d = lines.some((line) => /from 'three'/.test(line));
  if (small > 0 && builds3d && rel !== 'world/surface/layers.ts') offsets[`src/${rel}`] = small;
}

// --- The offsets ratchet ----------------------------------------------------------------------------------------

const sorted = Object.fromEntries(Object.entries(offsets).sort(([a], [b]) => a.localeCompare(b)));
if (WRITE_BASELINE) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`[conventions] wrote ${path.relative(process.cwd(), BASELINE)}: ${Object.values(sorted).reduce((a, b) => a + b, 0)} small offsets in ${Object.keys(sorted).length} files`);
} else {
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  for (const [file, count] of Object.entries(sorted)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      problems.push(
        `${file}: small offsets: ${count} hand-picked millimetre offsets (baseline ${allowed}): take a layer (world/surface/layers: layMesh / onSurface / decal) or a real gap (gapAt); a reviewed one takes \`// convention-ok: <why>\` (or rewrite the baseline: --write-baseline)`,
      );
    }
  }
}

if (problems.length) {
  console.error(`[conventions] ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`[conventions] ${RULES.length + FILE_RULES.length} rules from ${new Set([...RULES, ...FILE_RULES].map((r) => r.module)).size} module(s), no problem`);
