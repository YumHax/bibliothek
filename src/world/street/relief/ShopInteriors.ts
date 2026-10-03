import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { SHOPS } from '../facadePainter';
import { isShopOpen } from '../shops/shopHours';
import type { ShopKind } from '../streetPlan';
import { FacadeFrame } from './facadeFrame';
import { WALK_IN_ROOM_WALLS, WALK_IN_WALLS } from './walkInInteriors';
import { FACADE, onSurface } from '../../surface/layers';

/** How deep the rooms behind the windows are, how high their ceilings, and the metres of back wall one art tile covers. */
const ROOM = { depth: 2.6, ceiling: 3.3, tile: 2.4, display: 0.5 };
/** Seconds between two looks at the clock (shops opening and shutting). */
const CHECK_EVERY = 1;
const TILE_PX = 256;
type Kind = Exclude<ShopKind, 'shut'>;
const KINDS: readonly Kind[] = ['cafe', 'bakery', 'pharmacy', 'books', 'grocer', 'florist', 'tabac', 'bar', 'butcher', 'laundry', 'retro', 'arcade', 'furniture', 'electronics', 'pets'];
/** Two looks of each kind's room (a shop picks one from its facade), two tiles each, two looks to a row of the atlas. */
const VARIANTS = 2;
const COLUMNS = 2;
const ROWS = Math.ceil((KINDS.length * VARIANTS) / COLUMNS);
/** Someone in the shop: how often a window shows them, how far behind the glass they stand, how far they wander along. */
const PEOPLE = { share: 0.55, depth: [1.0, 1.9] as const, wander: 0.35 };
const CLOTHES = [0x3a4a6a, 0x6a3a3a, 0x2f2f33, 0xd8d0c0, 0x4a6a4a, 0x8a6a4a, 0x2a4a5a, 0xa04a5a];
const SKINS = [0xe0b8a0, 0xc8946e, 0x8a5a3e, 0xf0d0b8, 0x5a3a2a];

const VERTEX = /* glsl */ `
attribute vec2 aLocal;
attribute vec4 aRoom;
attribute vec3 aTangent;
attribute vec2 aTile;
attribute vec3 aLight;
attribute vec3 aWall;
attribute float aOpen;
attribute vec4 aPerson;
attribute vec3 aCloth;
attribute vec3 aSkin;
varying vec4 vPerson;
varying vec3 vCloth;
varying vec3 vSkin;
varying vec2 vLocal;
varying vec4 vRoom;
varying vec3 vDir;
varying vec2 vTile;
varying vec3 vLight;
varying vec3 vWall;
varying float vOpen;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 t = normalize(mat3(modelMatrix) * aTangent);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 view = world.xyz - cameraPosition;
  vDir = vec3(dot(view, t), view.y, dot(view, n));
  vLocal = aLocal;
  vRoom = aRoom;
  vTile = aTile;
  vLight = aLight;
  vWall = aWall;
  vOpen = aOpen;
  vPerson = aPerson;
  vCloth = aCloth;
  vSkin = aSkin;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// No backtick in here (the string is a template literal).
const FRAGMENT = /* glsl */ `
uniform sampler2D atlas;
uniform vec2 tileSize;
uniform float daylight;
uniform vec3 sky;
uniform float depth;
uniform float tileMetres;
uniform float displayDepth;
uniform float time;
varying vec4 vPerson;
varying vec3 vCloth;
varying vec3 vSkin;
varying vec2 vLocal;
varying vec4 vRoom;
varying vec3 vDir;
varying vec2 vTile;
varying vec3 vLight;
varying vec3 vWall;
varying float vOpen;
#include <fog_pars_fragment>

vec4 art(float side, vec2 uv) {
  vec2 st = vec2(fract(uv.x), clamp(uv.y, 0.002, 0.998));
  return texture2D(atlas, vTile + vec2((side + st.x) * 0.5, st.y) * tileSize);
}

