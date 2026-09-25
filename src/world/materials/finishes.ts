import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import { afterChunk, patchShader, VALUE_NOISE } from './shaderPatch';
import { markShared } from '../props/Prop';

/** Metres of timber one repeat of the grain texture covers (along the fibres, then across). */
const GRAIN_ALONG_M = 1.6;
const GRAIN_ACROSS_M = 0.4;
const GRAIN_PX = 512;

let grainTexture: THREE.CanvasTexture | null = null;

/**
 * Timber grain, greyscale and seamless: long wavering fibres along x, darker late-wood bands,
 * the odd knot with its growth rings swirling round it. Painted once and shared; the wood shader
 * reads it in object space, so every board gets grain at the same scale whatever its size.
 */
function grain(): THREE.CanvasTexture {
  if (grainTexture) return grainTexture;
  const [canvas, ctx] = createCanvas(GRAIN_PX, GRAIN_PX);
  const random = seededRandom(0x6a1b3c);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, GRAIN_PX, GRAIN_PX);
  // Growth bands: sinuous strokes across the whole tile, wrapped so the tile repeats.
  for (let i = 0; i < 70; i++) {
    const y0 = random() * GRAIN_PX;
    const dark = random() < 0.7;
    const alpha = dark ? 0.08 + random() * 0.22 : 0.05 + random() * 0.1;
    ctx.strokeStyle = dark ? `rgba(20,20,20,${alpha.toFixed(3)})` : `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.lineWidth = 0.6 + random() * (dark ? 3.5 : 2);
    const amplitude = 2 + random() * 6;
    const waves = 1 + Math.floor(random() * 3);
    const phase = random() * Math.PI * 2;
    for (const dy of [-GRAIN_PX, 0, GRAIN_PX]) {
      ctx.beginPath();
      for (let x = 0; x <= GRAIN_PX; x += 8) {
        const y = y0 + dy + Math.sin((x / GRAIN_PX) * Math.PI * 2 * waves + phase) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // A few knots: dark cores with rings round them.
  for (let k = 0; k < 3; k++) {
    const kx = random() * GRAIN_PX;
    const ky = random() * GRAIN_PX;
    for (let r = 14; r > 1; r -= 2.5) {
      ctx.strokeStyle = `rgba(30,25,20,${(0.12 + (14 - r) * 0.015).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * 2.4, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  grainTexture = markShared(new THREE.CanvasTexture(canvas));
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.colorSpace = THREE.NoColorSpace;
  grainTexture.anisotropy = 4;
  return grainTexture;
}

/**
 * Wood: a drop-in for `matte(color, roughness)` on timber (a new material per call, like `matte`).
 * With `QUALITY.detailedMaterials` the grain (projected in object space along each face's plane,
 * fibres along x on the tops and fronts, along z on the sides) shades the colour and the sheen,
 * and up-facing surfaces gather a little dust, more the higher they are (the top of a bookcase).
 */
export function wood(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return woodGrain(new THREE.MeshStandardMaterial({ color, roughness }));
}

/** Adds the grain and dust of `wood()` to an existing material (whatever its colour or map). */
export function woodGrain<M extends THREE.MeshStandardMaterial>(material: M): M {
  if (!QUALITY.detailedMaterials) return material;
  const uniforms = { woodGrain: { value: grain() }, grainScale: { value: new THREE.Vector2(1 / GRAIN_ALONG_M, 1 / GRAIN_ACROSS_M) } };
  return patchShader(material, 'wood', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'varying vec3 vObjectPos;\nvarying vec3 vObjectNormal;\nvarying float vWorldHeight;\nvarying float vUpFacing;\n' +
      afterChunk(
        shader.vertexShader,
        'begin_vertex',
        `vObjectPos = position;
        vObjectNormal = normal;
        vWorldHeight = (modelMatrix * vec4(position, 1.0)).y;
        vUpFacing = normalize((modelMatrix * vec4(normal, 0.0)).xyz).y;`,
      );
    shader.fragmentShader =
      `varying vec3 vObjectPos;\nvarying vec3 vObjectNormal;\nvarying float vWorldHeight;\nvarying float vUpFacing;\nuniform sampler2D woodGrain;\nuniform vec2 grainScale;\n${VALUE_NOISE}
      float woodFibre() {
        vec3 n = abs(vObjectNormal);
        vec2 p = n.y > max(n.x, n.z) ? vObjectPos.xz : (n.x > n.z ? vObjectPos.zy : vObjectPos.xy);
        return texture2D(woodGrain, p * grainScale).r;
      }
      float woodDust() {
        return smoothstep(0.8, 0.97, vUpFacing) * (0.12 + 0.6 * smoothstep(1.6, 2.1, vWorldHeight)) * (0.6 + 0.4 * patchNoise(vObjectPos.xz * 23.0));
      }\n` +
      afterChunk(
        afterChunk(
          shader.fragmentShader,
          'map_fragment',
          `float fibre = woodFibre();
          float dust = woodDust();
          diffuseColor.rgb *= mix(0.72, 1.12, fibre);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.40, 0.37), dust * 0.35);`,
        ),
        'roughnessmap_fragment',
        'roughnessFactor = clamp(roughnessFactor * mix(1.15, 0.88, fibre) + dust * 0.3, 0.0, 1.0);',
      );
  });
}

/**
 * Fabric: with `QUALITY.physicalMaterials`, a physical material with sheen (the soft rim light
 * of cloth and fur seen at a grazing angle); a plain standard one otherwise.
 */
export function fabric(parameters: THREE.MeshStandardMaterialParameters & { sheenTint?: THREE.ColorRepresentation }): THREE.MeshStandardMaterial {
  const { sheenTint, ...standard } = parameters;
  if (!QUALITY.physicalMaterials) return new THREE.MeshStandardMaterial(standard);
  const base = new THREE.Color(parameters.color ?? 0xffffff);
  const sheenColor = sheenTint !== undefined ? new THREE.Color(sheenTint) : base.clone().lerp(new THREE.Color(0xffffff), 0.45);
  return new THREE.MeshPhysicalMaterial({ ...standard, sheen: 1, sheenColor, sheenRoughness: 0.75 });
}

/**
 * Printed or moulded plastic (a game box's sleeve, a console): with `QUALITY.physicalMaterials`
 * a clearcoat catches the reflections over the print, the base keeps its own roughness.
 */
export function plastic(parameters: THREE.MeshStandardMaterialParameters, clearcoat = 0.6): THREE.MeshStandardMaterial {
  if (!QUALITY.physicalMaterials) return new THREE.MeshStandardMaterial(parameters);
  return new THREE.MeshPhysicalMaterial({ ...parameters, clearcoat, clearcoatRoughness: 0.18 });
}

/**
 * Paint that people touch and kick: with `QUALITY.detailedMaterials`, grey scuffs low down
 * (shoes, the vacuum cleaner) and faint smudges at hand height (world height, so a door frame and
 * a baseboard agree). For door linings, architraves, baseboards.
 */
export function scuffed<M extends THREE.MeshStandardMaterial>(material: M): M {
  if (!QUALITY.detailedMaterials) return material;
  return patchShader(material, 'scuffed', (shader) => {
    shader.vertexShader = 'varying vec3 vScuffWorld;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vScuffWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader =
      `varying vec3 vScuffWorld;\n${VALUE_NOISE}\n` +
      afterChunk(
        shader.fragmentShader,
        'map_fragment',
        `{
          float h = vScuffWorld.y;
          vec2 along = vec2(vScuffWorld.x + vScuffWorld.z, h);
          float kick = (1.0 - smoothstep(0.02, 0.32, h)) * smoothstep(0.55, 0.82, patchNoise(along * vec2(16.0, 30.0)));
          float hands = smoothstep(0.85, 0.95, h) * (1.0 - smoothstep(1.2, 1.35, h)) * smoothstep(0.6, 0.85, patchNoise(along * 12.0 + 7.0));
          diffuseColor.rgb *= 1.0 - 0.22 * kick - 0.08 * hands;
        }`,
      );
  });
}
