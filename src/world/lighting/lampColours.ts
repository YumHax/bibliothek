import * as THREE from 'three';
import { planckianXy } from '@/graphics/whiteBalance';

/**
 * The colours of every lamp, from its colour temperature: one source, so a bedside lamp, the stair
 * bulbs and a street lamp of the same kind agree. A kind of lamp is a kelvin value; the colour is
 * the black body's at that temperature (the Planckian locus, Kim et al.'s cubic fit), relative to
 * a 6504 K white so daylight stays neutral, then carried part of the way back to white
 * (`ADAPTATION`): the eye adapts to a lamp-lit room, and the post grade and the look's temperature
 * add their own warmth on top (docs/graphics.md "Lamp colours").
 *
 * All colours are linear (the renderer's working space), max channel 1. They are shared: pass them
 * to a light or a material, which copies them (`new PointLight(LAMP_LIGHT.incandescent)`,
 * `emissive: LAMP_GLOW.led`, `.copy()`), never edit one in place.
 */
export type LampKind = 'incandescent' | 'halogen' | 'led' | 'sodium';

/** Colour temperature of each kind (K): a household bulb, a halogen spot, a neutral LED, a sodium street lamp. */
const LAMP_KELVIN: Readonly<Record<LampKind, number>> = { incandescent: 2700, halogen: 3000, led: 4000, sodium: 2000 };

/** Share of the way from the black body's colour back to white the light is shown at (the eye's adaptation). */
const ADAPTATION = 0.35;
/** The glowing bulb, diffuser or shade itself reads whiter than the light it throws (a hot filament saturates): further to white. */
const GLOW_ADAPTATION = 0.5;
/** The light bounced off a white ceiling or wall: nearly white, a trace of the lamp's hue. */
const BOUNCE_ADAPTATION = 0.8;

/** Linear sRGB (unnormalised) of a black body at `kelvin`, luminance 1. */
function planckianRgb(kelvin: number, out: THREE.Color): THREE.Color {
  const [x, y] = planckianXy(kelvin);
  const X = x / y;
  const Z = (1 - x - y) / y;
  return out.setRGB(3.2404542 * X - 1.5371385 - 0.4985314 * Z, -0.969266 * X + 1.8760108 + 0.041556 * Z, 0.0556434 * X - 0.2040259 + 1.0572252 * Z, THREE.LinearSRGBColorSpace);
}

const reference = planckianRgb(6504, new THREE.Color());

/**
 * The linear colour of a lamp at `kelvin`, max channel 1, carried `adaptation` of the way back to
 * white (0 = the black body as is, 1 = white).
 */
function kelvinColour(kelvin: number, adaptation = ADAPTATION, out = new THREE.Color()): THREE.Color {
  planckianRgb(kelvin, out);
  out.setRGB(Math.max(0, out.r / reference.r), Math.max(0, out.g / reference.g), Math.max(0, out.b / reference.b), THREE.LinearSRGBColorSpace);
  const max = Math.max(out.r, out.g, out.b, 1e-6);
  out.multiplyScalar(1 / max);
  out.setRGB(out.r + (1 - out.r) * adaptation, out.g + (1 - out.g) * adaptation, out.b + (1 - out.b) * adaptation, THREE.LinearSRGBColorSpace);
  return out;
}

function byKind(adaptation: number): Readonly<Record<LampKind, THREE.Color>> {
  const kinds = Object.keys(LAMP_KELVIN) as LampKind[];
  return Object.fromEntries(kinds.map((kind) => [kind, kelvinColour(LAMP_KELVIN[kind], adaptation)])) as Record<LampKind, THREE.Color>;
}

/** The light a lamp of each kind throws (`PointLight` / `SpotLight` colour). */
export const LAMP_LIGHT = byKind(ADAPTATION);
/** The glow of the lamp itself: its bulb, diffuser, opal globe or lit shade (emissive colour). */
export const LAMP_GLOW = byKind(GLOW_ADAPTATION);
/** A lamp's light bounced off white paint (the ceiling's stand-in emissive, an ambient's sky colour). */
export const LAMP_BOUNCE = byKind(BOUNCE_ADAPTATION);
