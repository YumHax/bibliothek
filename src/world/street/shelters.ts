import * as THREE from 'three';

/**
 * At most this many shelters (boxes nothing falls into) in the shaders at once: of all the street's, the ones nearest
 * the eye (`Precipitation` chooses them again every few metres walked).
 */
export const MAX_SHELTERS = 32;

/**
 * The shelters nearest the eye, world space (unused slots inside out: empty): the sas open on the street, the shops'
 * awnings, the bus shelter, the kiosk. Read by the falling rain and snow (nothing falls into them), the splashes and
 * drips (rain lands on their tops and runs off their edges) and the weather on the street's materials (`snowCover`:
 * no snow settles under them, no rain wets what stands there). Written by the `Precipitation` that last drew.
 */
export const STREET_SHELTERS = {
  shelterMin: { value: Array.from({ length: MAX_SHELTERS }, () => new THREE.Vector3(1, 1, 1)) },
  shelterMax: { value: Array.from({ length: MAX_SHELTERS }, () => new THREE.Vector3(-1, -1, -1)) },
};

/** GLSL: the shelters' uniforms, `sheltered(p)` (inside one), and `shelterTop(p)` (the roof over p, or -1e4). */
export const SHELTER_GLSL = /* glsl */ `
#ifndef STREET_SHELTERS
#define STREET_SHELTERS
#define SHELTERS ${MAX_SHELTERS}
uniform vec3 shelterMin[SHELTERS];
uniform vec3 shelterMax[SHELTERS];
bool sheltered(vec3 p) {
  for (int i = 0; i < SHELTERS; i++) {
    if (all(greaterThan(p, shelterMin[i])) && all(lessThan(p, shelterMax[i]))) return true;
  }
  return false;
}
float shelterTop(vec2 xz) {
  float top = -1e4;
  for (int i = 0; i < SHELTERS; i++) {
    if (all(greaterThan(xz, shelterMin[i].xz)) && all(lessThan(xz, shelterMax[i].xz))) top = max(top, shelterMax[i].y);
  }
  return top;
}
#endif
`;
