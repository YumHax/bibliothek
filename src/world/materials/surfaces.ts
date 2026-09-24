import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import { afterChunk, patchShader, VALUE_NOISE } from './shaderPatch';

/** Metres of wall covered by one tile of the plaster texture. */
const PLASTER_TILE_M = 1.2;
const PLASTER_PX = 512;

let plasterBump: THREE.CanvasTexture | null = null;

/**
 * Roller-applied paint over plaster, as a bump map: a fine stipple of soft dots, a few broad
 * trowel undulations, seamless (every stamp wraps round the edges). Painted once, shared by
 * every wall; the walls' uvs are in metres (see `Room`'s `wallGeometry`).
 */
function plasterBumpMap(): THREE.CanvasTexture {
  if (plasterBump) return plasterBump;
  const [canvas, ctx] = createCanvas(PLASTER_PX, PLASTER_PX);
  const random = seededRandom(0x91a57e);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, PLASTER_PX, PLASTER_PX);
  const stamp = (x: number, y: number, r: number, style: string): void => {
    ctx.fillStyle = style;
    for (const dx of [-PLASTER_PX, 0, PLASTER_PX]) {
      for (const dy of [-PLASTER_PX, 0, PLASTER_PX]) {
        if (x + dx + r < 0 || x + dx - r > PLASTER_PX || y + dy + r < 0 || y + dy - r > PLASTER_PX) continue;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  // Broad undulations first: the trowel's passes under the paint.
  for (let i = 0; i < 60; i++) {
    const light = random() < 0.5;
    stamp(random() * PLASTER_PX, random() * PLASTER_PX, 30 + random() * 70, light ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)');
  }
  // The roller's stipple.
  for (let i = 0; i < 9000; i++) {
    const v = Math.round(random() * 255);
    stamp(random() * PLASTER_PX, random() * PLASTER_PX, 0.6 + random() * 1.8, `rgba(${v},${v},${v},0.16)`);
  }
  plasterBump = new THREE.CanvasTexture(canvas);
  plasterBump.wrapS = plasterBump.wrapT = THREE.RepeatWrapping;
  plasterBump.repeat.setScalar(1 / PLASTER_TILE_M);
  plasterBump.anisotropy = 4;
  return plasterBump;
}

export interface WallSurface {
  /** Length and height of the wall plane (metres); its geometry is centred on its origin. */
  length: number;
  height: number;
  /** Seeds where the ghosts of frames that once hung there are. */
  seed: number;
}

/**
 * A painted wall. With `QUALITY.detailedMaterials`: a plaster bump, the creases darkened where it
 * meets the floor, the ceiling and the next wall (the light that never reaches into a corner),
 * scuffed grime just above the baseboard, and one or two paler rectangles where a frame hung
 * and kept the sun off the paint. Otherwise the plain matte paint it always was.
 */
export function wallMaterial(color: number, surface: WallSurface): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  if (!QUALITY.detailedMaterials) return material;
  material.bumpMap = plasterBumpMap();
  material.bumpScale = 0.35;

  const random = seededRandom(surface.seed);
  const ghost = (): THREE.Vector4 => {
    const halfW = 0.15 + random() * 0.2;
    const halfH = 0.12 + random() * 0.2;
    const span = Math.max(0, surface.length / 2 - halfW - 0.3);
    return new THREE.Vector4((random() * 2 - 1) * span, 1.35 + random() * 0.4 - surface.height / 2, halfW, halfH);
  };
  const uniforms = {
    wallHalf: { value: new THREE.Vector2(surface.length / 2, surface.height / 2) },
    ghostA: { value: ghost() },
    ghostB: { value: random() < 0.6 ? ghost() : new THREE.Vector4(0, 0, 0, 0) },
  };
  return patchShader(material, 'wall', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vSurfacePos;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vSurfacePos = position.xy;');
    shader.fragmentShader =
      `varying vec2 vSurfacePos;\nuniform vec2 wallHalf;\nuniform vec4 ghostA;\nuniform vec4 ghostB;\n${VALUE_NOISE}
      float ghostMask(vec4 g) {
        vec2 d = abs(vSurfacePos - g.xy) - g.zw;
        return g.z <= 0.0 ? 0.0 : 1.0 - smoothstep(-0.015, 0.015, max(d.x, d.y));
      }\n` +
      afterChunk(
        shader.fragmentShader,
        'map_fragment',
        `{
          float fromFloor = vSurfacePos.y + wallHalf.y;
          float fromCeiling = wallHalf.y - vSurfacePos.y;
          float fromEnd = wallHalf.x - abs(vSurfacePos.x);
          float crease = 1.0 - 0.3 * exp(-fromFloor / 0.14) - 0.18 * exp(-fromCeiling / 0.2) - 0.22 * exp(-fromEnd / 0.22);
          float grime = (1.0 - smoothstep(0.08, 0.42, fromFloor)) * patchNoise(vSurfacePos * vec2(4.0, 11.0));
          float ghost = max(ghostMask(ghostA), ghostMask(ghostB));
          diffuseColor.rgb *= max(crease, 0.45) * (1.0 - 0.08 * grime) * (1.0 + 0.035 * ghost);
        }`,
      );
  });
}

