// The z-fighting finder, headless: every prop on its own and every room as its plan lays it out
// (`src/world/surface/zfightCatalogue.ts`), built in Node at high quality (bevels and fillets on) and run through
// the browser's own detector (`world/surface/zfight`). Each pair is keyed by its subject and the two meshes' paths
// and colours (never coordinates), and compared with `scripts/zfight-baseline.json`: a pair not in it fails.
//
//   npm run zfight                      props and rooms; fails on a new pair
//   npm run zfight -- --list            every pair found, baseline or not
//   npm run zfight -- --write-baseline  accept what is there now
//   npm run zfight -- --only shopProp   subjects whose name contains this
//
// The code is bundled with the project's esbuild into a temp file and run in Node (`scripts/headless.mjs`, shared
// with the other headless checks): canvases are stubbed (the detector reads geometry, colours and uvs only); WebGL
// is absent, so whatever asks for it falls back.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, bundle, flag, hush } from './headless.mjs';

const BASELINE = path.join(ROOT, 'scripts', 'zfight-baseline.json');

const started = performance.now();
const restore = hush();
// What the script imports from the game is listed in `src/headless/zfight.ts` (typechecked, and knip sees it used).
const { zfightSubjects, findZFighting, seedLiveRandom, THREE } = await bundle(`export * from '@/headless/zfight';`, { name: 'zfight' });
// The props' own live draws (a rug's jitter, a clock's hands) from one seed, so a run finds the same pairs as the last.
seedLiveRandom(0x9e3779b9);

// First, that the detector still sees a fight: a red slab flush on a blue one's top (both tops at y 0.1).
{
  const blind = new THREE.Group();
  const box = (color, height) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, 0.4), new THREE.MeshStandardMaterial({ color }));
    mesh.position.y = height / 2;
    blind.add(mesh);
  };
  box(0x2244aa, 0.1);
  box(0xaa2222, 0.1);
  if (findZFighting(blind, { viewDistance: 6 }).length === 0) {
    restore();
    console.error('[zfight] the detector missed a known fight (two flush boxes): the check is blind, fix world/surface/zfight first');
    process.exit(1);
  }
}

const only = arg('only');
const found = new Map(); // key -> description
const failed = [];
let checked = 0;
for (const subject of zfightSubjects()) {
  if (only && !subject.name.includes(only)) continue;
  let root;
  try {
    root = new THREE.Group();
    root.add(subject.build());
  } catch (error) {
    failed.push(`${subject.name}: ${String(error?.message ?? error).split('\n')[0]}`);
    continue;
  }
  checked++;
  if (flag('verbose')) {
    let meshes = 0;
    let triangles = 0;
    root.traverseVisible((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      triangles += (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
    });
    console.log(`  ${subject.name}: ${meshes} meshes, ${Math.round(triangles)} triangles, judged at ${subject.viewDistance.toFixed(1)} m`);
  }
  for (const pair of findZFighting(root, { viewDistance: subject.viewDistance })) {
    // The catalogue's floor slab is only there to hide what a prop rests on (a hung prop's top lands in its plane).
    if (pair.a.startsWith('Floor ') || pair.b.startsWith('Floor ')) continue;
    // Unordered, so a pair found the other way round is the same pair.
    const [a, b] = [pair.a, pair.b].sort();
    const key = `${subject.name} | ${a} | ${b}`;
    const previous = found.get(key);
    found.set(key, { area: (previous?.area ?? 0) + pair.areaCm2, at: previous?.at ?? pair.at, gapMm: pair.gapMm, holdsToM: pair.holdsToM });
  }
}
restore();
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const keys = [...found.keys()].sort();
if (flag('write-baseline')) {
  if (only) {
    console.error('[zfight] --write-baseline with --only would drop the other subjects: run it on everything');
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
  console.log(`[zfight] wrote ${path.relative(ROOT, BASELINE)}: ${keys.length} known pair(s) over ${checked} subjects (${seconds} s)`);
  process.exit(0);
}

const baseline = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : []);
const fresh = keys.filter((k) => !baseline.has(k));
const gone = [...baseline].filter((k) => !found.has(k) && (!only || k.includes(only)));
const describe = (k) => {
  const p = found.get(k);
  return `  ${k}\n      ${p.area.toFixed(1)} cm² at ${p.at}, ${p.gapMm} mm apart, ${p.holdsToM === 0 ? 'fights up close' : `holds to ${p.holdsToM} m`}`;
};
if (flag('list')) for (const k of keys) console.log(describe(k));
for (const f of failed) console.log(`[zfight] could not build ${f}`);
if (gone.length) console.log(`[zfight] ${gone.length} baseline pair(s) fixed: run \`npm run zfight -- --write-baseline\` to drop them`);
if (fresh.length) {
  console.log(`[zfight] ${fresh.length} new z-fighting pair(s) (two faces in one plane, see docs/props.md "Check"):`);
  for (const k of fresh) console.log(describe(k));
  console.log('[zfight] give the nearer face a real gap (surface/layers: onSurface, gapAt; props/joinery), or accept with --write-baseline if it can never be seen');
  process.exit(1);
}
console.log(`[zfight] ${checked} subjects, ${keys.length} known pair(s), none new (${seconds} s)`);
process.exit(0);
