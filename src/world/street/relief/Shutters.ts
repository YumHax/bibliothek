import * as THREE from 'three';
import { bareMetal } from '../metals';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { isShopOpen } from '../shops/shopHours';
import type { ShopKind, Vec2 } from '../streetPlan';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from './facadeFrame';
import { INSET } from '../../props/joinery';
import { frontVariant, hasShopfront, pilasterWidth } from '../shopfronts/shopfrontPlan';
import { LETTERING, letteringFont } from '../../city/shopLooks';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { paintPoster } from './posterArt';
import { lcg } from '@/random';

/** The shutter's box under the fascia (bottom, top, depth out of the wall), the curtain's plane, its foot. */
const BOX = { bottom: 2.8, top: 2.93, depth: 0.1 };
const CURTAIN = { out: 0.09, foot: 0.04 };
/** Metres of curtain one texture repeat covers (height), seconds to roll all the way. */
const SLATS_PER_REPEAT = 1.2;
const ROLL_SECONDS = 4;
const CHECK_EVERY = 1;

interface Shutter {
  kind: ShopKind;
  /** First of its four curtain vertices. */
  first: number;
  frame: FacadeFrame;
  s0: number;
  s1: number;
  /** 0 rolled up .. 1 down, and where it is going. */
  down: number;
  target: number;
  /** What was sprayed or pasted on it, if anything: its cell in the tags' atlas, where on the curtain (metres from its left end and its foot), how big. */
  tag: { cell: number; s: number; y: number; w: number; h: number } | null;
}

/** The tags' atlas: cells across, their size in metres on a curtain. */
const TAG_CELLS = 4;
const TAG_SIZE = { w: 2.2, h: 1.1 };

/**
 * The shops' roller shutters: a steel box under each shopfront's fascia and the slatted curtain
 * that rolls down out of it when the shop shuts (`SHOP_HOURS`, via `isShopOpen`) and back up
 * when it opens, over a few seconds, the slats keeping their size as it unrolls, each slat's curve in the bump. Some
 * carry a tag or a few posters of their own (`tagTexture`), placed once along them, riding down and up with the slats. Shops that have shut for good are painted shut already; the arcade never shuts, and the walk-in shops
 * keep none (their windows stand out of the wall, lit after closing: `shopfronts/`). All
 * curtains are one mesh whose four corners per shop move (only while one is rolling); the boxes
 * are another. Snow settles on the boxes. Back from dormancy (the street built ahead, or kept while the player was
 * home) each curtain takes the clock's state at once: hours may have passed, and every shop that opened or shut
 * meanwhile rolling and rattling in the same frame was a wall of noise on arrival.
 */
export class Shutters extends THREE.Group implements Furniture, Updatable, ActivityAware {
  readonly contactShadow = false;
  private readonly shutters: Shutter[] = [];
  private readonly positions: THREE.BufferAttribute;
  private readonly uvs: THREE.BufferAttribute;
  /** Each curtain corner's place on its tag (u, v and the tag's cell; cell -1: none). */
  private readonly tagUvs: THREE.BufferAttribute;
  /** The tags' atlas lives only in the patched shader's uniforms (`dispose` frees it). */
  private readonly tagTexture: THREE.Texture;
  private readonly curtain: THREE.Mesh;
  private clock = CHECK_EVERY;
  private rolling = true;
  /** Just (re)activated: the first update snaps to the clock, silently. */
  private fresh = true;
  private readonly frameMatrix = new THREE.Matrix4();

