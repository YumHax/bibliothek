import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { EYE_DIRECTION, headPoint, type FaceShape } from './head';
import type { PersonLook } from './looks';
import { cachedTexture } from './textureCache';
import { skin as skinMaterial } from '../materials/finishes';
import { QUALITY } from '@/graphics/quality';
import { afterChunk, patchShader } from '../materials/shaderPatch';

/*
 * Eyes at real scale, set into the sockets of the head: an eyeball (a glossy sphere painted with
 * the iris and pupil) that turns on its own to follow the gaze, framed by an upper and a lower lid
 * (shells of skin just outside the ball, the lash line darker). A blink rotates the upper lid down
 * over the ball. Most of each ball is buried in the head, so only the almond between the lids shows.
 * The upper lid carries the lashes (a fine dark tube along its edge); both lids tilt a little at
 * the outer corner, up or down by the face; the ball's reflections dim where the lids shade it.
 */

const BALL_R = 0.012;
const LID_R = 0.0129;
/** Polar angle (from the top) of the lids' edges when open. */
const UPPER_EDGE = Math.PI * 0.4;
const LOWER_EDGE = Math.PI * 0.62;
/** How far the upper lid rotates to meet the lower one. */
export const BLINK_ANGLE = LOWER_EDGE - UPPER_EDGE + 0.03;

export interface Eye {
  /** At the centre of the ball, in the head's frame. */
  group: THREE.Group;
  /** Turns with the gaze. */
  ball: THREE.Mesh;
  /** Turns down to blink and a little with the gaze. */
  upperLid: THREE.Mesh;
  /** Rides up a little in a squint or a real smile. */
  lowerLid: THREE.Mesh;
}

export function buildEyes(look: PersonLook, shape: FaceShape): [Eye, Eye] {
  // A wet eye: the lights and the room shine sharp on the cornea's coat, over the iris's own softer sheen.
  const ballMaterial = wetEye({ map: cachedTexture(`eye|${look.eyes}`, () => eyeTexture(look.eyes)), roughness: 0.2 });
  const lidMaterial = skinMaterial({ vertexColors: true, roughness: 0.66 });
  const skin = new THREE.Color(look.skin);
  const lash = new THREE.Color(0x17110e).lerp(new THREE.Color(look.hair), 0.2);
  const surface = headPoint(EYE_DIRECTION, shape);
  const lashMaterial = new THREE.MeshStandardMaterial({ color: lash, roughness: 0.8 });
  // The outer corners up or down a little, fixed by the face (no draw: the nose's size stands in for a seed).
  const tilt = ((look.nose * 97.3) % 1 - 0.5) * 0.16;
  const make = (side: -1 | 1): Eye => {
    const group = new THREE.Group();
    group.position.set(side * surface.x, surface.y, surface.z - 0.0085);
    const ball = new THREE.Mesh(ballGeometry(), ballMaterial);
    const upper = lidGeometry(0, UPPER_EDGE, skin, lash, 'bottom').rotateZ(side * tilt);
    const upperLid = new THREE.Mesh(upper, lidMaterial);
    // The lashes along the upper lid's edge, the front half (the rest is in the head), curling a touch outwards.
    const edge = LID_R * Math.sin(UPPER_EDGE) + 0.0003;
    const lashes = new THREE.Mesh(new THREE.TorusGeometry(edge, 0.00042, 4, 24, Math.PI).rotateX(Math.PI / 2).rotateZ(side * tilt), lashMaterial);
    lashes.position.y = LID_R * Math.cos(UPPER_EDGE);
    upperLid.add(lashes);
    // A smile reaches the eyes: the lower lids ride a little higher.
    const lowerEdge = look.smile ? LOWER_EDGE - 0.05 : LOWER_EDGE;
    const lowerLid = new THREE.Mesh(lidGeometry(lowerEdge, Math.PI - lowerEdge, skin.clone().lerp(new THREE.Color(0xc07a70), 0.12), lash, 'top').rotateZ(side * tilt * 0.6), lidMaterial);
    group.add(ball, upperLid, lowerLid);
    return { group, ball, upperLid, lowerLid };
  };
  return [make(-1), make(1)];
}

/** A sphere whose front hemisphere is mapped flat onto the texture (the iris in the middle); the back reads the white corner. */
function ballGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(BALL_R, 24, 18);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    if (z > 0) uv.setXY(i, 0.5 + position.getX(i) / (2 * BALL_R), 0.5 + position.getY(i) / (2 * BALL_R));
    else uv.setXY(i, 0.02, 0.02);
  }
  return geometry;
}

