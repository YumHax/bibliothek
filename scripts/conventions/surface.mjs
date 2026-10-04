// Surfaces, materials, textures and lights: the rules that keep z-fighting, freed materials and shader recompiles
// from coming back (docs/props.md "Materials, joints and layers", docs/graphics.md). Loaded by ../check-conventions.mjs
// with the other rule modules of this folder; see there for a rule's shape.

/** A layer's lift used as a bare number. */
const LIFT = /\b(FLOOR|GROUND|WALL|FACADE)\.\w+\.lift\b/;
/** A file that draws its layers as layers: the lift then goes with a polygon offset. */
const LAYERED = /\bonSurface\(|\blayMesh\(|\bdecal\(/;

export const rules = [
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

export const fileRules = [
  {
    name: 'layer without its offset',
    // `X.y.lift` alone is a few millimetres: past 20-40 m it fights. `onSurface` / `layMesh` add the layer's rank.
    test: (lines) => lines.some((line) => LIFT.test(line)) && !lines.some((line) => LAYERED.test(line)),
    except: ['world/surface/layers.ts'],
    hint: 'draw it with layMesh(mesh, layer) or onSurface(material, layer) (world/surface/layers); a solid slab whose top is the layer takes `// convention-ok: <why>`',
  },
];
