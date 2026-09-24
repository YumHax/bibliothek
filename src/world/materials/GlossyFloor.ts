import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** Reflection texture size: blurred anyway, so a modest one does. */
const TEXTURE_PX = 512;

/**
 * The reflection of a polished floor, laid a hair over it: the room rendered again from under the
 * floor (a `Reflector`), blurred over nine taps, added on top of the floor's own shading, faint
 * when looking down and strong at a grazing angle (Fresnel). Added light only: the alpha is left
 * alone. Only built with `QUALITY.reflections`; `strength` is the reflection at grazing incidence.
 */
export function glossyFloor(width: number, depth: number, strength: number): THREE.Mesh {
  const floor = new Reflector(new THREE.PlaneGeometry(width, depth), {
    textureWidth: TEXTURE_PX,
    textureHeight: TEXTURE_PX,
    clipBias: 0.003,
    multisample: 0,
    shader: GLOSSY_SHADER,
  });
  floor.name = 'GlossyFloor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.0015;
  const material = floor.material as THREE.ShaderMaterial;
  material.uniforms.strength.value = strength;
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  floor.receiveShadow = false;
  floor.castShadow = false;
  return floor;
}

const GLOSSY_SHADER = {
  name: 'GlossyFloorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    strength: { value: 0.2 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec3 sum = vec3(0.0);
      float spread = 0.01 * vUv.w;
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          sum += texture2DProj(tDiffuse, vUv + vec4(float(x) * spread, float(y) * spread, 0.0, 0.0)).rgb;
        }
      }
      vec3 toEye = normalize(cameraPosition - vWorld);
      float fresnel = 0.12 + 0.88 * pow(1.0 - clamp(toEye.y, 0.0, 1.0), 4.0);
      gl_FragColor = vec4(sum / 9.0 * strength * fresnel, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
