// The rules that keep z-fighting, freed materials and shader recompiles from coming back, checked on
// every `npm run typecheck` (there is no test suite: this and tsc are the check). Each rule says where
// the right way lives. A line may opt out with a trailing `// convention-ok: <why>`.
//
// Besides the line rules, a ratchet: hand-picked small offsets (`+ 0.002`, `z: 0.004`) are how z-fighting
// came back every time, so each file's count of them may not grow past `scripts/offset-baseline.json`.
// New code takes a layer (`world/surface/layers`: onSurface / layMesh / decal) or a real gap (`gapAt`).
// `node scripts/check-conventions.mjs --write-baseline` rewrites the baseline from the tree as it is
// (after a cleanup that lowered counts, or to accept reviewed ones).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS, '..', 'src');
const BASELINE = path.join(SCRIPTS, 'offset-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');

/** A layer's lift used as a bare number. */
const LIFT = /\b(FLOOR|GROUND|WALL|FACADE)\.\w+\.lift\b/;
/** A file that draws its layers as layers: the lift then goes with a polygon offset. */
const LAYERED = /\bonSurface\(|\blayMesh\(|\bdecal\(/;
/** A small literal offset: plus or minus a few millimetres, or a coordinate of a few millimetres. */
const SMALL_OFFSET = /[+-]\s*0\.00[1-9]\d*\b|\b[xyz]\s*:\s*-?0\.00[1-9]\d*\b/g;

const RULES = [
  {
    name: 'render order band',
    // A bare number: every transparent thing picks a band of `RENDER_ORDER` (world/surface/layers.ts).
    test: (line) => /\.renderOrder\s*=\s*-?\d/.test(line),
    except: ['world/surface/layers.ts'],
    hint: 'use RENDER_ORDER.<band> from world/surface/layers',
  },
  {
    name: 'surface layer',
    // Hand-set polygon offsets: a flat thing on a surface takes a layer and `onSurface()`.
    test: (line) => /polygonOffset(Factor|Units)?\s*[:=]/.test(line),
    except: ['world/surface/layers.ts', 'world/surface/zfight.ts'],
    hint: 'use onSurface(material, FLOOR|GROUND|WALL.<layer>) from world/surface/layers',
  },
  {
    name: 'shared geometry',
    // boxMesh / part / cylinderMesh / invisibleHitbox hand out cached geometries: never edit one in place.
    test: (line) => /\.geometry\.(translate|rotate[XYZ]|scale|applyMatrix4|applyQuaternion|center|setAttribute|deleteAttribute)\(/.test(line),
    except: [],
    hint: 'clone the geometry first (mesh.geometry = mesh.geometry.clone()), or move the mesh',
  },
  {
    name: 'module material',
    // A module-level material is shared by every instance: it must be a palette material (or marked
    // shared), or the first zone to unload frees it under everyone else.
    test: (line) => /^(export )?const \w+ = new THREE\.Mesh\w*Material\(/.test(line) || /^(export )?const \w+ = matte\(/.test(line),
    except: [],
    hint: 'use standard()/paint()/shared() from world/materials/palette (or markShared)',
  },
  {
    name: 'light visibility',
    // Hiding a light changes the scene's light count and recompiles every lit shader.
    test: (line) => /\b(light|bulb|lamp|glow)\w*\.visible\s*=/i.test(line) && !/mesh|Mesh|shade|Shade|glass|Glass|lens|Lens|halo|Halo|pool|Pool/.test(line),
    except: ['world/lighting/keepLights.ts', 'world/lighting/LightCuller.ts'],
    hint: 'dim it (intensity = 0) or hide its lamp with setShownKeepingLights (world/lighting/keepLights)',
  },
  {
    name: 'canvas texture',
    // One way a canvas becomes a texture: colour space, anisotropy by intent, tiling (graphics/canvas).
    test: (line) => /new THREE\.CanvasTexture\(/.test(line),
    except: ['graphics/canvas.ts'],
    hint: "use canvasTexture(canvas, { data?, anisotropy?, repeat? }) or toTexture(canvas, 'grazing' | 'facing') from graphics/canvas",
  },
  {
    name: 'texture tiling',
    // Both ways at once is `repeat: true` / `repeatTexture`; one axis only is a reviewed exception.
    test: (line) => /RepeatWrapping/.test(line),
    except: ['graphics/canvas.ts'],
    hint: 'use canvasTexture(canvas, { repeat: true }) or repeatTexture(texture) from graphics/canvas; one axis only takes `// convention-ok: <why>`',
  },
  {
    name: 'anisotropy number',
    // The filtering follows the quality level: an intent, never a number picked per prop.
    test: (line) => /\b(toTexture|canvasTexture)\([^;]*,\s*\d+\s*\)/.test(line) || /\banisotropy\s*[:=]\s*\d/.test(line),
    except: ['graphics/canvas.ts', 'graphics/quality.ts'],
    hint: "pass an Anisotropy intent ('grazing' | 'facing', graphics/canvas); a number with its reason takes `// convention-ok: <why>`",
  },
  {
    name: 'random lift',
    // A random height per thing scatters it across the other layers' heights (leaves over a wet road).
    test: (line) => /\.lift\s*[+-]\s*random\(\)|random\(\)\s*\*\s*\(?[^,;]*\.lift\b/.test(line),
    except: ['world/surface/layers.ts'],
    hint: 'give the scattered things a band of their own in world/surface/layers, or a fixed lift',
  },
];

/** Rules on a whole file (what `test` gets: its code lines, comments and opted-out lines left out). */
const FILE_RULES = [
  {
    name: 'layer without its offset',
    // `X.y.lift` alone is a few millimetres: past 20-40 m it fights. `onSurface` / `layMesh` add the layer's rank.
    test: (lines) => lines.some(LIFT_TEST) && !lines.some((line) => LAYERED.test(line)),
    except: ['world/surface/layers.ts'],
    hint: 'draw it with layMesh(mesh, layer) or onSurface(material, layer) (world/surface/layers); a solid slab whose top is the layer takes `// convention-ok: <why>`',
  },
];

function LIFT_TEST(line) {
  return LIFT.test(line);
}

const problems = [];
/** Small literal offsets per file (`SMALL_OFFSET`), for the ratchet. */
const offsets = {};
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) check(full);
  }
})(ROOT);

function check(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const code = [];
  let small = 0;
  lines.forEach((line, i) => {
    if (/\/\/ convention-ok\b/.test(line)) return;
    const stripped = line.replace(/\/\/.*$/, '');
    if (/^\s*(\*|\/\*)/.test(stripped)) return;
    code.push(stripped);
    small += (stripped.match(SMALL_OFFSET) ?? []).length;
    for (const rule of RULES) {
      if (rule.except.includes(rel)) continue;
      if (rule.test(stripped)) problems.push(`src/${rel}:${i + 1}: ${rule.name}: ${rule.hint}\n    ${line.trim()}`);
    }
  });
  for (const rule of FILE_RULES) {
    if (rule.except.includes(rel)) continue;
    if (rule.test(code)) problems.push(`src/${rel}: ${rule.name}: ${rule.hint}`);
  }
  // Only what builds 3D things (a sound's 0.005 s is no depth).
  const builds3d = lines.some((line) => /from 'three'/.test(line));
  if (small > 0 && builds3d && rel !== 'world/surface/layers.ts') offsets[`src/${rel}`] = small;
}

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
