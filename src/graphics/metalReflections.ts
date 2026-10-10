import * as THREE from 'three';

/**
 * How much more of the reflections bare metal takes than a dielectric. A `metalness: 1` material
 * has no diffuse: all it shows is its specular, and the image-based part of it is the scene's
 * environment at `Environment`'s room strength (0.24 at most, less in a dim room or the magenta
 * arcade), so brass and steel read black away from a lamp's highlight. Only the specular of the
 * environment is raised, scaled by the metalness: paint, wood and cloth (metalness 0) are
 * untouched, and no room glows brighter.
 */
const METAL_IBL_BOOST = 3.2;

/**
 * Patches three's `lights_fragment_maps` chunk once for every `MeshStandardMaterial` of the page,
 * before any program compiles (called by `quality.ts` as it resolves `QUALITY`). A chunk edit
 * rather than a per-material patch: metal is made in dozens of places, and a forgotten one would
 * stay black.
 *
 * The environment has no idea what hides it, so the same patch occludes its specular a little:
 * - horizon occlusion (the reflected ray dipping under the surface, from a bump or a smoothed
 *   normal, sees the inside of the object, not the room);
 * - the boost leaves metal that faces down (the underside of a tap, a pipe under the sink, brass
 *   inside a cabinet: the places the studio's bright floor would otherwise light up), so a cavity
 *   no longer glows with full studio light.
 */
export function brightenMetalReflections(): void {
  const chunk = THREE.ShaderChunk.lights_fragment_maps;
  if (chunk.includes('METAL_IBL_BOOST')) return;
  THREE.ShaderChunk.lights_fragment_maps = `${chunk}
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( STANDARD )
  // METAL_IBL_BOOST (graphics/metalReflections.ts)
  {
    vec3 envReflect = reflect( - geometryViewDir, geometryNormal );
    float horizon = min( 1.0 + dot( envReflect, nonPerturbedNormal ), 1.0 );
    float facesUp = smoothstep( - 0.6, 0.3, inverseTransformDirection( geometryNormal, viewMatrix ).y );
    radiance *= horizon * horizon * mix( 1.0, ${METAL_IBL_BOOST.toFixed(2)}, metalnessFactor * facesUp );
  }
#endif
`;
}