void main() {
  vec3 d = normalize(vDir);
  d.z = min(d.z, -0.02);
  vec3 o = vec3(vLocal, 0.0);
  // The room: x across the window (a little wider), y from the shop's floor to its ceiling, z into it.
  vec3 lo = vec3(-0.4, vRoom.z, -depth);
  vec3 hi = vec3(vRoom.x + 0.4, vRoom.w, 0.0);
  vec3 exitPlane = mix(lo, hi, step(0.0, d));
  vec3 tt = (exitPlane - o) / d;
  float tHit = min(min(tt.x, tt.y), tt.z);
  vec3 h = o + d * tHit;
  float wallH = vRoom.w - vRoom.z;
  vec3 col;
  if (tHit == tt.z) {
    col = art(0.0, vec2((h.x + vRoom.y) / tileMetres, (h.y - vRoom.z) / wallH)).rgb;
  } else if (tHit == tt.x) {
    col = vWall * (0.75 + 0.25 * (h.y - vRoom.z) / wallH);
  } else if (d.y < 0.0) {
    vec2 f = floor(vec2(h.x, h.z) / 0.4);
    col = vWall * (0.42 + 0.06 * mod(f.x + f.y, 2.0));
  } else {
    float lamp = exp(-dot(vec2(h.x - vRoom.x * 0.5, h.z + depth * 0.5), vec2(h.x - vRoom.x * 0.5, h.z + depth * 0.5)) * 0.8);
    col = vWall * (0.85 + 0.9 * lamp * vOpen);
  }
  #ifndef CHEAP
  // Someone in the shop while it is open (aPerson: where along the window, how deep, a phase, 1 if anyone):
  // a flat figure facing the street, drifting along the counter now and then.
  if (vPerson.w > 0.5 && vOpen > 0.5) {
    float tP = (-vPerson.y - o.z) / d.z;
    if (tP > 0.0 && tP < tHit) {
      vec3 q = o + d * tP;
      float px = vPerson.x + ${PEOPLE.wander.toFixed(2)} * sin(time * 0.11 + vPerson.z * 6.28);
      float hy = q.y - vRoom.z;
      float dx = abs(q.x - px);
      float body = step(0.0, hy) * step(hy, 1.45) * step(dx, mix(0.16, 0.22, smoothstep(0.85, 1.3, hy)) * (1.0 - 0.35 * smoothstep(1.32, 1.45, hy)));
      float head = step(length(vec2(dx * 1.1, hy - 1.6)), 0.11);
      if (head > 0.5) { col = vSkin; tHit = tP; }
      else if (body > 0.5) { col = vCloth * (0.85 + 0.15 * smoothstep(0.9, 1.4, hy)); tHit = tP; }
    }
  }
  // The display in front: things on a table or in a case, just behind the glass.
  float tFront = (-displayDepth - o.z) / d.z;
  if (tFront < tHit) {
    vec3 p = o + d * tFront;
    vec4 shown = art(1.0, vec2((p.x + vRoom.y) / tileMetres, (p.y - vRoom.z) / wallH));
    if (shown.a > 0.5) col = shown.rgb;
  }
  #endif
  // Lit by the shop's lamps while open, and by what daylight comes through the glass; deeper is darker.
  float fall = 1.0 - 0.3 * clamp(-h.z / depth, 0.0, 1.0);
  vec3 lit = col * (vLight * (0.04 + 1.15 * vOpen) + vec3(0.3 * daylight)) * fall;
  // The glass: a little of the sky, much more at a grazing angle.
  float fresnel = 0.05 + 0.55 * pow(1.0 - abs(d.z), 4.0);
  gl_FragColor = vec4(mix(lit * 0.9, sky, fresnel * (0.35 + 0.65 * daylight)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

interface Pane {
  kind: Kind;
  /** First vertex in the geometry (four per pane). */
  first: number;
  open: boolean;
}

/**
 * The shops seen through their windows: a pane of glass just in front of every painted display
 * window and shop door, whose shader traces the view ray into a room behind it (interior mapping)
 * instead of showing a flat picture: the back wall painted per kind of shop on a canvas atlas
 * (the baker's loaves, the bookseller's spines, the bar's bottles, RETRO GAMES' game boxes in
 * today's stock colours, the arcade's cabinets), the display just behind the glass, side walls, a
 * tiled floor and a lit ceiling, all moving with parallax as the player walks by. Lit by the shop's
 * own light while it is open (`isShopOpen`), by daylight through the glass otherwise, and
 * reflecting the sky, far more at a grazing angle. Each kind's room comes in two looks (a shop picks
 * one from its facade), and while it is open someone is often in it, behind the counter or browsing,
 * drifting along now and then. One draw call; `cheap` (low quality) keeps the room and drops the
 * display and the people.
 */
export class ShopInteriors extends THREE.Mesh implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly panes: Pane[];
  private readonly openAttribute: THREE.BufferAttribute;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private clock = CHECK_EVERY;

  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight, shopGoods: readonly string[] | null, options: { cheap?: boolean } = {}) {
    const atlas = paintAtlas(shopGoods);
    const uniforms: Record<string, THREE.IUniform> = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      atlas: { value: atlas },
      tileSize: { value: new THREE.Vector2(1 / COLUMNS, 1 / ROWS) },
      daylight: { value: 1 },
      sky: { value: new THREE.Color(0.6, 0.7, 0.8) },
      depth: { value: ROOM.depth },
      tileMetres: { value: ROOM.tile },
      displayDepth: { value: ROOM.display },
      time: { value: 0 },
    };
    // The glass stands `FACADE.shopInterior` in front of the painted wall.
    const material = onSurface(new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: true, defines: options.cheap ? { CHEAP: '' } : {} }), FACADE.shopInterior);
    const { geometry, panes } = paneGeometry(fronts);
    super(geometry, material);
    this.name = 'ShopInteriors';
    this.uniforms = uniforms;
    this.panes = panes;
    this.openAttribute = geometry.getAttribute('aOpen') as THREE.BufferAttribute;
    this.castShadow = false;
    this.receiveShadow = false;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The retro games shop's shelves in `goods` (today's stock colours): the atlas painted afresh. */
  repaintGoods(goods: readonly string[]): void {
    const old = this.uniforms.atlas!.value as THREE.Texture;
    this.uniforms.atlas!.value = paintAtlas(goods);
    old.dispose();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    this.uniforms.daylight!.value = s.daylight;
    this.uniforms.time!.value = ((this.uniforms.time!.value as number) + dt) % 3600;
    (this.uniforms.sky!.value as THREE.Color).copy(s.horizon).lerp(s.zenith, 0.35).multiplyScalar(0.25 + 0.75 * s.daylight);
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    let changed = false;
    for (const pane of this.panes) {
      const open = isShopOpen(pane.kind, s.hours);
      if (open === pane.open) continue;
      pane.open = open;
      for (let i = 0; i < 4; i++) this.openAttribute.setX(pane.first + i, open ? 1 : 0);
      changed = true;
    }
    if (changed) this.openAttribute.needsUpdate = true;
  }
}

