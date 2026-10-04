// What the headless checks share (zfight, scene-lint, check-data): the game's TypeScript bundled with the project's
// esbuild into a temp file and imported in Node, with just enough of the browser stubbed for building to run.
// Canvases accept everything and draw nothing (the checks read geometry, colours and uvs, never pixels); WebGL is
// absent, so whatever asks for it falls back; fetch rejects (nothing headless touches the network). arcade-balance.mjs
// keeps its own smaller set (the games need no DOM).
//
//   const { zfightSubjects, THREE } = await bundle(`
//     export { zfightSubjects } from '@/world/surface/zfightCatalogue';
//     export * as THREE from 'three';
//   `);
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/** The repository's root (the scripts live one level down). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The browser, stubbed, as a script prepended to the bundle: a 2D context that accepts everything and draws nothing
 * (getImageData hands back blank pixels of the asked size), images that are always loaded, an empty document, a
 * `location` whose `?quality=` is `quality` (the builders read `QUALITY` at import: high turns the bevels and fillets on).
 */
export function stubs(quality = 'high') {
  return `
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
  globalThis.location = { search: '?quality=${quality}', href: 'http://localhost/?quality=${quality}', hostname: 'localhost' };
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
}

/**
 * Vite's `?raw` imports in Node: `import frag from './Foo.frag.glsl?raw'` is the file's text (the shaders live in
 * `.glsl` files beside the code that compiles them; `src/vite-env.d.ts` types the import, `scripts/check-glsl.mjs`
 * parses the files).
 */
const rawImports = {
  name: 'raw-imports',
  setup(api) {
    api.onResolve({ filter: /\?raw$/ }, (args) => {
      const spec = args.path.replace(/\?raw$/, '');
      // A plugin's resolution runs before esbuild's `alias`, so `@/` is mapped here too.
      const file = spec.startsWith('@/') ? path.join(ROOT, 'src', spec.slice(2)) : path.resolve(args.resolveDir, spec);
      return { path: file, namespace: 'raw' };
    });
    api.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  },
};

/**
 * Bundles `contents` (an ES module body; `@/` is `src/`) for Node and imports it. The temp file is removed once
 * imported, so a stack trace names a file that is gone: the message is what to read. `name` tells the temp files of
 * two checks apart.
 */
export async function bundle(contents, { quality = 'high', name = 'headless' } = {}) {
  const out = path.join(os.tmpdir(), `bibliothek-${name}-${process.pid}.mjs`);
  await build({
    stdin: { contents, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { '@': path.join(ROOT, 'src') },
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' },
    loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty' },
    plugins: [rawImports],
    banner: { js: `(() => {${stubs(quality)}})();` },
    outfile: out,
    logLevel: 'error',
  });
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    fs.rmSync(out, { force: true });
  }
}

/** Mutes console.warn and console.info (the builders chatter as they build); returns what restores them. */
export function hush() {
  const loud = { warn: console.warn, info: console.info };
  console.warn = () => {};
  console.info = () => {};
  return () => Object.assign(console, loud);
}

/** `--name` given on the command line. */
export function flag(name) {
  return process.argv.includes(`--${name}`);
}

/** The value after `--name` on the command line, or `fallback`. */
export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
