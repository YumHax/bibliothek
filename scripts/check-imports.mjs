// The import rules, checked on every `npm run typecheck`: the layer order CLAUDE.md states, read off the import graph
// of src/ (every .ts file's static `import` / `export ... from`, side-effect imports and `import()` calls). Type-only
// imports are erased at build time and count for nothing; a dynamic import counts for the layering rules (it still
// couples the modules) and never for a cycle (it runs after both are initialised).
//
// - main.ts only calls the bootstrap steps: its value imports are `@/bootstrap/*`.
// - bootstrap is the top of the stack: nothing else imports it, types included.
// - the engine (core, player, input, interaction) knows no content: its value imports stay in the engine folders,
//   graphics, settings and persistence. What it needs of the HUD or the world is handed in by the bootstrap wiring.
// - the plans are data: no value import of three.js, the engine, the rules (game/), the HUD, the zones or the
//   builders (layout.ts, furnish*.ts). A dimension constant from a prop module is fine.
// - furniture (world/**) knows nothing of the session's rules: no value import of game/.
// - furniture reads no other zone's plan and never the world plan: a zone's classes may read their own zone's plan
//   (`world/<zone>/…` and its `<zone>Plan.ts`, the collection room's being world/roomPlan.ts), the city and the window
//   views may read what they draw (the street's and the courtyard's plans); a dimension both sides need is a measure
//   (world/measures/), a position comes from the builder. The zone layer, the builders' helpers (world/build/,
//   place*.ts) and the headless checks read plans by role.
// - no runtime import cycle (value, static edges): a module read while still initialising is `undefined` or not
//   depending on who imported whom first, which no browser test fails twice the same way.
//
// A line may opt out with a trailing `// imports-ok: <why>`: its edge then counts for nothing, cycles included.
// Each rule is data below, with a `hint` saying where the right way lives; the script first checks itself on a
// small synthetic tree (every rule must fire there, and a type-only or dynamic cycle must not).
//
//   node scripts/check-imports.mjs            fails on a problem
//   node scripts/check-imports.mjs --verbose  edge counts, what fired where, and the plans-imported-by-furniture tally
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const VERBOSE = process.argv.includes('--verbose');

const ENGINE = ['core/', 'player/', 'input/', 'interaction/'];
/** What the engine may import besides itself: leaf utilities with no content of their own (maths, random, text among them). */
const ENGINE_MAY_IMPORT = [...ENGINE, 'graphics/', 'settings/', 'persistence/', 'math/', 'random/', 'text/'];
/** What a plan may not import at runtime: the engine, the rules, the HUD, the zones. */
const PLANS_MAY_NOT_IMPORT = ['game/', 'bootstrap/', 'core/', 'player/', 'input/', 'interaction/', 'ui/', 'world/zone/'];

const under = (file, prefixes) => prefixes.some((prefix) => file.startsWith(prefix));
const isPlan = (file) => file === 'world/worldPlan.ts' || file === 'world/roomPlan.ts' || /^world\/.*Plan\.ts$/.test(file);
const isBuilder = (file) => file === 'world/layout.ts' || /(^|\/)(furnish|place)[A-Z]\w*\.ts$/.test(file);
/**
 * The zone a world file belongs to: its top folder under world/ (`world/stairwell/Lift.ts` is the stairwell's, a
 * plan in a subfolder too: `world/stairwell/powerCut/powerCutPlan.ts`); a file at world's root is the collection
 * room's (its plan is `world/roomPlan.ts`).
 */
