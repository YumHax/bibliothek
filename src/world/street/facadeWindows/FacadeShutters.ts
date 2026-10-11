import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TriBuilder } from '../relief/TriBuilder';
import { snowCovered } from '../snowCover';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { hashInts } from '@/random';

/**
 * What moves in the near facades' windows (`casementParts`), each leaf swinging on its hinge in the vertex shader (its
 * shadow too), so a whole street of them costs one draw call and no per-frame upload. The louvred shutters fold back
 * against the wall by day, a good part of the residents close them at bedtime (each window its own hour) and open them
 * in the morning, and on a hot summer afternoon some are pulled to against the sun. On a hot day some windows stand
 * open too: their two casements swing in, behind the wall (out of sight, as an open window's leaves are), and the room's
 * dark shows in the opening. A window with a flower box on its sill keeps its shutters open (they would close through
 * the box). The clock is one uniform (`update`).
 */
export class FacadeShutters extends THREE.Mesh {
  private readonly state: THREE.Vector4;

  constructor(geometry: THREE.BufferGeometry) {
    const state = { value: new THREE.Vector4() };
    const swing = (material: THREE.Material, key: string): THREE.Material =>
      patchShader(material, key, (shader) => {
        shader.uniforms.shutterState = state;
        shader.vertexShader = SWING_PARS + shader.vertexShader;
        if (shader.vertexShader.includes('#include <beginnormal_vertex>')) shader.vertexShader = afterChunk(shader.vertexShader, 'beginnormal_vertex', 'if (shutterHinge.w < 4.5) objectNormal.xz = shutterTurn(objectNormal.xz);');
        shader.vertexShader = afterChunk(shader.vertexShader, 'begin_vertex', SWING_VERTEX);
      });
    super(geometry, swing(snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })), 'facadeShutterSwing'));
    this.customDepthMaterial = swing(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'facadeShutterSwingDepth') as THREE.MeshDepthMaterial;
    this.state = state.value;
    this.name = 'FacadeShutters';
    this.castShadow = true;
    this.receiveShadow = true;
    // The leaves swing out of their resting bounds.
    this.frustumCulled = false;
  }

  /** The game's hour and how hot the day is (0 .. 1: summer under a clear sky). */
  update(hours: number, heat: number): void {
    this.state.set(hours, heat, 0, 0);
  }
}

/** What a leaf is, added to its window's draw in `shutterHinge.w`: a shutter (draw 0..1, `FIXED` never closing), a casement (`SASH` + draw, never opening at `SASH + 1`), the dark of an opening (`OPENING` + draw). */
const FIXED = 2;
const SASH = 3;
const OPENING = 5;

/*
 * A leaf's swing: its hinge (object space x, z; an opening's: its foot's height in y), which way it turns (+1 or -1)
 * and what it is with its window's draw (see `FIXED`, `SASH`, `OPENING`). Shutters close at night for draws under 0.42
 * (bed between 21:30 and 24:00, up between 6:20 and 8:30, each by its draw) and are pulled to most of the way on a hot
 * afternoon for those up to 0.68 (13:00-15:00 to 18:00-20:00); casements stand open on a hot day for draws from 0.55 to
 * 0.85 (from 9:30-12:00 to 19:00-21:00), swung in about 80 degrees, the room's dark shown in the opening meanwhile.
 */
