// The scene lint, headless: the z-fighting catalogue's subjects (`src/world/surface/zfightCatalogue.ts`: every decor
// kind, shop prop and piece on its own, every room as its plan lays it out) built in Node and checked for what
// otherwise only shows in play. A light's shadow set up outside the rules or a prop owning a shadow or an ambient
// (`world/lint/lights`); a thing the plan sinks under the floor, leaves floating, pushes through a wall or into
// another (`world/lint/placement`); a clickable part out of reach (`world/lint/reach`); a palette material freed by
// one prop's unload, or a cached one two builds hold that is never marked shared, so the first zone to unload frees
// it under everyone else (`world/lint/disposal`, `world/lint/sharing`). Each finding is keyed by its subject, the
// rule and names (never coordinates) and compared with `scripts/scene-baseline.json`: a finding not in it fails.
//
//   npm run scene-lint                      fails on a new finding
//   npm run scene-lint -- --list            every finding, baseline or not
//   npm run scene-lint -- --write-baseline  accept what is there now
//   npm run scene-lint -- --only room:      subjects whose name contains this
//   npm run scene-lint -- --verbose         each room's light counts, and what dispose() needed the running game for
//
// The code is bundled with the project's esbuild into a temp file and run in Node (`scripts/headless.mjs`, shared
// with zfight): canvases are stubbed, WebGL is absent, so whatever asks for it falls back.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, arg, bundle, flag, hush } from './headless.mjs';

const BASELINE = path.join(ROOT, 'scripts', 'scene-baseline.json');

/** Where the right way lives, per rule. */
const HINTS = {
  'shadow far': "bound shadow.camera.far to the light's range (Room.buildLights does): the bias is in units of far",
  'shadow autoUpdate': 'own the map with lighting/shadowRefresh (it sets autoUpdate false and refreshes on its own terms)',
  'prop shadow': "new lamps stay shadowless (CLAUDE.md): the room's rig draws the shadows; castShadow = false",
  'unbounded light': 'give the light a distance (its reach): with 0 every fragment of the scene evaluates it',
  'prop ambient': 'no HemisphereLight in a prop: the Room runs the ambient, one per occupied room',
  'shadow budget': 'fewer shadow-casting lights in the room (QUALITY.lights.pointShadows + spotShadows show at once)',
  'texture units': "fewer shadow-casting lights: with the materials' own maps they must fit 16 texture units or every lit shader fails to link",
  ambient: "one HemisphereLight per room (the Room's)",
  'light budget': 'more lights than QUALITY.lights shows at once: pool the glows (lighting/LightPool) or drop one',
  sunk: 'raise it: its bottom is under the floor (a layer of world/surface/layers if it is flat)',
  floating: 'lower it, hang it on a wall or the ceiling, or give it something to stand on',
  outside: 'move it in: its box leaves the room through a wall or the ceiling',
  overlap: 'two things share one space: move one (a plan line), or make the smaller rest on the larger',
  reach: 'bring the clickable part under 2.2 m, or give it a hitbox the player can reach',
  'unshared cache': 'markShared() the cached resource (world/materials/sharedResources), or take it from the palette, else build one per prop',
  'shared disposed': "never dispose a palette or cached resource yourself: the zone frees what is the prop's own",
  leak: 'keep every geometry, material and texture reachable from the prop (disposeTree frees them), or free it in dispose()',
};

const started = performance.now();
const restore = hush();
// What the script imports from the game is listed in `src/headless/scene.ts` (typechecked, and knip sees it used).
const { zfightSubjects, lintLights, lintPlacement, lintReach, lintDisposal, SharingLedger, markShared, seedLiveRandom, THREE } = await bundle(
  `export * from '@/headless/scene';`,
  { name: 'scene-lint' },
);
// The props' own live draws (a rug's jitter, a clock's hands) from one seed, so a finding keyed on geometry is the
// same from one run to the next.
seedLiveRandom(0x9e3779b9);

