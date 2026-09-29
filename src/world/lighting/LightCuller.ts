import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { LightBudgetSettings } from '@/graphics/quality';

/** What the culler asks of a zone: its group (to find a light's zone), whether it is drawn, whether the player is in it. */
export interface CullerZone {
  readonly group: THREE.Object3D;
  readonly isActive: boolean;
  readonly isDrawn: boolean;
  readonly isOccupied: boolean;
}

/**
 * The kinds the budget counts apart. A shadowed kind must keep its shadow to be shown at all (a
 * ceiling lamp without it would shine through the walls), so it is never turned into the plain kind:
 * each count stays fixed, and three.js compiles a program per count, not per light.
 */
type Kind = keyof LightBudgetSettings;

interface Entry {
  readonly light: THREE.Light;
  readonly kind: Kind;
  zone: CullerZone | null;
  /** Seconds it has been dark (0 while lit). */
  dark: number;
  /** Sort keys, refreshed each frame. */
  tier: number;
  score: number;
}

/**
 * What the culler keeps of a light between two sweeps (entries are rebuilt at each): the intensity
 * its owner wants (`base`), the culler's fade (`gain`, 0..1) and what it last wrote (`written`),
 * which tells an owner's new value from the culler's own.
 */
interface Fade {
  base: number;
  gain: number;
  written: number;
}

/** Every culled light's fade, kept across sweeps and cullers. */
const FADES = new WeakMap<THREE.Light, Fade>();

/**
 * The intensity `light`'s owner set, not the culler's fade of it: for code that stores a light's
 * intensity to hand it back later (`keepLights`), which would otherwise keep a half-faded value.
 */
export function intendedIntensity(light: THREE.Light): number {
  const fade = FADES.get(light);
  return fade && light.intensity === fade.written ? fade.base : light.intensity;
}

/** Seconds between two sweeps of the scene for lights that came or went (a bookcase's lamp, a zone's rig). */
const RESCAN_SECONDS = 1;
/** A shown light keeps its place until another outweighs it this many times over, so two alike do not trade places every frame. */
const HOLD = 1.6;
/** A shown light that goes dark keeps its place this long (seconds): a flicker or a stutter does not hand it to another light and back. */
const DARK_GRACE = 0.6;
/** Seconds a light takes to fade out before it hands its place over, and the newcomer to fade in (like `LightPool`'s slots). */
const FADE_SECONDS = 0.35;
/** A light whose range ends this far (m) short of the eye weighs this little: it lights nothing near the player. */
const RANGE_MARGIN = 1.5;
const OUT_OF_RANGE = 0.05;
/** A light whose reach is in the view weighs this much more than one behind the player. */
const IN_VIEW = 2;
/** The reach assumed for the view test of a light without a range (m). */
const UNBOUNDED_REACH = 6;

type AnyLight = THREE.Light & {
  isPointLight?: boolean;
  isSpotLight?: boolean;
  isHemisphereLight?: boolean;
  map?: THREE.Texture | null;
};

function kindOf(light: AnyLight): Kind | null {
  if (light.isPointLight) return light.castShadow ? 'pointShadows' : 'point';
  // A spot projecting a texture is a program of its own (`numSpotLightMaps`): left alone.
  if (light.isSpotLight && !light.map) return light.castShadow ? 'spotShadows' : 'spot';
  if (light.isHemisphereLight) return 'hemisphere';
  return null;
}

