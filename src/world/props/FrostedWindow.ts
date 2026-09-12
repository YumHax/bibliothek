import * as THREE from 'three';
import { Prop, part, matte } from './Prop';

export interface FrostedWindowOptions {
  /** Size of the glazed opening. Default 0.6 x 0.5. */
  width?: number;
  height?: number;
}

/** Face width of the frame and the mullion, how far they stand off the wall, the sill's overhang. */
const FRAME = 0.05;
const MULLION = 0.03;
const FRAME_DEPTH = 0.05;
const SILL_DEPTH = 0.07;
/** Glow of the frosted glass at night and in full day (the sky behind it, nothing else). */
const NIGHT_GLOW = 0.06;
const DAY_GLOW = 0.9;
const DAY_WHITE = new THREE.Color(0xfff8ee);

const PAINT = matte(0xf6f3ee, 0.7);

/**
 * A small obscured window high on an outside wall, the kind a bathroom gets: a painted frame
 * standing proud of the wall, a mullion, a sill, and two frosted panes that only let the light
 * through. Nothing is seen through it, so it needs no `Outdoors`; `setDaylight()` brightens and
 * tints the glass with the sky (the builder wires it to the shared `DayNight`). Wall-hung: origin
 * at the centre of the glass on the wall, +z into the room. Decoration: never collides.
 */
export class FrostedWindow extends Prop {
  private readonly glass: THREE.MeshStandardMaterial;

  constructor(options: FrostedWindowOptions = {}) {
    super();
    this.name = 'FrostedWindow';
    const w = options.width ?? 0.6;
    const h = options.height ?? 0.5;

    const z = FRAME_DEPTH / 2;
    part(this, FRAME, h + 2 * FRAME, FRAME_DEPTH, PAINT, { x: -w / 2 - FRAME / 2, z });
    part(this, FRAME, h + 2 * FRAME, FRAME_DEPTH, PAINT, { x: w / 2 + FRAME / 2, z });
    part(this, w, FRAME, FRAME_DEPTH, PAINT, { y: h / 2 + FRAME / 2, z });
    part(this, w, FRAME, FRAME_DEPTH, PAINT, { y: -h / 2 - FRAME / 2, z });
    part(this, MULLION, h, FRAME_DEPTH - 0.01, PAINT, { z: z - 0.005 });
    part(this, w + 2 * FRAME + 0.04, 0.03, SILL_DEPTH, PAINT, { y: -h / 2 - FRAME - 0.015, z: SILL_DEPTH / 2 });

    this.glass = new THREE.MeshStandardMaterial({ color: 0xe6ecee, roughness: 0.55, emissive: DAY_WHITE, emissiveIntensity: NIGHT_GLOW });
    const pane = part(this, w, h, 0.006, this.glass, { z: 0.008 });
    pane.castShadow = false;

    // Flat on a wall, high up: no shadow worth its draw calls.
    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
  }

  /** 0 = night, 1 = full day; `skyHue` tints the glow (warm by day, blue at night, orange at sunset). */
  setDaylight(daylight: number, skyHue?: THREE.Color): void {
    const t = THREE.MathUtils.clamp(daylight, 0, 1);
    this.glass.emissiveIntensity = THREE.MathUtils.lerp(NIGHT_GLOW, DAY_GLOW, t);
    this.glass.emissive.copy(DAY_WHITE);
    if (skyHue) this.glass.emissive.lerp(skyHue, 0.6);
  }
}
