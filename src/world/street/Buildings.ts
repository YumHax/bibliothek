import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { RELIEF, facadeHeight, paintFacade, paintPartyWall, paintRoof, type AtlasSlot, type FacadeFeatures, type GlassPane, type LightInside, type NightLight, type ReliefRect } from './facadePainter';
import { ROOF_SLOPE, facadeBays, facadeStyle, windowWidth, type FacadeStyle } from '../city/facadeStyle';
import { roofFurniture } from '../city/roofFurniture';
import { RegionUploader } from '../city/regionUpload';
import { nightnessOf } from './streetAir';
import { GROUND_FLOOR, STOREY, type FacadeSpec } from './streetPlan';
import { isShopOpen } from './shops/shopHours';
import { VALUE_NOISE, afterChunk, patchShader } from '../materials/shaderPatch';
import { envBoost } from '../materials/envBoost';
import { flatRoomLight, type FlatRoomId } from '../city/flatWindows';
import { STORY_WINDOWS, type FacadeWindow, type WindowLife, type WindowStory } from './windowLife';
import { WINDOW_STORY_GLSL } from './windowStoryGlsl';
import { RoofClutter, type DressedRoof } from './RoofClutter';

export interface BuildingsOptions {
  /** Scales every facade's `detail` (lower on low quality). */
  detailScale: number;
  anisotropy: number;
  /** The retro games shop's display colours (today's market stock), if known. */
  shopGoods: readonly string[] | null;
  /** The night map's and the surface mask's resolution, as a share of the colour atlas's (0.5 on high quality, 0.25 else). */
  nightScale: number;
  /** Whose home a lit window is and what story plays in it (`windowLife.ts`); none: every window keeps its curfew. */
  windowLife?: WindowLife;
}

const ATLAS_WIDTH = 4096;
/** The tallest the atlas may grow (`options.detailScale` is scaled back to fit). */
const MAX_ATLAS = 4096;
const PADDING = 4;
/** The cornice ledge along each roofline: how far it stands out and how tall it is. */
const LEDGE = { depth: 0.38, height: 0.4 };
/** How far back into the block a party wall runs from the street face (it shows above a lower neighbour), and how deep a block's roof is. */
const PARTY_WALL_DEPTH = 9;
/** A party wall is painted this much coarser than its building's front (a blind wall needs fewer pixels), never under `PARTY_MIN_DETAIL` px/m. */
const PARTY_DETAIL = 0.5;
const PARTY_MIN_DETAIL = 6;
/** Seconds between two looks at the clock (each light that changed is repainted on the night map and its rect uploaded alone). */
const CHECK_EVERY = 1;
/** Our flat's windows the street shows lit as their room was left (one uniform each, `city/flatWindows`). */
const FLAT_WINDOWS = 8;
/** How deep the panes sit behind the facade's face (the reveal the parallax shows), metres. */
const REVEAL = 0.14;
/** The walls' roughness in the surface mask (G), the material's roughness being 1. */
const WALL_ROUGHNESS = 0.88;
/** The glass's reflection, over the walls' `envMapIntensity`. */
const GLASS_REFLECTION = 2.2;
/** A drawn curtain still lets this much of a lit room's light through. */
const THROUGH_CURTAINS = 0.15;
/** The surface mask's R on a brick wall (the shader lays its courses; a pane is 1). */
const BRICK_FLAG = 64;
/** How far the relief's full range (`RELIEF` 0..1) stands out of the wall, metres, for the shading. */
const RELIEF_DEPTH = 0.16;
/** Buildings we never dress on top: our own (the roof is a place of its own, `world/roof`). */
const OURS = 'ours';

/*
 * Window life on the night map, as the window view's pane shader has it (`props/outdoors/shader.ts`,
 * `lightTexel`). Each light's id is in its own texture (`windowIds`, nearest, no mips, so ids never
 * blend): R the id (1..254; 0 = a light with no curfew, a sign or a lamp, left alone), G how far up
 * its window the texel is (0 sill .. 1 head), B one of our flat's windows (its index + 1: lit by
 * `flatLevels`, not by the curfew), or a story window (128 + its slot). The shader, above the ground
 * floor, flickers the bluish ones like a TV, now and then slides a dark band (someone crossing the
 * room) over a lit one (23 s slots hashed from the id), and lowers a quarter of the blinds between
 * 21 h and 22 h (dimmer, slatted; up again at 7-8 h). Which lights are on at all is the night map's
 * own: each is repainted alone when it switches (`relight`), with its room behind it (`LightInside`).
 */
