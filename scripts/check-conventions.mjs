// The rules that keep z-fighting, freed materials and shader recompiles from coming back, checked on
// every `npm run typecheck` (there is no test suite: this and tsc are the check). Each rule says where
// the right way lives. A line may opt out with a trailing `// convention-ok: <why>`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

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
    except: ['world/surface/layers.ts'],
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
    except: ['world/lighting/keepLights.ts'],
    hint: 'dim it (intensity = 0) or hide its lamp with setShownKeepingLights (world/lighting/keepLights)',
  },
];

const problems = [];
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
  lines.forEach((line, i) => {
    if (/\/\/ convention-ok\b/.test(line)) return;
    const code = line.replace(/\/\/.*$/, '');
    if (/^\s*(\*|\/\*)/.test(code)) return;
    for (const rule of RULES) {
      if (rule.except.includes(rel)) continue;
      if (rule.test(code)) problems.push(`src/${rel}:${i + 1}: ${rule.name}: ${rule.hint}\n    ${line.trim()}`);
    }
  });
}

if (problems.length) {
  console.error(`[conventions] ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.join('\n')}`);
  process.exit(1);
}