/**
 * Darkens a floor or ceiling plane towards its edges, where it meets the walls (the plane's
 * geometry is `halfSize` * 2, centred on its origin). `strength` is the darkening right at the edge.
 */
export function edgeOcclusion<M extends THREE.MeshStandardMaterial>(material: M, halfSize: THREE.Vector2, strength: number, reach = 0.25): M {
  if (!QUALITY.detailedMaterials) return material;
  const uniforms = { planeHalf: { value: halfSize.clone() }, edgeStrength: { value: strength }, edgeReach: { value: reach } };
  return patchShader(material, 'edgeOcclusion', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vPlanePos;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vPlanePos = position.xy;');
    shader.fragmentShader =
      'varying vec2 vPlanePos;\nuniform vec2 planeHalf;\nuniform float edgeStrength;\nuniform float edgeReach;\n' +
      afterChunk(
        shader.fragmentShader,
        'map_fragment',
        `{
          vec2 fromEdge = planeHalf - abs(vPlanePos);
          float edge = exp(-fromEdge.x / edgeReach) + exp(-fromEdge.y / edgeReach);
          diffuseColor.rgb *= 1.0 - edgeStrength * min(edge, 1.0);
        }`,
      );
  });
}

/**
 * A roughness map for a whole floor (not tiled): the lanes people walk (the middle of the room,
 * towards `paths`, zone-local door spots) are scuffed dull; along the walls, where nobody steps,
 * the varnish keeps its gloss. G channel, as three.js reads it; multiply with the material's roughness.
 */
export function floorWearMap(width: number, depth: number, paths: readonly THREE.Vector2[], seed: number): THREE.CanvasTexture | null {
  if (!QUALITY.detailedMaterials) return null;
  const px = 256;
  const [canvas, ctx] = createCanvas(px, px);
  const random = seededRandom(seed);
  ctx.fillStyle = 'rgb(0,150,0)';
  ctx.fillRect(0, 0, px, px);
  // The floor plane is turned face up, its local +y along world -z; the canvas's top row is the
  // texture's v = 1, so the back of the room (-z) is at the top.
  const toPx = (x: number, z: number): [number, number] => [(x / width + 0.5) * px, (z / depth + 0.5) * px];
  const scuff = (x: number, y: number, r: number, alpha: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,255,0,${alpha})`);
    g.addColorStop(1, 'rgba(0,255,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  const [cx, cy] = toPx(0, 0);
  scuff(cx, cy, px * 0.45, 0.55);
  for (const p of paths) {
    const [x, y] = toPx(p.x, p.y);
    for (let t = 0; t <= 1; t += 0.1) scuff(x + (cx - x) * t, y + (cy - y) * t, px * 0.12, 0.35);
  }
  for (let i = 0; i < 40; i++) scuff(random() * px, random() * px, 4 + random() * 14, 0.25);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