/** Whether every parent of `light` is visible (the light's own flag is the culler's). */
function parentsShown(light: THREE.Object3D): boolean {
  for (let o = light.parent; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** A shadow-casting light's map redrawn on the next frame. */
function requestShadow(light: THREE.Light): void {
  const shadow = (light as THREE.Light & { shadow?: THREE.LightShadow }).shadow;
  if (light.castShadow && shadow) shadow.needsUpdate = true;
}

/**
 * The light budget at work (`QUALITY.lights`, see `lightBudget.ts`). three.js renders forward: every
 * light the scene draws is evaluated by every lit fragment, dark or not, near or not (only the
 * shadow lookup is skipped for a dark one), and the flat alone holds some thirty (each room's rig,
 * lamps not bought yet kept dark, the rooms next door). Each frame the culler hands the renderer the
 * best few of each kind and hides the rest (`visible = false`): the player's room first, then the
 * zones seen through the doorways, then the others; lit before dark; within that, bright and near
 * before dim and far. Lights outside any zone always come first.
 *
 * The number shown of each kind is `min(budget, lights of that kind)`, whichever lights they are,
 * so changing which recompiles nothing (three.js keys its programs on the counts). It only changes
 * when zones come or go, as it did before. `apply` runs the same choice at once on any root: `World`
 * calls it before compiling (at start, after a trip, on a stand-in scene prepared ahead) so the
 * programs are the ones the loop will use.
 *
 * Within a tier, a light whose range (`distance`) ends short of the player weighs next to nothing,
 * and one whose reach is in the view weighs double.
 *
 * Owners keep driving their lights (intensity, colour, position) and never touch `visible`: a lamp
 * switched on in the player's room outranks a dark one at once. A handover fades (`FADE_SECONDS`
 * out, then in): the culler ticks after everything else (`Engine.addLateUpdatable`) and scales the
 * intensity the owner just set by its fade; a value it did not write is the owner's new one. Only
 * while a light fades does its `intensity` differ from its owner's. A light just shown gets its
 * shadow map redrawn.
 */
export class LightCuller implements Updatable {
  private entries: Entry[] = [];
  private rescan = 0;
  private lastSet = 0;
  private readonly eye = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly byKind = new Map<Kind, Entry[]>();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private hasFrustum = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly zones: () => readonly CullerZone[],
    private readonly viewer: THREE.Object3D,
    private readonly budget: LightBudgetSettings,
  ) {}

  update(dt: number): void {
    this.rescan -= dt;
    const set = this.activeSet();
    if (this.rescan <= 0 || set !== this.lastSet) {
      this.rescan = RESCAN_SECONDS;
      this.lastSet = set;
      this.entries = this.collect(this.scene);
    }
    this.assign(this.entries, dt);
  }

  /** Culls the lights under `root` now (the scene, or a stand-in holding zones about to come in). */
  apply(root: THREE.Object3D = this.scene): void {
    const entries = this.collect(root);
    this.assign(entries);
    if (root === this.scene) {
      this.entries = entries;
      this.lastSet = this.activeSet();
      this.rescan = RESCAN_SECONDS;
    }
  }

  /** A signature of which zones are active (a hash of their groups' ids, in order): no string built every frame. */
  private activeSet(): number {
    let set = 17;
    for (const zone of this.zones()) if (zone.isActive) set = (Math.imul(set, 31) + zone.group.id) | 0;
    return set;
  }

  private collect(root: THREE.Object3D): Entry[] {
    const groups = new Map<THREE.Object3D, CullerZone>();
    for (const zone of this.zones()) groups.set(zone.group, zone);
    const entries: Entry[] = [];
    root.traverse((obj) => {
      const light = obj as AnyLight;
      if (!light.isLight) return;
      const kind = kindOf(light);
      if (!kind) return;
      let zone: CullerZone | null = null;
      for (let o = light.parent; o && !zone; o = o.parent) zone = groups.get(o) ?? null;
      entries.push({ light, kind, zone, dark: 0, tier: 0, score: 0 });
    });
    return entries;
  }

  /**
   * Ranks every light and fades the handover. Each kind keeps exactly `min(budget, lights)` shown
   * (the count the programs were compiled for): a light that loses its place fades out first, still
   * shown, and only once it is dark does the next one take the place and fade in. `dt` 0 (`apply`)
   * does it all at once.
   */
  private assign(entries: readonly Entry[], dt = 0): void {
    this.viewer.getWorldPosition(this.eye);
    const camera = this.viewer as THREE.Camera;
    this.hasFrustum = camera.isCamera === true;
    if (this.hasFrustum) {
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    for (const list of this.byKind.values()) list.length = 0;
    for (const entry of entries) {
      // A light under a hidden parent is out of the renderer's count already: not the culler's to choose.
      if (!parentsShown(entry.light)) continue;
      this.rank(entry, dt);
      let list = this.byKind.get(entry.kind);
      if (!list) this.byKind.set(entry.kind, (list = []));
      list.push(entry);
    }
    const step = dt > 0 ? dt / FADE_SECONDS : 1;
    for (const [kind, list] of this.byKind) {
      list.sort((a, b) => b.tier - a.tier || b.score - a.score);
      const target = Math.min(this.budget[kind], list.length);
      let shown = 0;
      for (let i = 0; i < list.length; i++) {
        const { light } = list[i]!;
        if (!light.visible) continue;
        const fade = FADES.get(light);
        const wanted = i < target;
        // Never faded in (just came with its zone), dark, or all at once: out now, nothing to see go.
        if (!wanted && (!fade || dt === 0 || fade.base <= 0 || (fade.gain -= step) <= 0)) {
          this.hide(light, fade);
          continue;
        }
        if (wanted && fade) {
          // Fading in, its shadow map follows what moves meanwhile (a door, the cat), not only the
          // frame it came back on: else a room seen through a door keeps a stale shadow until the
          // shadow's next idle refresh.
          if (fade.gain < 1) requestShadow(light);
          fade.gain = Math.min(1, fade.gain + step);
        }
        else if (wanted) FADES.set(light, { base: light.intensity, gain: dt === 0 ? 1 : 0, written: light.intensity });
        shown++;
      }
      // The places freed go to the best lights waiting, which fade in from dark.
      for (let i = 0; i < target && shown < target; i++) {
        const { light } = list[i]!;
        if (light.visible) continue;
        light.visible = true;
        const fade = FADES.get(light);
        if (fade) fade.gain = dt === 0 ? 1 : 0;
        else FADES.set(light, { base: light.intensity, gain: dt === 0 ? 1 : 0, written: light.intensity });
        requestShadow(light);
        shown++;
      }
      // More shown than the count (a zone's lights came in shown, a light outranked one still fading):
      // the lowest go at once, so the count never moves.
      for (let i = list.length - 1; i >= 0 && shown > target; i--) {
        const { light } = list[i]!;
        if (!light.visible) continue;
        this.hide(light, FADES.get(light));
        shown--;
      }
      for (const { light } of list) if (light.visible) this.write(light);
    }
  }

  private hide(light: THREE.Light, fade: Fade | undefined): void {
    light.visible = false;
    if (!fade) return;
    fade.gain = 0;
    // Hidden, the light keeps its owner's intensity (whoever reads it back sees their own value).
    light.intensity = fade.written = fade.base;
  }

  /**
   * Ticked before the owners (`Engine.addEarlyUpdatable`): each faded light gets its owner's value
   * back, so an owner that eases from `light.intensity` (the projector's beam, the TV's glow) eases
   * from its own value, not from the fade, which would feed back (the base sinking with the gain, the
   * light losing its rank while it fades in, and swapping places over and over).
   */
  readonly restoreOwners: Updatable = {
    update: () => {
      for (const { light } of this.entries) {
        const fade = FADES.get(light);
        if (fade && light.intensity === fade.written && fade.written !== fade.base) light.intensity = fade.written = fade.base;
      }
    },
  };

  /** The owner's intensity times the fade, written once the owners have set theirs this frame (the culler ticks late). */
  private write(light: THREE.Light): void {
    const fade = FADES.get(light);
    if (!fade) return;
    light.intensity = fade.written = fade.base * fade.gain;
  }

  /** The intensity the owner wants: a value that is not the culler's last write is the owner's new one. */
  private ownerIntensity(light: THREE.Light): number {
    const fade = FADES.get(light);
    if (!fade) return light.intensity;
    if (light.intensity !== fade.written) fade.base = fade.written = light.intensity;
    return fade.base;
  }

  private rank(entry: Entry, dt: number): void {
    const { light, zone } = entry;
    const intensity = this.ownerIntensity(light);
    entry.dark = intensity > 0 ? 0 : entry.dark + dt;
    if (intensity <= 0 && !(light.visible && entry.dark < DARK_GRACE)) {
      entry.tier = -1;
      entry.score = 0;
      return;
    }
    entry.tier = !zone ? 3 : zone.isOccupied ? 2 : zone.isDrawn ? 1 : 0;
    const any = light as AnyLight;
    if (any.isHemisphereLight) {
      entry.score = intensity * (light.visible ? HOLD : 1);
      return;
    }
    // Last frame's world matrix: `getWorldPosition` would recompose every parent's, for every light, every frame.
    const at = this.at.setFromMatrixPosition(light.matrixWorld);
    const d2 = at.distanceToSquared(this.eye);
    const range = (light as THREE.PointLight).distance ?? 0;
    let score = intensity / (1 + d2);
    // A light that ends short of the player lights nothing near them; one whose reach is in view lights what they see.
    if (range > 0 && d2 > (range + RANGE_MARGIN) ** 2) score *= OUT_OF_RANGE;
    if (this.hasFrustum) {
      this.sphere.set(at, range > 0 ? range : UNBOUNDED_REACH);
      if (this.frustum.intersectsSphere(this.sphere)) score *= IN_VIEW;
    }
    entry.score = score * (light.visible ? HOLD : 1);
  }
}
