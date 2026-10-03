import * as THREE from 'three';
import { createCanvas, seededRandom, canvasTexture } from '@/covers/generated/canvasUtils';
import { paintOnce } from './materials/paintedTiles';
import { beforeChunk, afterChunk, patchShader, replaceChunk, VALUE_NOISE } from './materials/shaderPatch';

/** Metres of floor covered by one tile of the texture (must be a multiple of `PLANK_LENGTH`). */
const TILE_M = 2.4;
const TILE_PX = 1024;
const PLANK_WIDTH = 0.12;
const PLANK_LENGTH = 1.2;
/** Width of the dark gap between planks, in pixels. */
const GAP_PX = 2;
/** Length (px) of the bevel at a plank's ends, where it meets the next one in its row. */
const END_BEVEL_PX = 5;
/** Rows of planks in one tile of the texture. */
const ROWS = Math.round(TILE_M / PLANK_WIDTH);
/** How much a plank's sheen differs from its neighbours' (roughness times 1 +- this). */
const PLANK_ROUGHNESS_SPREAD = 0.16;

const PX_PER_M = TILE_PX / TILE_M;

interface Plank {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where each texture row's first plank end is, in texture u (0..1), indexed by row from the
 * texture's bottom (v): filled when the tile is painted, read by the shader for per-plank sheen.
 */
const rowOffsets: number[] = new Array<number>(ROWS).fill(0);

/**
 * Oak strip flooring, generated once: staggered planks with their own tint, grain lines and a
 * bevelled gap. Returns a standard material with a colour and a bump map so the plank edges catch
 * the light. Painted once for the page (`paintOnce`). The 2.4 m tile would repeat in a grid, so
 * the shader deals the rows out afresh: each row of planks on the floor reads a row of the tile
 * picked by a hash of its index, shifted along its length and maybe turned end for end (rows meet
 * at a gap, so any row fits next to any other); each plank then gets a sheen of its own.
 */
export function parquetMaterial(floorWidth: number, floorDepth: number): THREE.MeshStandardMaterial {
  const [map, bumpMap] = paintOnce('parquet', paintParquet);
  for (const tex of [map, bumpMap]) tex.repeat.set(floorWidth / TILE_M, floorDepth / TILE_M);
  const material = new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.6, roughness: 0.55, metalness: 0 });
  const uniforms = { plankOffset: { value: rowOffsets.slice() } };
  return patchShader(material, 'parquetRows', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const rows = `${ROWS}.0`;
    const functions = /* glsl */ `
      ${VALUE_NOISE}
      uniform float plankOffset[${ROWS}];
      // xy: where in the tile this spot of the floor reads; z: a hash of the plank it lies on.
      // flip: -1 where the row reads its source end for end (the tile's u runs against the floor's).
      vec3 parquetCell(vec2 uv, out float flip) {
        float row = floor(uv.y * ${rows});
        float source = min(floor(patchHash(vec2(row, 3.7)) * ${rows}), ${rows} - 1.0);
        flip = patchHash(vec2(row, 29.1)) < 0.5 ? 1.0 : -1.0;
        float u = flip * uv.x + patchHash(vec2(row, 11.3)) * 4.0;
        float along = (u - plankOffset[int(source)]) / ${(PLANK_LENGTH / TILE_M).toFixed(6)};
        return vec3(u, (source + fract(uv.y * ${rows})) / ${rows}, patchHash(vec2(row * 1.37 + 5.0, floor(along))));
      }
      // This fragment's cell, dealt once (before the colour) and read by the colour, the sheen and
      // the bump: the map and the bump map share one repeat, so their uvs are the same.
      vec3 parquetHere;
      float parquetFlip = 1.0;
      #ifdef USE_BUMPMAP
        uniform sampler2D bumpMap;
        uniform float bumpScale;
        // three's forward-differenced bump (bumpmap_pars_fragment), read through the dealt rows with
        // the floor's own derivatives (the jump between two rows would pick the smallest mip).
        vec2 dHdxy_fwd() {
          vec2 dSTdx = dFdx(vBumpMapUv);
          vec2 dSTdy = dFdy(vBumpMapUv);
          vec2 uv = parquetHere.xy;
          // The neighbours one pixel over on the floor, in the tile: along a turned row the tile's u
          // runs backwards, so the step does too (else its bevels and grain light from the wrong side).
          vec2 flip = vec2(parquetFlip, 1.0);
          float Hll = bumpScale * textureGrad(bumpMap, uv, dSTdx, dSTdy).x;
          float dBx = bumpScale * textureGrad(bumpMap, uv + dSTdx * flip, dSTdx, dSTdy).x - Hll;
          float dBy = bumpScale * textureGrad(bumpMap, uv + dSTdy * flip, dSTdx, dSTdy).x - Hll;
          return vec2(dBx, dBy);
        }
        vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
          vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
          vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN);
          vec3 R2 = cross(vN, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          return normalize(abs(fDet) * surf_norm - vGrad);
        }
      #endif
    `;
    let fragment = replaceChunk(shader.fragmentShader, 'bumpmap_pars_fragment', functions);
    // The colour through the dealt rows; three's own lookup is switched off round its chunk (other
    // patches anchor on it, so it stays).
    fragment = beforeChunk(
      fragment,
      'map_fragment',
      `#ifdef USE_MAP
        parquetHere = parquetCell(vMapUv, parquetFlip);
        diffuseColor *= textureGrad(map, parquetHere.xy, dFdx(vMapUv), dFdy(vMapUv));
        #undef USE_MAP
        #define PARQUET_MAP
      #endif`,
    );
    fragment = afterChunk(fragment, 'map_fragment', '#ifdef PARQUET_MAP\n#define USE_MAP\n#endif');
    fragment = afterChunk(
      fragment,
      'roughnessmap_fragment',
      `roughnessFactor = clamp(roughnessFactor * (1.0 + ${PLANK_ROUGHNESS_SPREAD} * (2.0 * parquetHere.z - 1.0)), 0.0, 1.0);`,
    );
    shader.fragmentShader = fragment;
  });
}

