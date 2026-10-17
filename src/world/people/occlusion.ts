import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { frameKey, framedSubject } from '@/graphics/framing';
import { damp } from '@/math/damp';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { isShared } from '../materials/sharedResources';
import type { PersonLook } from './looks';
import type { Rig } from './rig';

/*
 * How a body keeps light from itself, analytically (capsule occlusion, as Naughty Dog's games do it):
 * a fixed set of capsules along the bones (head, jaw, neck, trunk, upper arms, forearms, hands,
 * thighs, shins, a cap's peak or long hair's sides) in world space, as uniforms, and every material of
 * the person darkens the light that reaches it round them: the chin over the neck, the arms against
 * the flanks, the thighs on each other, a hand raised by the face. The ambient and the reflections
 * take it all, the lamps a little (a soft contact shadow under the shadow maps' texels). A convex part
 * never occludes itself (the cosine to its own axis is negative), so each capsule may sit inside the
 * surface it stands for. The capsules are read off the bones as the person is drawn (`onBeforeRender`,
 * once per render), so they match the frame exactly. No texture unit.
 *
 * Also here: the face's specular occlusion (no reflections in the eye sockets, under the nose and the
 * lower lip; `faceSpecularOcclusion`), and the portrait light of a conversation: the person framed
 * (`graphics/framing`) takes a soft warm fill from the camera's side and a faint rim, as a film lights
 * its dialogue, scaled to the frame's key so it reads the same in any room. Never a shadowed light. And always a faint
 * rim of the room's own light on the silhouette (`AMBIENT_RIM`), so people stand off the walls behind them.
 */

/** Capsules per person (fixed: one shader program for everyone). */
const OCCLUDERS = 16;
/** What the lamps' direct light keeps of the occlusion (the ambient and reflections take all of it). */
const DIRECT_SHARE = 0.3;
/** The portrait light's fill (times the frame's key) and its colour, its rim, and how fast it comes and goes (per second). */
const PORTRAIT_FILL = 0.35;
const PORTRAIT_COLOR = new THREE.Color(1, 0.86, 0.72);
const PORTRAIT_RIM = 0.5;
const PORTRAIT_RATE = 3;
/**
 * A faint rim of the room's own light where the body turns away from the viewer (always, not only in a conversation):
 * people stand off the walls behind them instead of melting into them. Times the ambient they already get.
 */
const AMBIENT_RIM = 0.45;
/** The capsules ease out between these distances from the viewer (m): further, an armpit or a chin's shade is under a pixel. */
const OCCLUSION_REACH = [8, 12] as const;
/** The framed subject belongs to this person when its owner is theirs and it is within this far (m, on the floor). */
const PORTRAIT_REACH = 0.9;

type Point = readonly [number, number, number];

/** One capsule in a bone's frame (reference metres): from `a` to `b`, its radius and how dark it gets. */
interface Occluder {
  bone: THREE.Object3D;
  a: Point;
  b: Point;
  radius: number;
  strength: number;
}

const FRAGMENT_PARS = /* glsl */ `
uniform vec4 personOccA[${OCCLUDERS}];
uniform vec4 personOccB[${OCCLUDERS}];
uniform float personOccNear;
uniform vec3 personPortrait;
uniform float personRim;
uniform float personAmbientRim;
`;

/** After three's own ambient occlusion: the capsules' occlusion, then the portrait light (itself a little occluded). */
const FRAGMENT_APPLY = /* glsl */ `
{
  // World position and normal from the view's (the view matrix is rigid: its inverse is its transpose).
  mat3 viewRotation = mat3(viewMatrix);
  vec3 occP = (-vViewPosition - viewMatrix[3].xyz) * viewRotation;
  vec3 occN = normal * viewRotation;
  float occ = 1.0;
  // Far off (a person a few pixels across) the loop is skipped: personOccNear eases it out.
  if (personOccNear > 0.0) {
    for (int i = 0; i < ${OCCLUDERS}; i++) {
      vec4 a = personOccA[i];
      vec4 b = personOccB[i];
      if (a.w <= 0.0) continue;
      vec3 ab = b.xyz - a.xyz;
      float t = clamp(dot(occP - a.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      vec3 d = a.xyz + ab * t - occP;
      float l2 = max(dot(d, d), 1e-6);
      // A sphere's cosine-weighted share of the sky, roughly: its solid angle times the cosine to it.
      float cosine = dot(occN, d) * inversesqrt(l2);
      float o = clamp(cosine, 0.0, 1.0) * min(1.0, a.w * a.w / l2);
      occ *= 1.0 - b.w * o;
    }
    occ = mix(1.0, occ, personOccNear);
  }
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= occ;
  {
    // The room's light at this point, as the ambient brought it (its colour, its level), wrapping the silhouette, lit from above.
    float edge = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    vec3 roomLight = min(reflectedLight.indirectDiffuse / max(material.diffuseColor, vec3(0.03)), vec3(4.0));
    reflectedLight.indirectDiffuse += roomLight * (material.diffuseColor * 0.55 + 0.035) * (edge * edge * edge) * clamp(normal.y * 0.5 + 0.6, 0.0, 1.0) * personAmbientRim;
  }
  reflectedLight.directDiffuse *= mix(1.0, occ, ${DIRECT_SHARE.toFixed(2)});
  #ifdef USE_SHEEN
    sheenSpecularIndirect *= occ;
  #endif
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= occ;
  #endif
  if (personPortrait.r + personPortrait.g + personPortrait.b > 0.0) {
    // A fill from the camera's side, a little above and to the left; a rim where the surface turns away, lit from above.
    float fill = clamp(dot(normal, normalize(vec3(-0.4, 0.35, 1.0))) * 0.65 + 0.35, 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * clamp(normal.y * 0.6 + 0.5, 0.0, 1.0);
    reflectedLight.indirectDiffuse += personPortrait * (material.diffuseColor * fill * occ + (material.diffuseColor * 0.6 + 0.04) * rim * personRim);
  }
}
`;

