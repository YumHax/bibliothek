import * as THREE from 'three';
import { FLOOR, onSurface } from '@/world/surface/layers';

/**
 * The placement grid drawn on a surface round a carried piece: thin lines every `cell` metres from `origin`
 * (plane-local, metres), fading out `radius` from `centre`. Unlit, no depth write, alpha kept for the canvas's
 * cut-out (normal blending over an opaque floor leaves it at 1).
 */
export function gridMaterial(cell: number): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uCell: { value: cell },
      uOrigin: { value: new THREE.Vector2() },
      uCentre: { value: new THREE.Vector2() },
      uRadius: { value: 1.4 },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.32 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPlane;
      void main() {
        vPlane = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uCell;
      uniform vec2 uOrigin;
      uniform vec2 uCentre;
      uniform float uRadius;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vPlane;
      void main() {
        vec2 p = (vPlane - uOrigin) / uCell;
        vec2 width = fwidth(p);
        vec2 toLine = abs(fract(p - 0.5) - 0.5) / max(width, vec2(1e-4));
        float line = 1.0 - min(min(toLine.x, toLine.y), 1.0);
        float fade = 1.0 - smoothstep(uRadius * 0.45, uRadius, distance(vPlane, uCentre));
        float alpha = line * fade * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return onSurface(material, FLOOR.placement);
}
