import * as THREE from 'three';
import { patchShader } from '../materials/shaderPatch';
import { isShared } from '../materials/sharedResources';

/** The sun's shadow fades out over this outer share of its map (the square of street round the player): no hard edge. */
const EDGE_FADE = 0.15;

const RETURN = 'return mix( 1.0, shadow, shadowIntensity );';

/**
 * The shadow chunk with `getShadow` (directional and spot maps; the point lights' is another
 * function) fading its shadow to none towards the map's border. Out here the only shadow-casting
 * light is the sun (`StreetLighting`), whose map is a square round the player: without this its
 * shadows stop dead along that square's edge, 28 m out.
 */
function fadingShadowChunk(): string {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const at = chunk.indexOf(RETURN);
  if (at < 0) throw new Error('[shadowFade] getShadow has changed');
  const fade = /* glsl */ `
		float shadowEdge = max( abs( shadowCoord.x - 0.5 ), abs( shadowCoord.y - 0.5 ) ) * 2.0;
		shadow = mix( shadow, 1.0, smoothstep( ${(1 - EDGE_FADE).toFixed(3)}, 1.0, shadowEdge ) );
		`;
  return chunk.slice(0, at) + fade + chunk.slice(at);
}

/**
 * Patches every lit, shadow-receiving material under `root` that is the street's own (palette
 * materials are shared with the flat, whose window suns must keep their edges: those are left
 * alone) so the sun's shadow fades out at its map's border. Call once, when the street is built,
 * before anything has compiled.
 */
export function fadeSunShadowEdges(root: THREE.Object3D): void {
  const chunk = fadingShadowChunk();
  const done = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.receiveShadow) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(material) || isShared(material)) continue;
      done.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshPhongMaterial)) continue;
      patchShader(material, 'streetShadowFade', (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', chunk);
      });
    }
  });
}
