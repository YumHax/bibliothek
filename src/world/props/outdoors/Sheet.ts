import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';

/**
 * Scenery texture size. The panorama covers 360° across but only the `ELEVATION_MIN..MAX` band
 * down, at the same angular resolution both ways (about 11 texels per degree); the sky above the
 * band is drawn analytically and nothing is ever seen below it.
 */
export const SCENE_WIDTH = 4096;
export const SCENE_HEIGHT = 1344;
/** Down to the pavement under the window: nothing but the building's own foot is steeper than this. */
export const ELEVATION_MIN = THREE.MathUtils.degToRad(-80);
export const ELEVATION_MAX = THREE.MathUtils.degToRad(40);
/** Height of the eye above the street, in metres: the flat is on a sixth floor. */
export const EYE_HEIGHT = 18;
export const PX_PER_RAD = SCENE_WIDTH / (Math.PI * 2);
/**
 * Distances are stored in a byte as `1 - exp(-d / DEPTH_SCALE)`: about half a metre per step
 * across the street, saturating around 900 m. The shader decodes it for the haze and to hide
 * moving things behind what stands nearer.
 */
export const DEPTH_SCALE = 160;

export type Rng = () => number;
/** What lights up at night: tungsten (warm), fluorescent and screens (cool), or a whiter mix of both. */
export type LightKind = 'warm' | 'cool' | 'neutral';

/**
 * How a surface takes the weather, 0..1 each: `wet` how much it mirrors the sky once rain has
 * puddled on it (asphalt most), `snow` how much snow settles on it (flat ground, roofs).
 */
export interface Surface {
  wet?: number;
  snow?: number;
}

export type Fill = string | CanvasGradient;

/**
 * A convex polygon in texture space that is also a Path2D: painted like any path, and rasterised
 * texel by texel by `Sheet.lit()`, which needs the corners. Corners in order, no self-crossing.
 */
export class Polygon extends Path2D {
  constructor(readonly corners: readonly (readonly [number, number])[]) {
    super();
    corners.forEach(([x, y], i) => (i === 0 ? this.moveTo(x, y) : this.lineTo(x, y)));
    this.closePath();
  }
}

/** Texture x of an azimuth: 0 is straight out of the front wall (+z), +90° is +x, like the shader's `atan(d.x, d.z)`. */
export function azimuthX(azimuth: number): number {
  return (azimuth / (Math.PI * 2) + 0.5) * SCENE_WIDTH;
}

/** Texture y of an elevation; `ELEVATION_MAX` is the top row. */
export function elevationY(elevation: number): number {
  return (1 - (elevation - ELEVATION_MIN) / (ELEVATION_MAX - ELEVATION_MIN)) * SCENE_HEIGHT;
}

/** Texture y of a point `height` metres above the street, `distance` metres away (true perspective from the eye). */
export function heightY(height: number, distance: number): number {
  return elevationY(Math.atan2(height - EYE_HEIGHT, distance));
}

/** Texture size of `metres` seen `distance` away (small-angle; exact enough for anything but the road under the window). */
export function sizePx(metres: number, distance: number): number {
  return (metres / distance) * PX_PER_RAD;
}

/** Vertical squash of a shape lying flat on the ground `distance` away: 1 seen from straight above, 0 at the horizon. */
export function groundSquash(distance: number): number {
  return EYE_HEIGHT / Math.hypot(EYE_HEIGHT, distance);
}

/** Azimuth of the world point (x, z), the eye at the origin. */
export function azimuthOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Texture point of the world point (x, z) at `height` above the street. */
export function worldPoint(x: number, z: number, height: number): [number, number] {
  return [azimuthX(azimuthOf(x, z)), heightY(height, Math.hypot(x, z))];
}