const zoneOf = (file) => {
  const match = file.match(/^world\/([^/]+)\//);
  return match ? `world/${match[1]}/` : 'world/';
};
/** What reads the plans by role, not as furniture: the zone layer, the builders' helpers, the headless checks. */
const PLAN_READERS = ['world/zone/', 'world/World.ts', 'world/Sky.ts', 'world/zoneHandle.ts', 'world/travel/', 'world/build/', 'world/buildContext.ts', 'world/surface/zfightCatalogue.ts', 'world/lint/'];
/** Folders that draw what another zone's plan lays out: the city (the street's description shared by its two views) and the views onto the street and the courtyard. */
const PLAN_VIEWERS = { 'world/city/': ['world/street/'], 'world/outlook/': ['world/street/', 'world/courtyard/'] };

/**
 * A rule looks at one edge: `from(file)` says whether the importing file is its concern, `forbids(to, edge)` whether
 * the edge breaks it (`to` is the imported file, src-relative, or null for a package: `edge.external` then names it).
 * Type-only edges are skipped unless `types` is set.
 */
const RULES = [
  {
    name: 'main is wiring only',
    from: (file) => file === 'main.ts',
    forbids: (to) => to !== null && !to.startsWith('bootstrap/'),
    hint: 'src/main.ts only calls the src/bootstrap/* steps: put the wiring in a bootstrap step',
  },
  {
    name: 'bootstrap is the top',
    from: (file) => file !== 'main.ts' && !file.startsWith('bootstrap/'),
    forbids: (to) => to !== null && to.startsWith('bootstrap/'),
    types: true,
    hint: 'nothing imports the wiring; move what is shared into the module it wires (services, world, ui...)',
  },
  {
    name: 'engine knows no content',
    from: (file) => under(file, ENGINE),
    forbids: (to) => to !== null && !under(to, ENGINE_MAY_IMPORT),
    hint: 'hand it in from the bootstrap wiring (an option, a callback, an element), as TouchControls takes its badgeHome',
  },
  {
    name: 'plans are data',
    from: isPlan,
    forbids: (to, edge) => (to === null ? edge.external === 'three' : under(to, PLANS_MAY_NOT_IMPORT) || isBuilder(to)),
    hint: 'a plan names kinds, placements and options (docs/architecture.md "Layers"): build it in layout.ts or the zone\'s furnish<Kind>.ts',
  },
  {
    name: 'furniture knows no rules',
    from: (file) => file.startsWith('world/'),
    forbids: (to) => to !== null && to.startsWith('game/'),
    hint: 'furniture asks the Session through an Interactable or a callback handed in by its builder, never by importing game/',
  },
  {
    name: 'furniture knows no other plan',
    // A zone's own classes may read their zone's plan (it is their data); nothing reads another zone's, and nothing
    // reads the world plan: a shared dimension is a measure (world/measures), a position comes from the builder.
    from: (file) => file.startsWith('world/') && !isPlan(file) && !isBuilder(file) && !under(file, PLAN_READERS),
    forbids: (to, _edge, file) => {
      if (to === null || !isPlan(to)) return false;
      if (to === 'world/worldPlan.ts') return true;
      const zone = zoneOf(file);
      const planZone = zoneOf(to);
      return zone !== planZone && !(PLAN_VIEWERS[zone] ?? []).includes(planZone);
    },
    hint: "a dimension both read goes in world/measures/, a position comes as an option from the zone's builder (furnish<Kind>.ts); a class reads only its own zone's plan",
  },
];

const ASSET = /\.(css|png|jpg|jpeg|svg|webp|wasm|json|glsl|mp3|ogg|wav)(\?\w+)?$/;

/** The static import / export-from statements and `import()` calls of one file's text, comments left out. */
function edgesOf(text) {
  const edges = [];
  const optOut = new Set();
  // Comments go, so a doc comment quoting an import is not one; the line count is kept so the numbers stay right.
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^([^\n]*?)\s\/\/(?!\s*imports-ok\b).*$/gm, '$1')
    .replace(/^\s*\/\/(?!\s*imports-ok\b).*$/gm, '');
  const lineOf = (index) => code.slice(0, index).split('\n').length;
  code.replace(/^.*\/\/\s*imports-ok\b.*$/gm, (line, index) => {
    optOut.add(lineOf(index));
    return line;
  });
  // `import x from`, `import { a, type B } from`, `import type ...`, `export { x } from`, `export * from`.
  const statement = /^[ \t]*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm;
  for (const match of code.matchAll(statement)) {
    const [, , typeKeyword, clause, spec] = match;
    const specifiers = clause.replace(/^[^{]*\{|\}[^}]*$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    const defaultOrNamespace = /^[\w$]+\s*,|^[\w$]+$|^\*/.test(clause.trim());
    const everyTyped = specifiers.length > 0 && specifiers.every((s) => /^type\s/.test(s)) && !defaultOrNamespace;
    edges.push({ line: lineOf(match.index), spec, typeOnly: Boolean(typeKeyword) || everyTyped, dynamic: false, text: match[0].trim() });
  }
  // Side-effect imports: `import './x.css'`, `import '@/x'`.
  for (const match of code.matchAll(/^[ \t]*import\s+['"]([^'"]+)['"]/gm)) {
    edges.push({ line: lineOf(match.index), spec: match[1], typeOnly: false, dynamic: false, text: match[0].trim() });
  }
  for (const match of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    edges.push({ line: lineOf(match.index), spec: match[1], typeOnly: false, dynamic: true, text: match[0].trim() });
  }
  for (const edge of edges) edge.optOut = optOut.has(edge.line);
  return edges;
}

/** Where `spec` imported from `file` lands: a src-relative .ts file, a package name, an asset, or nothing. */
function resolve(file, spec, exists) {
  if (ASSET.test(spec)) return { to: null, external: null, asset: true };
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
  else return { to: null, external: spec.split('/')[0].startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0], asset: false };
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (candidate.endsWith('.ts') && exists(candidate)) return { to: candidate, external: null, asset: false };
  }
  return { to: null, external: null, asset: false, unresolved: true };
}

