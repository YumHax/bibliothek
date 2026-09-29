import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { PARAPET, facadeHeight, paintFacade, paintRoof, type AtlasSlot, type FacadeFeatures, type GlassPane, type NightLight } from './facadePainter';
import { ROOF_SLOPE, facadeStyle, type FacadeStyle } from '../city/facadeStyle';
import { nightnessOf } from './streetAir';
import { GROUND_FLOOR, type FacadeSpec } from './streetPlan';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { envBoost } from '../materials/envBoost';
import { flatRoomLight, type FlatRoomId } from '../city/flatWindows';

export interface BuildingsOptions {
  /** Scales every facade's `detail` (lower on low quality). */
  detailScale: number;
  anisotropy: number;
  /** The retro games shop's display colours (today's market stock), if known. */
  shopGoods: readonly string[] | null;
  /** The night map's and the glass mask's resolution, as a share of the colour atlas's (0.5 on high quality, 0.25 else). */
  nightScale: number;
}

const ATLAS_WIDTH = 4096;
/** The tallest the atlas may grow (`options.detailScale` is scaled back to fit). */
const MAX_ATLAS = 4096;
const PADDING = 4;
/** The cornice ledge along each roofline: how far it stands out and how tall it is. */
const LEDGE = { depth: 0.38, height: 0.4 };
/** How far back into the block a party wall runs from the street face (it shows above a lower neighbour). */
const PARTY_WALL_DEPTH = 9;
/** Seconds between two looks at the clock, and the least time between two uploads of the night map. */
const CHECK_EVERY = 1;
const UPLOAD_EVERY = 6;
/** Our flat's windows the street shows lit as their room was left (one uniform each, `city/flatWindows`). */
const FLAT_WINDOWS = 8;
/** How deep the panes sit behind the facade's face (the reveal the parallax shows), metres. */
const REVEAL = 0.14;
/** The walls' roughness in the glass mask (G), the material's roughness being 1. */
const WALL_ROUGHNESS = 0.88;
/** The glass's reflection, over the walls' `envMapIntensity`. */
const GLASS_REFLECTION = 2.2;
/** A drawn curtain still lets this much of a lit room's light through. */
const THROUGH_CURTAINS = 0.15;

/*
 * Window life on the night map, as the window view's pane shader has it (`props/outdoors/shader.ts`,
 * `lightTexel`). Each light's id is in its own texture (`windowIds`, nearest, no mips, so ids never
 * blend): R the id (1..254; 0 = a light with no curfew, a sign or a lamp, left alone), G how far up
 * its window the texel is (0 sill .. 1 head), B one of our flat's windows (its index + 1: lit by
 * `flatLevels`, not by the curfew). The shader, above the ground floor, flickers the bluish ones like a
 * TV, now and then slides a dark band (someone crossing the room) over a lit one (23 s slots hashed
 * from the id), and lowers a quarter of the blinds between 21 h and 22 h (dimmer, slatted; up again at 7-8 h).
 */
