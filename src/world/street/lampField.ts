import * as THREE from 'three';
import { oneDriver } from './oneDriver';

/** How many lamps the rain and the mist read: the nearest to the eye. */
export const LAMP_FIELD_SLOTS = 8;

/**
 * The street lamps nearest the eye, for what is lit by them without being a lit material: the rain's streaks, so a
 * drop falling past a lamp catches its light. Each slot is a lamp's head (world xyz) and how lit it is (w: 0 off);
 * `lampFieldColor` their sodium. Written by `StreetLamps` (one driver a frame: the street's or a window's view).
 */
export const STREET_LAMP_FIELD = {
  lampField: { value: Array.from({ length: LAMP_FIELD_SLOTS }, () => new THREE.Vector4()) },
  lampFieldColor: { value: new THREE.Color() },
};

const driver = oneDriver();

/** Whether `owner` writes the field this frame (see `oneDriver`). */
export function drivesLampField(owner: object): boolean {
  return driver.drives(owner);
}

/** GLSL: `lampFieldAt(world)` the lamps' light at a point of the air (no facing: a drop, a wisp of mist). */
export const LAMP_FIELD_GLSL = /* glsl */ `
uniform vec4 lampField[${LAMP_FIELD_SLOTS}];
uniform vec3 lampFieldColor;
vec3 lampFieldAt(vec3 w) {
  float sum = 0.0;
  for (int i = 0; i < ${LAMP_FIELD_SLOTS}; i++) {
    vec4 lamp = lampField[i];
    if (lamp.w <= 0.0) continue;
    vec3 d = w - lamp.xyz;
    // Brightest under the head (the light falls down and out), soft round it.
    float below = smoothstep(1.0, -2.0, d.y);
    sum += lamp.w * (0.35 + 0.65 * below) / (1.0 + dot(d, d) * 0.12);
  }
  return lampFieldColor * sum;
}
`;
