import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MediaSpec } from '@/catalog/media';
import { WALL, onSurface } from '@/world/surface/layers';
import { shellShape, type Ribs } from './outline';
import type { MediaModel } from './MediaModel';

/** Edge fillet of the moulded shell (m). */
const BEVEL = 0.0008;
/** A rib: how tall across, how far it stands out (m). */
const RIB_H = 0.0009;
const RIB_PROUD = 0.0005;
/** How far the label and the photo stand off the shell (m): a sticker's thickness; their layer's polygon offset keeps them on top. */
const LABEL_LIFT = 0.00015;
const PHOTO_LIFT = 0.00025;
/** A photo whose outline differs more than this in proportion from the shell is not stretched over it. */
const PHOTO_ASPECT_SLACK = 0.18;

/**
 * A cartridge at real size: the shell extruded from its outline (`outline.ts`) with a moulded
 * edge, its grip ribs, the label in its place on the front (folded over the top edge where the
 * real one is) and the dark mouth at the bottom where the board's contacts are. `setPhoto` lays a
 * photograph of the real cartridge's front over the whole face instead of the drawn label. The
 * label side faces +z, the top +y, the contacts -y. Every material is its own (a wishlist ghost
 * fades them); `dispose` frees them all.
 */
export class CartridgeModel extends THREE.Group implements MediaModel {
  readonly materials: THREE.MeshStandardMaterial[];
  private readonly body: THREE.Mesh;
  private readonly frontRibs: THREE.Mesh | null;
  private readonly label: THREE.Mesh;
  private readonly fold: THREE.Mesh | null;
  private readonly skin: THREE.Mesh;
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly skinMaterial: THREE.MeshStandardMaterial;
  private readonly aspect: number;
  private readonly foldDepth: number;

  constructor(readonly spec: MediaSpec) {
    super();
    this.name = `Cartridge:${spec.shape}`;
    const { width: w, height: h, depth: d } = spec.size;
    const shape = shellShape(spec);
    this.aspect = w / h;
    this.foldDepth = shape.fold;

    const plastic = new THREE.MeshStandardMaterial({ color: spec.colour, roughness: 0.62, metalness: 0 });
    const mouth = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.9 });
    this.labelMaterial = onSurface(new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.55 }), WALL.print);
    this.skinMaterial = onSurface(new THREE.MeshStandardMaterial({ roughness: 0.5, alphaTest: 0.5 }), WALL.overlay);

    // The shell, with the back's ribs in the same draw.
    const shell = new THREE.ExtrudeGeometry(shape.outline, {
      depth: d - 2 * BEVEL,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelOffset: -BEVEL,
      bevelSegments: 2,
      curveSegments: 6,
    });
    shell.translate(0, 0, -(d - 2 * BEVEL) / 2);
    const back = ribGeometries(shape.ribs.filter((r) => r.face === 'back'), -d / 2);
    const bodyGeometry = mergeGeometries([shell.toNonIndexed(), ...back].map(stripGroups), false) ?? shell;
    if (bodyGeometry !== shell) shell.dispose();
    for (const g of back) g.dispose();
    this.body = new THREE.Mesh(bodyGeometry, plastic);

    const front = ribGeometries(shape.ribs.filter((r) => r.face === 'front'), d / 2);
    const frontGeometry = front.length ? mergeGeometries(front.map(stripGroups), false) : null;
    for (const g of front) g.dispose();
    this.frontRibs = frontGeometry ? new THREE.Mesh(frontGeometry, plastic) : null;

    // The label, and its fold over the top edge: one texture, the fold's strip at its top.
    const { label } = spec;
    const total = label.height + shape.fold;
    this.label = new THREE.Mesh(labelGeometry(label.width, label.height, 0, label.height / total), this.labelMaterial);
    this.label.position.set(label.x, label.y, d / 2 + LABEL_LIFT);
    this.fold = null;
    if (shape.fold > 0) {
      const foldGeometry = new THREE.PlaneGeometry(label.width, shape.fold);
      remapV(foldGeometry, label.height / total, 1);
      this.fold = new THREE.Mesh(foldGeometry, this.labelMaterial);
      this.fold.rotation.x = -Math.PI / 2;
      this.fold.position.set(label.x, h / 2 + LABEL_LIFT, d / 2 - shape.fold / 2 - BEVEL);
    }

    // The mouth: the underside's opening, dark.
    const mouthMesh = new THREE.Mesh(new THREE.PlaneGeometry(shape.mouth, d * 0.55), onSurface(mouth, WALL.paper));
    mouthMesh.rotation.x = Math.PI / 2;
    mouthMesh.position.set(0, -h / 2 - LABEL_LIFT, 0);

    // The photograph, over the whole front, hidden until there is one.
    const skinGeometry = new THREE.ShapeGeometry(shape.outline, 6);
    normaliseUv(skinGeometry);
    this.skin = new THREE.Mesh(skinGeometry, this.skinMaterial);
    this.skin.position.z = d / 2 + PHOTO_LIFT;
    this.skin.visible = false;

    this.add(this.body, this.label, mouthMesh, this.skin);
    if (this.frontRibs) this.add(this.frontRibs);
    if (this.fold) this.add(this.fold);
    this.materials = [plastic, mouth, this.labelMaterial, this.skinMaterial];
    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = obj === this.body;
        obj.receiveShadow = true;
      }
    });
  }

  /** Width over height of the texture `setPrint` expects: the label with its fold above it. */
  get printAspect(): number {
    return this.spec.label.width / (this.spec.label.height + this.foldDepth);
  }

  get printFold(): number {
    return this.foldDepth / (this.spec.label.height + this.foldDepth);
  }

  setPrint(texture: THREE.Texture | null): void {
    swapMap(this.labelMaterial, texture, 0xd8d8d8);
  }

  /** The real cartridge's front, trimmed to its outline; refused (false) when its proportions are not this shell's. */
  setPhoto(texture: THREE.Texture | null): boolean {
    const image = texture?.image as { width?: number; height?: number } | undefined;
    const ratio = image?.width && image.height ? image.width / image.height / this.aspect : 1;
    const fits = texture !== null && Math.abs(ratio - 1) <= PHOTO_ASPECT_SLACK;
    swapMap(this.skinMaterial, fits ? texture : null, 0xffffff);
    if (texture && !fits) texture.dispose();
    this.skin.visible = fits;
    this.label.visible = !fits;
    if (this.frontRibs) this.frontRibs.visible = !fits;
    return fits;
  }

  /** Off the GPU while nobody sees it (uploaded again when drawn). */
  freeGpu(): void {
    this.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.map?.dispose();
  }

  dispose(): void {
    this.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) {
      m.map?.dispose();
      m.dispose();
    }
  }
}

