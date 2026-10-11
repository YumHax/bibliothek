import * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { isShared } from '../materials/sharedResources';

/** How many lamps past the real lights wash the walls, the trees and the cars round them (the nearest after those). */
export const WASH_SLOTS = 12;
/** The wash's reach: at this distance (m) a lamp gives half its light; and how strong it is at the lamp. */
const HALF_AT = 5;
const STRENGTH = 0.9;
/** How much of the BRDF's highlight the wash adds (a wash spreads the lamp: its highlight is a little softer than a bulb's). */
const SPECULAR = 0.8;

/**
 * The light of the street lamps that have no real light (`StreetLamps` lends real point lights to the few nearest the
 * player): an analytic term patched into the materials it washes, so the facades, the trees' undersides and the cars
 * all down the street are lit warm by every lamp at night, not only the four nearest, with each lamp's highlight on
 * what is glossy (wet paint, glass, the setts after rain: the material's own GGX). Each slot is a lamp's head (world
 * xyz) and how lit it is (w: 0 off); the owner writes them every frame. No shadow, no texture unit: ALU only.
 */
export class LampWash {
  readonly uniforms = {
    lampWash: { value: Array.from({ length: WASH_SLOTS }, () => new THREE.Vector4()) },
    lampWashColor: { value: new THREE.Color() },
  };
  private readonly washed = new WeakSet<THREE.Material>();

  /** Patches every lit material under `roots` that is not shared with the rest of the page (a palette look stays as it is). */
  over(roots: readonly THREE.Object3D[]): void {
    for (const root of roots) {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.patch(material);
      });
    }
  }

  private patch(material: THREE.Material): void {
    if (!(material instanceof THREE.MeshStandardMaterial) || isShared(material) || this.washed.has(material)) return;
    this.washed.add(material);
    patchShader(material, 'lampWash', (shader) => {
      shader.uniforms.lampWash = this.uniforms.lampWash;
      shader.uniforms.lampWashColor = this.uniforms.lampWashColor;
      shader.fragmentShader =
        `uniform vec4 lampWash[${WASH_SLOTS}];\nuniform vec3 lampWashColor;\n` +
        afterChunk(shader.fragmentShader, 'lights_fragment_end', /* glsl */ `
          for ( int i = 0; i < ${WASH_SLOTS}; i ++ ) {
            vec4 lamp = lampWash[ i ];
            if ( lamp.w <= 0.0 ) continue;
            vec3 toLamp = ( viewMatrix * vec4( lamp.xyz, 1.0 ) ).xyz - geometryPosition;
            float d2 = dot( toLamp, toLamp );
            vec3 lampDir = toLamp * inversesqrt( d2 );
            float facing = max( dot( normal, lampDir ), 0.0 );
            vec3 lampIrradiance = lampWashColor * ( lamp.w * ${STRENGTH.toFixed(2)} * facing / ( 1.0 + d2 / ${(HALF_AT * HALF_AT).toFixed(1)} ) );
            reflectedLight.directDiffuse += lampIrradiance * diffuseColor.rgb;
            // The lamp's highlight too (the material's own BRDF): wet paint, glass and setts down the street catch it.
            reflectedLight.directSpecular += lampIrradiance * BRDF_GGX( lampDir, geometryViewDir, normal, material ) * ${SPECULAR.toFixed(2)};
          }
        `);
    });
  }
}