const WINDOW_LIFE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
{
  vec4 lifeIds = texture2D(windowIds, vEmissiveMapUv);
  float flatIndex = floor(lifeIds.b * 255.0 + 0.5);
  float lifeId = lifeIds.r;
  float lifeLit = max(emissiveColor.r, max(emissiveColor.g, emissiveColor.b));
  if (flatIndex > 127.5) {
    // A story window (B = 128 + its slot): what goes on behind it drawn over its light, in its own frame.
    float storySlot = flatIndex - 128.0;
    vec4 storyAt = vec4(0.0);
    vec4 storyIs = vec4(0.0, 1.0, -1.0, 0.0);
    for (int i = 0; i < ${STORY_WINDOWS}; i++) if (float(i) == storySlot) { storyAt = storyAxis[i]; storyIs = storyBand[i]; }
    if (storyIs.z > -0.5 && lifeLit > 0.02) totalEmissiveRadiance *= windowStory(vLifeLocal, storyAt, storyIs, windowLife.x);
  } else if (flatIndex > 0.5) {
    float level = 0.0;
    for (int i = 0; i < ${FLAT_WINDOWS}; i++) if (float(i + 1) == flatIndex) level = flatLevels[i];
    totalEmissiveRadiance *= level;
  } else if (lifeLit > 0.02 && lifeId > 0.002 && vLifePos.y > ${GROUND_FLOOR.toFixed(2)}) {
    float t = windowLife.x;
    float h1 = fract(sin(lifeId * 311.7) * 43758.5453);
    if (emissiveColor.b > emissiveColor.r * 1.25) {
      float k = floor(t * 7.0 + lifeId * 97.0);
      totalEmissiveRadiance *= 0.55 + 0.45 * fract(sin(k * 12.9898 + lifeId * 78.233) * 43758.5453);
    }
    float slot = t / 23.0 + h1 * 7.0;
    if (fract(sin(floor(slot) * 91.7 + lifeId * 53.1) * 43758.5453) < 0.2) {
      float along = vLifePos.x + vLifePos.z;
      float band = fract((along - t * 0.55) / 3.7 + h1);
      totalEmissiveRadiance *= mix(1.0, 0.28, smoothstep(0.0, 0.03, band) * (1.0 - smoothstep(0.1, 0.13, band)));
    }
    if (h1 < 0.25) {
      // Down between 21 h and 22 h (each window at its own moment), up again in the morning: from its head down.
      float hh = windowLife.y - h1 * 0.6;
      float lowered = hh >= 12.0 ? smoothstep(21.0, 22.0, hh) : 1.0 - smoothstep(7.0, 8.0, hh);
      if (lifeIds.g > 1.0 - lowered) totalEmissiveRadiance *= 0.3 * (0.75 + 0.25 * step(0.5, fract(vLifePos.y * 14.0)));
    }
  }
}
#endif
`;

/*
 * The walls' surface (the surface mask, `roughnessMap`: R the pane (1) or a brick wall (BRICK_FLAG), G the roughness
 * the material reads, B how far the relief stands out, 0.5 the wall's face). On a pane the eye ray is followed a
 * reveal deep and the atlas read where it lands (the pane's contents shift with the view; where it lands off the pane
 * the reveal's side shows, in its shade); the glass then mirrors the environment more than the walls do
 * (`GLASS_REFLECTION`). On brick the courses are laid here in world metres, so they hold at any distance and fade out
 * where they would shimmer: stretcher bond, each brick a shade of its own, the mortar a little sunk. The relief and the
 * mortar make a height whose slope tilts the normal (`facadeTilt`, as three.js's bump map does), so sills, cornices,
 * quoins and grooves catch a low sun. Rain darkens the walls (more near the ground, in streaks) and glosses them;
 * snow lies on whatever looks up (cornice tops, the roofs, a mansard's slope a little).
 */
const SURFACE = /* glsl */ `
float lifeGlass = 0.0;
float lifeHeight = 0.0;
float lifeWet = 0.0;
float lifeSnow = 0.0;
#if defined(USE_MAP) && defined(USE_ROUGHNESSMAP)
{
  vec4 lifeSurface = texture2D(roughnessMap, vMapUv);
  lifeGlass = step(0.5, lifeSurface.r) * lifeSurface.r;
  float lifeBrick = step(0.12, lifeSurface.r) * (1.0 - step(0.4, lifeSurface.r));
  vec3 N = normalize(vLifeNormal);
  vec3 T = vec3(N.z, 0.0, -N.x);
  // Stretcher bond: courses of 75 mm, bricks of 215 mm, every other course shifted by half a brick.
  float along = dot(vLifePos, T);
  float rows = vLifePos.y / 0.075;
  float course = floor(rows);
  float bricks = along / 0.215 + 0.5 * mod(course, 2.0);
  vec2 fw = fwidth(vec2(bricks, rows));
  float fine = (1.0 - smoothstep(0.18, 0.45, max(fw.x, fw.y))) * lifeBrick * step(0.1, abs(N.x) + abs(N.z));
  vec2 cell = vec2(fract(bricks), fract(rows));
  vec2 edge = min(cell, 1.0 - cell);
  float mortar = max(1.0 - smoothstep(0.045 - fw.x, 0.045 + fw.x, edge.x), 1.0 - smoothstep(0.12 - fw.y, 0.12 + fw.y, edge.y)) * fine;
  float tone = 0.9 + 0.2 * patchHash(vec2(floor(bricks), course));
  diffuseColor.rgb *= mix(1.0, tone, fine);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 1.5, vec3(0.7, 0.66, 0.6), 0.65), mortar * 0.8);
  lifeHeight = (lifeSurface.b - 0.5) * ${RELIEF_DEPTH.toFixed(3)} - mortar * 0.008;
  if (lifeGlass > 0.5) {
    vec3 V = normalize(cameraPosition - vLifePos);
    vec3 T2 = vec3(N.z, 0.0, -N.x);
    float vn = max(dot(V, N), 0.25);
    vec2 shift = -${REVEAL.toFixed(3)} * vec2(dot(V, T2), V.y) / vn;
    vec2 inUv = vMapUv + shift * vUvPerMetre;
    float onPane = smoothstep(0.35, 0.65, texture2D(roughnessMap, inUv).r);
    vec3 seen = texture2D(map, inUv).rgb;
    diffuseColor.rgb = seen * mix(0.55, 1.0, onPane);
  }
  // The weather on the walls: wet darker towards the ground and in streaks; snow where the face looks up.
  float streaks = 0.7 + 0.3 * patchNoise(vec2(along * 1.7, vLifePos.y * 0.12));
  lifeWet = facadeWeather.x * (1.0 - facadeWeather.y) * mix(0.55, 1.0, 1.0 - smoothstep(0.0, 3.0, vLifePos.y)) * streaks * (1.0 - lifeGlass);
  diffuseColor.rgb *= 1.0 - 0.32 * lifeWet;
  lifeSnow = facadeWeather.y * smoothstep(0.25, 0.7, N.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), lifeSnow);
}
#endif
`;

/** The relief's slope tilting the normal (three.js's `perturbNormalArb`, in metres of height per metre across the screen). */
const TILT = /* glsl */ `
vec3 facadeTilt(vec3 surfPos, vec3 surfNormal, vec2 dHdxy, float facing) {
  vec3 sigmaX = normalize(dFdx(surfPos));
  vec3 sigmaY = normalize(dFdy(surfPos));
  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float det = dot(sigmaX, r1) * facing;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNormal - grad);
}
`;

/** A painted facade and what stands out of it, for the relief (`relief/`): its spec, size and features in facade metres. */
export interface PaintedFront {
  spec: FacadeSpec;
  width: number;
  height: number;
  features: FacadeFeatures;
}

/** A wall's rect in the colour atlas (pixels; a facade's under its roof's band), whether it is brick, its relief. */
interface Surface {
  x: number;
  y: number;
  w: number;
  h: number;
  brick: boolean;
  relief: readonly ReliefRect[];
}

/** A blind side wall showing over a lower neighbour: where it stands (the corner, the way into the block), its look, its height. */
interface Party {
  spec: FacadeSpec;
  style: FacadeStyle;
  /** The corner on the street (zone-local), the faces' direction along the street, which way the wall looks (+1 along it, -1 back). */
  at: [number, number];
  along: [number, number];
  facing: 1 | -1;
  /** From the lower neighbour's cornice up to the taller one's top. */
  y0: number;
  y1: number;
  seed: number;
}

interface Placed {
  spec: FacadeSpec;
  style: FacadeStyle;
  width: number;
  height: number;
  /** The roof's slope, foot to ridge (0: a flat roof behind the parapet); its band is painted over the facade's in the slot. */
  roof: number;
  slot: AtlasSlot;
  /** A party wall's slot (no facade of its own). */
  party?: Party;
}

/** How far under the parapet's top a sloping roof starts, so no sky shows between them. */
const ROOF_FOOT = 0.3;

/** The length of a style's roof slope (0 for a flat roof). */
function roofSlope(style: FacadeStyle): number {
  return style.roof === 'flat' ? 0 : Math.hypot(ROOF_SLOPE[style.roof].rise, ROOF_SLOPE[style.roof].run);
}

/** A light as an opaque colour on the night map, its room drawn over it: curtains, a blind, furniture, someone there. */
function paintLight(ctx: CanvasRenderingContext2D, light: NightLight, k: number, on: boolean): [number, number, number, number] {
  const [x, y, w, h] = nightRect(light, k);
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  if (!on) return [x, y, w, h];
  ctx.fillStyle = light.color;
  ctx.fillRect(x, y, w, h);
  const inside: LightInside | undefined = light.inside;
  if (!inside || w < 3 || h < 3) return [x, y, w, h];
  const lit = new THREE.Color(light.color);
  const tone = (color: THREE.Color, k2: number): string => `#${color.clone().multiplyScalar(k2).getHexString()}`;
  if (inside.blind) {
    ctx.fillStyle = tone(lit, 0.55);
    ctx.fillRect(x, y, w, Math.round(h * inside.blind));
  }
  if (inside.curtains) {
    const cloth = tone(lit.clone().lerp(new THREE.Color(inside.curtains.color), 0.5), 0.5);
    ctx.fillStyle = cloth;
    ctx.fillRect(x, y, Math.max(1, Math.round(w * inside.curtains.left)), h);
    const right = Math.max(1, Math.round(w * inside.curtains.right));
    ctx.fillRect(x + w - right, y, right, h);
  }
  if (inside.furniture) {
    const [a, b, fh] = inside.furniture;
    ctx.fillStyle = tone(lit, 0.38);
    ctx.fillRect(x + Math.round(w * a), y + h - Math.round(h * fh), Math.max(1, Math.round(w * (b - a))), Math.round(h * fh));
  }
  if (inside.figure !== undefined) {
    ctx.fillStyle = tone(lit, 0.2);
    const cx = x + w * inside.figure;
    const shoulders = y + h * 0.4;
    ctx.fillRect(Math.round(cx - w * 0.2), Math.round(shoulders), Math.max(1, Math.round(w * 0.4)), Math.round(h * 0.58));
    ctx.beginPath();
    ctx.ellipse(cx, shoulders - h * 0.09, Math.max(0.6, w * 0.1), Math.max(0.6, h * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (inside.arch) {
    // The arch's corners stay dark: two triangles over the springing.
    const a = Math.round(h * inside.arch);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * 0.42, y);
    ctx.lineTo(x, y + a);
    ctx.closePath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w * 0.58, y);
    ctx.lineTo(x + w, y + a);
    ctx.closePath();
    ctx.fill();
  }
  return [x, y, w, h];
}