const WINDOW_LIFE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
{
  vec4 lifeIds = texture2D(windowIds, vEmissiveMapUv);
  float flatIndex = floor(lifeIds.b * 255.0 + 0.5);
  float lifeId = lifeIds.r;
  float lifeLit = max(emissiveColor.r, max(emissiveColor.g, emissiveColor.b));
  if (flatIndex > 0.5) {
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
 * The windows' glass (the roughness map: R the pane, G the roughness the material reads from it): the pane sits a reveal deep behind the facade, so the eye ray is followed that far in and
 * the atlas read where it lands (the pane's painted contents shift with the view; where it lands off
 * the pane the reveal's side shows, in its shade). The glass then mirrors the environment more
 * than the walls do (`GLASS_REFLECTION`).
 */
const GLASS_INSET = /* glsl */ `
float lifeGlass = 0.0;
#if defined(USE_MAP) && defined(USE_ROUGHNESSMAP)
{
  lifeGlass = texture2D(roughnessMap, vMapUv).r;
  if (lifeGlass > 0.5) {
    vec3 V = normalize(cameraPosition - vLifePos);
    vec3 N = normalize(vLifeNormal);
    vec3 T = vec3(N.z, 0.0, -N.x);
    float vn = max(dot(V, N), 0.25);
    vec2 shift = -${REVEAL.toFixed(3)} * vec2(dot(V, T), V.y) / vn;
    vec2 inUv = vMapUv + shift * vUvPerMetre;
    float onPane = smoothstep(0.35, 0.65, texture2D(roughnessMap, inUv).r);
    vec3 seen = texture2D(map, inUv).rgb;
    diffuseColor.rgb = seen * mix(0.55, 1.0, onPane);
  }
}
#endif
`;

/** A painted facade and what stands out of it, for the relief (`relief/`): its spec, size and features in facade metres. */
export interface PaintedFront {
  spec: FacadeSpec;
  width: number;
  height: number;
  features: FacadeFeatures;
}

interface Placed {
  spec: FacadeSpec;
  style: FacadeStyle;
  width: number;
  height: number;
  /** The roof's slope, foot to ridge (0: a flat roof behind the parapet); its band is painted over the facade's in the slot. */
  roof: number;
  slot: AtlasSlot;
}

/** How far under the parapet's top a sloping roof starts, so no sky shows between them. */
const ROOF_FOOT = 0.3;

/** The length of a style's roof slope (0 for a flat roof). */
function roofSlope(style: FacadeStyle): number {
  return style.roof === 'flat' ? 0 : Math.hypot(ROOF_SLOPE[style.roof].rise, ROOF_SLOPE[style.roof].run);
}

/**
 * Every building face along the street, as one mesh with one material: each face is a quad (and a
 * cornice ledge along its roofline) whose painted facade (`paintFacade`) sits in a shared canvas
 * atlas, shelf-packed. A second, smaller atlas (`nightScale`) holds the lit windows for the night
 * (`emissiveMap`, opaque: no alpha to premultiply), with their ids beside it (`windowIds`) and the
 * windows' glass (`glassMask`: roughness, a reveal in parallax, a stronger reflection): each light comes on at its own point of dusk and goes out when the city's
 * wakefulness drops below its curfew, as in the painted view; the night map is repainted where
 * lights change and re-uploaded at most every `UPLOAD_EVERY` seconds (a few times a game hour).
 * One draw call for the whole street's architecture (two with the sun's shadow).
 */
export class Buildings extends THREE.Mesh implements Furniture, Updatable {
  readonly contactShadow = false;
  /** Every facade's features (awnings, balconies, shop windows...), for the relief built in front of them. */
  readonly fronts: PaintedFront[];
  private readonly lights: NightLight[] = [];
  private readonly on: boolean[];
  private readonly night: CanvasRenderingContext2D;
  private readonly nightTexture: THREE.CanvasTexture;
  private readonly nightScale: number;
  /** Our flat's lights (their room, their index in `lights`) and the uniform their levels go to. */
  private readonly flatLights: { room: FlatRoomId; light: number }[] = [];
  private readonly flatLevels: number[];
  private readonly dayNight: DayNight;
  private checkClock = CHECK_EVERY;
  private sinceUpload = UPLOAD_EVERY;
  private dirty = false;

  constructor(facades: readonly FacadeSpec[], dayNight: DayNight, options: BuildingsOptions) {
    // Every GPU takes a 4096 texture: a finer detail that would need a taller atlas is scaled back to fit.
    let placed = pack(facades, options.detailScale);
    let atlasHeight = atlasHeightOf(placed);
    for (let scale = options.detailScale; atlasHeight > MAX_ATLAS && scale > 0.3; ) {
      scale *= 0.92;
      placed = pack(facades, scale);
      atlasHeight = atlasHeightOf(placed);
    }
    const [canvas, ctx] = createCanvas(ATLAS_WIDTH, atlasHeight);
    const nightScale = options.nightScale;
    const [nightCanvas, night] = createCanvas(Math.round(ATLAS_WIDTH * nightScale), Math.round(atlasHeight * nightScale));
    night.fillStyle = '#000';
    night.fillRect(0, 0, nightCanvas.width, nightCanvas.height);
    const lights: NightLight[] = [];
    const panes: GlassPane[] = [];
    const fronts: PaintedFront[] = [];
    for (const p of placed) {
      // The roof's band on top of the slot, the facade under it.
      if (p.roof > 0) paintRoof(ctx, p.style, p.width, p.roof, p.slot);
      const painted = paintFacade(ctx, p.spec, p.width, { ...p.slot, y: p.slot.y + p.roof * p.slot.k }, options.shopGoods);
      lights.push(...painted.lights);
      panes.push(...painted.glass);
      fronts.push({ spec: p.spec, width: p.width, height: p.height, features: painted.features });
    }

    const map = toTexture(canvas, options.anisotropy);
    const nightTexture = toTexture(nightCanvas, options.anisotropy);
    const ids = windowIdTexture(lights, nightCanvas.width, nightCanvas.height, nightScale);
    const glass = glassTexture(panes, nightCanvas.width, nightCanvas.height, nightScale, options.anisotropy);
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: nightTexture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 1, roughnessMap: glass });
    const life = { value: new THREE.Vector2() };
    const flatLevels = new Array<number>(FLAT_WINDOWS).fill(0);
    patchShader(material, 'streetWindowLife', (shader) => {
      shader.uniforms.windowLife = life;
      shader.uniforms.windowIds = { value: ids };
      shader.uniforms.flatLevels = { value: flatLevels };
      shader.vertexShader =
        'attribute vec2 uvPerMetre;\nvarying vec2 vUvPerMetre;\nvarying vec3 vLifePos;\nvarying vec3 vLifeNormal;\n' +
        afterChunk(shader.vertexShader, 'begin_vertex', 'vLifePos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLifeNormal = mat3(modelMatrix) * objectNormal;\nvUvPerMetre = uvPerMetre;');
      let fragment = `uniform vec2 windowLife;\nuniform sampler2D windowIds;\nuniform float flatLevels[${FLAT_WINDOWS}];\nvarying vec2 vUvPerMetre;\nvarying vec3 vLifePos;\nvarying vec3 vLifeNormal;\n` + shader.fragmentShader;
      fragment = afterChunk(fragment, 'map_fragment', GLASS_INSET);
      fragment = afterChunk(fragment, 'emissivemap_fragment', WINDOW_LIFE);
      fragment = afterChunk(fragment, 'lights_fragment_maps', `#if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)\nradiance *= 1.0 + ${GLASS_REFLECTION.toFixed(2)} * lifeGlass;\n#endif`);
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
    this.lights = lights;
    this.fronts = fronts;
    this.on = lights.map(() => false);
    this.night = night;
    this.nightTexture = nightTexture;
    this.dayNight = dayNight;
    this.life = life.value;
    this.atlas = { ctx, map, placed };
    // Each light's own id (see `WINDOW_LIFE`) and its colour as bytes, for writing it straight into the night map.
  }

  /** The shader's window-life clock: real seconds and game hours. */
  private readonly life: THREE.Vector2;
  /** The day atlas, its texture and where each facade is in it: RETRO GAMES' window is repainted on a new market day. */
  private readonly atlas: { ctx: CanvasRenderingContext2D; map: THREE.Texture; placed: readonly Placed[] };

  /** Repaints the retro games shop's facade with `goods` (today's stock colours) and re-uploads the atlas. */
  repaintGoods(goods: readonly string[]): void {
    const { ctx, map, placed } = this.atlas;
    for (const p of placed) {
      if (!p.spec.shops.some((shop) => shop.kind === 'retro')) continue;
      paintFacade(ctx, p.spec, p.width, { ...p.slot, y: p.slot.y + p.roof * p.slot.k }, goods);
      map.needsUpdate = true;
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
    this.lightFlat(THREE.MathUtils.smoothstep(nightness, 0.15, 0.7), wakefulnessAt(s.hours));
    this.sinceUpload += dt;
    this.checkClock += dt;
    if (this.checkClock >= CHECK_EVERY) {
      this.checkClock = 0;
      this.relight(THREE.MathUtils.smoothstep(nightness, 0.15, 0.7), wakefulnessAt(s.hours));
    }
    if (this.dirty && this.sinceUpload >= UPLOAD_EVERY) {
      this.dirty = false;
      this.sinceUpload = 0;
      this.nightTexture.needsUpdate = true;
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

  /** Switches every light whose state changed on the night map (the upload waits for `update`); the flat's stay painted on (`lightFlat` dims them). */
  private relight(dusk: number, wakefulness: number): void {
    const ctx = this.night;
    const k = this.nightScale;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i]!;
      const on = light.room !== undefined || (dusk > light.litAt && wakefulness >= light.curfew);
      if (on === this.on[i]) continue;
      this.on[i] = on;
      // Opaque, so the colour lands exactly as given (the ids are in their own texture).
      const [x, y, w, h] = nightRect(light, k);
      ctx.fillStyle = on ? light.color : '#000';
      ctx.fillRect(x, y, w, h);
      this.dirty = true;
    }
  }
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
function windowIdTexture(lights: readonly NightLight[], width: number, height: number, k: number): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  let flat = 0;
  lights.forEach((light, i) => {
    const index = light.room && flat < FLAT_WINDOWS ? ++flat : 0;
    if (light.curfew <= 0 && !index) return;
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

/** The glass mask at the night map's size: R the panes, G the roughness (the walls' elsewhere). Filtered and mipmapped. */
function glassTexture(panes: readonly GlassPane[], width: number, height: number, k: number, anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(width, height);
  ctx.fillStyle = `rgb(0, ${Math.round(WALL_ROUGHNESS * 255)}, 0)`;
  ctx.fillRect(0, 0, width, height);
  for (const pane of panes) {
    ctx.fillStyle = `rgb(255, ${Math.round(pane.rough * 255)}, 0)`;
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

/** Places every facade in the atlas: tallest first, left to right in shelves. */
function pack(facades: readonly FacadeSpec[], detailScale: number): Placed[] {
  const sized = facades.map((spec) => {
    const width = Math.hypot(spec.to[0] - spec.from[0], spec.to[1] - spec.from[1]);
    const style = facadeStyle(spec.seed);
    return { spec, style, width, height: facadeHeight(spec.storeys), roof: roofSlope(style), k: spec.detail * detailScale };
  });
  const order = [...sized].sort((a, b) => (b.height + b.roof) * b.k - (a.height + a.roof) * a.k);
  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const item of order) {
    const w = Math.ceil(item.width * item.k) + PADDING;
    const h = Math.ceil((item.height + item.roof) * item.k) + PADDING;
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    placed.push({ spec: item.spec, style: item.style, width: item.width, height: item.height, roof: item.roof, slot: { x: x + PADDING / 2, y: y + PADDING / 2, k: item.k } });
    x += w;
    shelf = Math.max(shelf, h);
  }
  return placed;
}

/**
 * The quads and ledges of every facade in one geometry, uvs into the atlas. A face runs from
 * `from` to `to` (the left and right ends seen from the street) and faces the left-hand normal
 * (-dz, dx); the ledge is a box along its roofline whose faces all sample the painted cornice band.
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
  for (const { spec, style, width, height, roof, slot } of placed) {
    // How far the atlas's uv moves per metre along the face and up it (the glass's parallax).
    scale = [slot.k / atlasW, slot.k / atlasH];
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
    const y0 = height - PARAPET - 0.15 - (spec.from[0] === spec.to[0] ? 0.03 : 0);
    const y1 = y0 + LEDGE.height;
    const d = LEDGE.depth;
    const band = v(height - PARAPET + 0.05);
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
      // The roof: its slope rising back from behind the parapet (the band over the facade's in the atlas), a gable
      // end at each end of the face.
      const { rise, run } = ROOF_SLOPE[style.roof];
      const foot = height - ROOF_FOOT;
      const [afx, afz, bfx, bfz] = [ax - nx * run, az - nz * run, bx - nx * run, bz - nz * run];
      const vr = (t: number): number => 1 - (slot.y + (roof - t) * slot.k) / atlasH;
      const slope = new THREE.Vector3(nx * rise, run, nz * rise).normalize();
      quad([ax, foot, az, bx, foot, bz, bfx, foot + rise, bfz, afx, foot + rise, afz], [slope.x, slope.y, slope.z], [u0, vr(0), u1, vr(0), u1, vr(roof), u0, vr(roof)]);
      const mid = vr(roof / 2);
      const gable = [u0, mid, u0, mid, u0, mid, u0, mid];
      quad([ax, foot, az, afx, foot + rise, afz, afx, foot, afz, afx, foot, afz], [-ux, 0, -uz], gable);
      quad([bx, foot, bz, bfx, foot, bfz, bfx, foot + rise, bfz, bfx, foot + rise, bfz], [ux, 0, uz], gable);
    }
  }
  // The party walls: where two faces in line meet and one is taller, the taller building's blind side wall shows above
  // the lower one's roofline, running back into the block (else the sky shows through it, seen at a slant).
  for (const a of placed) {
    for (const b of placed) {
      if (a === b || Math.hypot(a.spec.to[0] - b.spec.from[0], a.spec.to[1] - b.spec.from[1]) > 0.05) continue;
      const [ux, uz] = [(a.spec.to[0] - a.spec.from[0]) / a.width, (a.spec.to[1] - a.spec.from[1]) / a.width];
      const [bux, buz] = [(b.spec.to[0] - b.spec.from[0]) / b.width, (b.spec.to[1] - b.spec.from[1]) / b.width];
      if (ux * bux + uz * buz < 0.99 || Math.abs(a.height - b.height) < 0.2) continue;
      const tall = a.height > b.height ? a : b;
      const low = tall === a ? b : a;
      const [px, pz] = a.spec.to;
      // Back into the block: against the faces' normal (-uz, ux).
      const [qx, qz] = [px + uz * PARTY_WALL_DEPTH, pz - ux * PARTY_WALL_DEPTH];
      const y0 = low.height - PARAPET;
      const y1 = tall.height;
      scale = [tall.slot.k / atlasW, tall.slot.k / atlasH];
      // One texel of the taller face's cornice band, its stone's colour: a blind wall.
      const at = tall === a ? tall.width - 0.3 : 0.3;
      const uvs1 = (tall.slot.x + at * tall.slot.k) / atlasW;
      const vs1 = 1 - (tall.slot.y + (tall.roof + PARAPET - 0.05) * tall.slot.k) / atlasH;
      const flat = [uvs1, vs1, uvs1, vs1, uvs1, vs1, uvs1, vs1];
      if (tall === a) quad([px, y0, pz, qx, y0, qz, qx, y1, qz, px, y1, pz], [ux, 0, uz], flat);
      else quad([qx, y0, qz, px, y0, pz, px, y1, pz, qx, y1, qz], [-ux, 0, -uz], flat);
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
