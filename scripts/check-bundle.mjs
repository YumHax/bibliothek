// The bundle's size, ratcheted. After `vite build`, every chunk in dist/assets (JavaScript and CSS) is weighed, raw
// and gzipped, and compared with scripts/bundle-baseline.json: a chunk that grew more than CHUNK_GROWTH over its
// baseline (and more than CHUNK_FLOOR bytes, so a small chunk's few hundred bytes do not count), or a total that grew
// more than TOTAL_GROWTH, fails. New chunks are reported and allowed (a zone split out of the main chunk is the point);
// chunks that went are reported. The last step of `npm run build`:
//
//   node scripts/check-bundle.mjs                   after vite build; fails on growth past the baseline
//   node scripts/check-bundle.mjs --list            every chunk: raw, gzip, baseline, change
//   node scripts/check-bundle.mjs --write-baseline  accept the sizes as they are (after a reviewed growth, or a split)
//
// Chunks are keyed by their stem (the name before Rollup's hash: `index`, `three`, `furnishStreet`); two chunks with
// one stem are told apart by size rank (`index#1.js` the entry, `index#2.js` the shared chunk). The main chunk holds
// everything that is not behind a dynamic import: new weight that belongs to one zone goes in that zone's chunk
// (`import('./furnishX')`, see vite.config.ts `manualChunks` for three.js's own chunk).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'assets');
const BASELINE = path.join(ROOT, 'scripts', 'bundle-baseline.json');
const flag = (name) => process.argv.includes(`--${name}`);

/** A chunk may grow this share over its baseline... */
const CHUNK_GROWTH = 0.05;
/** ...and only counts once it grew this many bytes (raw). */
const CHUNK_FLOOR = 2048;
/** The whole bundle may grow this share over its baseline. */
const TOTAL_GROWTH = 0.03;

if (!fs.existsSync(DIST)) {
  console.error(`[bundle] ${path.relative(ROOT, DIST)} is missing: run \`npx vite build\` first (npm run build does)`);
  process.exit(1);
}

// --- Weigh the chunks ---------------------------------------------------------------------------------------

/** stem.ext -> [{ file, raw, gzip }] sorted by raw size, largest first. */
const groups = new Map();
for (const file of fs.readdirSync(DIST)) {
  const m = file.match(/^(.*)-[A-Za-z0-9_-]{8}\.(js|css)$/);
  if (!m) continue;
  const content = fs.readFileSync(path.join(DIST, file));
  const entry = { file, raw: content.length, gzip: zlib.gzipSync(content, { level: 9 }).length };
  const key = `${m[1]}.${m[2]}`;
  groups.set(key, [...(groups.get(key) ?? []), entry]);
}
/** key -> { file, raw, gzip }, keys `stem.ext` or `stem#rank.ext`. */
const chunks = new Map();
for (const [key, list] of groups) {
  list.sort((a, b) => b.raw - a.raw);
  const [stem, ext] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
  list.forEach((entry, i) => chunks.set(list.length > 1 ? `${stem}#${i + 1}.${ext}` : key, entry));
}
const total = { raw: 0, gzip: 0 };
for (const c of chunks.values()) {
  total.raw += c.raw;
  total.gzip += c.gzip;
}

const kB = (n) => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} kB`;
const pct = (now, base) => `${now >= base ? '+' : ''}${(((now - base) / base) * 100).toFixed(1)} %`;
const sorted = [...chunks.entries()].sort(([a], [b]) => a.localeCompare(b));

if (flag('write-baseline')) {
  const out = { total, chunks: Object.fromEntries(sorted.map(([key, { raw, gzip }]) => [key, { raw, gzip }])) };
  fs.writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[bundle] wrote ${path.relative(ROOT, BASELINE)}: ${chunks.size} chunks, ${kB(total.raw)} raw, ${kB(total.gzip)} gzip`);
  process.exit(0);
}

// --- Compare with the baseline ------------------------------------------------------------------------------

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
if (!baseline) {
  console.error(`[bundle] no ${path.relative(ROOT, BASELINE)}: run \`node scripts/check-bundle.mjs --write-baseline\` once`);
  process.exit(1);
}
const problems = [];
const fresh = [];
for (const [key, chunk] of sorted) {
  const base = baseline.chunks[key];
  if (!base) {
    fresh.push(`${key} (${kB(chunk.raw)} raw, ${kB(chunk.gzip)} gzip)`);
    continue;
  }
  if (chunk.raw > base.raw * (1 + CHUNK_GROWTH) && chunk.raw - base.raw > CHUNK_FLOOR) {
    problems.push(`  ${key}: ${kB(chunk.raw)} raw, baseline ${kB(base.raw)} (${pct(chunk.raw, base.raw)}; gzip ${kB(chunk.gzip)})`);
  }
}
const gone = Object.keys(baseline.chunks).filter((key) => !chunks.has(key));
if (total.raw > baseline.total.raw * (1 + TOTAL_GROWTH)) {
  problems.push(`  total: ${kB(total.raw)} raw, baseline ${kB(baseline.total.raw)} (${pct(total.raw, baseline.total.raw)}; gzip ${kB(total.gzip)})`);
}

if (flag('list')) {
  const width = Math.max(...sorted.map(([key]) => key.length));
  for (const [key, chunk] of sorted) {
    const base = baseline.chunks[key];
    console.log(`  ${key.padEnd(width)}  ${kB(chunk.raw).padStart(9)} raw  ${kB(chunk.gzip).padStart(9)} gzip  ${base ? `baseline ${kB(base.raw).padStart(9)}  ${pct(chunk.raw, base.raw)}` : 'new'}`);
  }
  console.log(`  ${'total'.padEnd(width)}  ${kB(total.raw).padStart(9)} raw  ${kB(total.gzip).padStart(9)} gzip  baseline ${kB(baseline.total.raw).padStart(9)}  ${pct(total.raw, baseline.total.raw)}`);
}
if (fresh.length) console.log(`[bundle] ${fresh.length} new chunk(s): ${fresh.join(', ')}`);
if (gone.length) console.log(`[bundle] ${gone.length} baseline chunk(s) gone: ${gone.join(', ')} (run --write-baseline to drop them)`);
if (problems.length) {
  console.error(`[bundle] ${problems.length} size(s) past the baseline (a chunk may grow ${CHUNK_GROWTH * 100} %, the total ${TOTAL_GROWTH * 100} %):\n${problems.join('\n')}`);
  console.error('[bundle] move the new weight behind a dynamic import (a zone chunk), or accept it with `node scripts/check-bundle.mjs --write-baseline`');
  process.exit(1);
}
console.log(`[bundle] ${chunks.size} chunks, ${kB(total.raw)} raw, ${kB(total.gzip)} gzip, within the baseline (${pct(total.raw, baseline.total.raw)})`);
