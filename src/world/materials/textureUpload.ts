import type * as THREE from 'three';

/** Texels (width x height) past which a texture is uploaded in an idle moment of its own (`uploadTexturesSpread`). */
const BIG_TEXTURE = 1 << 20;

function materialsOf(obj: THREE.Object3D): THREE.Material[] {
  const material = (obj as Partial<THREE.Mesh>).material;
  return Array.isArray(material) ? material : material ? [material] : [];
}

/** Every texture `root`'s materials hold, once each (render targets aside: their owner draws them). */
export function texturesOf(root: THREE.Object3D): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  root.traverse((obj) => {
    for (const m of materialsOf(obj)) {
      for (const value of Object.values(m)) {
        const texture = value as THREE.Texture | null;
        if (texture?.isTexture && !texture.isRenderTargetTexture) textures.add(texture);
      }
    }
  });
  return textures;
}

/**
 * Every texture of `root` uploaded (`renderer.initTexture`), an idle moment awaited after each big one (`BIG_TEXTURE`
 * texels, a facade atlas is 16 M), so a street's atlases, masks and night maps never go up in one frame (left to the
 * first draw, they did: a freeze the moment a window onto the street came into view).
 */
export async function uploadTexturesSpread(renderer: THREE.WebGLRenderer, root: THREE.Object3D, between: () => Promise<void>): Promise<void> {
  for (const texture of texturesOf(root)) {
    renderer.initTexture(texture);
    const image = texture.image as { width?: number; height?: number } | null;
    if ((image?.width ?? 0) * (image?.height ?? 0) >= BIG_TEXTURE) await between();
  }
}