const SWING_PARS = /* glsl */ `
attribute vec4 shutterHinge;
uniform vec4 shutterState;
float shutterRamp(float h, float at) { return smoothstep(at, at + 0.05, h); }
float sashOpen(float k) {
  if (k < 0.55 || k >= 0.85 || shutterState.y < 0.3) return 0.0;
  float h = shutterState.x;
  return shutterRamp(h, 9.5 + fract(k * 13.7) * 2.5) * (1.0 - shutterRamp(h, 19.0 + fract(k * 7.9) * 2.0));
}
vec2 shutterTurn(vec2 p) {
  float id = shutterHinge.w;
  float h = shutterState.x;
  float amount = 0.0;
  if (id < 0.42) {
    float bed = 21.5 + id * 5.9;
    float wake = 6.3 + fract(id * 37.1) * 2.2;
    amount = h >= 12.0 ? shutterRamp(h, bed) : 1.0 - shutterRamp(h, wake);
  } else if (id < 0.68) {
    float from = 13.0 + fract(id * 11.3) * 2.0;
    float to = 18.0 + fract(id * 5.7) * 2.0;
    amount = 0.86 * shutterState.y * shutterRamp(h, from) * (1.0 - shutterRamp(h, to));
  } else if (id >= ${SASH.toFixed(1)} && id < ${(SASH + 1).toFixed(1)}) {
    amount = 0.45 * sashOpen(id - ${SASH.toFixed(1)});
  }
  float a = shutterHinge.z * 3.14159265 * amount;
  float c = cos(a);
  float s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}
`;

const SWING_VERTEX = /* glsl */ `
if (shutterHinge.w >= ${OPENING.toFixed(1)}) transformed.y = mix(transformed.y, shutterHinge.x, step(0.02, sashOpen(shutterHinge.w - ${OPENING.toFixed(1)})));
else transformed.xz = shutterHinge.xy + shutterTurn(transformed.xz - shutterHinge.xy);
`;

/** One leaf on its way into the merged geometry: its triangles and its `shutterHinge` (an opening's: its x per vertex). */
interface Leaf {
  geometry: THREE.BufferGeometry;
  hinge: [number, number, number, number];
  opening?: boolean;
}

/** What a leaf is: a shutter, a casement, the dark of an opening. */
type LeafKind = 'shutter' | 'sash' | 'opening';

/** Collects the leaves `casementParts` builds and merges them with their hinges (`build`). */
export class ShutterLeaves {
  private readonly leaves: Leaf[] = [];
  private readonly point = new THREE.Vector3();

  get isEmpty(): boolean {
    return this.leaves.length === 0;
  }

  /**
   * A leaf: `draw` builds its triangles (in the facade frame `m`), hinged at (s, out) of that frame, turning `turn`
   * (a shutter: +1 for a leaf right of its hinge, -1 left of it, each swinging out over the window; a casement the other
   * way, swinging in); `window`: the window's own number (its leaves move together); `fixed`: it never moves. An
   * opening's dark (`kind` 'opening') is a quad at the window, `s` its foot's height: laid flat there (no area: nothing
   * to see, nothing in the wall's plane) and stood up to its height while its casements are open.
   */
  leaf(kind: LeafKind, m: THREE.Matrix4, s: number, out: number, turn: 1 | -1, window: number, fixed: boolean, draw: (b: TriBuilder) => void): void {
    const b = new TriBuilder();
    draw(b);
    if (b.isEmpty) return;
    const k = (hashInts(window * 7919 + 13) % 1000) / 1000;
    if (kind === 'opening') {
      if (!fixed) this.leaves.push({ geometry: b.build(), hinge: [0, s, 0, OPENING + k], opening: true });
      return;
    }
    const hinge = this.point.set(s, 0, out).applyMatrix4(m);
    const id = kind === 'shutter' ? (fixed ? FIXED : k) : SASH + (fixed ? 1 : k);
    this.leaves.push({ geometry: b.build(), hinge: [hinge.x, hinge.z, turn, id] });
  }

  build(): THREE.BufferGeometry {
    for (const { geometry, hinge, opening } of this.leaves) {
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const count = position.count;
      const data = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        data.set(hinge, i * 4);
        // An opening: each corner's own height kept in x, the corner laid down at its foot.
        if (opening) {
          data[i * 4] = position.getY(i);
          position.setY(i, hinge[1]);
        }
      }
      geometry.setAttribute('shutterHinge', new THREE.BufferAttribute(data, 4));
    }
    const merged = mergeGeometries(this.leaves.map((l) => l.geometry))!;
    for (const l of this.leaves) l.geometry.dispose();
    merged.computeBoundingSphere();
    return merged;
  }
}
