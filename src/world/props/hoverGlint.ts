import * as THREE from 'three';

/** The glint's colour (a warm catch-light) and strength on the hovered part. */
const GLINT_COLOR = 0xfff0d6;
const GLINT = 0.4;
/** A fitting is a part no bigger than this (bounding-sphere radius, m): a handle, a knob, a tap, not a door. */
const FITTING_RADIUS = 0.15;
/** A fitting is metal (a handle, a hinge, a tap); plastic knobs are named by their host. */
const FITTING_METALNESS = 0.5;

/**
 * The flat's one hover cue: the part a hand would reach for (a handle, a knob, a tap, a switch, a
 * lever) catches a warm glint, never the whole piece (a dark lampshade or a fabric seat lit up
 * reads as a glitch). The parts get their own copy of their material the first time they glint
 * (palette materials are shared: never tinted in place); found lazily, so a host may build them
 * after handing over the root (a `SwingLeaf`'s panel is built by its host).
 */
export class HoverGlint {
  private materials: THREE.MeshStandardMaterial[] | null = null;
  private lit = false;

  private constructor(private readonly find: () => THREE.Mesh[]) {}

  /** These parts glint. */
  static of(...parts: THREE.Mesh[]): HoverGlint {
    return new HoverGlint(() => parts);
  }

  /**
   * The small metal fittings under `root` (handles, hinges, knobs, a lamp's socket), `except` a
   * subtree left out (a drawer's contents). None found, the small parts of any finish instead.
   */
  static fittings(root: THREE.Object3D, except?: THREE.Object3D): HoverGlint {
    return new HoverGlint(() => {
      const small: THREE.Mesh[] = [];
      const metal: THREE.Mesh[] = [];
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial) || !obj.material.visible) return;
        if (except && isUnder(obj, except)) return;
        if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
        const scale = Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z));
        if ((obj.geometry.boundingSphere?.radius ?? Infinity) * scale > FITTING_RADIUS) return;
        small.push(obj);
        if (obj.material.metalness >= FITTING_METALNESS) metal.push(obj);
      });
      return metal.length ? metal : small;
    });
  }

  set(hovered: boolean): void {
    if (hovered === this.lit) return;
    this.lit = hovered;
    for (const material of (this.materials ??= this.adopt())) material.emissiveIntensity = hovered ? GLINT : 0;
  }

  /** Gives each part its own copy of its material, emissive ready (one copy per shared source). */
  private adopt(): THREE.MeshStandardMaterial[] {
    const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    for (const mesh of this.find()) {
      const source = mesh.material;
      if (Array.isArray(source) || !(source instanceof THREE.MeshStandardMaterial)) continue;
      let copy = copies.get(source);
      if (!copy) {
        copy = source.clone();
        // Not the palette's: this copy belongs to the part, freed with its zone.
        copy.userData = {};
        copy.onBeforeCompile = source.onBeforeCompile;
        copy.customProgramCacheKey = source.customProgramCacheKey;
        copy.emissive.setHex(GLINT_COLOR);
        copy.emissiveIntensity = 0;
        copies.set(source, copy);
      }
      mesh.material = copy;
    }
    return [...copies.values()];
  }
}

function isUnder(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o === root) return true;
  return false;
}
