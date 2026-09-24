import * as THREE from 'three';
import { afterChunk, patchShader } from '@/world/materials/shaderPatch';

/** Layers of fur over the skin, and how far the outermost stands off it (metres). */
const SHELLS = 5;
const FUR_LENGTH = 0.006;
/** Strands per metre across the coat (a strand cell is 1 / this wide). */
const STRAND_DENSITY = 650;

/**
 * Shell fur: the furred parts of the cat drawn again `SHELLS` times, each copy pushed a little
 * further out along the normals and with more of its surface cut away (strands thin out towards
 * their tips), shading darker near the skin where the coat shadows itself. One instanced draw per
 * part (the shell index is the instance index), no blending (the gaps are discarded), no shadows.
 *
 * Each skin material gets one shell material (`shellMaterialFor`), kept in step by `sync` when the
 * coat or the hover glow changes.
 */
export class CatFur {
  private readonly shells = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();

  /** Grows fur on `mesh` (a child that shares its geometry and follows it). */
  grow(mesh: THREE.Mesh): void {
    const skin = mesh.material as THREE.MeshStandardMaterial;
    const fur = new THREE.InstancedMesh(mesh.geometry, this.shellMaterialFor(skin), SHELLS);
    fur.name = 'Fur';
    fur.castShadow = false;
    fur.receiveShadow = true;
    // Every instance sits exactly on the skin; the shader moves each out by its index.
    fur.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < SHELLS; i++) fur.setMatrixAt(i, new THREE.Matrix4());
    fur.frustumCulled = false;
    mesh.add(fur);
  }

  /** Copies colour, map and hover glow from each skin to its shells. */
  sync(): void {
    for (const [skin, shell] of this.shells) {
      shell.color.copy(skin.color);
      shell.map = skin.map;
      shell.emissive.copy(skin.emissive);
    }
  }

  private shellMaterialFor(skin: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    const existing = this.shells.get(skin);
    if (existing) return existing;
    const shell = new THREE.MeshStandardMaterial({ color: skin.color, map: skin.map, roughness: 1 });
    const uniforms = { furLength: { value: FUR_LENGTH }, strandDensity: { value: STRAND_DENSITY } };
    patchShader(shell, 'catFur', (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        `uniform float furLength;\nvarying vec3 vFurPos;\nvarying float vShell;\n` +
        afterChunk(
          shader.vertexShader,
          'begin_vertex',
          `vShell = (float(gl_InstanceID) + 1.0) / ${SHELLS.toFixed(1)};
          vFurPos = position;
          transformed += normal * furLength * vShell;`,
        );
      shader.fragmentShader =
        `uniform float strandDensity;\nvarying vec3 vFurPos;\nvarying float vShell;\n
        float strandHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }\n` +
        afterChunk(
          shader.fragmentShader,
          'map_fragment',
          `{
            vec3 cell = vFurPos * strandDensity;
            float strand = strandHash(floor(cell));
            // Round strands: the further from the cell's centre, the sooner they end.
            vec3 local = fract(cell) - 0.5;
            float thickness = 1.0 - length(local.xy + local.yz) * 0.9;
            if (strand * thickness < vShell * 0.85 + 0.1) discard;
            diffuseColor.rgb *= mix(0.62, 1.05, vShell);
          }`,
        );
    });
    this.shells.set(skin, shell);
    return shell;
  }
}
