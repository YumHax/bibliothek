import * as THREE from 'three';
import { markShared } from './sharedResources';
import { fabric, scuffed, wood } from './finishes';

/**
 * Shared, memoised materials: one per look for the whole page, marked shared so no zone's unload
 * frees them, and so props that look alike batch into the same program and state.
 *
 * The rule: **never mutate a palette material** (colour, emissive, opacity, map, side...), since every
 * prop using that look would change with it. A material a prop changes at runtime (a lamp's glow,
 * a fade, a highlight) is its own: `matte()` or `new THREE.Mesh*Material` in that class.
 *
 * And never give one material to both an `InstancedMesh` and a plain mesh: three r169 keeps one
 * program per material and swaps it (and re-uploads its uniforms) at every draw that switches
 * between the two. Instanced things take a key of their own (`shared('pigeon|instanced', ...)`);
 * `?debug` logs the materials that are used both ways (`[materials]`).
 */
const cache = new Map<string, THREE.Material>();

/** The material cached under `key`, made by `make` the first time. For looks the helpers below do not cover (a patched shader, a canvas map). */
export function shared<M extends THREE.Material>(key: string, make: () => M): M {
  let material = cache.get(key) as M | undefined;
  if (!material) {
    material = markShared(make());
    cache.set(key, material);
  }
  return material;
}

/** A shared `MeshStandardMaterial` with these parameters: identical parameters anywhere in the code give the same material. */
export function standard(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return shared(`standard|${keyOf(parameters)}`, () => new THREE.MeshStandardMaterial(parameters));
}

/** The twin of `standard(parameters)` for `InstancedMesh`es only (see the rule above: one material never serves both). */
export function instancedStandard(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return shared(`instanced|standard|${keyOf(parameters)}`, () => new THREE.MeshStandardMaterial(parameters));
}

/** The twin of `basic(parameters)` for `InstancedMesh`es only. */
export function instancedBasic(parameters: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return shared(`instanced|basic|${keyOf(parameters)}`, () => new THREE.MeshBasicMaterial(parameters));
}

/** A shared `MeshBasicMaterial` (unlit: glows, printed signs, masks). */
export function basic(parameters: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return shared(`basic|${keyOf(parameters)}`, () => new THREE.MeshBasicMaterial(parameters));
}

/** The shared twin of `matte(color, roughness)`: a plain painted, plastic or cloth surface. */
export function paint(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return standard({ color, roughness });
}

/** The shared twin of `wood(color, roughness)` (grain and dust with `QUALITY.detailedMaterials`). */
export function timber(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return shared(`wood|${colorKey(color)}|${roughness}`, () => wood(color, roughness));
}

/** The shared twin of `fabric({ color, roughness })` (cloth with sheen on high quality). */
export function cloth(color: THREE.ColorRepresentation, roughness = 1): THREE.MeshStandardMaterial {
  return shared(`fabric|${colorKey(color)}|${roughness}`, () => fabric({ color, roughness }));
}

/** A shared `scuffed` paint (door linings, baseboards). */
export function scuffedPaint(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return shared(`scuffed|${colorKey(color)}|${roughness}`, () => scuffed(new THREE.MeshStandardMaterial({ color, roughness })));
}

/** The house metals and the invisible hit material, each one material for the page. */
export const METAL = {
  /** Polished brass: handles, lamp stems, keys. */
  brass: (): THREE.MeshStandardMaterial => standard({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 }),
  /** Old, darker brass: display cabinets, the collector's binder, market fittings. */
  agedBrass: (): THREE.MeshStandardMaterial => standard({ color: 0xb8892a, metalness: 0.9, roughness: 0.35 }),
  /** Brushed steel: appliances, bins, rails. */
  steel: (): THREE.MeshStandardMaterial => standard({ color: 0xc4c7cb, metalness: 0.7, roughness: 0.3 }),
  /** Satin steel, duller: coat hooks, umbrella stands, door furniture. */
  satinSteel: (): THREE.MeshStandardMaterial => standard({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 }),
  /** Bright chrome: taps, jukebox trim, radio grilles. */
  chrome: (): THREE.MeshStandardMaterial => standard({ color: 0xd8dadd, metalness: 0.9, roughness: 0.2 }),
} as const;

/** The material of every invisible hitbox: draws nothing. */
export function invisible(): THREE.MeshBasicMaterial {
  return basic({ visible: false });
}

/* ---------- keys ---------- */

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

/** A colour by its components, not `getHexString()` (which clamps: an HDR glow of 2.4 would key as white). */
function colorKey(color: THREE.ColorRepresentation): string {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  return `${c.r},${c.g},${c.b}`;
}

/** A stable key for material parameters: colours by value, textures and other objects by identity. */
function keyOf(parameters: object): string {
  return Object.keys(parameters)
    .sort()
    .map((name) => {
      const value: unknown = (parameters as Record<string, unknown>)[name];
      return `${name}=${valueKey(name, value)}`;
    })
    .join(',');
}

function valueKey(name: string, value: unknown): string {
  const isColour = /color|emissive$|specular|sheenColor|attenuationColor/i.test(name);
  if ((typeof value === 'number' || typeof value === 'string') && isColour) return colorKey(value);
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value);
  if (value instanceof THREE.Color) return colorKey(value);
  if (value instanceof THREE.Vector2) return `${value.x}:${value.y}`;
  if (typeof value === 'object') {
    let id = objectIds.get(value);
    if (id === undefined) objectIds.set(value, (id = nextObjectId++));
    return `#${id}`;
  }
  return String(value);
}
