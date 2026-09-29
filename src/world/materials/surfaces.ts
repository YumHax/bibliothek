import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import { afterChunk, patchShader, VALUE_NOISE } from './shaderPatch';
import { markShared } from '../props/Prop';

/** Metres of wall covered by one tile of the plaster texture. */
const PLASTER_TILE_M = 1.2;
const PLASTER_PX = 512;
/** Size of a floor's wear map (one for the whole floor). */
const WEAR_PX = 512;
const wearMaps = new Map<string, THREE.CanvasTexture>();

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
  plasterBump = markShared(new THREE.CanvasTexture(canvas));
  plasterBump.wrapS = plasterBump.wrapT = THREE.RepeatWrapping;
  plasterBump.repeat.setScalar(1 / PLASTER_TILE_M);
  plasterBump.anisotropy = QUALITY.anisotropy;
  return plasterBump;
}

/** An opening cut from the bottom edge of a wall (wall-local x of its centre, metres). */
export interface WallOpening {
  x: number;
  width: number;
  height: number;
}

/** A rectangle on a wall's plane (wall-local, centred on the wall): something hangs or stands there. */
export interface WallRect {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

export interface WallSurface {
  /** Length and height of the wall plane (metres); its geometry is centred on its origin. */
  length: number;
  height: number;
  /** Seeds where the ghosts of frames that once hung there are. */
  seed: number;
  /** The openings cut through it (doorways): their reveals get a crease, their jambs a touch of hand grime. */
  openings?: readonly WallOpening[];
}

/** Openings a wall's shader knows about (more are left plain). */
const MAX_OPENINGS = 4;
/** Tries at placing a frame's ghost clear of everything on the wall before giving it up. */
const GHOST_TRIES = 24;
/** Room left round a ghost and what it must stay clear of (m). */
const GHOST_MARGIN = 0.08;

interface WallDetail {
  surface: WallSurface;
  ghostA: { value: THREE.Vector4 };
  ghostB: { value: THREE.Vector4 };
}

const wallDetails = new WeakMap<THREE.Material, WallDetail>();

/**
 * The ghosts of frames a wall shows: one or two paler rectangles at picture height, drawn from its
 * seed, each clear of the openings and of `blocked` (what hangs or stands against it now: a frame
 * where a real picture hangs, or peeking out round the TV, would read as a glitch). A ghost that
 * finds no clear spot is left out.
 */
function drawGhosts(surface: WallSurface, blocked: readonly WallRect[]): [THREE.Vector4, THREE.Vector4] {
  const random = seededRandom(surface.seed);
  const obstacles = ghostObstacles(surface, blocked);
  const clear = (g: THREE.Vector4): boolean => ghostClear(g, obstacles);
  const ghost = (): THREE.Vector4 => {
    for (let i = 0; i < GHOST_TRIES; i++) {
      const halfW = 0.15 + random() * 0.2;
      const halfH = 0.12 + random() * 0.2;
      const span = Math.max(0, surface.length / 2 - halfW - 0.3);
      const g = new THREE.Vector4((random() * 2 - 1) * span, 1.35 + random() * 0.4 - surface.height / 2, halfW, halfH);
      if (clear(g)) {
        obstacles.push({ x: g.x, y: g.y, halfWidth: g.z, halfHeight: g.w });
        return g;
      }
    }
    return new THREE.Vector4(0, 0, 0, 0);
  };
  const a = ghost();
  const b = random() < 0.6 ? ghost() : new THREE.Vector4(0, 0, 0, 0);
  return [a, b];
}

function ghostObstacles(surface: WallSurface, blocked: readonly WallRect[]): WallRect[] {
  return [
    ...blocked,
    ...(surface.openings ?? []).map((o) => ({ x: o.x, y: o.height / 2 - surface.height / 2, halfWidth: o.width / 2, halfHeight: o.height / 2 })),
  ];
}

function ghostClear(g: THREE.Vector4, obstacles: readonly WallRect[]): boolean {
  return g.z <= 0 || obstacles.every((o) => Math.abs(g.x - o.x) > g.z + o.halfWidth + GHOST_MARGIN || Math.abs(g.y - o.y) > g.w + o.halfHeight + GHOST_MARGIN);
}

/**
 * Moves the ghosts of frames of a `wallMaterial` clear of what now hangs or stands against its
 * wall (`Room` calls it once the zone's furniture is placed, and again when that changes). Ghosts
 * still clear stay where they are: buying a lamp must not shift the pale rectangles about under the
 * player's eyes; only when one is now covered are they laid out afresh (the covered one is behind
 * the new thing anyway). A no-op for a plain wall.
 */
export function avoidOnWall(material: THREE.Material, blocked: readonly WallRect[]): void {
  const detail = wallDetails.get(material);
  if (!detail) return;
  const obstacles = ghostObstacles(detail.surface, blocked);
  if (ghostClear(detail.ghostA.value, obstacles) && ghostClear(detail.ghostB.value, obstacles)) return;
  const [a, b] = drawGhosts(detail.surface, blocked);
  detail.ghostA.value.copy(a);
  detail.ghostB.value.copy(b);
}

/**
 * A painted wall. With `QUALITY.detailedMaterials`: a plaster bump, the creases darkened where it
 * meets the floor, the ceiling, the next wall and the reveals of its openings (the light that never
 * reaches into a corner), scuffed grime just above the baseboard and on the jambs at hand height,
 * and one or two paler rectangles where a frame hung and kept the sun off the paint (clear of the
 * openings; `avoidOnWall` moves them clear of the furniture). Otherwise the plain matte paint it always was.
 */
export function wallMaterial(color: number, surface: WallSurface): THREE.MeshStandardMaterial {
  // `low` has no grain pass to break up a lamp's falloff on the plaster: the wall dithers itself (as the palette's materials do).
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide, dithering: !QUALITY.postFx });
  if (!QUALITY.detailedMaterials) return material;
  material.bumpMap = plasterBumpMap();
  material.bumpScale = 0.35;

  const [ghostA, ghostB] = drawGhosts(surface, []);
  // Each opening: x of its centre, half its width, its top (from the floor); w 1 when used.
  const openings = Array.from({ length: MAX_OPENINGS }, (_, i) => {
    const o = surface.openings?.[i];
    return o ? new THREE.Vector4(o.x, o.width / 2, o.height, 1) : new THREE.Vector4(0, 0, 0, 0);
  });
  const uniforms = {
    wallHalf: { value: new THREE.Vector2(surface.length / 2, surface.height / 2) },
    ghostA: { value: ghostA },
    ghostB: { value: ghostB },
    wallOpenings: { value: openings },
  };
  wallDetails.set(material, { surface, ghostA: uniforms.ghostA, ghostB: uniforms.ghostB });
  return patchShader(material, 'wall', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vSurfacePos;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vSurfacePos = position.xy;');
    shader.fragmentShader =
      `varying vec2 vSurfacePos;\nuniform vec2 wallHalf;\nuniform vec4 ghostA;\nuniform vec4 ghostB;\nuniform vec4 wallOpenings[${MAX_OPENINGS}];\n${VALUE_NOISE}
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
          // The reveals: a softer crease along the jambs and the head (the lining stands proud of
          // the plaster there), and the grey of hands on the jambs at latch height.
          for (int i = 0; i < ${MAX_OPENINGS}; i++) {
            vec4 o = wallOpenings[i];
            if (o.w < 0.5) continue;
            float side = abs(vSurfacePos.x - o.x) - o.y;
            float above = fromFloor - o.z;
            float fromOpening = above < 0.0 ? side : (side < 0.0 ? above : length(vec2(side, above)));
            crease -= 0.12 * exp(-max(fromOpening, 0.0) / 0.1);
            float jamb = above < 0.0 ? exp(-max(side, 0.0) / 0.06) : 0.0;
            float hands = smoothstep(0.8, 0.95, fromFloor) * (1.0 - smoothstep(1.3, 1.5, fromFloor));
            grime += 0.8 * jamb * hands * patchNoise(vSurfacePos * vec2(20.0, 9.0) + float(i) * 3.1);
          }
          float ghost = max(ghostMask(ghostA), ghostMask(ghostB));
          diffuseColor.rgb *= max(crease, 0.45) * (1.0 - 0.08 * min(grime, 1.0)) * (1.0 + 0.035 * ghost);
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
  // A room rebuilt after its zone unloaded wears the same map: painted once per floor for the page.
  const key = `${width}|${depth}|${seed}|${paths.map((p) => `${p.x},${p.y}`).join(';')}`;
  const cached = wearMaps.get(key);
  if (cached) return cached;
  const px = WEAR_PX;
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
  for (let i = 0; i < 80; i++) scuff(random() * px, random() * px, 8 + random() * 28, 0.25);
  // A fine mottle over everything: the varnish never wears evenly, even where nobody walks.
  for (let i = 0; i < 2600; i++) {
    const g = Math.round(110 + random() * 110);
    ctx.fillStyle = `rgba(0,${g},0,0.18)`;
    ctx.fillRect(random() * px, random() * px, 1 + random() * 3, 1 + random() * 3);
  }
  const texture = markShared(new THREE.CanvasTexture(canvas));
  texture.anisotropy = QUALITY.anisotropy;
  texture.colorSpace = THREE.NoColorSpace;
  wearMaps.set(key, texture);
  return texture;
}