/** A band of sphere between two polar angles, skin-coloured with the lash line on the `edge` row. */
function lidGeometry(thetaStart: number, thetaLength: number, skin: THREE.Color, lash: THREE.Color, edge: 'top' | 'bottom'): THREE.BufferGeometry {
  const widthSegments = 24;
  const heightSegments = 8;
  const geometry = new THREE.SphereGeometry(LID_R, widthSegments, heightSegments, 0, Math.PI * 2, thetaStart, thetaLength);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  const c = new THREE.Color();
  for (let iy = 0; iy <= heightSegments; iy++) {
    const fromEdge = edge === 'bottom' ? heightSegments - iy : iy;
    const dark = fromEdge === 0 ? (edge === 'bottom' ? 0.9 : 0.45) : fromEdge === 1 ? (edge === 'bottom' ? 0.35 : 0.1) : 0;
    c.copy(skin).lerp(lash, dark);
    if (fromEdge === 2 && edge === 'bottom') c.multiplyScalar(0.85); // the crease above the lashes
    for (let ix = 0; ix <= widthSegments; ix++) c.toArray(colors, (iy * (widthSegments + 1) + ix) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Sclera, a fibrous iris with a dark limbal ring, the pupil, a faint catchlight. */
function eyeTexture(irisColor: number): THREE.CanvasTexture {
  const S = 128;
  const [canvas, ctx] = createCanvas(S, S);
  // Never paper white: an off-white that greys and warms towards the corners.
  ctx.fillStyle = '#dcd3c7';
  ctx.fillRect(0, 0, S, S);
  const shade = ctx.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(120,70,60,0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, S, S);

  const c = S / 2;
  const iris = S * 0.24;
  const r = (irisColor >> 16) & 255;
  const g = (irisColor >> 8) & 255;
  const b = irisColor & 255;
  const tint = (k: number): string => `rgb(${Math.min(255, r * k)},${Math.min(255, g * k)},${Math.min(255, b * k)})`;
  const base = ctx.createRadialGradient(c, c, iris * 0.2, c, c, iris);
  base.addColorStop(0, tint(1.5));
  base.addColorStop(0.6, tint(1.05));
  base.addColorStop(1, tint(0.55));
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(c, c, iris, 0, Math.PI * 2);
  ctx.fill();
  // Radial fibres.
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.sin(i * 7.3) * 0.03;
    ctx.strokeStyle = i % 2 ? tint(1.7) : tint(0.6);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * iris * 0.35, c + Math.sin(a) * iris * 0.35);
    ctx.lineTo(c + Math.cos(a) * iris * 0.92, c + Math.sin(a) * iris * 0.92);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(15,12,10,0.8)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(c, c, iris - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#070606';
  ctx.beginPath();
  ctx.arc(c, c, S * 0.085, 0, Math.PI * 2);
  ctx.fill();
  // Only a faint painted catchlight: the cornea's coat reflects the real lights.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(c + iris * 0.35, c - iris * 0.35, S * 0.025, 0, Math.PI * 2);
  ctx.fill();
  // The upper lid and lashes shade the top of the ball (it turns only a little, so the shade stays about under them).
  const lid = ctx.createLinearGradient(0, S * 0.12, 0, S * 0.46);
  lid.addColorStop(0, 'rgba(40,26,22,0.55)');
  lid.addColorStop(1, 'rgba(40,26,22,0)');
  ctx.fillStyle = lid;
  ctx.fillRect(0, 0, S, S * 0.46);
  return toTexture(canvas, 'facing');
}

/**
 * The eyeball's material: a clear coat over the painted ball where the renderer affords it
 * (`QUALITY.physicalMaterials`). The room's reflections are dimmed (a ball sits in a socket, under
 * lids and brows, never in the open), more so up where the upper lid shades it.
 */
function wetEye(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const material = QUALITY.physicalMaterials ? new THREE.MeshPhysicalMaterial({ ...parameters, clearcoat: 1, clearcoatRoughness: 0.04 }) : new THREE.MeshStandardMaterial({ ...parameters, roughness: 0.12 });
  return patchShader(material, 'eyeShade', (shader) => {
    shader.fragmentShader = afterChunk(shader.fragmentShader, 'lights_fragment_maps', /* glsl */ `
      {
        float socket = 0.5 * (1.0 - 0.6 * smoothstep(0.05, 0.55, normal.y));
        #if defined( RE_IndirectSpecular )
          radiance *= socket;
          #ifdef USE_CLEARCOAT
            clearcoatRadiance *= socket;
          #endif
        #endif
      }
    `);
  });
}