  /** `onRoll`: a shutter starts rolling (up or down) at `at` (zone-local, on the pavement before it), for its rattle. */
  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight, private readonly onRoll?: (at: Vec2) => void) {
    super();
    this.name = 'Shutters';
    const random = lcg(4141);
    const boxes: THREE.BufferGeometry[] = [];
    const position: number[] = [];
    const normal: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const tagUv: number[] = [];
    const box = new THREE.Matrix4();
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      for (const shop of front.features.shopfronts) {
        // The arcade never shuts; the walk-in shops' windows stay lit behind their glass (`shopfronts/`).
        if (shop.kind === 'arcade' || hasShopfront(shop.kind)) continue;
        // A front built in 3D: the shutter runs between its pilasters.
        const inset = pilasterWidth(frontVariant(front.spec.detail, shop.kind));
        const s0 = shop.s0 + inset;
        const s1 = shop.s1 - inset;
        const first = position.length / 3;
        for (let i = 0; i < 4; i++) {
          position.push(0, 0, 0);
          normal.push(frame.n.x, 0, frame.n.y);
          uv.push(0, 0);
          tagUv.push(0, 0, -1);
        }
        index.push(first, first + 1, first + 2, first, first + 2, first + 3);
        // A tag or a few posters on some, each its own, placed once: somewhere along it, a little over its foot.
        const width = s1 - s0;
        const w = Math.min(TAG_SIZE.w, width - 0.3);
        const tag = random() < 0.45 && w > 0.8 ? { cell: Math.floor(random() * TAG_CELLS), s: 0.15 + random() * (width - 0.3 - w), y: 0.25 + random() * 0.5, w, h: TAG_SIZE.h * (w / TAG_SIZE.w) } : null;
        this.shutters.push({ kind: shop.kind, first, frame, s0, s1, down: 0, target: 0, tag });
        // The box's ends buried an `INSET` in the pilasters (ending on their faces, they would lie in the joinery's planes).
        const g = new THREE.BoxGeometry(s1 - s0 + (inset > 0 ? 2 * INSET : 0), BOX.top - BOX.bottom, BOX.depth);
        g.applyMatrix4(frame.matrix((s0 + s1) / 2, (BOX.top + BOX.bottom) / 2, BOX.depth / 2, box));
        boxes.push(g.toNonIndexed());
        g.dispose();
      }
    }
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.Float32BufferAttribute(position, 3);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.uvs = new THREE.Float32BufferAttribute(uv, 2);
    this.uvs.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', this.uvs);
    this.tagUvs = new THREE.Float32BufferAttribute(tagUv, 3);
    this.tagUvs.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('tagUv', this.tagUvs);
    geometry.setIndex(index);
    const [texture, bump] = shutterTextures();
    texture.wrapT = THREE.RepeatWrapping; // convention-ok: wraps one way only
    bump.wrapT = THREE.RepeatWrapping; // convention-ok: wraps one way only
    const material = new THREE.MeshStandardMaterial({ map: texture, bumpMap: bump, bumpScale: 1.2, roughness: 0.5, side: THREE.DoubleSide });
    // Each curtain's tag or posters, from their own atlas, where `tagUv` puts them (riding with the slats).
    const tags = tagTexture();
    patchShader(material, 'shutterTags', (shader) => {
      shader.uniforms.shutterTags = { value: tags };
      shader.vertexShader = 'attribute vec3 tagUv;\nvarying vec3 vTagUv;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vTagUv = tagUv;');
      shader.fragmentShader =
        `uniform sampler2D shutterTags;\nvarying vec3 vTagUv;\n` +
        afterChunk(
          shader.fragmentShader,
          'map_fragment',
          `if (vTagUv.z >= 0.0 && vTagUv.x > 0.0 && vTagUv.x < 1.0 && vTagUv.y > 0.0 && vTagUv.y < 1.0) {
  vec4 tag = texture2D(shutterTags, vec2((vTagUv.z + vTagUv.x) / ${TAG_CELLS.toFixed(1)}, vTagUv.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, tag.rgb, tag.a);
}`,
        );
    });
    this.tagTexture = tags;
    this.curtain = new THREE.Mesh(geometry, material);
    this.curtain.castShadow = false;
    this.curtain.receiveShadow = true;
    // The corners move: bounds computed now would cull it wrongly.
    this.curtain.frustumCulled = false;
    this.add(this.curtain);
    if (boxes.length) {
      const merged = new THREE.Mesh(mergeAll(boxes), snowCovered(bareMetal({ color: 0xa4a8ac, roughness: 0.5 })));
      merged.castShadow = true;
      merged.receiveShadow = true;
      this.add(merged);
    }
    // Start where the clock says, no rolling on arrival.
    this.snapToClock();
  }

  /** Every curtain where the clock says it is, without a roll or a rattle. */
  private snapToClock(): void {
    const hours = this.dayNight.state.hours;
    for (const s of this.shutters) s.down = s.target = isShopOpen(s.kind, hours) ? 0 : 1;
    this.clock = 0;
    this.rolling = false;
    this.layout();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    this.tagTexture.dispose();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  update(dt: number): void {
    if (this.fresh) {
      this.fresh = false;
      this.snapToClock();
      return;
    }
    this.clock += dt;
    if (this.clock >= CHECK_EVERY) {
      this.clock = 0;
      const hours = this.dayNight.state.hours;
      for (const s of this.shutters) {
        const target = isShopOpen(s.kind, hours) ? 0 : 1;
        if (target !== s.target) {
          s.target = target;
          this.rolling = true;
          if (this.onRoll) {
            const at = new THREE.Vector3().setFromMatrixPosition(s.frame.matrix((s.s0 + s.s1) / 2, 1.5, 0.3, this.frameMatrix));
            this.onRoll([at.x, at.z]);
          }
        }
      }
    }
    if (!this.rolling) return;
    let moving = false;
    const step = dt / ROLL_SECONDS;
    for (const s of this.shutters) {
      if (s.down === s.target) continue;
      s.down = s.target > s.down ? Math.min(s.target, s.down + step) : Math.max(s.target, s.down - step);
      moving = true;
    }
    this.layout();
    this.rolling = moving;
  }

  /** Puts every curtain's corners where its roll says: from the box down to its bottom, uvs in metres so the slats keep their size. */
  private layout(): void {
    const p = new THREE.Vector3();
    const height = BOX.bottom - CURTAIN.foot;
    for (const s of this.shutters) {
      const bottom = BOX.bottom - height * s.down;
      const repeat = (BOX.bottom - bottom) / SLATS_PER_REPEAT;
      const corners: [number, number, number, number][] = [
        [s.s0, bottom, 0, 0],
        [s.s1, bottom, 1, 0],
        [s.s1, BOX.bottom, 1, repeat],
        [s.s0, BOX.bottom, 0, repeat],
      ];
      corners.forEach(([along, y, u, v], i) => {
        s.frame.point(along, y, CURTAIN.out, p);
        this.positions.setXYZ(s.first + i, p.x, p.y, p.z);
        // v counts up from the foot: the slats (and the tag) ride down and up with it.
        this.uvs.setXY(s.first + i, u, v);
        const tag = s.tag;
        if (tag) this.tagUvs.setXYZ(s.first + i, (along - s.s0 - tag.s) / tag.w, (y - bottom - tag.y) / tag.h, tag.cell);
      });
    }
    this.positions.needsUpdate = true;
    this.uvs.needsUpdate = true;
    this.tagUvs.needsUpdate = true;
  }
}

