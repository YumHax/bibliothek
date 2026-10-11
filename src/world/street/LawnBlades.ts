import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { QUALITY } from '@/graphics/quality';
import { currentSeason } from '@/time/season';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { canvasTexture, createCanvas } from '@/graphics/canvas';
import { onLawn, offPaths } from '../city/park';
import { inFlatFrame } from '../city/frontage';
import { WIND_GLSL, STREET_WIND } from './wind';
import { PARK_STREET, PARK_WALK, STREET_ENDS } from '@/world/measures/street';
import { lcg } from '@/random';

/** The blades' grid: a tuft per cell (m), out to this radius round the eye (m), by quality (none on low). */
const GRID = { high: { cell: 0.34, radius: 9 }, medium: { cell: 0.46, radius: 7 } } as const;
/** The mask of where grass grows (the walked gardens and a margin round them), its texel (m). */
const MASK_TEXEL = 0.5;
const MASK_MARGIN = 12;
/** Blades a tuft, and its height (m). */
const BLADES = 6;
const HEIGHT = 0.11;
const GREENS = { spring: 0x6aa040, summer: 0x76983e, autumn: 0x86904a, winter: 0x8a8a5a } as const;

/**
 * Grass you can see blades of, round the eye only, on the lawns of the walked gardens: a field of small tufts on a
 * grid that moves with the camera (each tuft's spot, turn and size from its cell in the world, so nothing slides as
 * the player walks), placed in the vertex shader from the instance's number (no CPU per frame), only where the lawn
 * is (a mask painted once from `city/park`: not on the paths, beds, pond or playground), shrinking away towards the
 * edge of its radius, bending in the street's wind. Lit as the lawn under it (its normals point up). Not on `low`.
 */
export class LawnBlades extends THREE.InstancedMesh implements Furniture {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();

  static wanted(): boolean {
    return QUALITY.level !== 'low';
  }

  constructor(lawnY: number) {
    const grid = QUALITY.level === 'high' ? GRID.high : GRID.medium;
    const side = Math.ceil((grid.radius * 2) / grid.cell);
    const { texture, from, size } = lawnMask();
    const material = new THREE.MeshStandardMaterial({ color: GREENS[currentSeason().name], roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });
    patchShader(material, `lawnBlades:${side}`, (shader) => {
      shader.uniforms.lawnMask = { value: texture };
      shader.uniforms.streetWind = STREET_WIND;
      shader.vertexShader =
        `uniform sampler2D lawnMask;\n` +
        WIND_GLSL +
        afterChunk(
          afterChunk(shader.vertexShader, 'beginnormal_vertex', 'objectNormal = vec3(0.0, 1.0, 0.0);'),
          'begin_vertex',
          /* glsl */ `
          {
            float id = float(gl_InstanceID);
            vec2 cellAt = vec2(mod(id, ${side.toFixed(1)}), floor(id / ${side.toFixed(1)})) - ${(side / 2).toFixed(1)};
            // The eye in the blades' own frame (whatever turns or moves the park they stand in).
            vec3 eyeLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
            vec2 cell = floor(eyeLocal.xz / ${grid.cell.toFixed(3)}) + cellAt;
            vec2 h = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
            vec2 spot = (cell + h) * ${grid.cell.toFixed(3)};
            vec2 maskUv = (spot - vec2(${from[0].toFixed(2)}, ${from[1].toFixed(2)})) / vec2(${size[0].toFixed(2)}, ${size[1].toFixed(2)});
            float grows = (maskUv.x > 0.0 && maskUv.x < 1.0 && maskUv.y > 0.0 && maskUv.y < 1.0) ? texture2D(lawnMask, maskUv).r : 0.0;
            float away = length(spot - eyeLocal.xz);
            float k = grows * (1.0 - smoothstep(${(grid.radius * 0.55).toFixed(2)}, ${grid.radius.toFixed(2)}, away)) * (0.7 + 0.6 * h.x);
            float turn = h.y * 6.2832;
            vec3 p = transformed * k;
            p.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p.xz;
            vec3 world = (modelMatrix * vec4(spot.x, ${lawnY.toFixed(3)}, spot.y, 1.0)).xyz;
            // The wind blows in the world: its push turned back into the blades' frame.
            p += transpose(mat3(modelMatrix)) * windSway(world, h.x * 6.0) * p.y * 3.0;
            transformed = vec3(spot.x, ${lawnY.toFixed(3)}, spot.y) + p;
          }
        `,
        );
    });
    super(tuftGeometry(), material, side * side);
    this.name = 'LawnBlades';
    // Placed in the vertex shader (the instance matrices are the identity): never culled by their box.
    this.frustumCulled = false;
    this.castShadow = false;
    this.receiveShadow = true;
  }
}

/**
 * Where the blades grow: a mask over the walked gardens and a margin round them (zone-local), white on the lawn
 * clear of paths, beds, the pond, the bandstand and the playground, black elsewhere (and past the hedge).
 */
function lawnMask(): { texture: THREE.CanvasTexture; from: [number, number]; size: [number, number] } {
  const x0 = PARK_WALK.minX - MASK_MARGIN;
  const x1 = PARK_STREET.hedge - 0.8;
  const z0 = Math.max(STREET_ENDS.south, PARK_WALK.minZ - MASK_MARGIN);
  const z1 = PARK_WALK.maxZ + MASK_MARGIN;
  const w = Math.ceil((x1 - x0) / MASK_TEXEL);
  const h = Math.ceil((z1 - z0) / MASK_TEXEL);
  const [canvas, ctx] = createCanvas(w, h);
  const image = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [fx, fz] = inFlatFrame([x0 + (i + 0.5) * MASK_TEXEL, z0 + (j + 0.5) * MASK_TEXEL]);
      const v = onLawn(fx, fz, 0.2) && offPaths(fx, fz, 0.1) ? 255 : 0;
      const k = (j * w + i) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = v;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  // Canvas rows run down from the top (v = 1): flipped so the texture's v follows z.
  const texture = canvasTexture(canvas, { data: true, anisotropy: 1, mipmaps: false }); // convention-ok: a mask read in a vertex shader, never seen at a slant
  texture.flipY = false;
  return { texture, from: [x0, z0], size: [w * MASK_TEXEL, h * MASK_TEXEL] };
}

/** One tuft: `BLADES` thin triangles fanned round its foot, leaning out, darker at the root (vertex colour). */
function tuftGeometry(): THREE.BufferGeometry {
  const random = lcg(131);
  const positions: number[] = [];
  const colours: number[] = [];
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + random() * 0.8;
    const lean = 0.25 + random() * 0.45;
    const height = HEIGHT * (0.6 + random() * 0.6);
    const r = 0.05 * random();
    const [bx, bz] = [Math.cos(a) * r, Math.sin(a) * r];
    const [tx, tz] = [bx + Math.cos(a) * height * lean * 0.5, bz + Math.sin(a) * height * lean * 0.5];
    const [cx, cz] = [-Math.sin(a) * 0.006, Math.cos(a) * 0.006];
    positions.push(bx - cx, 0, bz - cz, bx + cx, 0, bz + cz, tx, height, tz);
    colours.push(0.6, 0.6, 0.55, 0.6, 0.6, 0.55, 1.05, 1.05, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return geometry;
}
