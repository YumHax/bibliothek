import * as THREE from 'three';
import { patchShader } from './shaderPatch';
import { isShared } from './sharedResources';

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

/**
 * Light added, scaled by the fragment's alpha (and the material's opacity): glows, pools, beams, sparks.
 * A fogged one fades to black in the haze (`fogsToBlack`), never to the fog's colour.
 */
export function additive<M extends THREE.Material>(material: M): M {
  return fogsToBlack(keepAlpha(material, THREE.SrcAlphaFactor, THREE.OneFactor));
}

/**
 * Light that is added fades out with distance in fog, it does not turn fog-coloured: three's fog
 * mixes every fragment towards `fogColor`, so a lamp's pool far down a misty street would add
 * `fogColor x alpha` and show as a grey blob. Here the material's own fog step mixes towards black
 * instead (its `fogColor` read as black inside that step only; the scene's fog shaping stays).
 * Nothing changes for a material without fog, or whose shader has no fog step.
 */
function fogsToBlack<M extends THREE.Material>(material: M): M {
  if (!(material as { fog?: boolean }).fog || isShared(material)) return material;
  return patchShader(material, 'fogsToBlack', (shader) => {
    const include = '#include <fog_fragment>';
    if (!shader.fragmentShader.includes(include)) return;
    // The sun's glow in the haze (`graphics/heightFog`'s `fogSunColor`) is added to the fog's colour: black too, or a lamp's pool would light up round a low sun.
    shader.fragmentShader = shader.fragmentShader.replace(include, `#define fogColor vec3(0.0)\n#define fogSunColor vec3(0.0)\n${include}\n#undef fogSunColor\n#undef fogColor`);
  });
}

/** Light added as it is (alpha ignored): a reflection rendered on black, a slate's glow. */
export function additiveOne<M extends THREE.Material>(material: M): M {
  return keepAlpha(material, THREE.OneFactor, THREE.OneFactor);
}

/** Ordinary transparency (the colour laid over by its alpha): rain, steam, scuffs, ripples. */
export function overKeepingAlpha<M extends THREE.Material>(material: M): M {
  return keepAlpha(material, THREE.SrcAlphaFactor, THREE.OneMinusSrcAlphaFactor);
}
