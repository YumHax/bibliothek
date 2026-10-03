import * as THREE from 'three';
import { standard } from './palette';
import { RENDER_ORDER } from '../surface/layers';
import type { SkyState } from '../props/DayNight';

/*
 * The flat's and the shops' glass, one look per kind of glass (shared palette materials: never edit
 * one in place). A see-through pane is transparent, writes no depth and draws in the glass band
 * (`asGlass`), so what stands behind it is drawn first and seen through it. Windows onto the outside
 * are not here: their panes show the street (`props/Window`, `world/outlook`), and the street's own
 * glass is painted into its facades (`street/facadePainter`). Vehicle glass is `street/carModel`'s.
 */
export const GLASS = {
  /** A display case's or a cabinet's thin clear pane, seen from both sides: nothing but its reflections. */
  clear: standard({ color: 0xe8f4f4, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.4 }),
  /** A glazed door's or a lodge's pane, seen from one side. */
  pane: standard({ color: 0xdfe8ea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.13, depthWrite: false }),
  /** A glass shelf, edge on: a little greener and denser than a pane. */
  shelf: standard({ color: 0xcfe6e2, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.8 }),
  /** A shower screen, the bathroom's shelves and tumblers: thicker glass, a little more of it shows. */
  screen: standard({ color: 0xdff0f0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  /** Jars, glasses and glazed cabinet doors in the kitchen. */
  ware: standard({ color: 0xe8f0f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  /** A mirror's silvered glass (the environment's reflection; the mirrors with a real reflection are `props/MirrorGlass`). */
  mirror: standard({ color: 0xc8ccd0, roughness: 0.05, metalness: 1 }),
} as const;

/** Roof glass under snow, and the grey of an overcast sky through it. */
const SNOW_GLASS = new THREE.Color(0xe8eef2);
const OVERCAST = new THREE.Color(0x9aa2aa);
const snowGlass = new THREE.Color();

/**
 * The colour of a roof window seen from under it (the stairwell's roof light, the attic's roof windows):
 * the sky between zenith and horizon, greyed by cloud, darkened by rain, white with snow lying on it, a
 * lightning flash. One formula, so every roof light of the building agrees. Written into `out`.
 */
export function skyGlassColour(out: THREE.Color, s: SkyState): THREE.Color {
  out.copy(s.zenith).lerp(s.horizon, 0.4);
  out.lerp(OVERCAST, 0.7 * s.cloudCover);
  out.multiplyScalar((0.25 + 1.1 * s.daylight) * (1 - 0.35 * s.rain));
  out.lerp(snowGlass.copy(SNOW_GLASS).multiplyScalar(0.3 + 0.8 * s.daylight), 0.8 * s.snowCover);
  return out.addScalar(1.5 * s.lightning);
}

/** Frosted glass lit by the day behind it: its glow at night and at noon, and its white. */
const DAYLIT = { night: 0.06, day: 0.9, white: new THREE.Color(0xfff8ee) };

/** A frosted pane glowing with the daylight behind it (a landing's window, the market hall's roof): its own material, lit by `lightDaylitGlass`. */
export function daylitGlass(roughness = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xe6ecee, roughness, emissive: DAYLIT.white, emissiveIntensity: DAYLIT.night });
}

/** `glass` (a `daylitGlass`) at `daylight` (0 night .. 1 full day), its glow tinted towards `skyHue` (warm by day, blue at night, orange at sunset). */
export function lightDaylitGlass(glass: THREE.MeshStandardMaterial, daylight: number, skyHue?: THREE.Color): void {
  glass.emissiveIntensity = THREE.MathUtils.lerp(DAYLIT.night, DAYLIT.day, THREE.MathUtils.clamp(daylight, 0, 1));
  glass.emissive.copy(DAYLIT.white);
  if (skyHue) glass.emissive.lerp(skyHue, 0.6);
}

/** `object` no longer stops the crosshair (the boxes behind a pane are clicked through it), casts no shadow, draws as glass. */
export function asGlass<T extends THREE.Object3D>(object: T): T {
  object.raycast = () => {};
  object.castShadow = false;
  object.receiveShadow = false;
  object.renderOrder = RENDER_ORDER.glass;
  return object;
}