/**
 * Every building face along the street, as one mesh with one material: each face is a quad (and a
 * cornice ledge along its roofline, a roof with its back and gables, the blind party walls over lower
 * neighbours) whose painted facade (`paintFacade`) sits in a shared canvas atlas, shelf-packed. A
 * second, smaller atlas (`nightScale`) holds the lit windows for the night (`emissiveMap`, opaque: no
 * alpha to premultiply) with their rooms behind them, with their ids beside it (`windowIds`) and the
 * walls' surface (`roughnessMap`: the glass with its reveal in parallax and stronger reflection, brick,
 * the relief, see `SURFACE`): each light comes on at its own point of dusk and goes out when the city's
 * wakefulness drops below its curfew (a shop's in its closing hour, `SHOP_HOURS`), as in the painted
 * view; only the lights that changed are repainted and uploaded (`RegionUploader`). What stands on the
 * roofs is a child mesh (`RoofClutter`). Two draw calls for the whole street's architecture (four with
 * the sun's shadow).
 */
export class Buildings extends THREE.Mesh implements Furniture, Updatable {
  readonly contactShadow = false;
  /** Every facade's features (awnings, balconies, shop windows...), for the relief built in front of them. */
  readonly fronts: PaintedFront[];
  private readonly lights: NightLight[] = [];
  private readonly on: boolean[];
  private readonly night: CanvasRenderingContext2D;
  private readonly nightUpload: RegionUploader;
  private readonly nightScale: number;
  /** Our flat's lights (their room, their index in `lights`) and the uniform their levels go to. */
  private readonly flatLights: { room: FlatRoomId; light: number }[] = [];
  private readonly flatLevels: number[];
  private readonly dayNight: DayNight;
  private readonly weather: THREE.Vector2;
  private checkClock = CHECK_EVERY;