// First, that the checks still see. A crate half under the floor of a 4 x 4 room and a shadow lamp left at three's
// 500 m far must both be found; a material two builds hold without being marked shared must be, and a prop whose
// dispose() frees a shared material too.
{
  const room = { width: 4, depth: 4, height: 2.6 };
  const group = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xaa2222 }));
  crate.position.y = 0.1;
  crate.userData.lint = 'crate#1';
  const lamp = new THREE.PointLight(0xffffff, 1, 10);
  lamp.castShadow = true;
  group.add(crate, lamp);
  const sunk = lintPlacement(group, room).some((f) => f.check === 'sunk');
  const far = lintLights(group, true).findings.some((f) => f.check === 'shadow far');

  const cached = new THREE.MeshStandardMaterial({ color: 0x2244aa });
  const twice = () => new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), cached);
  const ledger = new SharingLedger();
  ledger.note(twice(), 'first build');
  const unshared = ledger.note(twice(), 'second build').some((f) => f.check === 'unshared cache');

  const palette = markShared(new THREE.MeshStandardMaterial({ color: 0x44aa22 }));
  const careless = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), palette);
  careless.dispose = () => palette.dispose();
  const freed = lintDisposal(careless).findings.some((f) => f.check === 'shared disposed');

  if (!sunk || !far || !unshared || !freed) {
    restore();
    console.error('[scene] the checks missed a known fault (a sunk crate, a 500 m shadow far, an unmarked cache, a freed palette material): the lint is blind, fix world/lint first');
    process.exit(1);
  }
}

const only = arg('only');
const verbose = flag('verbose');
/** key -> detail */
const found = new Map();
const failed = [];
const notes = [];
const ledger = new SharingLedger();
let checked = 0;

/** `subject | check | key`, with ` #2` when the same key comes up twice in one subject. */
function keyed(subject, check, key) {
  const base = `${subject} | ${check} | ${key}`;
  let full = base;
  for (let n = 2; found.has(full); n++) full = `${base} #${n}`;
  return full;
}
const file = (subject, finding) => found.set(keyed(subject, finding.check, finding.key), finding.detail);
const firstLine = (error) => String(error?.message ?? error).split('\n')[0];
/** What a subject built: a prop's one item, a room's shell and its placed things (the catalogue's floor slab is not one). */
const itemsOf = (built) => built.children.filter((o) => o.name !== 'Floor');

for (const subject of zfightSubjects()) {
  if (only && !subject.name.includes(only)) continue;
  let built;
  try {
    built = subject.build();
  } catch (error) {
    failed.push(`${subject.name}: ${firstLine(error)}`);
    continue;
  }
  checked++;
  const isRoom = subject.room !== undefined;
  const lights = lintLights(built, isRoom);
  for (const f of lights.findings) file(subject.name, f);
  if (verbose && isRoom) notes.push(`  ${subject.name}: ${lights.summary}`);
  if (isRoom) {
    for (const f of lintPlacement(built, subject.room)) file(subject.name, f);
    for (const f of lintReach(built)) file(subject.name, f);
  }
  const items = itemsOf(built);
  for (const item of items) for (const f of ledger.note(item, subject.name)) file(f.subject, f);
  for (const item of items) {
    const { findings, error } = lintDisposal(item);
    for (const f of findings) file(subject.name, f);
    if (error && verbose) notes.push(`  ${subject.name}: dispose() needs the running game (${firstLine(error)})`);
  }
  // A prop built again: what both builds hold outlives a zone and must be marked shared.
  if (!isRoom) {
    try {
      for (const item of itemsOf(subject.build())) for (const f of ledger.note(item, `${subject.name} (again)`)) file(f.subject, f);
    } catch {
      // The first build's error is the one reported.
    }
  }
}
restore();
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const keys = [...found.keys()].sort();
if (flag('write-baseline')) {
  if (only) {
    console.error('[scene] --write-baseline with --only would drop the other subjects: run it on everything');
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
  console.log(`[scene] wrote ${path.relative(ROOT, BASELINE)}: ${keys.length} known finding(s) over ${checked} subjects (${seconds} s)`);
  process.exit(0);
}

const baseline = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : []);
const fresh = keys.filter((k) => !baseline.has(k));
const gone = [...baseline].filter((k) => !found.has(k) && (!only || k.includes(only)));
const describe = (k) => `  ${k}\n      ${found.get(k)}`;
if (flag('list')) for (const k of keys) console.log(describe(k));
for (const note of notes) console.log(note);
for (const f of failed) console.log(`[scene] could not build ${f}`);
if (gone.length) console.log(`[scene] ${gone.length} baseline finding(s) fixed: run \`npm run scene-lint -- --write-baseline\` to drop them`);
if (fresh.length) {
  console.log(`[scene] ${fresh.length} new finding(s):`);
  const checks = new Set();
  for (const k of fresh) {
    console.log(describe(k));
    checks.add(k.split(' | ')[1]);
  }
  for (const check of checks) console.log(`[scene] ${check}: ${HINTS[check] ?? 'see docs/checks.md'}`);
  console.log('[scene] fix it, or accept it with --write-baseline if it is right as it is');
  process.exit(1);
}
console.log(`[scene] ${checked} subjects, ${keys.length} known finding(s), none new (${seconds} s)`);
process.exit(0);