function mergeAll(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const count = geometries.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  let offset = 0;
  for (const g of geometries) {
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    offset += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.computeBoundingSphere();
  return out;
}

/** Galvanised slats, and their height for the bump (each slat's curve, the grooves between): one repeat is `SLATS_PER_REPEAT` metres. */
function shutterTextures(): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const w = 256;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  const [bumpCanvas, bump] = createCanvas(16, h);
  const random = lcg(515);
  ctx.fillStyle = '#9a9ea2';
  ctx.fillRect(0, 0, w, h);
  const slat = h / 16;
  for (let y = 0; y < h; y += slat) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, y + 3, w, 2);
    // The slat's curve: low at its grooves, high across its middle.
    for (let i = 0; i < slat; i++) {
      const g = Math.round(70 + 150 * Math.sin((Math.PI * (i + 0.5)) / slat));
      bump.fillStyle = `rgb(${g}, ${g}, ${g})`;
      bump.fillRect(0, y + i, 16, 1);
    }
  }
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(60,50,40,0.12)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(random() * w, random() * h, 2 + random() * 6, 1 + random() * 2);
  }
  const bumpTexture = toTexture(bumpCanvas, 'grazing');
  bumpTexture.colorSpace = THREE.NoColorSpace;
  return [toTexture(canvas, 'grazing'), bumpTexture];
}

/**
 * What gets onto a shutter, a cell each (`TAG_CELLS` across, `TAG_SIZE` metres): a crew's name in fat outlined
 * letters, a throw-up in chrome and black, a couple of posters pasted over with a tag across them, a row of gig bills.
 */
function tagTexture(): THREE.CanvasTexture {
  const cw = 512;
  const ch = 256;
  const [canvas, ctx] = createCanvas(cw * TAG_CELLS, ch);
  const tag = (x: number, y: number, word: string, px: number, fill: string, outline: string, lean = -0.25): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, lean, 1, 0, 0);
    ctx.font = letteringFont(LETTERING.condensed, px);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = px * 0.24;
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(word, 0, 0);
    ctx.fillRect(px * 0.3, 2, px * 0.05, px * 0.5);
    ctx.restore();
  };
  tag(60, 190, 'ZEKONE', 120, '#e83a8a', '#15151a');
  tag(cw + 50, 200, 'PIXL', 150, '#d8dadc', '#15151a', -0.15);
  paintPoster(ctx, 1, cw * 2 + 40, 20, 140, 196);
  paintPoster(ctx, 1, cw * 2 + 190, 20, 140, 196, true);
  tag(cw * 2 + 60, 200, 'KRAY', 100, '#3ae8c8', '#15151a');
  for (let i = 0; i < 3; i++) paintPoster(ctx, [0, 3, 6][i]!, cw * 3 + 30 + i * 160, 26, 146, 204, i === 1);
  const texture = toTexture(canvas, 'grazing');
  return texture;
}