/** Raised ribs spread across a band, on the face at `z` (outwards along its sign). */
function ribGeometries(bands: readonly Ribs[], z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const sign = Math.sign(z);
  for (const band of bands) {
    const step = band.count > 1 ? (band.y1 - band.y0 - RIB_H) / (band.count - 1) : 0;
    for (let i = 0; i < band.count; i++) {
      // Twice as deep as it stands out: half of it sunk in the shell (less the 0.1 mm the bevel takes).
      const g = new THREE.BoxGeometry(band.x1 - band.x0, RIB_H, RIB_PROUD * 2).toNonIndexed();
      g.translate((band.x0 + band.x1) / 2, band.y0 + RIB_H / 2 + i * step, z - sign * 0.0001);
      out.push(g);
    }
  }
  return out;
}

function stripGroups(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.clearGroups();
  return g;
}

/** A label: a rectangle with rounded corners, its uvs spanning `v0`..`v1` of the texture's height. */
function labelGeometry(w: number, h: number, v0: number, v1: number): THREE.BufferGeometry {
  const r = Math.min(0.002, w * 0.05, h * 0.05);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ShapeGeometry(s, 4);
  normaliseUv(g);
  remapV(g, v0, v1);
  return g;
}

/** ShapeGeometry's uvs are its x, y in metres: stretch them over the shape's bounding box, 0..1. */
function normaliseUv(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const sx = box.max.x - box.min.x || 1;
  const sy = box.max.y - box.min.y || 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - box.min.x) / sx, (pos.getY(i) - box.min.y) / sy);
  uv.needsUpdate = true;
}

/** Squeezes a geometry's v (0..1) into `v0`..`v1`. */
function remapV(g: THREE.BufferGeometry, v0: number, v1: number): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
}

/** Puts `texture` on `material` (freeing the one it replaces); null goes back to the plain `blank` colour. */
function swapMap(material: THREE.MeshStandardMaterial, texture: THREE.Texture | null, blank: number): void {
  if (material.map === texture) return;
  material.map?.dispose();
  material.map = texture;
  material.color.setHex(texture ? 0xffffff : blank);
  material.needsUpdate = true;
}