/**
 * The face's specular occlusion: the room's reflections (and a little of the lamps' highlights) kept out
 * of the creases the radial head cannot shade itself: the eye sockets, under the nose and its wings,
 * the corners of the mouth, under the lower lip. In the face's angles, read off the painted skin's UVs
 * (`radialSurface`: u = 0.5 + azimuth / 2pi, v = 0.5 + elevation / pi).
 */
const FACE_APPLY = /* glsl */ `
#ifdef USE_MAP
{
  float au = abs((vMapUv.x - 0.5) * 6.2831853);
  float fv = (vMapUv.y - 0.5) * 3.1415927;
  #define FACE_BELL(u0, v0, su, sv) exp(-0.5 * (((au - (u0)) / (su)) * ((au - (u0)) / (su)) + ((fv - (v0)) / (sv)) * ((fv - (v0)) / (sv))))
  float crease = 0.85 * FACE_BELL(0.37, 0.16, 0.13, 0.09)
    + 0.8 * FACE_BELL(0.0, -0.41, 0.13, 0.045)
    + 0.5 * FACE_BELL(0.16, -0.3, 0.06, 0.09)
    + 0.5 * FACE_BELL(0.27, -0.57, 0.045, 0.04)
    + 0.6 * FACE_BELL(0.0, -0.71, 0.17, 0.04);
  #undef FACE_BELL
  crease = clamp(crease, 0.0, 1.0);
  reflectedLight.indirectSpecular *= 1.0 - 0.85 * crease;
  reflectedLight.directSpecular *= 1.0 - 0.5 * crease;
  reflectedLight.indirectDiffuse *= 1.0 - 0.2 * crease;
}
#endif
`;

/** Patches the face's material (the painted head skin) with its specular occlusion. */
export function faceSpecularOcclusion(material: THREE.Material): void {
  if (!QUALITY.detailedMaterials) return;
  patchShader(material, 'faceSpecOcclusion', (shader) => {
    shader.fragmentShader = afterChunk(shader.fragmentShader, 'aomap_fragment', FACE_APPLY);
  });
}

