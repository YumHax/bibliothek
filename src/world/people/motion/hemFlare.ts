import * as THREE from 'three';
import { spring } from '@/math/springs';
import { afterChunk, patchShader } from '../../materials/shaderPatch';

/*
 * The hem of an untucked top hangs off the body, so it moves a little on its own: a thigh coming
 * forward lifts the front off the belly, a leg going back pushes the back out, seated it rides up on
 * the lap, and it settles after a step with a little sway. Each vertex of the hem's band carries
 * which way is out there and how much of the lip it is (`hemOut`: out x, out z, lip 0..1; the band's
 * top hugs the body and stays); the push front, sides and back is a uniform (per person, a few
 * floats). Only the lip moves, by millimetres: the band's shadow stays the band's.
 */

/** How far (reference metres) the lip comes off the body per unit of a thigh's forward reach (front), backward reach (back), and with the walk (sides). */
const FRONT = 0.009;
const BACK = 0.004;
const SIDES = 0.0025;
/** The cloth's own sway after a change (rad/s, damping ratio): it trails the legs and overshoots a little. */
const OMEGA = 11;
const ZETA = 0.45;

const HEADER = /* glsl */ `
attribute vec3 hemOut;
uniform vec3 hemFlare;
`;

export class HemFlare {
  /** The lip's push off the body: front, sides, back (reference metres). */
  private readonly flare = { value: new THREE.Vector3() };
  private readonly state = [0, 0, 0, 0, 0, 0];
  private readonly down = new THREE.Vector3();

  /** Makes `material` (the hem band's) push its lip out by the flare (one program for every hem). */
  patch<M extends THREE.Material>(material: M): M {
    return patchShader(material, 'hemFlare', (shader) => {
      shader.uniforms.hemFlare = this.flare;
      shader.vertexShader = afterChunk(
        `${HEADER}${shader.vertexShader}`,
        'begin_vertex',
        /* glsl */ `{
          float front = max(hemOut.y, 0.0);
          float push = hemOut.z * (hemFlare.x * front + hemFlare.y * abs(hemOut.x) + hemFlare.z * max(-hemOut.y, 0.0));
          transformed.xz += hemOut.xy * push;
          transformed.y += hemOut.z * hemFlare.x * front * 0.45;
        }`,
      );
    });
  }

  /** A frame: the thighs' turns about their hips (`hip.quaternion` in the pelvis's frame). */
  update(dt: number, hipL: THREE.Quaternion, hipR: THREE.Quaternion): void {
    let forward = 0;
    let backward = 0;
    for (const hip of [hipL, hipR]) {
      const z = this.down.set(0, -1, 0).applyQuaternion(hip).z;
      forward = Math.max(forward, z);
      backward = Math.max(backward, -z);
    }
    const goals = [FRONT * Math.min(1, forward), SIDES * Math.min(1, (forward + backward) * 2), BACK * Math.min(1, backward * 2)];
    const s = this.state;
    for (let k = 0; k < 3; k++) [s[k * 2], s[k * 2 + 1]] = spring(s[k * 2]!, s[k * 2 + 1]!, goals[k]!, OMEGA, Math.min(dt, 0.05), ZETA);
    this.flare.value.set(Math.max(0, s[0]!), Math.max(0, s[2]!), Math.max(0, s[4]!));
  }
}