  constructor(facades: readonly FacadeSpec[], dayNight: DayNight, options: BuildingsOptions) {
    // Every GPU takes a 4096 texture: a finer detail that would need a taller atlas is scaled back to fit.
    const parties = partyWalls(facades);
    let placed = pack(facades, parties, options.detailScale);
    let atlasHeight = atlasHeightOf(placed);
    for (let scale = options.detailScale; atlasHeight > MAX_ATLAS && scale > 0.3; ) {
      scale *= 0.92;
      placed = pack(facades, parties, scale);
      atlasHeight = atlasHeightOf(placed);
    }
    const [canvas, ctx] = createCanvas(ATLAS_WIDTH, atlasHeight);
    const nightScale = options.nightScale;
    const [nightCanvas, night] = createCanvas(Math.round(ATLAS_WIDTH * nightScale), Math.round(atlasHeight * nightScale));
    night.fillStyle = '#000';
    night.fillRect(0, 0, nightCanvas.width, nightCanvas.height);
    const lights: NightLight[] = [];
    const panes: GlassPane[] = [];
    const surfaces: Surface[] = [];
    const fronts: PaintedFront[] = [];
    const roofs: DressedRoof[] = [];
    // Every home light as a window of its facade (facade metres), for `windowLife` to claim.
    const windows: FacadeWindow[] = [];
    for (const p of placed) {
      if (p.party) {
        const { relief } = paintPartyWall(ctx, p.style, p.width, p.height, p.slot, p.party.seed);
        surfaces.push({ x: p.slot.x, y: p.slot.y, w: p.width * p.slot.k, h: p.height * p.slot.k, brick: p.style.kind === 'brick', relief });
        continue;
      }
      const ours = p.spec.id.startsWith(OURS);
      const bays = facadeBays(p.width, p.spec.bays);
      const things = ours ? undefined : roofFurniture(p.style, p.width, bays, windowWidth(p.style, p.width / bays));
      // The roof's band on top of the slot (its roof windows' lights with it), the facade under it.
      const roofLights: NightLight[] = [];
      if (p.roof > 0) paintRoof(ctx, p.style, p.width, p.roof, p.slot, things, roofLights);
      const top = p.slot.y + p.roof * p.slot.k;
      const painted = paintFacade(ctx, p.spec, p.width, { ...p.slot, y: top }, options.shopGoods);
      for (const l of [...painted.lights, ...roofLights]) {
        lights.push(l);
        windows.push(facadeWindow(p, top, l));
      }
      panes.push(...painted.glass);
      surfaces.push({ x: p.slot.x, y: top, w: p.width * p.slot.k, h: p.height * p.slot.k, brick: painted.brick, relief: painted.relief });
      fronts.push({ spec: p.spec, width: p.width, height: p.height, features: painted.features });
      if (things) roofs.push({ spec: p.spec, style: p.style, height: p.height, foot: ROOF_FOOT, things });
    }
    // Claimed windows: lit by their claim, not their curfew; the first `STORY_WINDOWS` with a story get a slot each.
    const claims = options.windowLife ? options.windowLife.claim(windows) : [];
    const storySlots: { light: number; story: () => WindowStory }[] = [];
    const storyOf = lights.map((_, i) => {
      const story = claims[i]?.story;
      if (!story || storySlots.length >= STORY_WINDOWS || lights[i]!.room) return -1;
      storySlots.push({ light: i, story });
      return storySlots.length - 1;
    });

    const map = toTexture(canvas, options.anisotropy);
    const nightTexture = toTexture(nightCanvas, options.anisotropy);
    const ids = windowIdTexture(lights, nightCanvas.width, nightCanvas.height, nightScale, storyOf);
    const surface = surfaceTexture(surfaces, panes, nightCanvas.width, nightCanvas.height, nightScale, options.anisotropy);
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: nightTexture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 1, roughnessMap: surface });
    const life = { value: new THREE.Vector2() };
    const weather = { value: new THREE.Vector2() };
    const flatLevels = new Array<number>(FLAT_WINDOWS).fill(0);
    // Each story window's frame (its middle along the face, the face's direction over its width) and its band
    // (sill and head over the street, the story's kind and parameter), in the facades' own frame.
    const storyAxis = Array.from({ length: STORY_WINDOWS }, () => new THREE.Vector4());
    const storyBand = Array.from({ length: STORY_WINDOWS }, () => new THREE.Vector4(0, 1, -1, 0));
    storySlots.forEach(({ light }, slot) => {
      const w = windows[light]!;
      const [ax, az] = w.facade.from;
      const length = Math.hypot(w.facade.to[0] - ax, w.facade.to[1] - az);
      const ux = (w.facade.to[0] - ax) / length;
      const uz = (w.facade.to[1] - az) / length;
      const mid = (w.along[0] + w.along[1]) / 2;
      const width = Math.max(0.1, w.along[1] - w.along[0]);
      storyAxis[slot]!.set(ax + ux * mid, az + uz * mid, ux / width, uz / width);
      storyBand[slot]!.set(w.height[0], w.height[1], -1, 0);
    });
    patchShader(material, 'streetWindowLife', (shader) => {
      shader.uniforms.windowLife = life;
      shader.uniforms.facadeWeather = weather;
      shader.uniforms.windowIds = { value: ids };
      shader.uniforms.flatLevels = { value: flatLevels };
      shader.uniforms.storyAxis = { value: storyAxis };
      shader.uniforms.storyBand = { value: storyBand };
      shader.vertexShader =
        'attribute vec2 uvPerMetre;\nvarying vec2 vUvPerMetre;\nvarying vec3 vLifePos;\nvarying vec3 vLifeLocal;\nvarying vec3 vLifeNormal;\n' +
        afterChunk(shader.vertexShader, 'begin_vertex', 'vLifePos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLifeLocal = transformed;\nvLifeNormal = mat3(modelMatrix) * objectNormal;\nvUvPerMetre = uvPerMetre;');
      let fragment =
        `uniform vec2 windowLife;\nuniform vec2 facadeWeather;\nuniform sampler2D windowIds;\nuniform float flatLevels[${FLAT_WINDOWS}];\nuniform vec4 storyAxis[${STORY_WINDOWS}];\nuniform vec4 storyBand[${STORY_WINDOWS}];\nvarying vec2 vUvPerMetre;\nvarying vec3 vLifePos;\nvarying vec3 vLifeLocal;\nvarying vec3 vLifeNormal;\n` +
        VALUE_NOISE +
        TILT +
        WINDOW_STORY_GLSL +
        shader.fragmentShader;
      fragment = afterChunk(fragment, 'map_fragment', SURFACE);
      fragment = afterChunk(fragment, 'roughnessmap_fragment', 'roughnessFactor = mix(mix(roughnessFactor, 0.28, lifeWet * 0.85), 0.8, lifeSnow);');
      // How much the relief rises per metre across the screen, both ways (its height is in metres).
      fragment = afterChunk(
        fragment,
        'normal_fragment_maps',
        'vec2 lifeSlope = clamp(vec2(dFdx(lifeHeight) / max(length(dFdx(vLifePos)), 1e-4), dFdy(lifeHeight) / max(length(dFdy(vLifePos)), 1e-4)), -1.5, 1.5);\nnormal = facadeTilt(-vViewPosition, normal, lifeSlope, faceDirection);',
      );
      fragment = afterChunk(fragment, 'emissivemap_fragment', WINDOW_LIFE);
      fragment = afterChunk(fragment, 'lights_fragment_maps', `#if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)\nradiance *= 1.0 + ${GLASS_REFLECTION.toFixed(2)} * lifeGlass + 1.2 * lifeWet;\n#endif`);
      shader.fragmentShader = fragment;
    });
    // The walls mirror the sky less than a glossy prop (the glass more, `GLASS_REFLECTION`).
    envBoost(material, 0.4);
    super(facadeGeometry(placed, ATLAS_WIDTH, atlasHeight), material);
    this.nightScale = nightScale;
    this.flatLevels = flatLevels;
    lights.forEach((light, i) => {
      if (light.room && this.flatLights.length < FLAT_WINDOWS) this.flatLights.push({ room: light.room, light: i });
    });
    this.name = 'Buildings';
    this.castShadow = true;
    this.receiveShadow = true;
    this.litBy = lights.map((_, i) => claims[i]?.lit ?? null);
    this.stories = storySlots.map(({ story }, slot) => ({ story, band: storyBand[slot]! }));
    this.lights = lights;
    this.fronts = fronts;
    this.on = lights.map(() => false);
    this.night = night;
    this.nightUpload = new RegionUploader(nightTexture);
    this.nightUpload.attach(this);
    this.dayNight = dayNight;
    this.life = life.value;
    this.weather = weather.value;
    this.atlas = { ctx, map, placed, upload: new RegionUploader(map) };
    this.atlas.upload.attach(this);
    this.idTexture = ids;
    this.add(new RoofClutter(roofs));
  }

  /** The window ids live only in the patched shader's uniforms, where `disposeTree` never looks: freed here, with the uploaders' scratch. */
  private readonly idTexture: THREE.Texture;

  dispose(): void {
    this.idTexture.dispose();
    this.nightUpload.dispose();
    this.atlas.upload.dispose();
  }

  /** The shader's window-life clock: real seconds and game hours. */
  private readonly life: THREE.Vector2;
  /** Each light's claim on when it is lit (`windowLife`), null: its curfew. */
  private readonly litBy: readonly ((() => boolean) | null)[];
  /** The story windows: what plays in each now, written to its band's kind and parameter. */
  private readonly stories: readonly { story: () => WindowStory; band: THREE.Vector4 }[];
  /** The day atlas, its texture and where each facade is in it: RETRO GAMES' window is repainted on a new market day. */
  private readonly atlas: { ctx: CanvasRenderingContext2D; map: THREE.Texture; placed: readonly Placed[]; upload: RegionUploader };

  /** Repaints the retro games shop's facade with `goods` (today's stock colours) and uploads that facade's rect alone. */
  repaintGoods(goods: readonly string[]): void {
    const { ctx, placed, upload } = this.atlas;
    for (const p of placed) {
      if (p.party || !p.spec.shops.some((shop) => shop.kind === 'retro')) continue;
      const top = p.slot.y + p.roof * p.slot.k;
      paintFacade(ctx, p.spec, p.width, { ...p.slot, y: top }, goods);
      upload.mark(p.slot.x, top, p.width * p.slot.k, p.height * p.slot.k);
    }
  }
  private time = 0;

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const nightness = nightnessOf(s);
    const material = this.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 1.3 * (0.03 + 0.97 * THREE.MathUtils.smoothstep(nightness, 0.1, 0.5));
    this.time = (this.time + dt) % 10000;
    this.life.set(this.time, s.hours);
    this.weather.set(s.wetness, s.snowCover);
    this.lightFlat(THREE.MathUtils.smoothstep(nightness, 0.15, 0.7), wakefulnessAt(s.hours));
    this.checkClock += dt;
    if (this.checkClock >= CHECK_EVERY) {
      this.checkClock = 0;
      this.relight(THREE.MathUtils.smoothstep(nightness, 0.15, 0.7), wakefulnessAt(s.hours), s.hours);
      for (const { story, band } of this.stories) {
        const now = story();
        band.z = now.kind;
        band.w = now.param;
      }
    }
  }

  /**
   * Our flat's windows: as lit as their room was left (its lamp, dimmed by drawn curtains), or,
   * before the room is built, by the curfew like any home's. Written to `flatLevels` each frame.
   */
  private lightFlat(dusk: number, wakefulness: number): void {
    for (let i = 0; i < this.flatLights.length; i++) {
      const { room, light } = this.flatLights[i]!;
      const state = flatRoomLight(room);
      const l = this.lights[light]!;
      // A lamp left on shows once the day fades (by day a lit room hardly shows from the street).
      const shown = Math.min(1, dusk * 2);
      this.flatLevels[i] = state ? shown * state.lampShown * (THROUGH_CURTAINS + (1 - THROUGH_CURTAINS) * state.curtainsOpen) : dusk > l.litAt && wakefulness >= l.curfew ? 1 : 0;
    }
  }

  /**
   * Switches every light whose state changed on the night map, each repainted alone (its room behind it) and its rect
   * uploaded alone at the next draw; the flat's stay painted on (`lightFlat` dims them).
   */
  private relight(dusk: number, wakefulness: number, hours: number): void {
    const ctx = this.night;
    const k = this.nightScale;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i]!;
      const claimed = this.litBy[i];
      const kept = claimed ? claimed() : light.shop ? isShopOpen(light.shop, hours % 24) : wakefulness >= light.curfew;
      const on = light.room !== undefined || (dusk > light.litAt && kept);
      if (on === this.on[i]) continue;
      this.on[i] = on;
      // Opaque, so the colour lands exactly as given (the ids are in their own texture); a texel round it for the filter's rim.
      const [x, y, w, h] = paintLight(ctx, light, k, on);
      this.nightUpload.mark(x - 1, y - 1, w + 2, h + 2);
    }
  }
}

