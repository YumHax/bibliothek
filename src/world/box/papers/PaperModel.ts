import * as THREE from 'three';
import { printGlow } from '@/world/materials/printGlow';
import { WALL, onSurface } from '@/world/surface/layers';
import { clamp, smooth } from '@/math/scalar';
import { reduceMotion } from '@/settings/motion';
import { dampFactor } from '@/math/damp';
import type { Paper } from './paperContents';

/** One leaf's thickness (m): a booklet's two sides of thin paper; a stack of them gives each side of the spread its depth. */
const LEAF = 0.00022;
/** A page turned takes this long (s); a sheet turned over a little less. */
const TURN_SECONDS = 0.42;
const FLIP_RATE = 9;
/** How far a turning page's free edge trails behind its spine (radians at mid-turn): the page curls as it goes over. */
const CURL = 0.55;
/** Columns of the turning page's mesh along its width: enough for the curl to look round. */
const SEGMENTS = 20;
/** A folded sheet unfolding when it comes out (1/s): across first, then down. */
const UNFOLD_RATE = 2.4;
/** The reading light's colour (`setReading`): a warm bulb's, as on the box. */
const READING_TINT = new THREE.Color(1, 0.94, 0.84);

/**
 * A paper out of the box held up to read (`PaperReader`), in its own frame: x right, y up, +z towards the eye, centred
 * on what shows. A bound paper (a booklet, a leaflet) lies open at a spread, its spine at x 0, each side the thickness
 * of the leaves on it; a page turns over the spine with a curl. A sheet (a card, a poster) turns over about its middle;
 * a folded one opens out across, then down. Pages show the stock's colour until their texture is drawn (`setPage`).
 */
export class PaperModel extends THREE.Group {
  /** Every surface's material, its own (the reading light lifts them): left, right, turning front, turning back, the edges. */
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly textures = new Map<number, THREE.Texture>();
  private readonly placeholder: THREE.Texture;
  private readonly inner = new THREE.Group();
  private readonly bound: boolean;
  private readonly leaves: number;
  /** Bound: how many leaves lie turned to the left (eased towards `target`); a sheet: 0 its front, 1 its back. */
  private opened = 0;
  private target = 0;
  /** A folded sheet: how far it is unfolded (0..1, eased) and whether it is asked to be. */
  private unfold = 0;
  private unfolding = false;
  private readonly left: THREE.Mesh | null = null;
  private readonly right: THREE.Mesh | null = null;
  private readonly leftBlock: THREE.Mesh | null = null;
  private readonly rightBlock: THREE.Mesh | null = null;
  private readonly turning: THREE.Group | null = null;
  private readonly turnFront: THREE.Mesh | null = null;
  private readonly turnBack: THREE.Mesh | null = null;
  private readonly front: THREE.Mesh | null = null;
  private readonly back: THREE.Mesh | null = null;

