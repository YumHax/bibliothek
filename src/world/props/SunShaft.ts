import * as THREE from 'three';
import { IQ_HASH, SINE_HASH, valueNoise3 } from '@/graphics/glslNoise';
import { RENDER_ORDER } from '@/world/surface/layers';
import { POINT_SCALE, scalesPoints } from '@/world/particles/pointScale';
import { additive } from '@/world/materials/blend';
import BEAM_VERTEX from './SunShaftBeam.vert.glsl?raw';
import MOTE_VERTEX from './SunShaftMote.vert.glsl?raw';
import MOTE_FRAGMENT from './SunShaftMote.frag.glsl?raw';
import sunShaftBeamFrag from './SunShaftBeam.frag.glsl?raw';
import { assemble } from '@/graphics/glslAssemble';
import { random } from '@/random';

interface SunShaftOptions {
  /** Glazed opening, metres (the shaft's section at the glass). */
  width: number;
  height: number;
  /** Mullion grid of the window, so the beam carries its bars. */
  columns: number;
  rows: number;
  /** Local y of the floor (the window's origin is the centre of the glass). */
  floorY: number;
}

/** Longest beam: a low sun would otherwise throw a shaft across the whole flat. */
const MAX_LENGTH = 4.5;
/** Brightness of the beam per unit of sun intensity (additive, linear light). */
const BEAM_STRENGTH = 0.022;
const MOTES = 180;
const MOTE_STRENGTH = 0.9;

/** Adds colour without touching the alpha: a beam across a playing video lights it instead of blacking it out. */
function glowing(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
  material.depthWrite = false;
  return additive(material);
}

/**
 * The sunbeam through a window: the glazed opening swept along the sun's rays down to the floor,
 * drawn as a faint additive volume (its far side, so it still shows from inside the beam),
 * striped by the mullions (each fragment is traced back along the ray to the glass and tested
 * against the grid), brightest near the glass and shimmering slowly; and the dust floating in it,
 * points drifting on slow noise that only show in the light. Window-local: +z into the room.
 * `setSun` takes the direction towards the sun in the window's frame (as `RoomWindow` computes it).
 */
export class SunShaft extends THREE.Group {
  private readonly beam: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: {
    time: THREE.IUniform<number>;
    rayDir: THREE.IUniform<THREE.Vector3>;
    color: THREE.IUniform<THREE.Color>;
    strength: THREE.IUniform<number>;
    beamLength: THREE.IUniform<number>;
    opening: THREE.IUniform<THREE.Vector4>;
    eye: THREE.IUniform<THREE.Vector3>;
  };

  constructor(private readonly options: SunShaftOptions) {
    super();
    this.name = 'SunShaft';
    const { width, height, columns, rows } = options;
    this.uniforms = {
      time: { value: 0 },
      rayDir: { value: new THREE.Vector3(0, -0.5, 1).normalize() },
      color: { value: new THREE.Color(0xffffff) },
      strength: { value: 0 },
      beamLength: { value: 1 },
      opening: { value: new THREE.Vector4(width, height, columns, rows) },
      eye: { value: new THREE.Vector3() },
    };

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    // Two quads (at the glass, at the far end) joined by four sides: a skewed box, wound inwards so
    // the faces drawn are the far side of the volume (what the eye looks through the beam to).
    beamGeometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    this.beam = new THREE.Mesh(
      beamGeometry,
      glowing(
        new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: BEAM_VERTEX,
          fragmentShader: BEAM_FRAGMENT,
        }),
      ),
    );
    this.beam.frustumCulled = false;
    this.beam.renderOrder = RENDER_ORDER.sheen;
    // The camera in the window's frame, for the march (cheaper here than a matrix inverse per fragment).
    this.beam.onBeforeRender = (_renderer, _scene, camera) => {
      this.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
      this.worldToLocal(this.uniforms.eye.value);
    };

    // Dust: fixed seeds in the unit prism (u, v across the opening, t along the beam), placed by the shader.
    const seeds = new Float32Array(MOTES * 3);
    const phases = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      seeds[i * 3] = random() - 0.5;
      seeds[i * 3 + 1] = random() - 0.5;
      seeds[i * 3 + 2] = Math.pow(random(), 1.4);
      phases[i] = random() * 100;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    moteGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.motes = new THREE.Points(
      moteGeometry,
      glowing(
        new THREE.ShaderMaterial({
          uniforms: { ...this.uniforms, moteStrength: { value: MOTE_STRENGTH }, pointScale: POINT_SCALE },
          vertexShader: MOTE_VERTEX,
          fragmentShader: MOTE_FRAGMENT,
        }),
      ),
    );
    this.motes.frustumCulled = false;
    this.motes.renderOrder = RENDER_ORDER.sheen;
    scalesPoints(this.motes);

    for (const object of [this.beam, this.motes]) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
    this.add(this.beam, this.motes);
    this.visible = false;
  }

  /**
   * The sun, as `RoomWindow` sees it: `towardSun` (window frame, unit), its colour and the
   * intensity of the spot it throws (0 hides the shaft).
   */
  setSun(towardSun: THREE.Vector3, color: THREE.Color, intensity: number): void {
    const inward = this.uniforms.rayDir.value.copy(towardSun).negate();
    // Only a sun in front of the wall and above the horizon throws a beam into the room.
    this.visible = intensity > 0 && inward.z > 0.05 && inward.y < -0.02;
    if (!this.visible) return;
    this.uniforms.color.value.copy(color);
    this.uniforms.strength.value = intensity * BEAM_STRENGTH;
    const { width: w, height: h, floorY } = this.options;
    // Until the rays from the top of the glass reach the floor (the far edge of the sun patch), no
    // longer than MAX_LENGTH; the part of the volume that dips under the floor is hidden by it.
    const length = Math.min(MAX_LENGTH, Math.max(0.5, (floorY - h / 2) / inward.y));
    this.uniforms.beamLength.value = length;
    const position = this.beam.geometry.getAttribute('position') as THREE.BufferAttribute;
    const corners: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    corners.forEach(([x, y], i) => {
      position.setXYZ(i, x, y, 0.01);
      position.setXYZ(i + 4, x + inward.x * length, y + inward.y * length, 0.01 + inward.z * length);
    });
    position.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.visible) this.uniforms.time.value += dt;
  }
}

/** Window-local position of the fragment, for the shader to trace it back to the glass. */

/**
 * The beam is shaded by what reaches the eye through it, approximated per fragment of its back
 * face: the ray from the camera to the fragment is sampled at a few points inside the volume,
 * each traced back to the glass along the sun's direction to see if a mullion shades it, and
 * weighted by how far along the beam it is (fading out towards the floor) and a slow noise (the
 * air moving). Far side only, so the camera may stand inside the beam.
 */
const BEAM_FRAGMENT = assemble(sunShaftBeamFrag, { chunks: { valueNoise3_noise: valueNoise3('noise', 'iqHash'), iq_hash: IQ_HASH, sine_hash: SINE_HASH } });