/** Is `object` inside `ancestor`'s tree (or `ancestor` itself)? */
function isWithin(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

/** One person's capsules and portrait light: built from the rig, patched onto every material of theirs, refreshed as they are drawn. */
export class PersonOcclusion {
  private readonly occluders: Occluder[];
  private readonly a = new Float32Array(OCCLUDERS * 4);
  private readonly b = new Float32Array(OCCLUDERS * 4);
  private readonly uniforms = {
    personOccA: { value: this.a },
    personOccB: { value: this.b },
    personOccNear: { value: 1 },
    personPortrait: { value: new THREE.Color(0, 0, 0) },
    personRim: { value: PORTRAIT_RIM },
    personAmbientRim: { value: AMBIENT_RIM },
  };
  private lastFrame = -1;
  private portrait = 0;
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  /** Null when the materials are plain (`QUALITY.detailedMaterials` off). */
  static build(rig: Rig, look: PersonLook): PersonOcclusion | null {
    return QUALITY.detailedMaterials ? new PersonOcclusion(rig, look) : null;
  }

  private constructor(rig: Rig, look: PersonLook) {
    const build = look.build;
    const list: Occluder[] = [
      { bone: rig.skull, a: [0, 0, 0], b: [0, 0, 0], radius: 0.09, strength: 0.5 },
      { bone: rig.skull, a: [0, -0.075, 0.045], b: [0, -0.075, 0.045], radius: 0.05, strength: 0.6 },
      { bone: rig.head, a: [0, -0.09, 0], b: [0, 0.03, 0], radius: 0.05, strength: 0.6 },
      { bone: rig.chest, a: [0, -0.2, 0], b: [0, 0.15, 0], radius: 0.12 * build, strength: 0.6 },
    ];
    for (const arm of rig.arms) {
      list.push(
        { bone: arm.shoulder, a: [0, 0, 0], b: [0, -0.3, 0], radius: 0.046, strength: 0.7 },
        { bone: arm.elbow, a: [0, 0, 0], b: [0, -0.27, 0], radius: 0.036, strength: 0.7 },
        { bone: arm.wrist, a: [0, -0.01, 0], b: [0, -0.09, 0], radius: 0.034, strength: 0.6 },
      );
    }
    for (const leg of rig.legs) {
      list.push({ bone: leg.hip, a: [0, 0, 0], b: [0, -0.42, 0], radius: 0.068, strength: 0.7 }, { bone: leg.knee, a: [0, 0, 0], b: [0, -0.4, 0], radius: 0.046, strength: 0.6 });
    }
    // A cap's peak shades the brow; long hair hangs by the cheeks and the neck.
    if (look.hat === 'cap') list.push({ bone: rig.skull, a: [-0.05, 0.045, 0.12], b: [0.05, 0.045, 0.12], radius: 0.032, strength: 0.7 });
    if (look.hairStyle === 'long') {
      for (const side of [-1, 1] as const) list.push({ bone: rig.skull, a: [side * 0.085, -0.02, -0.03], b: [side * 0.1, -0.21, -0.05], radius: 0.035, strength: 0.6 });
    }
    this.occluders = list.slice(0, OCCLUDERS);
  }

  /**
   * Gives every material of `person` (theirs alone: nothing shared, nothing see-through) the capsules and
   * the portrait light, and has each of their meshes refresh the capsules as it is drawn.
   */
  patch(person: THREE.Object3D, skip: THREE.Object3D): void {
    const uniforms = this.uniforms;
    const refresh = (renderer: THREE.WebGLRenderer): void => this.refresh(renderer.info.render.frame);
    const seen = new Set<THREE.Material>();
    person.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o === skip || mesh.name === 'ContactShadow') return;
      let mine = false;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || material.transparent || !material.visible || isShared(material)) continue;
        mine = true;
        if (seen.has(material)) continue;
        seen.add(material);
        patchShader(material, 'personOcclusion', (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = afterChunk(FRAGMENT_PARS + shader.fragmentShader, 'aomap_fragment', FRAGMENT_APPLY);
        });
      }
      if (!mine) return;
      const before = mesh.onBeforeRender;
      mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
        before.call(mesh, renderer, scene, camera, geometry, material, group);
        refresh(renderer);
      };
    });
  }

  /**
   * The portrait light, eased in while a conversation frames this person (`graphics/framing`: the subject
   * is under `person`'s owner and by them) and out after; scaled to the frame's key.
   */
  updatePortrait(dt: number, person: THREE.Object3D): void {
    const subject = framedSubject();
    let wanted = 0;
    if (subject && person.parent && isWithin(subject, person.parent)) {
      subject.getWorldPosition(this.p);
      person.getWorldPosition(this.q);
      if (Math.hypot(this.p.x - this.q.x, this.p.z - this.q.z) < PORTRAIT_REACH) wanted = 1;
    }
    if (wanted === 0 && this.portrait === 0) return;
    this.portrait = damp(this.portrait, wanted, PORTRAIT_RATE, dt);
    if (wanted === 0 && this.portrait < 0.01) this.portrait = 0;
    this.uniforms.personPortrait.value.copy(PORTRAIT_COLOR).multiplyScalar(this.portrait * PORTRAIT_FILL * frameKey());
    this.uniforms.personRim.value = PORTRAIT_RIM;
  }

  /**
   * How far the viewer is (metres, as the level of detail measures it): the capsules ease out over
   * `OCCLUSION_REACH`, past which neither the shader's loop nor the capsules' refresh runs (the street's
   * crowd is mostly that far off).
   */
  reach(distance: number): void {
    this.uniforms.personOccNear.value = 1 - THREE.MathUtils.smoothstep(distance, OCCLUSION_REACH[0], OCCLUSION_REACH[1]);
  }

  /** The capsules in world space from the bones' world matrices (current while the frame is drawn), once per render. */
  private refresh(frame: number): void {
    if (frame === this.lastFrame || this.uniforms.personOccNear.value <= 0) return;
    this.lastFrame = frame;
    const { a, b, p, q, scale } = this;
    for (let i = 0; i < OCCLUDERS; i++) {
      const o = this.occluders[i];
      if (!o) {
        a[i * 4 + 3] = 0;
        continue;
      }
      const m = o.bone.matrixWorld;
      p.set(o.a[0], o.a[1], o.a[2]).applyMatrix4(m);
      q.set(o.b[0], o.b[1], o.b[2]).applyMatrix4(m);
      scale.setFromMatrixScale(m);
      a[i * 4] = p.x;
      a[i * 4 + 1] = p.y;
      a[i * 4 + 2] = p.z;
      a[i * 4 + 3] = o.radius * Math.max(scale.x, scale.y, scale.z);
      b[i * 4] = q.x;
      b[i * 4 + 1] = q.y;
      b[i * 4 + 2] = q.z;
      b[i * 4 + 3] = o.strength;
    }
  }
}