/** A light as a window of its facade, in facade metres (`top`: the facade's top edge in the atlas, under its roof's band). */
function facadeWindow(p: Placed, top: number, light: NightLight): FacadeWindow {
  const { k } = p.slot;
  const s0 = (light.x - p.slot.x) / k;
  const y1 = p.height - (light.y - top) / k;
  const y0 = y1 - light.h / k;
  const floor = y0 < GROUND_FLOOR ? 0 : 1 + Math.floor((y0 - GROUND_FLOOR) / STOREY);
  return { facade: p.spec, along: [s0, s0 + light.w / k], height: [y0, y1], floor };
}

/** A light's rect on the night map (whole texels), from its colour-atlas pixels and the night map's scale. */
function nightRect(light: { x: number; y: number; w: number; h: number }, k: number): [number, number, number, number] {
  const x = Math.round(light.x * k);
  const y = Math.round(light.y * k);
  return [x, y, Math.max(1, Math.round((light.x + light.w) * k) - x), Math.max(1, Math.round((light.y + light.h) * k) - y)];
}

/**
 * The lights' ids beside the night map (see `WINDOW_LIFE`): R the id, G how far up its window, B a
 * flat window's index + 1. Nearest, no mips (a blend of two ids is a third window); written once.
 */
function windowIdTexture(lights: readonly NightLight[], width: number, height: number, k: number, storyOf: readonly number[]): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  let flat = 0;
  lights.forEach((light, i) => {
    // B: a flat window's index + 1, or a story window's 128 + its slot.
    const index = light.room && flat < FLAT_WINDOWS ? ++flat : storyOf[i]! >= 0 ? 128 + storyOf[i]! : 0;
    // A shop's window and a sign keep no home life (no TV, nobody crossing, no blind).
    if ((light.curfew <= 0 || light.shop) && !index) return;
    const id = 1 + (((i * 2654435761) >>> 0) % 254);
    const [x0, y0, w, h] = nightRect(light, k);
    // A texel wider all round than the light's rect: the night map's glow is filtered past its edge, and that rim must
    // follow the window (its blind, its TV) too. The rim never overwrites a neighbour's own texels.
    for (let y = Math.max(0, y0 - 1); y < Math.min(height, y0 + h + 1); y++) {
      // Rows bottom up, as the canvas textures are flipped.
      const row = (height - 1 - y) * width;
      const up = Math.round(THREE.MathUtils.clamp(1 - (y - y0 + 0.5) / h, 0, 1) * 255);
      for (let x = Math.max(0, x0 - 1); x < Math.min(width, x0 + w + 1); x++) {
        const t = (row + x) * 4;
        const rim = x < x0 || x >= x0 + w || y < y0 || y >= y0 + h;
        if (rim && data[t + 3] !== 0) continue;
        data[t] = index ? 0 : id;
        data[t + 1] = up;
        data[t + 2] = index;
        data[t + 3] = 255;
      }
    }
  });
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The surface mask at the night map's size (see `SURFACE`): each slot's wall (R brick or not, G its roughness, B its
 * face), its relief over it in paint order, the panes last (R 1, G their roughness, B sunk). Filtered and mipmapped.
 */