/** The whole analysis over a tree: `files` maps src-relative paths to their text. */
function analyse(files) {
  const exists = (rel) => files.has(rel);
  const graph = new Map();
  const problems = [];
  const fired = new Map();
  let edgeCount = 0;
  for (const [file, text] of files) {
    const edges = edgesOf(text).map((edge) => ({ ...edge, ...resolve(file, edge.spec, exists) }));
    graph.set(file, edges);
    for (const edge of edges) {
      edgeCount++;
      if (edge.optOut || edge.asset) continue;
      if (edge.unresolved) {
        problems.push(`src/${file}:${edge.line}: unresolved import: nothing at '${edge.spec}' (a moved file, a typo)\n    ${edge.text}`);
        continue;
      }
      for (const rule of RULES) {
        if (!rule.from(file)) continue;
        if (edge.typeOnly && !rule.types) continue;
        if (!rule.forbids(edge.to, edge, file)) continue;
        fired.set(rule.name, (fired.get(rule.name) ?? 0) + 1);
        problems.push(`src/${file}:${edge.line}: ${rule.name}: ${rule.hint}\n    ${edge.text}`);
      }
    }
  }
  const cycles = runtimeCycles(graph);
  for (const cycle of cycles) {
    fired.set('import cycle', (fired.get('import cycle') ?? 0) + 1);
    problems.push(`src/${cycle[0]}: import cycle: ${cycle.map((f) => path.basename(f)).join(' > ')} (break it with a type-only import, a callback, or a module that owns the shared piece)\n    ${cycle.join(' > ')}`);
  }
  return { problems, cycles, fired, edgeCount, graph };
}

/** The cycles over value, static edges (Tarjan's components, one shortest loop printed per component). */
function runtimeCycles(graph) {
  const next = new Map();
  for (const [file, edges] of graph) {
    next.set(file, [...new Set(edges.filter((e) => e.to && !e.typeOnly && !e.dynamic && !e.optOut).map((e) => e.to))]);
  }
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  // Iterative Tarjan: 1300 files chained by imports would blow a recursive one's stack.
  for (const root of next.keys()) {
    if (indices.has(root)) continue;
    const work = [[root, 0]];
    indices.set(root, index);
    low.set(root, index);
    index++;
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node] = frame;
      const targets = next.get(node) ?? [];
      if (frame[1] < targets.length) {
        const target = targets[frame[1]++];
        if (!indices.has(target)) {
          indices.set(target, index);
          low.set(target, index);
          index++;
          stack.push(target);
          onStack.add(target);
          work.push([target, 0]);
        } else if (onStack.has(target)) {
          low.set(node, Math.min(low.get(node), indices.get(target)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === indices.get(node)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        if (component.length > 1 || (next.get(node) ?? []).includes(node)) components.push(component);
      }
    }
  }
  return components.map((component) => shortestLoop(component.sort()[0], new Set(component), next));
}

/** The shortest path from `start` back to itself through `members` (breadth first), as `[start, ..., start]`. */
function shortestLoop(start, members, next) {
  const previous = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const target of next.get(node) ?? []) {
      if (!members.has(target)) continue;
      if (target === start) {
        const loop = [start];
        for (let at = node; at !== null; at = previous.get(at)) loop.push(at);
        return loop.reverse();
      }
      if (!previous.has(target)) {
        previous.set(target, node);
        queue.push(target);
      }
    }
  }
  return [start, start];
}