/** A Path2D through `points`, closed. */
export function outline(points: readonly (readonly [number, number])[]): Path2D {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

/** Byte value the depth channel holds for a thing `distance` metres away (see `DEPTH_SCALE`). */
export function encodeDepth(distance: number): number {
  return Math.round(THREE.MathUtils.clamp(1 - Math.exp(-distance / DEPTH_SCALE), 0, 1) * 255);
}

/**
 * The three canvases the scenery is painted on, side by side, all in scenery texture space:
 *  - `color`: the day colours, transparent where there is only sky;
 *  - `light`: R the warm lights that come on at night (windows, shops, lamps and the pools they cast),
 *    G the cool ones (offices, screens), B how much a surface mirrors the sky (glass, water);
 *  - `haze`: grey = how far away the surface is (`encodeDepth`), for the atmospheric perspective and to
 *    hide the moving sprites behind nearer things;
 *  - `curfew`: grey = how early in the night each light goes out (0 = never: street lamps, signs left on).
 *    The shader keeps a light on while the city's wakefulness (`wakefulnessAt`) is above its curfew, so
 *    the windows go dark one by one through the night, and switches them on one by one at dusk in an
 *    order hashed from the same value. Lights are on or off, never dimmed, so a light and its curfew are
 *    rasterised onto exactly the same texels, without anti-aliasing on either canvas (`lit()`), and the
 *    shader switches each texel before filtering. A texel that carries light but no stamp (a lamp's `glow`)
 *    reads 0: it burns all night. A light whose curfew byte is 7 mod 8 is animated by the shader: a cool
 *    one flickers like a television, a warm one blinks like a beacon (see `lit()`'s `animated`);
 *  - `ground`: R the cast shadows (drawn straight under what casts them, so they never point the wrong
 *    way; the shader fades them with the sun), G how wet a surface gets, B how much snow it catches;
 *  - `fx`: what moves or changes in the painted scenery itself. R how far a texel sways in the wind (texels
 *    at full wind x 16: tree crowns, more towards the top), G its sway phase (7 bits) plus 128 on the
 *    swaying thing itself (without it, the margin around a crown the crown may sway into), B the
 *    curfew of a roller shutter that comes down over a shop front when the shop shuts (0 = none).
 *    Nearest-sampled like the lights. A light whose curfew byte is 6 mod 8 is a fairy light (`fairy()`):
 *    it twinkles in the colour painted under it.
 * Things are painted far to near (painter's algorithm). A thing announces its distance and glassiness with
 * `begin()`, then every silhouette it fills with `rect()` / `path()` lands on the first three canvases at once,
 * so it hides what stood behind it on every channel; details that stay inside a silhouette go to
 * `color` directly, and lights go through `lit()` / `glow()`.
 */
export class Sheet {
  readonly color: CanvasRenderingContext2D;
  readonly light: CanvasRenderingContext2D;
  readonly haze: CanvasRenderingContext2D;
  readonly curfew: CanvasRenderingContext2D;
  readonly ground: CanvasRenderingContext2D;
  readonly fx: CanvasRenderingContext2D;
  private hazeStyle = '#000000';
  private fxStyle: string | CanvasGradient = '#000000';
  private groundStyle = '#000000';
  private glassByte = 0;

  constructor() {
    [, this.color] = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
    [, this.light] = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
    [, this.haze] = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
    [, this.curfew] = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
    [, this.ground] = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
    [, this.fx] = createCanvas(SCENE_WIDTH, SCENE_HEIGHT);
    for (const ctx of [this.light, this.haze, this.curfew, this.ground, this.fx]) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
  }

  private get all(): CanvasRenderingContext2D[] {
    return [this.color, this.light, this.haze, this.curfew, this.ground, this.fx];
  }

  /**
   * The next silhouettes belong to a thing `distance` metres away whose surface mirrors the sky by
   * `glass` (0..1) and takes the weather as `surface` says (see `Surface`; default neither).
   */
  begin(distance: number, glass = 0, surface: Surface = {}): void {
    const h = encodeDepth(distance);
    this.hazeStyle = `rgb(${h},${h},${h})`;
    this.glassByte = Math.round(THREE.MathUtils.clamp(glass, 0, 1) * 255);
    this.groundStyle = `rgb(0,${byte(surface.wet ?? 0)},${byte(surface.snow ?? 0)})`;
    this.fxStyle = '#000000';
  }

  /**
   * The next silhouettes (until the next `begin()`) sway in the wind: not at all at texture row
   * `bottom` (the foot of the trunk), up to `amplitude` texels at full wind at row `top` (the top of
   * the crown), all together on their own `phase` (0..1). See `swayMargin()` for the edges.
   */
  swaying(top: number, bottom: number, amplitude: number, phase: number): void {
    this.fxStyle = this.swayGradient(top, bottom, amplitude, phase, true);
  }

  /**
   * The margin around a swaying shape (`p`, a little larger than it) that it may sway into: the
   * shader moves the shape there, and leaves whatever else is there alone. Keeps the swaying shapes
   * already painted under it.
   */
  swayMargin(p: Path2D, top: number, bottom: number, amplitude: number, phase: number): void {
    const ctx = this.fx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = this.swayGradient(top, bottom, amplitude, phase, false);
    ctx.fill(p);
    ctx.restore();
  }

  private swayGradient(top: number, bottom: number, amplitude: number, phase: number, core: boolean): CanvasGradient {
    const r = Math.round(THREE.MathUtils.clamp(amplitude, 0, 15.9) * 16);
    const g = (Math.floor(THREE.MathUtils.euclideanModulo(phase, 1) * 127) & 127) + (core ? 128 : 0);
    const gradient = this.fx.createLinearGradient(0, bottom, 0, Math.min(top, bottom - 1));
    gradient.addColorStop(0, `rgb(0,${g},0)`);
    gradient.addColorStop(1, `rgb(${r},${g},0)`);
    return gradient;
  }

  /**
   * A roller shutter over `p` (a shop front), down while the city's wakefulness is below `curfew`:
   * the shop's closing time, and in the morning until it opens. Stamp it after the shop's own
   * silhouettes; anything painted over it later (an awning, a tree) hides it again.
   */
  shutter(p: Path2D, curfew: number): void {
    const ctx = this.fx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = `rgb(0,0,${Math.max(1, byte(curfew))})`;
    ctx.fill(p);
    ctx.restore();
  }

  /** Fills a silhouette rectangle with `fill`, stamping the current distance and glassiness. */
  rect(x: number, y: number, w: number, h: number, fill: Fill): void {
    this.color.fillStyle = fill;
    this.color.fillRect(x, y, w, h);
    this.haze.fillStyle = this.hazeStyle;
    this.haze.fillRect(x, y, w, h);
    this.light.fillStyle = `rgb(0,0,${this.glassByte})`;
    this.light.fillRect(x, y, w, h);
    this.ground.fillStyle = this.groundStyle;
    this.ground.fillRect(x, y, w, h);
    this.fx.fillStyle = this.fxStyle;
    this.fx.fillRect(x, y, w, h);
  }

  /** Fills a silhouette path with `fill`, stamping the current distance and glassiness. */
  path(p: Path2D, fill: Fill): void {
    this.color.fillStyle = fill;
    this.color.fill(p);
    this.haze.fillStyle = this.hazeStyle;
    this.haze.fill(p);
    this.light.fillStyle = `rgb(0,0,${this.glassByte})`;
    this.light.fill(p);
    this.ground.fillStyle = this.groundStyle;
    this.ground.fill(p);
    this.fx.fillStyle = this.fxStyle;
    this.fx.fill(p);
  }

  /**
   * A shadow cast on whatever is already painted under `p`, `strength` 0..1 (or a gradient built by
   * `shadowFill`). Shadows sit straight under what casts them and the shader shows them only as
   * strongly as the sun shines, so they never point the wrong way nor survive an overcast sky.
   */
  shadow(p: Path2D, strength: number | CanvasGradient): void {
    const ctx = this.ground;
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = typeof strength === 'number' ? shadowStyle(strength) : strength;
    ctx.fill(p);
    ctx.restore();
  }

  /** A radial gradient for `shadow()`: `strength` at the centre fading to none at radius `r`. */
  shadowFill(x: number, y: number, r: number, strength: number): CanvasGradient {
    const g = this.ground.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, shadowStyle(strength));
    g.addColorStop(0.65, shadowStyle(strength * 0.7));
    g.addColorStop(1, 'rgb(0,0,0)');
    return g;
  }

  /**
   * A surface that lights up at night (a window, a shop front, a lamp head); `strength` 0..1.
   * `curfew` 0..1 is the wakefulness below which it goes out again: 0 (default) burns all night, 1
   * goes out as soon as the evening turns; see `wakefulnessAt` for what the hours mean. `animated`
   * makes the shader move it: a cool light flickers like a television, a warm one blinks like an
   * aviation beacon.
   */
  lit(shape: Polygon, kind: LightKind, strength = 1, curfew = 0, animated = false): void {
    this.light.fillStyle = this.lightStyle(kind, strength);
    this.curfew.fillStyle = curfewStyle(curfew, animated);
    // Texel by texel, whole texels only, on both canvases at once: the light and its curfew must
    // cover exactly the same texels, and a canvas fill would anti-alias each edge differently.
    for (const [x, y, w] of texelRuns(shape.corners)) {
      this.light.fillRect(x, y, w, 1);
      this.curfew.fillRect(x, y, w, 1);
    }
  }

  /**
   * A fairy light (a bulb of a string of lights): lit at night in the colour painted under it (paint
   * the bulb first), twinkling on its own; `curfew` as for `lit()`.
   */
  fairy(shape: Polygon, strength = 1, curfew = 0): void {
    this.light.fillStyle = this.lightStyle('warm', strength);
    this.curfew.fillStyle = curfewStyle(curfew, 'fairy');
    for (const [x, y, w] of texelRuns(shape.corners)) {
      this.light.fillRect(x, y, w, 1);
      this.curfew.fillRect(x, y, w, 1);
    }
  }

  /** `lit()` for an axis-aligned rectangle (the thousands of tower windows). */
  litRect(x: number, y: number, w: number, h: number, kind: LightKind, strength = 1, curfew = 0, animated = false): void {
    this.lit(new Polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), kind, strength, curfew, animated);
  }

  /**
   * Dims the light already lit under `p` to `strength` of full, without touching its curfew: the
   * goods standing in a lit shop window, a figure against a lit room. Stay inside the lit shape.
   */
  dim(p: Path2D, kind: LightKind, strength: number): void {
    this.light.fillStyle = this.lightStyle(kind, strength);
    this.light.fill(p);
  }

  private lightStyle(kind: LightKind, strength: number): string {
    const v = byte(strength);
    if (kind === 'neutral') return `rgb(${Math.round(v * 0.7)},${Math.round(v * 0.55)},${this.glassByte})`;
    return kind === 'warm' ? `rgb(${v},0,${this.glassByte})` : `rgb(0,${v},${this.glassByte})`;
  }

  /**
   * A soft pool of warm light centred on (x, y), an ellipse of radii (rx, ry), added over whatever is
   * there. With a `curfew` (a shop's light spilling on the pavement) it goes out with that light; the
   * ellipse's rim carries no light, so its hard-edged curfew stamp never shows.
   */
  glow(x: number, y: number, rx: number, ry: number, strength: number, curfew?: number): void {
    if (curfew !== undefined) {
      const c = this.curfew;
      c.save();
      c.fillStyle = curfewStyle(curfew, false);
      c.beginPath();
      c.ellipse(x, y, rx, Math.max(ry, 0.5), 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    const ctx = this.light;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    ctx.scale(1, Math.max(ry / rx, 0.01));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(255,0,0,${strength})`);
    g.addColorStop(0.5, `rgba(255,0,0,${strength * 0.35})`);
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  /**
   * Neon or back-lit lettering centred on (x, y): `size` px tall, squeezed across by `squeeze` for a
   * facade seen at an angle (negative to mirror it: see the shop fascias). Anti-aliased, so it carries no curfew: a sign lit this way burns all night.
   */
  sign(text: string, x: number, y: number, size: number, squeeze: number, font: string, kind: 'warm' | 'cool', strength: number): void {
    const ctx = this.light;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    ctx.scale(squeeze, 1);
    ctx.font = `${Math.round(size * 10) / 10}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const v = Math.round(THREE.MathUtils.clamp(strength, 0, 1) * 255);
    ctx.fillStyle = kind === 'warm' ? `rgb(${v},0,0)` : `rgb(0,${v},0)`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /** Runs `draw`, again shifted by a full turn when the shape between texture x0 and x1 crosses the seam. */
  wrapped(x0: number, x1: number, draw: () => void): void {
    draw();
    const offsets: number[] = [];
    if (x0 < 0) offsets.push(SCENE_WIDTH);
    if (x1 > SCENE_WIDTH) offsets.push(-SCENE_WIDTH);
    for (const offset of offsets) {
      for (const ctx of this.all) {
        ctx.save();
        ctx.translate(offset, 0);
      }
      draw();
      for (const ctx of this.all) ctx.restore();
    }
  }

  /** Packs the canvases into the three scenery textures the pane shader samples. */
  finish(): { scene: THREE.CanvasTexture; lights: THREE.DataTexture; curfew: THREE.DataTexture; ground: THREE.CanvasTexture; fx: THREE.DataTexture } {
    // Day colours, premultiplied by coverage so that mip levels blend cleanly into the sky.
    const scene = new THREE.CanvasTexture(this.color.canvas);
    scene.colorSpace = THREE.SRGBColorSpace;
    scene.premultiplyAlpha = true;
    scene.anisotropy = 8;
    scene.wrapS = THREE.RepeatWrapping;
    scene.wrapT = THREE.ClampToEdgeWrapping;

    // Lights and glass in RGB, the depth in alpha: linear masks, not colours. Rows are flipped
    // here so the first row is the bottom one, as the canvas texture above has them (flipY).
    const light = this.light.getImageData(0, 0, SCENE_WIDTH, SCENE_HEIGHT).data;
    const haze = this.haze.getImageData(0, 0, SCENE_WIDTH, SCENE_HEIGHT).data;
    const packed = new Uint8Array(light.length);
    const rowBytes = SCENE_WIDTH * 4;
    for (let y = 0; y < SCENE_HEIGHT; y++) {
      const src = (SCENE_HEIGHT - 1 - y) * rowBytes;
      const dst = y * rowBytes;
      for (let i = 0; i < rowBytes; i += 4) {
        packed[dst + i] = light[src + i];
        packed[dst + i + 1] = light[src + i + 1];
        packed[dst + i + 2] = light[src + i + 2];
        packed[dst + i + 3] = haze[src + i];
      }
    }
    // Sampled nearest, like the curfew below: the shader filters the four texels around the eye
    // ray itself, after switching each one, so that no rim of a light survives its own curfew.
    const lights = new THREE.DataTexture(packed, SCENE_WIDTH, SCENE_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType);
    lights.colorSpace = THREE.NoColorSpace;
    lights.generateMipmaps = false;
    lights.minFilter = THREE.NearestFilter;
    lights.magFilter = THREE.NearestFilter;
    lights.wrapS = THREE.RepeatWrapping;
    lights.wrapT = THREE.ClampToEdgeWrapping;
    lights.needsUpdate = true;

    // Each light's curfew, one byte a texel, sampled nearest and without mip levels: a blend of two
    // windows' curfews would be a third window that exists nowhere.
    const curfewSrc = this.curfew.getImageData(0, 0, SCENE_WIDTH, SCENE_HEIGHT).data;
    const curfewBytes = new Uint8Array(SCENE_WIDTH * SCENE_HEIGHT);
    for (let y = 0; y < SCENE_HEIGHT; y++) {
      const src = (SCENE_HEIGHT - 1 - y) * rowBytes;
      const dst = y * SCENE_WIDTH;
      for (let x = 0; x < SCENE_WIDTH; x++) curfewBytes[dst + x] = curfewSrc[src + x * 4];
    }
    const curfew = new THREE.DataTexture(curfewBytes, SCENE_WIDTH, SCENE_HEIGHT, THREE.RedFormat, THREE.UnsignedByteType);
    curfew.colorSpace = THREE.NoColorSpace;
    curfew.generateMipmaps = false;
    curfew.minFilter = THREE.NearestFilter;
    curfew.magFilter = THREE.NearestFilter;
    curfew.wrapS = THREE.RepeatWrapping;
    curfew.wrapT = THREE.ClampToEdgeWrapping;
    curfew.needsUpdate = true;

    // Shadows and the weather masks: soft, filtered and mipmapped like the day colours.
    const ground = new THREE.CanvasTexture(this.ground.canvas);
    ground.colorSpace = THREE.NoColorSpace;
    ground.wrapS = THREE.RepeatWrapping;
    ground.wrapT = THREE.ClampToEdgeWrapping;

    // Sway and shutters, flipped like the lights; nearest: a blend of two trees' phases is neither.
    const fxSrc = this.fx.getImageData(0, 0, SCENE_WIDTH, SCENE_HEIGHT).data;
    const fxBytes = new Uint8Array(fxSrc.length);
    for (let y = 0; y < SCENE_HEIGHT; y++) fxBytes.set(fxSrc.subarray((SCENE_HEIGHT - 1 - y) * rowBytes, (SCENE_HEIGHT - y) * rowBytes), y * rowBytes);
    const fx = new THREE.DataTexture(fxBytes, SCENE_WIDTH, SCENE_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType);
    fx.colorSpace = THREE.NoColorSpace;
    fx.generateMipmaps = false;
    fx.minFilter = THREE.NearestFilter;
    fx.magFilter = THREE.NearestFilter;
    fx.wrapS = THREE.RepeatWrapping;
    fx.wrapT = THREE.ClampToEdgeWrapping;
    fx.needsUpdate = true;
    return { scene, lights, curfew, ground, fx };
  }
}

function byte(v: number): number {
  return Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
}

function shadowStyle(strength: number): string {
  return `rgb(${byte(strength)},0,0)`;
}

/**
 * The curfew byte of a light. Animated lights (televisions, beacons) are those whose byte is 7
 * mod 8, fairy lights 6 mod 8, so every other light steers clear of those residues.
 */
function curfewStyle(curfew: number, animated: boolean | 'fairy'): string {
  let v = byte(curfew);
  if (animated === 'fairy') v = Math.min(254, (v & ~7) | 6);
  else if (animated) v = Math.min(255, (v & ~7) | 7);
  else if (v % 8 >= 6) v -= (v % 8) - 5;
  return `rgb(${v},${v},${v})`;
}

/**
 * The texels whose centres a convex polygon covers, as runs `[x, y, width]` one per row. A shape
 * too thin to catch any centre still lights the one texel under its middle: a far tower window
 * must not vanish because it fell between two centres.
 */
function texelRuns(corners: readonly (readonly [number, number])[]): [number, number, number][] {
  const runs: [number, number, number][] = [];
  const ys = corners.map(([, y]) => y);
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));
  for (let row = top; row < bottom; row++) {
    const cy = row + 0.5;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < corners.length; i++) {
      const [x0, y0] = corners[i];
      const [x1, y1] = corners[(i + 1) % corners.length];
      if ((y0 - cy) * (y1 - cy) > 0) continue; // the edge does not cross this row's centre line
      const x = y0 === y1 ? x0 : x0 + ((cy - y0) * (x1 - x0)) / (y1 - y0);
      left = Math.min(left, x, y0 === y1 ? x1 : x);
      right = Math.max(right, x, y0 === y1 ? x1 : x);
    }
    const first = Math.ceil(left - 0.5);
    const last = Math.floor(right - 0.5);
    if (first <= last) runs.push([first, row, last - first + 1]);
  }
  if (runs.length === 0) {
    const xs = corners.map(([x]) => x);
    runs.push([Math.floor((Math.min(...xs) + Math.max(...xs)) / 2), Math.floor((Math.min(...ys) + Math.max(...ys)) / 2), 1]);
  }
  return runs;
}