function surfaceTexture(
  surfaces: readonly Surface[],
  panes: readonly GlassPane[],
  width: number,
  height: number,
  k: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(width, height);
  const wall = Math.round(WALL_ROUGHNESS * 255);
  ctx.fillStyle = `rgb(0, ${wall}, 128)`;
  ctx.fillRect(0, 0, width, height);
  const byte = (v: number): number => Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
  for (const s of surfaces) {
    ctx.fillStyle = `rgb(${s.brick ? BRICK_FLAG : 0}, ${wall}, ${byte(RELIEF.wall)})`;
    ctx.fillRect(s.x * k, s.y * k, s.w * k, s.h * k);
    for (const r of s.relief) {
      ctx.fillStyle = `rgb(${r.brick ? BRICK_FLAG : 0}, ${byte(r.rough)}, ${byte(r.height)})`;
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
  }
  for (const pane of panes) {
    ctx.fillStyle = `rgb(255, ${byte(pane.rough)}, ${byte(RELIEF.door - 0.1)})`;
    ctx.fillRect(pane.x * k, pane.y * k, pane.w * k, pane.h * k);
  }
  const texture = toTexture(canvas, anisotropy);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** The atlas's height for `placed`, in whole 256-pixel bands. */
function atlasHeightOf(placed: readonly Placed[]): number {
  return Math.ceil(Math.max(...placed.map((p) => p.slot.y + (p.height + p.roof) * p.slot.k)) / 256) * 256;
}

/**
 * Where two faces in line meet and one is taller, the taller building's blind side wall shows above the lower one's
 * roofline, running back into the block (else the sky shows through it, seen at a slant): each such wall.
 */
function partyWalls(facades: readonly FacadeSpec[]): Party[] {
  const parties: Party[] = [];
  for (const a of facades) {
    for (const b of facades) {
      if (a === b || Math.hypot(a.to[0] - b.from[0], a.to[1] - b.from[1]) > 0.05) continue;
      const aw = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]);
      const bw = Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]);
      const [ux, uz] = [(a.to[0] - a.from[0]) / aw, (a.to[1] - a.from[1]) / aw];
      const [bux, buz] = [(b.to[0] - b.from[0]) / bw, (b.to[1] - b.from[1]) / bw];
      const ah = facadeHeight(a.storeys);
      const bh = facadeHeight(b.storeys);
      if (ux * bux + uz * buz < 0.99 || Math.abs(ah - bh) < 0.2) continue;
      const tall = ah > bh ? a : b;
      const low = tall === a ? b : a;
      const lowStyle = facadeStyle(low.seed);
      parties.push({
        spec: tall,
        style: facadeStyle(tall.seed),
        at: [a.to[0], a.to[1]],
        along: [ux, uz],
        facing: tall === a ? 1 : -1,
        y0: facadeHeight(low.storeys) - lowStyle.parapet,
        y1: facadeHeight(tall.storeys),
        seed: tall.seed * 13 + low.seed,
      });
    }
  }
  return parties;
}