/** Four corners per pane with what its shader needs: the window's own metres, the room's size, the facade's direction, the art tile, the light, the walls' colour. */
function paneGeometry(fronts: readonly PaintedFront[]): { geometry: THREE.BufferGeometry; panes: Pane[] } {
  const position: number[] = [];
  const normal: number[] = [];
  const local: number[] = [];
  const room: number[] = [];
  const tangent: number[] = [];
  const tile: number[] = [];
  const person: number[] = [];
  const cloth: number[] = [];
  const skin: number[] = [];
  const light: number[] = [];
  const wall: number[] = [];
  const open: number[] = [];
  const index: number[] = [];
  const panes: Pane[] = [];
  const p = new THREE.Vector3();
  const lightColor = new THREE.Color();
  const wallColor = new THREE.Color();
  const clothColor = new THREE.Color();
  const skinColor = new THREE.Color();
  for (const front of fronts) {
    const frame = new FacadeFrame(front.spec);
    const random = seededRandom(front.spec.seed * 977 + 3);
    for (const w of front.features.windows) {
      if (w.kind === 'shut') continue;
      const kind = w.kind;
      const first = position.length / 3;
      const width = w.s1 - w.s0;
      const height = w.y1 - w.y0;
      // Each shop's look of its kind's room: the same for all its windows (drawn from where the shop starts).
      const variant = Math.floor(Math.abs(Math.sin(front.spec.seed * 12.9898 + Math.round(w.s0 / 6) * 78.233)) * 43758.5453) % VARIANTS;
      const t = KINDS.indexOf(kind) * VARIANTS + variant;
      const origin = [(t % COLUMNS) / COLUMNS, 1 - (Math.floor(t / COLUMNS) + 1) / ROWS];
      // Someone inside, now and then (not in a door's narrow pane, nor the walk-in shops: theirs are their own rooms).
      const anyone = width > 1.2 && !(kind in WALK_IN_WALLS) && random() < PEOPLE.share;
      const personAt = [0.35 + random() * Math.max(0, width - 0.7), PEOPLE.depth[0] + random() * (PEOPLE.depth[1] - PEOPLE.depth[0]), random(), anyone ? 1 : 0];
      clothColor.setHex(CLOTHES[Math.floor(random() * CLOTHES.length)]!);
      skinColor.setHex(SKINS[Math.floor(random() * SKINS.length)]!);
      lightColor.set(w.light);
      const own = WALK_IN_ROOM_WALLS[kind as keyof typeof WALK_IN_ROOM_WALLS];
      if (own) wallColor.set(own).multiplyScalar(0.9);
      else wallColor.set(SHOPS[kind].front).lerp(new THREE.Color(0xe8dcc8), 0.45);
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
        frame.point(w.s0 + a * width, w.y0 + b * height, FACADE.shopInterior.lift, p);
        position.push(p.x, p.y, p.z);
        normal.push(frame.n.x, 0, frame.n.y);
        tangent.push(frame.u.x, 0, frame.u.y);
        local.push(a * width, b * height);
        // Width, where the window starts along the facade (the art runs on across windows), floor and ceiling in window metres.
        room.push(width, w.s0, -w.y0, ROOM.ceiling - w.y0);
        tile.push(origin[0]!, origin[1]!);
        person.push(personAt[0]!, personAt[1]!, personAt[2]!, personAt[3]!);
        cloth.push(clothColor.r, clothColor.g, clothColor.b);
        skin.push(skinColor.r, skinColor.g, skinColor.b);
        light.push(lightColor.r, lightColor.g, lightColor.b);
        wall.push(wallColor.r, wallColor.g, wallColor.b);
        open.push(0);
      }
      index.push(first, first + 1, first + 2, first, first + 2, first + 3);
      panes.push({ kind, first, open: false });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangent, 3));
  g.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
  g.setAttribute('aRoom', new THREE.Float32BufferAttribute(room, 4));
  g.setAttribute('aTile', new THREE.Float32BufferAttribute(tile, 2));
  g.setAttribute('aPerson', new THREE.Float32BufferAttribute(person, 4));
  g.setAttribute('aCloth', new THREE.Float32BufferAttribute(cloth, 3));
  g.setAttribute('aSkin', new THREE.Float32BufferAttribute(skin, 3));
  g.setAttribute('aLight', new THREE.Float32BufferAttribute(light, 3));
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(wall, 3));
  const openAttribute = new THREE.Float32BufferAttribute(open, 1);
  openAttribute.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aOpen', openAttribute);
  g.setIndex(index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return { geometry: g, panes };
}

