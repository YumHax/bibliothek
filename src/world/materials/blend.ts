import * as THREE from 'three';

/*
 * Blending that never touches the canvas's alpha: it is the video cut-out (docs/graphics.md), so a
 * glow, a veil or a reflection drawn with three's own blendings (which write their alpha) would punch
 * holes in the frame. Each helper sets the colour equation and keeps the destination's alpha
 * (source alpha factor 0, destination 1), marks the material transparent and returns it. The depth
 * write is the caller's (most of these skip it, some through `onSurface`).
 * `coverageKeepsAlpha` (`palette`) is the same rule for alpha-to-coverage cut-outs.
 */

function keepAlpha<M extends THREE.Material>(material: M, src: THREE.BlendingSrcFactor, dst: THREE.BlendingDstFactor): M {
  material.transparent = true;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = src;
  material.blendDst = dst;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

/** Light added, scaled by the fragment's alpha (and the material's opacity): glows, pools, beams, sparks. */
export function additive<M extends THREE.Material>(material: M): M {
  return keepAlpha(material, THREE.SrcAlphaFactor, THREE.OneFactor);
}

/** Light added as it is (alpha ignored): a reflection rendered on black, a slate's glow. */
export function additiveOne<M extends THREE.Material>(material: M): M {
  return keepAlpha(material, THREE.OneFactor, THREE.OneFactor);
}

/** Ordinary transparency (the colour laid over by its alpha): rain, steam, scuffs, ripples. */
export function overKeepingAlpha<M extends THREE.Material>(material: M): M {
  return keepAlpha(material, THREE.SrcAlphaFactor, THREE.OneMinusSrcAlphaFactor);
}
