import type * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { MATERIAL_UNITS, countLights, describeCount } from '../lighting/lightBudget';
import type { Finding } from './finding';
import { pathOf } from './naming';

/** Point and spot shadow cameras reach no farther than this (m): the bias is in units of `far` (CLAUDE.md); no room is 30 m across. */
const SHADOW_FAR_MAX = 30;
/** Texture units a lit shader may use: the shadow maps and a material's own maps must fit (CLAUDE.md, `lighting/lightBudget`). */
const TEXTURE_UNITS = 16;

type AnyLight = THREE.Light & {
  isPointLight?: boolean;
  isSpotLight?: boolean;
  isDirectionalLight?: boolean;
  isHemisphereLight?: boolean;
  shadow?: THREE.LightShadow;
  distance?: number;
};

interface LightsReport {
  findings: Finding[];
  /** The counts (`describeCount`), for `--verbose`. */
  summary: string;
}

/**
 * The lights a built subject holds, hidden ones included (the `LightCuller` shows them in turn). `room`: the subject
 * is a room's shell with its plan, which owns the shadows and the ambient and keeps within the budget; a prop owns
 * neither (new lamps stay shadowless, only a `Room` runs a `HemisphereLight`).
 */
export function lintLights(root: THREE.Object3D, room: boolean): LightsReport {
  const findings: Finding[] = [];
  const lights: AnyLight[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) lights.push(obj as AnyLight);
  });
  for (const light of lights) {
    const key = pathOf(light, root);
    const shadowed = light.castShadow && Boolean(light.isPointLight || light.isSpotLight || light.isDirectionalLight);
    if (shadowed && light.shadow) {
      const far = (light.shadow.camera as THREE.PerspectiveCamera).far;
      if ((light.isPointLight || light.isSpotLight) && far > SHADOW_FAR_MAX) findings.push({ check: 'shadow far', key, detail: `shadow.camera.far is ${far} m; the bias is in units of it` });
      if (light.shadow.autoUpdate) findings.push({ check: 'shadow autoUpdate', key, detail: 'its shadow map re-renders every frame' });
      if (!room) findings.push({ check: 'prop shadow', key, detail: "a prop's light casts a shadow: a texture unit in every lit shader" });
    }
    if ((light.isPointLight || light.isSpotLight) && light.distance === 0) findings.push({ check: 'unbounded light', key, detail: 'distance 0: every fragment of the scene evaluates it' });
    if (light.isHemisphereLight && !room) findings.push({ check: 'prop ambient', key, detail: 'a HemisphereLight lights the whole scene' });
  }
  const count = countLights(lights);
  if (room) {
    const shadowBudget = QUALITY.lights.pointShadows + QUALITY.lights.spotShadows;
    if (count.shadows > shadowBudget) findings.push({ check: 'shadow budget', key: 'shadow maps', detail: `${count.shadows} shadow-casting lights; the budget shows ${shadowBudget} at once` });
    if (count.shadows + MATERIAL_UNITS > TEXTURE_UNITS) findings.push({ check: 'texture units', key: 'shadow maps', detail: `${count.shadows} shadow maps + ${MATERIAL_UNITS} material maps > ${TEXTURE_UNITS} texture units: lit shaders would not link` });
    if (count.hemisphere > 1) findings.push({ check: 'ambient', key: 'hemisphere lights', detail: `${count.hemisphere} HemisphereLights; a room runs one` });
    if (count.point > QUALITY.lights.point) findings.push({ check: 'light budget', key: 'point lights', detail: `${count.point} point lights; the culler shows ${QUALITY.lights.point}` });
    if (count.spot > QUALITY.lights.spot) findings.push({ check: 'light budget', key: 'spot lights', detail: `${count.spot} spot lights; the culler shows ${QUALITY.lights.spot}` });
  }
  return { findings, summary: describeCount(count) };
}