/**
 * The art behind the glass, one row of two tiles per kind of shop: its back wall (left, opaque, the
 * wall one art tile of `ROOM.tile` metres wide and floor to ceiling tall) and its display just
 * behind the glass (right, transparent where there is nothing).
 */
function paintAtlas(shopGoods: readonly string[] | null): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(TILE_PX * 2 * COLUMNS, TILE_PX * ROWS);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  KINDS.forEach((kind, k) => {
    for (let variant = 0; variant < VARIANTS; variant++) {
      const t = k * VARIANTS + variant;
      const x = (t % COLUMNS) * TILE_PX * 2;
      const y = Math.floor(t / COLUMNS) * TILE_PX;
      const look = SHOPS[kind];
      const palette = kind === 'retro' && shopGoods?.length ? shopGoods : look.goods;
      const random = seededRandom(1000 + k * 37 + variant * 7919);
      ctx.save();
      ctx.translate(x, y);
      paintBackWall(ctx, kind, palette, random, variant);
      ctx.translate(TILE_PX, 0);
      paintDisplay(ctx, kind, look.front, palette, random);
      ctx.restore();
    }
  });
  const texture = toTexture(canvas, 4);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

const S = TILE_PX;
/** Canvas y of a height (metres) over the shop floor: the tile is floor (bottom) to ceiling (top). */
const Y = (m: number): number => S - (m / ROOM.ceiling) * S;
/** Canvas x of a distance (metres) along the tile's width. */
const X = (m: number): number => (m / ROOM.tile) * S;

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function paintBackWall(ctx: CanvasRenderingContext2D, kind: Kind, palette: readonly string[], random: () => number, variant: number): void {
  // The second look of a room is painted another colour (a dark green, a pale blue...), and hangs a picture or a poster.
  const walls = kind === 'butcher' || kind === 'pharmacy' || kind === 'laundry' ? ['#e8ebe8', '#dce8ec'] : kind === 'bar' || kind === 'arcade' || kind === 'retro' ? ['#2a2230', '#1e2a2c'] : ['#d8c8ac', '#b8c4b0'];
  const wall = walls[variant % walls.length]!;
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, S, S);
  const shelf = (h: number): void => {
    ctx.fillStyle = kind === 'pharmacy' ? '#f4f4f0' : '#6a4a30';
    ctx.fillRect(0, Y(h), S, 4);
  };
  const shelves = (heights: number[], item: (x: number, base: number) => number): void => {
    for (const h of heights) {
      shelf(h);
      for (let px = 4; px < S - 6; ) px += item(px, Y(h));
    }
  };
  switch (kind) {
    case 'bakery':
      shelves([1.0, 1.5, 2.0], (px, base) => {
        ctx.fillStyle = pick(random, palette);
        ctx.beginPath();
        ctx.ellipse(px + 10, base - 7, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        return 22 + random() * 6;
      });
      break;
    case 'books':
    case 'tabac':
      shelves([0.3, 0.75, 1.2, 1.65, 2.1, 2.55], (px, base) => {
        const w = kind === 'books' ? 3 + random() * 4 : 9 + random() * 6;
        const h = kind === 'books' ? 18 + random() * 8 : 20 + random() * 6;
        ctx.fillStyle = pick(random, palette);
        ctx.fillRect(px, base - h, w, h);
        return w + 1;
      });
      break;
    case 'retro':
      shelves([0.4, 0.9, 1.4, 1.9, 2.4], (px, base) => {
        ctx.fillStyle = pick(random, palette);
        ctx.fillRect(px, base - 26, 10, 26);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px + 1, base - 24, 8, 5);
        return 12;
      });
      break;
    case 'pharmacy':
      shelves([0.5, 1.0, 1.5, 2.0, 2.5], (px, base) => {
        ctx.fillStyle = pick(random, palette);
        const w = 8 + random() * 8;
        ctx.fillRect(px, base - 12, w, 12);
        return w + 2;
      });
      ctx.fillStyle = '#2fbf5a';
      ctx.fillRect(X(1.1), Y(3.0), X(0.25), Y(2.4) - Y(3.0));
      ctx.fillRect(X(0.93), Y(2.83), X(0.6), Y(2.57) - Y(2.83));
      break;
    case 'grocer':
      for (const h of [0.5, 1.1, 1.7]) {
        for (let px = 4; px < S - 30; px += 34) {
          ctx.fillStyle = kind === 'grocer' ? '#8a6a44' : '#5a6a72';
          ctx.fillRect(px, Y(h) - 16, 30, 16);
          for (let i = 0; i < 7; i++) {
            ctx.fillStyle = pick(random, palette);
            ctx.beginPath();
            ctx.arc(px + 4 + random() * 22, Y(h) - 16 - random() * 5, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      break;
    case 'bar':
    case 'cafe':
      // A mirror behind a counter, bottles or cups on shelves, a chalk menu.
      ctx.fillStyle = kind === 'bar' ? '#3a3440' : '#5a4636';
      ctx.fillRect(0, Y(2.6), S, Y(1.3) - Y(2.6));
      shelves([1.55, 2.05], (px, base) => {
        ctx.fillStyle = pick(random, palette);
        const w = kind === 'bar' ? 5 : 8;
        const h = kind === 'bar' ? 16 + random() * 8 : 7;
        ctx.fillRect(px, base - h, w, h);
        return w + 4 + random() * 4;
      });
      ctx.fillStyle = kind === 'bar' ? '#4a2e22' : '#6a4a30';
      ctx.fillRect(0, Y(1.05), S, Y(0) - Y(1.05));
      ctx.fillStyle = '#1e2a24';
      ctx.fillRect(X(1.5), Y(3.0), X(0.7), Y(2.65) - Y(3.0));
      ctx.fillStyle = 'rgba(240,240,230,0.7)';
      for (let l = 0; l < 3; l++) ctx.fillRect(X(1.56), Y(2.95 - l * 0.1), X(0.4 + random() * 0.2), 2);
      if (kind === 'cafe') {
        ctx.fillStyle = '#b8bcc0';
        ctx.fillRect(X(0.5), Y(1.45), X(0.5), Y(1.05) - Y(1.45));
      }
      break;
    case 'butcher':
      // White tiles, hams hanging from a rail, the counter.
      ctx.strokeStyle = 'rgba(120,130,130,0.35)';
      for (let px = 0; px < S; px += 12) ctx.strokeRect(px, 0, 12, S);
      ctx.fillStyle = '#9aa0a4';
      ctx.fillRect(0, Y(2.5), S, 3);
      for (let px = 12; px < S; px += 30) {
        ctx.fillStyle = pick(random, palette);
        ctx.beginPath();
        ctx.ellipse(px, Y(2.2), 8, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e0e4e4';
      ctx.fillRect(0, Y(1.0), S, Y(0) - Y(1.0));
      break;
    case 'laundry':
      for (const row of [0, 1]) {
        for (let px = 6; px < S - 40; px += 44) {
          const top = Y(0.95 + row * 0.9);
          ctx.fillStyle = '#f4f4f4';
          ctx.fillRect(px, top, 40, 40);
          ctx.fillStyle = '#3a4650';
          ctx.beginPath();
          ctx.arc(px + 20, top + 22, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = pick(random, ['#6fa0c8', '#c8d4dc', '#e0a0a8']);
          ctx.beginPath();
          ctx.arc(px + 20, top + 24, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'furniture':
    case 'electronics':
    case 'pets':
    case 'florist':
      // The walk-in shops: their back wall as their room has it (`world/shop/shopPlan`).
      WALK_IN_WALLS[kind](ctx, { S, X, Y }, palette, random);
      break;
    case 'arcade':
      for (let px = 8; px < S - 30; px += 42) {
        ctx.fillStyle = '#141018';
        ctx.fillRect(px, Y(1.85), 34, Y(0) - Y(1.85));
        ctx.fillStyle = pick(random, palette);
        ctx.fillRect(px + 5, Y(1.65), 24, Y(1.2) - Y(1.65));
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px + 5, Y(1.82), 24, 5);
      }
      break;
  }
  if (variant > 0 && kind !== 'arcade' && !(kind in WALK_IN_WALLS)) {
    // A framed picture or a poster high on the wall, a clock beside it.
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(X(0.25), Y(3.1), X(0.55), Y(2.65) - Y(3.1));
    ctx.fillStyle = pick(random, ['#6a8aa8', '#c8a060', '#8a5a6a', '#5a7a5a']);
    ctx.fillRect(X(0.29), Y(3.06), X(0.47), Y(2.69) - Y(3.06));
    ctx.fillStyle = '#f0ece0';
    ctx.beginPath();
    ctx.arc(X(1.9), Y(2.9), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(X(1.9) - 0.5, Y(2.9) - 5, 1, 5);
  }
  // A little shade near the floor and the ceiling.
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(0,0,0,0.2)');
  g.addColorStop(0.15, 'rgba(0,0,0,0)');
  g.addColorStop(0.9, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/** What stands just behind the glass: a table, a case, a rack; transparent above it. */
function paintDisplay(ctx: CanvasRenderingContext2D, kind: Kind, front: string, palette: readonly string[], random: () => number): void {
  ctx.clearRect(0, 0, S, S);
  // The walk-in shops' displays stand in 3D in front of the pane (`shopfronts/`).
  if (kind in WALK_IN_WALLS) return;
  const top = kind === 'arcade' ? 0 : kind === 'bar' || kind === 'cafe' ? 0.75 : 0.8;
  if (kind === 'arcade') return;
  // The table or case itself.
  ctx.fillStyle = kind === 'butcher' || kind === 'bakery' ? 'rgba(210,225,230,1)' : front;
  if (kind === 'bar' || kind === 'cafe') {
    // Stools or little tables, with gaps.
    for (let px = 20; px < S; px += 70) {
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(px, Y(top), 30, 5);
      ctx.fillRect(px + 13, Y(top), 4, Y(0) - Y(top));
    }
    return;
  }
  ctx.fillRect(0, Y(top), S, Y(0) - Y(top));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, Y(top) + 4, S, 3);
  // Goods on it.
  for (let px = 4; px < S - 10; px += 12 + random() * 10) {
    ctx.fillStyle = pick(random, palette);
    const h = kind === 'retro' || kind === 'books' ? 14 + random() * 10 : 6 + random() * 8;
    const w = kind === 'florist' ? 8 : 9 + random() * 5;
    if (kind === 'florist' || kind === 'grocer' || kind === 'bakery') {
      ctx.beginPath();
      ctx.ellipse(px + w / 2, Y(top) - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(px, Y(top) - h, w, h);
    }
  }
}