/** The colour and bump tiles, repeat-wrapped. */
function paintParquet(): [THREE.Texture, THREE.Texture] {
  const [colorCanvas, color] = createCanvas(TILE_PX, TILE_PX);
  const [bumpCanvas, bump] = createCanvas(TILE_PX, TILE_PX);
  const random = seededRandom(0x9a7452);

  // Gaps first: whatever the planks do not cover.
  color.fillStyle = '#4a3320';
  color.fillRect(0, 0, TILE_PX, TILE_PX);
  bump.fillStyle = '#404040';
  bump.fillRect(0, 0, TILE_PX, TILE_PX);

  const rowPx = PLANK_WIDTH * PX_PER_M;
  const lengthPx = PLANK_LENGTH * PX_PER_M;
  const rows = ROWS;
  for (let row = 0; row < rows; row++) {
    // Each row is shifted by a random fraction of a plank; TILE_PX is a multiple of the plank
    // length, so the plank cut by the right edge continues from the left edge.
    const offset = random() * lengthPx;
    rowOffsets[rows - 1 - row] = offset / TILE_PX;
    for (let x = offset - lengthPx; x < TILE_PX; x += lengthPx) {
      drawPlank(color, bump, random, { x: x + GAP_PX / 2, y: row * rowPx + GAP_PX / 2, w: lengthPx - GAP_PX, h: rowPx - GAP_PX });
    }
  }

  const map = canvasTexture(colorCanvas, { repeat: true });
  const bumpMap = canvasTexture(bumpCanvas, { data: true, repeat: true });
  return [map, bumpMap];
}

function drawPlank(color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, random: () => number, p: Plank): void {
  // Base tint: warm oak, each plank a little lighter, darker, redder or greyer than the next.
  const hue = 28 + (random() - 0.5) * 10;
  const sat = 38 + (random() - 0.5) * 16;
  const light = 50 + (random() - 0.5) * 16;
  color.fillStyle = `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%)`;
  color.fillRect(p.x, p.y, p.w, p.h);

  // Grain: long wavy strokes along the plank, darker or lighter than the base.
  color.save();
  color.beginPath();
  color.rect(p.x, p.y, p.w, p.h);
  color.clip();
  const lines = 7 + Math.floor(random() * 6);
  for (let i = 0; i < lines; i++) {
    const y = p.y + ((i + 0.5) / lines) * p.h + (random() - 0.5) * 4;
    const dark = random() < 0.65;
    color.strokeStyle = dark ? `rgba(60,35,15,${(0.08 + random() * 0.18).toFixed(3)})` : `rgba(255,230,190,${(0.05 + random() * 0.1).toFixed(3)})`;
    color.lineWidth = 0.6 + random() * 1.6;
    color.beginPath();
    color.moveTo(p.x - 2, y);
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const x = p.x + (s / steps) * (p.w + 4);
      color.quadraticCurveTo(x - p.w / steps / 2, y + (random() - 0.5) * 6, x, y + (random() - 0.5) * 3);
    }
    color.stroke();
  }
  // Occasional knot.
  if (random() < 0.18) {
    const kx = p.x + p.w * (0.15 + random() * 0.7);
    const ky = p.y + p.h * (0.3 + random() * 0.4);
    const knot = color.createRadialGradient(kx, ky, 1, kx, ky, 6 + random() * 5);
    knot.addColorStop(0, 'rgba(50,28,12,0.75)');
    knot.addColorStop(0.6, 'rgba(70,40,18,0.35)');
    knot.addColorStop(1, 'rgba(70,40,18,0)');
    color.fillStyle = knot;
    color.fillRect(kx - 12, ky - 12, 24, 24);
  }
  color.restore();

  // Bump: plank surface raised over the gaps, soft bevel on the edges, faint grain relief.
  const bevel = bump.createLinearGradient(0, p.y, 0, p.y + p.h);
  bevel.addColorStop(0, '#909090');
  bevel.addColorStop(0.12, '#c8c8c8');
  bevel.addColorStop(0.88, '#c8c8c8');
  bevel.addColorStop(1, '#909090');
  bump.fillStyle = bevel;
  bump.fillRect(p.x, p.y, p.w, p.h);
  // The ends are eased too, so the joint with the next plank in the row catches the light like the sides.
  for (const [from, to] of [[p.x, p.x + END_BEVEL_PX], [p.x + p.w, p.x + p.w - END_BEVEL_PX]] as const) {
    const end = bump.createLinearGradient(from, 0, to, 0);
    end.addColorStop(0, 'rgba(64,64,64,0.75)');
    end.addColorStop(1, 'rgba(64,64,64,0)');
    bump.fillStyle = end;
    bump.fillRect(Math.min(from, to), p.y, END_BEVEL_PX, p.h);
  }
  bump.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 4; i++) bump.fillRect(p.x, p.y + random() * p.h, p.w, 1);
}
