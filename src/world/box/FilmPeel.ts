import * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';

/** How long the torn shrink-wrap takes to peel off the front and fade (s). */
const PEEL_S = 0.7;
/** The film's own look: a glassy sheet, barely there. */
const FILM = { color: 0xf4f7fa, opacity: 0.32, roughness: 0.12 } as const;

/**
 * The shrink-wrap coming off a sealed box (`GameBox.unseal`): a sheet of film over the front swings off from its left
 * edge and fades, and a crumpled scrap of it stays inside the box (shown with the contents, `scrap`). Its own
 * geometries and material (never the shared caches), freed by `dispose`.
 */
export class FilmPeel {
  /** The crumpled scrap left in the box: the caller shows it while the box is open. */
  readonly scrap: THREE.Mesh;
  private readonly pivot = new THREE.Group();
  private readonly sheet: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly scrapMaterial: THREE.MeshStandardMaterial;
  private t = 0;

  constructor(parent: THREE.Object3D, dims: BoxDimensions, layerMask: number) {
    this.material = new THREE.MeshStandardMaterial({ color: FILM.color, transparent: true, opacity: FILM.opacity, roughness: FILM.roughness, side: THREE.DoubleSide, depthWrite: false });
    this.scrapMaterial = this.material.clone();
    this.scrapMaterial.opacity = FILM.opacity * 1.4;
    const { width, height, depth } = dims;
    // The sheet hangs from the front's left edge, a breath proud of it (it is gone in under a second).
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.sheet.position.x = width / 2;
    this.pivot.position.set(-width / 2, 0, depth / 2 + 0.0015); // convention-ok: a see-through sheet gone in under a second, never at rest on the front
    this.pivot.add(this.sheet);
    parent.add(this.pivot);
    // The scrap: a small plane bent into a few facets, lying at the bottom of the box's tray.
    const scrapGeometry = new THREE.PlaneGeometry(width * 0.35, width * 0.25, 4, 3);
    const pos = scrapGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(i * 2.3) * 0.004);
    scrapGeometry.computeVertexNormals();
    this.scrap = new THREE.Mesh(scrapGeometry, this.scrapMaterial);
    this.scrap.rotation.set(-Math.PI / 2 + 0.25, 0, 0.6);
    this.scrap.position.set(width * 0.18, -height / 2 + 0.006, -depth * 0.15); // convention-ok: a crumpled scrap, its facets up to 4 mm either way, clear of the tray
    this.scrap.visible = false;
    parent.add(this.scrap);
    for (const mesh of [this.sheet, this.scrap]) {
      mesh.castShadow = false;
      mesh.layers.mask = layerMask;
    }
  }

  /** Whether the sheet is still peeling (false: it is gone, only the scrap is left). */
  get peeling(): boolean {
    return this.pivot.parent !== null;
  }

  tick(dt: number): void {
    if (!this.peeling) return;
    this.t = Math.min(PEEL_S, this.t + dt);
    const k = this.t / PEEL_S;
    // Swings out from the left edge, lifts a little, and thins away.
    this.pivot.rotation.y = -k * k * 1.9;
    this.sheet.position.y = k * 0.02;
    this.material.opacity = FILM.opacity * (1 - k);
    if (k >= 1) this.pivot.removeFromParent();
  }

  dispose(): void {
    this.pivot.removeFromParent();
    this.scrap.removeFromParent();
    this.sheet.geometry.dispose();
    this.scrap.geometry.dispose();
    this.material.dispose();
    this.scrapMaterial.dispose();
  }
}