/** Places every facade and party wall in the atlas: tallest first, left to right in shelves. */
function pack(facades: readonly FacadeSpec[], parties: readonly Party[], detailScale: number): Placed[] {
  const sized: (Omit<Placed, 'slot'> & { k: number })[] = facades.map((spec) => {
    const width = Math.hypot(spec.to[0] - spec.from[0], spec.to[1] - spec.from[1]);
    const style = facadeStyle(spec.seed);
    return { spec, style, width, height: facadeHeight(spec.storeys), roof: roofSlope(style), k: spec.detail * detailScale };
  });
  for (const party of parties) {
    const k = Math.max(PARTY_MIN_DETAIL, party.spec.detail * detailScale * PARTY_DETAIL);
    sized.push({ spec: party.spec, style: party.style, width: PARTY_WALL_DEPTH, height: party.y1 - party.y0, roof: 0, k, party });
  }
  const order = [...sized].sort((a, b) => (b.height + b.roof) * b.k - (a.height + a.roof) * a.k);
  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const { k, ...item } of order) {
    const w = Math.ceil(item.width * k) + PADDING;
    const h = Math.ceil((item.height + item.roof) * k) + PADDING;
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    placed.push({ ...item, slot: { x: x + PADDING / 2, y: y + PADDING / 2, k } });
    x += w;
    shelf = Math.max(shelf, h);
  }
  return placed;
}

/**
 * The quads and ledges of every facade in one geometry, uvs into the atlas. A face runs from
 * `from` to `to` (the left and right ends seen from the street) and faces the left-hand normal
 * (-dz, dx); the ledge is a box along its roofline whose faces all sample the painted cornice band.
 * A sloping roof rises behind the parapet, its back slope (a pitched roof's) or its top and back (a
 * mansard's) closing it, a gable at each end; the party walls take their own painted slots.
 */