  constructor(readonly paper: Paper, layersMask: number) {
    super();
    this.name = `Paper:${paper.kind}`;
    this.bound = paper.kind === 'booklet' || paper.kind === 'leaflet';
    this.leaves = this.bound ? Math.max(1, Math.floor(paper.pages.length / 2)) : 1;
    this.placeholder = stockTexture();
    const { width: w, height: h } = paper;
    this.add(this.inner);
    const page = (side: THREE.Side): THREE.MeshStandardMaterial => {
      const material = onSurface(printGlow(new THREE.MeshStandardMaterial({ map: this.placeholder, color: paper.stock, roughness: 0.88, side })), WALL.print);
      this.materials.push(material);
      return material;
    };
    if (this.bound) {
      const plane = (x: number): THREE.PlaneGeometry => {
        const g = new THREE.PlaneGeometry(w, h);
        g.translate(x, 0, 0);
        return g;
      };
      this.left = new THREE.Mesh(plane(-w / 2), page(THREE.FrontSide));
      this.right = new THREE.Mesh(plane(w / 2), page(THREE.FrontSide));
      const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color(paper.stock).multiplyScalar(0.92), roughness: 0.95 });
      this.materials.push(edge);
      const block = new THREE.BoxGeometry(w, h, 1);
      this.leftBlock = new THREE.Mesh(block, edge);
      this.rightBlock = new THREE.Mesh(block, edge);
      this.leftBlock.position.x = -w / 2;
      this.rightBlock.position.x = w / 2;
      // The turning page: a strip of columns from the spine out, its back drawn mirrored (seen from behind once over).
      const strip = new THREE.PlaneGeometry(w, h, SEGMENTS, 1);
      strip.translate(w / 2, 0, 0);
      const mirrored = strip.clone();
      const uv = mirrored.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      this.turnFront = new THREE.Mesh(strip, page(THREE.FrontSide));
      this.turnBack = new THREE.Mesh(mirrored, page(THREE.BackSide));
      this.turning = new THREE.Group();
      this.turning.add(this.turnFront, this.turnBack);
      this.inner.add(this.leftBlock, this.rightBlock, this.left, this.right, this.turning);
    } else {
      const plane = new THREE.PlaneGeometry(w, h);
      const mirrored = plane.clone();
      const uv = mirrored.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      this.front = new THREE.Mesh(plane, page(THREE.FrontSide));
      this.back = new THREE.Mesh(mirrored, page(THREE.BackSide));
      this.inner.add(this.front, this.back);
    }
    this.traverse((obj) => {
      obj.layers.mask = layersMask;
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = obj.receiveShadow = false;
    });
    this.layout();
  }

  /** What shows now (m): the open spread, the shut booklet, the sheet as far as it is unfolded. The framing fits it. */
  get extent(): { width: number; height: number } {
    const { width: w, height: h } = this.paper;
    if (this.bound) return { width: w * (1 + this.openAmount()), height: h };
    const folds = this.paper.folds;
    if (!folds) return { width: w, height: h };
    const [sx, sy] = this.unfoldScale();
    return { width: w * sx, height: h * sy };
  }

  /** Opens it (bound: at its first spread; a folded sheet unfolds) or shuts it (back to its cover, folded). */
  setOpen(open: boolean): void {
    if (this.bound) {
      // Shut from deep in it: the leaves before the first spread go over together, the last one turns on its way into the box.
      if (!open) this.opened = Math.min(this.opened, 1);
      this.target = open ? Math.max(1, Math.min(this.target, this.leaves - 1)) : 0;
    } else {
      this.unfolding = open;
      if (!open) this.target = 0;
    }
  }

  /** A page on (`1`) or back (`-1`); a sheet is turned over either way. False when there is nothing that way. */
  turn(way: 1 | -1): boolean {
    if (!this.bound) {
      this.target = this.target === 0 ? 1 : 0;
      return true;
    }
    const next = clamp(this.target + way, 0, this.leaves);
    if (next === this.target) return false;
    this.target = next;
    return true;
  }

  /** The pages on show and the next ones either way (to draw before they are turned to). */
  pagesNeeded(): number[] {
    const last = this.paper.pages.length - 1;
    const out = new Set<number>();
    if (!this.bound) return [0, 1];
    for (const k of [Math.floor(this.opened), this.target]) for (let p = 2 * k - 2; p <= 2 * k + 3; p++) if (p >= 0 && p <= last) out.add(p);
    return [...out];
  }

  /** The texture of page `index` (the model owns it from now on and frees it with `dropPage` or `dispose`). */
  setPage(index: number, texture: THREE.Texture): void {
    this.textures.get(index)?.dispose();
    this.textures.set(index, texture);
  }

  hasPage(index: number): boolean {
    return this.textures.has(index);
  }

  /** Frees the pages not in `keep` (the reader keeps only those on show and the next). */
  dropPagesBut(keep: ReadonlySet<number>): void {
    for (const [index, texture] of this.textures) {
      if (keep.has(index)) continue;
      texture.dispose();
      this.textures.delete(index);
    }
  }

  /** The reading light (`ReadingLight`): every face lights its own print by `radiance`, warm. */
  setReading(radiance: number): void {
    for (const material of this.materials) material.emissive.copy(READING_TINT).multiplyScalar(Math.max(0, radiance));
  }

  update(dt: number): void {
    if (this.bound) {
      const step = reduceMotion() ? Infinity : dt / TURN_SECONDS;
      this.opened = this.target > this.opened ? Math.min(this.target, this.opened + step) : Math.max(this.target, this.opened - step);
    } else {
      this.opened += (this.target - this.opened) * dampFactor(reduceMotion() ? 40 : FLIP_RATE, dt);
      if (Math.abs(this.target - this.opened) < 1e-3) this.opened = this.target;
      const goal = this.unfolding ? 1 : 0;
      this.unfold = reduceMotion() ? goal : clamp(this.unfold + Math.sign(goal - this.unfold) * dt * UNFOLD_RATE, 0, 1);
    }
    this.layout();
  }

  dispose(): void {
    this.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.placeholder.dispose();
  }

  // --- Laying it out ------------------------------------------------------------------------------

  /** How open a bound paper is (0 shut at either cover .. 1 open at a spread). */
  private openAmount(): number {
    return Math.min(1, this.opened, this.leaves - this.opened);
  }

  private unfoldScale(): [number, number] {
    const folds = this.paper.folds;
    if (!folds) return [1, 1];
    const across = smooth(clamp(this.unfold * 2, 0, 1));
    const down = smooth(clamp(this.unfold * 2 - 1, 0, 1));
    return [THREE.MathUtils.lerp(1 / folds.across, 1, across), THREE.MathUtils.lerp(1 / folds.down, 1, down)];
  }

  private layout(): void {
    if (this.bound) this.layoutBound();
    else this.layoutSheet();
  }

  /** The sheet turned about its middle (front 0, back 1), as unfolded as it is (its texture squeezed with it: folded, its print is under the folds). */
  private layoutSheet(): void {
    const [sx, sy] = this.unfoldScale();
    this.inner.scale.set(sx, sy, 1);
    this.inner.rotation.y = this.opened * Math.PI;
    this.showPage(this.front!, 0);
    this.showPage(this.back!, 1);
  }

  /**
   * The spread at `opened` leaves turned: with k of them on the left, its left page shows page 2k - 1 and its right
   * page 2k; mid-turn leaf k goes over (its front 2k, its back 2k + 1) and the right page under it is 2k + 2 already.
   */
  private layoutBound(): void {
    const { width: w } = this.paper;
    const n = this.leaves;
    const k = Math.min(n - 1, Math.floor(this.opened));
    const frac = this.opened - k;
    const turningNow = frac > 1e-4 && this.opened < n;
    // Centred on what shows: the cover alone, the spread, the back cover alone.
    this.inner.position.x = (-w / 2) * (1 - Math.min(1, this.opened)) + (w / 2) * (1 - Math.min(1, n - this.opened));
    const onLeft = turningNow ? k : Math.round(this.opened);
    const onRight = n - onLeft - (turningNow ? 1 : 0);
    const tl = onLeft * LEAF;
    const tr = onRight * LEAF;
    this.side(this.leftBlock!, this.left!, tl, onLeft > 0 ? 2 * onLeft - 1 : -1);
    this.side(this.rightBlock!, this.right!, tr, onRight > 0 ? 2 * (n - onRight) : -1);
    const turning = this.turning!;
    turning.visible = turningNow;
    if (!turningNow) return;
    this.showPage(this.turnFront!, 2 * k);
    this.showPage(this.turnBack!, 2 * k + 1);
    turning.position.z = Math.max(tl, tr) + LEAF;
    this.bend(smooth(frac) * Math.PI);
  }

  /** One side of the spread: its block of leaves `thick` deep, the page on it showing `page` (-1: nothing on that side). */
  private side(block: THREE.Mesh, page: THREE.Mesh, thick: number, index: number): void {
    const shown = index >= 0;
    block.visible = page.visible = shown;
    if (!shown) return;
    block.scale.z = Math.max(1e-5, thick);
    block.position.z = thick / 2;
    page.position.z = thick + LEAF * 0.25;
    this.showPage(page, index);
  }

  /** The turning page `theta` over (0 lying on the right .. pi on the left), its free edge trailing in a curl. */
  private bend(theta: number): void {
    const { width: w } = this.paper;
    const curl = CURL * Math.sin(theta);
    const front = this.turnFront!.geometry;
    const pos = front.getAttribute('position') as THREE.BufferAttribute;
    const cols = SEGMENTS + 1;
    const ds = w / SEGMENTS;
    let x = 0;
    let z = 0;
    const xs: number[] = [0];
    const zs: number[] = [0];
    for (let i = 1; i < cols; i++) {
      const s = (i - 0.5) / SEGMENTS;
      const phi = theta - curl * s * s;
      x += Math.cos(phi) * ds;
      z += Math.sin(phi) * ds;
      xs.push(x);
      zs.push(z);
    }
    // PlaneGeometry's vertices: rows top to bottom, columns left to right.
    for (let i = 0; i < pos.count; i++) {
      const col = i % cols;
      pos.setX(i, xs[col]!);
      pos.setZ(i, zs[col]!);
    }
    pos.needsUpdate = true;
    front.computeVertexNormals();
    front.computeBoundingSphere();
    const back = this.turnBack!.geometry;
    (back.getAttribute('position') as THREE.BufferAttribute).copy(pos).needsUpdate = true;
    back.computeVertexNormals();
    back.computeBoundingSphere();
  }

  /** Points `mesh`'s material at page `index`'s texture (the stock's colour until it is drawn). */
  private showPage(mesh: THREE.Mesh, index: number): void {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const texture = this.textures.get(index) ?? null;
    material.map = texture ?? this.placeholder;
    material.color.set(texture ? 0xffffff : this.paper.stock);
  }
}

/** A 1-pixel white map: every page keeps a map (no second program when its own arrives), tinted by the stock till then. */
function stockTexture(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
