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
// The code is bundled with the project's esbuild into a temp file and run in Node. Canvases are stubbed: painting
// does nothing (the detector reads geometry, colours and uvs only); WebGL is absent, so whatever asks for it falls back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'scripts', 'zfight-baseline.json');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

// A 2D context that accepts everything and draws nothing; getImageData hands back blank pixels of the asked size.
const STUBS = `
  const noop = () => {};
  const gradient = { addColorStop: noop };
  function context(canvas) {
    const state = { canvas, font: '10px serif', fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1 };
    return new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return (text) => ({ width: String(text).length * (parseFloat(target.font) || 10) * 0.55, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (key === 'getImageData' || key === 'createImageData') return (x, y, w, h) => { const W = w ?? x?.width ?? 1, H = h ?? x?.height ?? 1; return { width: W, height: H, data: new Uint8ClampedArray(Math.max(1, W * H * 4)) }; };
        if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') return () => gradient;
        if (key === 'createPattern') return () => ({ setTransform: noop });
        if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, invertSelf() { return this; } });
        if (key === 'getLineDash') return () => [];
        if (key === 'isPointInPath' || key === 'isPointInStroke') return () => false;
        return noop;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
  }
  class FakeCanvas {
    constructor(width = 300, height = 150) { this.width = width; this.height = height; this.style = {}; }
    getContext(kind) { return kind === '2d' ? (this.ctx ??= context(this)) : null; }
    toDataURL() { return 'data:,'; }
    addEventListener() {}
    removeEventListener() {}
  }
  class FakeImage { constructor() { this.width = 1; this.height = 1; this.complete = true; } addEventListener() {} removeEventListener() {} set src(v) { this._src = v; } get src() { return this._src; } decode() { return Promise.resolve(); } }
  const element = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, addEventListener: noop, removeEventListener: noop, setAttribute: noop });
  globalThis.window = globalThis;
  globalThis.addEventListener = noop; globalThis.removeEventListener = noop;
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  globalThis.location = { search: '?quality=high', href: 'http://localhost/?quality=high', hostname: 'localhost' };
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
  globalThis.devicePixelRatio = 1; globalThis.innerWidth = 1920; globalThis.innerHeight = 1080;
  globalThis.Image = FakeImage; globalThis.HTMLCanvasElement = FakeCanvas; globalThis.HTMLImageElement = FakeImage;
  globalThis.OffscreenCanvas = FakeCanvas;
  globalThis.fetch = () => Promise.reject(new Error('no network headless'));
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : tag === 'img' ? new FakeImage() : element()),
    createElementNS: (_ns, tag) => (tag === 'canvas' ? new FakeCanvas() : element()),
    addEventListener: noop, removeEventListener: noop, body: element(), head: element(), documentElement: element(),
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]), check: () => true, add: noop },
    visibilityState: 'visible', hidden: false,
  };
  if (!('navigator' in globalThis) || !globalThis.navigator) globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0, hardwareConcurrency: 4 };
`;

const out = path.join(os.tmpdir(), `bibliothek-zfight-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `
      export { zfightSubjects } from '@/world/surface/zfightCatalogue';
      export { findZFighting } from '@/world/surface/zfight';
      export * as THREE from 'three';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { '@': path.join(ROOT, 'src') },
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty' },
  banner: { js: `(() => {${STUBS}})();` },
  outfile: out,
  logLevel: 'error',
});

const started = performance.now();
const quiet = { log: console.log, warn: console.warn, info: console.info };
console.warn = () => {};
console.info = () => {};
let mod;
try {
  mod = await import(pathToFileURL(out).href);
} finally {
  fs.rmSync(out, { force: true });
}
const { zfightSubjects, findZFighting, THREE } = mod;

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
    Object.assign(console, quiet);
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
    quiet.log(`  ${subject.name}: ${meshes} meshes, ${Math.round(triangles)} triangles, judged at ${subject.viewDistance.toFixed(1)} m`);
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
Object.assign(console, quiet);
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