/** Every rule must fire on this tree, and the only cycle is the value one (type-only and dynamic loops are none). */
function selfTest() {
  const tree = new Map([
    ['main.ts', "import { a } from '@/world/a';\nimport type { Session } from '@/game/s';"],
    ['world/a.ts', "import { b } from '@/bootstrap/b';\nimport { s } from '@/game/s';\nimport { ok } from '@/game/s'; // imports-ok: the self-test's opt-out"],
    ['bootstrap/b.ts', 'export const b = 1;'],
    ['game/s.ts', "import { a } from '@/world/a';\nexport const s = 1;"],
    ['core/c.ts', "import { x } from '@/ui/x';\nimport { Engine } from './Engine';"],
    ['core/Engine.ts', 'export class Engine {}'],
    ['ui/x.ts', "import type { Engine } from '@/core/Engine';\nimport { type T, type U } from '@/core/c';\nexport const x = 1;"],
    ['world/kitchen/kitchenPlan.ts', "import * as THREE from 'three';\nimport { furnishKitchen } from './furnishKitchen';\n/* a comment: import { z } from '@/game/s'; */\nimport { CISTERN_TOP } from '../bathroom/Toilet';"],
    ['world/kitchen/furnishKitchen.ts', "export const furnishKitchen = () => import('./kitchenPlan');"],
    ['world/bathroom/Toilet.ts', 'export const CISTERN_TOP = 0.8;'],
    // The kitchen's own tap reads the kitchen's plan (its data); a generic prop reading it is the one problem here.
    ['world/kitchen/Tap.ts', "import { furnishKitchen } from './furnishKitchen';\nimport type { Zone } from '../zone/Zone';\nexport const tap = furnishKitchen;"],
    ['world/props/Plant.ts', "import { furnishKitchen } from '../kitchen/furnishKitchen';\nimport { CISTERN_TOP } from '../bathroom/Toilet';\nexport const plant = [furnishKitchen, CISTERN_TOP];"],
    ['world/zone/Zone.ts', 'export type Zone = object;'],
  ]);
  // The kitchen plan is imported by the tap (same zone, fine) and by a prop (another zone's plan: fires once).
  tree.set('world/kitchen/Tap.ts', `${tree.get('world/kitchen/Tap.ts')}\nimport { x } from './kitchenPlan';`);
  tree.set('world/props/Plant.ts', `${tree.get('world/props/Plant.ts')}\nimport { x } from '../kitchen/kitchenPlan';`);
  const { problems, cycles, fired } = analyse(tree);
  const missing = RULES.map((r) => r.name).filter((name) => !fired.has(name));
  const expectedCycle = cycles.length === 1 && cycles[0].join(' > ') === 'game/s.ts > world/a.ts > game/s.ts';
  const expectedFires =
    fired.get('plans are data') === 2 && fired.get('furniture knows no rules') === 1 && fired.get('engine knows no content') === 1 && fired.get('furniture knows no other plan') === 1;
  if (missing.length || !expectedCycle || !expectedFires || problems.length !== 8) {
    console.error(`[imports] the self-test failed: the check is blind, fix scripts/check-imports.mjs first\n  rules that did not fire: ${missing.join(', ') || 'none'}\n  cycles: ${cycles.map((c) => c.join(' > ')).join('; ') || 'none'}\n  fired: ${JSON.stringify([...fired])}\n  problems (${problems.length}):\n${problems.join('\n')}`);
    process.exit(1);
  }
}

function readTree() {
  const files = new Map();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.set(path.relative(SRC, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'));
    }
  })(SRC);
  return files;
}

const started = performance.now();
selfTest();
const files = readTree();
const { problems, cycles, fired, edgeCount, graph } = analyse(files);
const ms = Math.round(performance.now() - started);

if (VERBOSE) {
  // The zones' classes reading their own plan (allowed), and the cross-zone reads carried by an `imports-ok` (reviewed).
  const own = [];
  const carried = [];
  for (const [file, edges] of graph) {
    if (!file.startsWith('world/') || isPlan(file) || isBuilder(file) || under(file, PLAN_READERS)) continue;
    for (const edge of edges) {
      if (!edge.to || !isPlan(edge.to) || edge.typeOnly) continue;
      (edge.optOut ? carried : own).push(`${file} -> ${edge.to}`);
    }
  }
  console.log(`[imports] ${files.size} files, ${edgeCount} edges; fired: ${[...fired].map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing'}`);
  console.log(`[imports] plans read by their own zone's classes: ${own.length} import(s); cross-zone reads carried by imports-ok: ${carried.length}`);
  for (const reader of carried.sort()) console.log(`    ${reader}`);
}
if (problems.length) {
  console.error(`[imports] ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`[imports] ${files.size} files, ${edgeCount} edges, ${cycles.length} runtime cycles (${ms} ms)`);