function facadeGeometry(placed: readonly Placed[], atlasW: number, atlasH: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const perMetre: number[] = [];
  const indices: number[] = [];
  let scale: [number, number] = [0, 0];
  const quad = (corners: number[], normal: [number, number, number], uv: number[]): void => {
    const base = positions.length / 3;
    positions.push(...corners);
    for (let i = 0; i < 4; i++) normals.push(...normal);
    for (let i = 0; i < 4; i++) perMetre.push(...scale);
    uvs.push(...uv);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const { spec, style, width, height, roof, slot, party } of placed) {
    // How far the atlas's uv moves per metre along the face and up it (the glass's parallax).
    scale = [slot.k / atlasW, slot.k / atlasH];
    if (party) {
      partyQuad(quad, party, slot, atlasW, atlasH);
      continue;
    }
    const [ax, az] = spec.from;
    const [bx, bz] = spec.to;
    const nx = -(bz - az) / width;
    const nz = (bx - ax) / width;
    const u0 = slot.x / atlasW;
    const u1 = (slot.x + width * slot.k) / atlasW;
    // The facade's band sits under the roof's in the slot.
    const v = (y: number): number => 1 - (slot.y + (roof + height - y) * slot.k) / atlasH;
    const u = (s: number): number => (slot.x + s * slot.k) / atlasW;
    const ux = (bx - ax) / width;
    const uz = (bz - az) / width;
    // The face itself, from `s0` to `s1` along and `y0` to `y1` up.
    const face = (s0: number, s1: number, y0: number, y1: number): void => {
      const [x0, z0, x1, z1] = [ax + ux * s0, az + uz * s0, ax + ux * s1, az + uz * s1];
      quad([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], [nx, 0, nz], [u(s0), v(y0), u(s1), v(y0), u(s1), v(y1), u(s0), v(y1)]);
    };
    // Round its openings (street-level holes: a door walked through), in columns and the lintels over them.
    let s0 = 0;
    for (const hole of [...(spec.openings ?? [])].sort((a, b) => a.at - b.at)) {
      const a = hole.at - hole.width / 2;
      const b = hole.at + hole.width / 2;
      face(s0, a, 0, height);
      face(a, b, hole.height, height);
      s0 = b;
    }
    face(s0, width, 0, height);
    // The cornice ledge: front, underside and top, all in the cornice band.
    // Facades running along z sit 3 cm lower, so the two ledges meeting at a corner never share a plane.
    const cornice = height - style.parapet;
    const y0 = cornice - 0.15 - (spec.from[0] === spec.to[0] ? 0.03 : 0);
    const y1 = y0 + LEDGE.height;
    const d = LEDGE.depth;
    const band = v(cornice + 0.05);
    const out = (x: number, z: number): [number, number] => [x + nx * d, z + nz * d];
    const [aox, aoz] = out(ax, az);
    const [box, boz] = out(bx, bz);
    const uvBand = [u0, band, u1, band, u1, band, u0, band];
    quad([aox, y0, aoz, box, y0, boz, box, y1, boz, aox, y1, aoz], [nx, 0, nz], uvBand);
    quad([ax, y0, az, bx, y0, bz, box, y0, boz, aox, y0, aoz], [0, -1, 0], uvBand);
    quad([aox, y1, aoz, box, y1, boz, bx, y1, bz, ax, y1, az], [0, 1, 0], uvBand);
    // Its ends, so a ledge seen from the side (past a lower neighbour, down a side street) is solid, not a hollow shell.
    quad([ax, y0, az, aox, y0, aoz, aox, y1, aoz, ax, y1, az], [-ux, 0, -uz], uvBand);
    quad([box, y0, boz, bx, y0, bz, bx, y1, bz, box, y1, boz], [ux, 0, uz], uvBand);
    if (style.roof !== 'flat') {
      // The roof: its slope rising back from behind the parapet (the band over the facade's in the atlas).
      const { rise, run } = ROOF_SLOPE[style.roof];
      const foot = height - ROOF_FOOT;
      const back = (t: number): [number, number, number, number] => [ax - nx * t, az - nz * t, bx - nx * t, bz - nz * t];
      const [afx, afz, bfx, bfz] = back(run);
      const vr = (t: number): number => 1 - (slot.y + (roof - t) * slot.k) / atlasH;
      const slopeUv = [u0, vr(0), u1, vr(0), u1, vr(roof), u0, vr(roof)];
      const slope = new THREE.Vector3(nx * rise, run, nz * rise).normalize();
      quad([ax, foot, az, bx, foot, bz, bfx, foot + rise, bfz, afx, foot + rise, afz], [slope.x, slope.y, slope.z], slopeUv);
      // One texel of the parapet's band, the wall's colour: the gables.
      const wallTexel = v(height - 0.5);
      const gable = [u0, wallTexel, u0, wallTexel, u0, wallTexel, u0, wallTexel];
      if (spec.id.startsWith(OURS)) {
        // Our own roof is the roof zone's (`world/roof`): only its street slope and its ends here, as before.
        quad([ax, foot, az, afx, foot + rise, afz, afx, foot, afz, afx, foot, afz], [-ux, 0, -uz], gable);
        quad([bx, foot, bz, bfx, foot, bfz, bfx, foot + rise, bfz, bfx, foot + rise, bfz], [ux, 0, uz], gable);
        continue;
      }
      // The back: a pitched roof falls again to its foot; a mansard runs flat to its back slope.
      const depth = style.roof === 'pitched' ? 2 * run : PARTY_WALL_DEPTH;
      const [arx, arz, brx, brz] = back(depth - run);
      const [akx, akz, bkx, bkz] = back(depth);
      const backSlope = new THREE.Vector3(-nx * rise, run, -nz * rise).normalize();
      quad([bkx, foot, bkz, akx, foot, akz, arx, foot + rise, arz, brx, foot + rise, brz], [backSlope.x, backSlope.y, backSlope.z], slopeUv);
      if (style.roof === 'mansard') {
        const zinc = vr(roof - 0.05);
        quad([afx, foot + rise, afz, bfx, foot + rise, bfz, brx, foot + rise, brz, arx, foot + rise, arz], [0, 1, 0], [u0, zinc, u1, zinc, u1, zinc, u0, zinc]);
      }
      // The gables: the profile at each end (foot, up the front slope, along the top, down the back).
      const profile = (x: number, z: number, sign: 1 | -1): void => {
        const at = (t: number, y: number): number[] => [x - nx * t, y, z - nz * t];
        const [p0, p1, p2, p3] = [at(0, foot), at(run, foot + rise), at(depth - run, foot + rise), at(depth, foot)] as [number[], number[], number[], number[]];
        // Counter-clockwise seen from outside that end: the street's side is on the right at the left end, on the left at the right end.
        const corners = sign > 0 ? [...p3, ...p2, ...p1, ...p0] : [...p0, ...p1, ...p2, ...p3];
        quad(corners, [sign * ux, 0, sign * uz], gable);
      };
      profile(ax, az, -1);
      profile(bx, bz, 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('uvPerMetre', new THREE.Float32BufferAttribute(perMetre, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/** A party wall's quad, in its painted slot: from the corner on the street back into the block, the slot's left edge on the viewer's left. */
function partyQuad(quad: (corners: number[], normal: [number, number, number], uv: number[]) => void, party: Party, slot: AtlasSlot, atlasW: number, atlasH: number): void {
  const [px, pz] = party.at;
  const [ux, uz] = party.along;
  // Back into the block: against the faces' normal (-uz, ux).
  const [qx, qz] = [px + uz * PARTY_WALL_DEPTH, pz - ux * PARTY_WALL_DEPTH];
  const { y0, y1 } = party;
  const u0 = slot.x / atlasW;
  const u1 = (slot.x + PARTY_WALL_DEPTH * slot.k) / atlasW;
  const vTop = 1 - slot.y / atlasH;
  const vBottom = 1 - (slot.y + (y1 - y0) * slot.k) / atlasH;
  const uv = [u0, vBottom, u1, vBottom, u1, vTop, u0, vTop];
  if (party.facing > 0) quad([px, y0, pz, qx, y0, qz, qx, y1, qz, px, y1, pz], [ux, 0, uz], uv);
  else quad([qx, y0, qz, px, y0, pz, px, y1, pz, qx, y1, qz], [-ux, 0, -uz], uv);
}
