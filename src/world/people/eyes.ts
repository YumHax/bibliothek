import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { eyeSurface, headRadius, type FaceShape } from './head';
import type { PersonLook } from './looks';
import { cachedTexture } from './textureCache';
import { skinMaterial } from './skinShader';
import { QUALITY } from '@/graphics/quality';
import { afterChunk, beforeChunk, patchShader } from '../materials/shaderPatch';
import { coverageKeepsAlpha } from '../materials/palette';
import { gaussian, ramp } from '@/math/scalar';
import { weldNormals } from './geometry';
import { seedOfLook } from './motion/temperament';
import { lcg } from '@/random';

/*
 * Eyes at real scale, set into the sockets of the head: an eyeball (a glossy sphere painted with
 * the iris and pupil) that turns on its own to follow the gaze, framed by an upper and a lower lid
 * (shells of skin just outside the ball, the lash line darker). A blink rotates the upper lid down
 * over the ball. Most of each ball is buried in the head, so only the almond between the lids shows.
 *
 * - The ball's shader (`wetEye`) looks at the iris through the cornea: the view ray is refracted
 *   onto a plane behind the front of the ball, so the iris sits in depth and the pupil stays inside
 *   it from the side. The pupil opens in the dark and closes in bright light (the lights at the
 *   eye, summed in the shader), a little wider in a conversation (`EyeShade.widen`). The lids shade
 *   the ball in the head's frame (`EyeShade.lids`, `aimEye`), not in the turning ball's.
 * - Each lid's margin is a moist rim about a millimetre thick; the upper lid has its crease and a
 *   little fullness under it (deeper and heavier with age, faint on some faces), the lower one some
 *   fullness (bags on an elder). A glossy tear line runs where the lower lid meets the ball, and the
 *   caruncle sits pink in the inner corner, just short of where the skin covers the ball.
 * - Lashes are fanned cards (`lashGeometry`, a strand texture with alpha to coverage): longer
 *   towards the outer corner, curling up above, short and faint below.
 * - Both lids tilt a little at the outer corner, up or down by the face.
 */

const BALL_R = 0.012;
const LID_R = 0.0129;
/** Polar angle (from the top) of the lids' edges when open. */
const UPPER_EDGE = Math.PI * 0.4;
const LOWER_EDGE = Math.PI * 0.62;
/** How far the upper lid rotates to meet the lower one. */
export const BLINK_ANGLE = LOWER_EDGE - UPPER_EDGE + 0.03;
/** How far each lid's margin rolls in towards the ball (metres). */
const ROLL = 0.0005;
/** The deepest a crease may sink the lid (it stays clear of the ball). */
const MAX_CREASE = 0.0006;
/** The lashes' length (metres): upper at the outer corner, lower. */
const UPPER_LASH = 0.0062;
const LOWER_LASH = 0.0026;
/** Strand tiles across a lash card. */
const LASH_REPEAT = 5;

/** The iris's radius on the ball (unit sphere, seen from the front), and the plane it sits on behind the cornea. */
const IRIS = 0.48;
const IRIS_PLANE = 0.8;
/** The painted pupil, as a share of the iris's radius (`eyeTexture`). */
const PAINTED_PUPIL = 0.085 / 0.24;

/** What the ball's shader is told each frame (`aimEye`, `Face.setFocus`). */
export interface EyeShade {
  /** The ball's turn: its frame into the eye group's (the head's, unturned). */
  turn: { value: THREE.Matrix3 };
  /** Elevation (radians, the group's frame) of the upper and the lower lid's edges. */
  lids: { value: THREE.Vector2 };
  /** How much wider the pupil opens than the light asks (share of the iris). */
  widen: { value: number };
}

export interface Eye {
  /** At the centre of the ball, in the head's frame. */
  group: THREE.Group;
  /** Turns with the gaze. */
  ball: THREE.Mesh;
  /** Turns down to blink and a little with the gaze. */
  upperLid: THREE.Mesh;
  /** Rides up a little in a squint or a real smile. */
  lowerLid: THREE.Mesh;
  /** -1 on the head's -x side, 1 on +x. */
  side: -1 | 1;
  shade: EyeShade;
}

/** How a lid is shaped: the crease's depth (metres) and distance from the edge (radians), and the fullness between them. */
interface LidShape {
  crease: number;
  creaseAt: number;
  puff: number;
}

export function buildEyes(look: PersonLook, shape: FaceShape): [Eye, Eye] {
  const texture = cachedTexture(`eye|${look.eyes}`, () => eyeTexture(look.eyes));
  const lidMaterial = skinMaterial({ vertexColors: true, roughness: 0.66 });
  const skin = new THREE.Color(look.skin);
  const lash = new THREE.Color(0x17110e).lerp(new THREE.Color(look.hair), 0.2);
  const lids = lidShapesOf(look, shape);
  // The lids' margins, moist and pinker than the skin; the tear line; the caruncle.
  const margin = skinMaterial({ color: skin.clone().lerp(new THREE.Color(0xc98a84), 0.35), roughness: 0.38 });
  const tear = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf0d4cc).lerp(skin, 0.2), roughness: 0.06 });
  const caruncle = skinMaterial({ color: skin.clone().lerp(new THREE.Color(0xd27c78), 0.55), roughness: 0.3 });
  const upperLashes = lashMaterial(lash);
  const lowerLashes = lashMaterial(lash.clone().lerp(skin, 0.3));
  // The outer corners up or down a little, fixed by the face (no draw: the nose's size stands in for a seed).
  const tilt = ((look.nose * 97.3) % 1 - 0.5) * 0.16;
  const make = (side: -1 | 1): Eye => {
    const group = new THREE.Group();
    // Each over its own socket: one a hair higher than the other (`eyeSurface`).
    const surface = eyeSurface(side, shape);
    group.position.set(surface.x, surface.y, surface.z - 0.0085);
    const shade: EyeShade = { turn: { value: new THREE.Matrix3() }, lids: { value: new THREE.Vector2(Math.PI / 2 - UPPER_EDGE, Math.PI / 2 - LOWER_EDGE) }, widen: { value: 0 } };
    // A wet eye: the lights and the room shine sharp on the cornea's coat, over the iris's own softer sheen.
    const ball = new THREE.Mesh(ballGeometry(), wetEye({ map: texture, roughness: 0.2 }, shade));

    const upperTilt = side * tilt;
    const upperLid = new THREE.Mesh(lidGeometry(0, UPPER_EDGE, skin, lash, 'bottom', lids.upper).rotateZ(upperTilt), lidMaterial);
    upperLid.add(
      new THREE.Mesh(edgeArc(LID_R - 0.0004, UPPER_EDGE, 0.00045, Math.PI).rotateZ(upperTilt), margin),
      lashes(lashGeometry(side, UPPER_EDGE, UPPER_LASH, [0.3, 1.05], Math.PI * 0.94).rotateZ(upperTilt), upperLashes),
    );
    // Neutral at rest: a smile raises the lower lids as it comes (`motion/face`).
    const lowerTilt = side * tilt * 0.6;
    const lowerLid = new THREE.Mesh(lidGeometry(LOWER_EDGE, Math.PI - LOWER_EDGE, skin.clone().lerp(new THREE.Color(0xc07a70), 0.12), lash, 'top', lids.lower).rotateZ(lowerTilt), lidMaterial);
    lowerLid.add(
      new THREE.Mesh(edgeArc(LID_R - 0.0004, LOWER_EDGE, 0.00045, Math.PI).rotateZ(lowerTilt), margin),
      new THREE.Mesh(edgeArc(BALL_R + 0.00022, LOWER_EDGE - 0.035, 0.00022, Math.PI * 0.8).rotateZ(lowerTilt), tear),
      lashes(lashGeometry(side, LOWER_EDGE, LOWER_LASH, [-0.5, -0.9], Math.PI * 0.85).rotateZ(lowerTilt), lowerLashes),
    );
    group.add(ball, upperLid, lowerLid);
    const corner = innerCorner(side, group.position, shape);
    if (corner) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), caruncle);
      mesh.position.copy(corner);
      mesh.scale.set(0.0017, 0.0012, 0.0013);
      group.add(mesh);
    }
    return { group, ball, upperLid, lowerLid, side, shade };
  };
  return [make(-1), make(1)];
}

/**
 * Turns the eye to `yaw` / `pitch` in its socket and sets its lids (`upper`, `lower`: their turns
 * about x, down positive), telling the ball's shader where they are.
 */
export function aimEye(eye: Eye, yaw: number, pitch: number, upper: number, lower: number): void {
  eye.ball.rotation.set(pitch, yaw, 0, 'YXZ');
  eye.upperLid.rotation.x = upper;
  eye.lowerLid.rotation.x = lower;
  eye.ball.updateMatrix();
  eye.shade.turn.value.setFromMatrix4(eye.ball.matrix);
  eye.shade.lids.value.set(Math.PI / 2 - UPPER_EDGE - upper, Math.PI / 2 - LOWER_EDGE - lower);
}

/** The lids for this face: the crease (faint on some faces, deeper and lower with age), the fullness under it, bags under an elder's eyes. */
function lidShapesOf(look: PersonLook, shape: FaceShape): { upper: LidShape; lower: LidShape } {
  const random = lcg(seedOfLook(look) * 31 + 5);
  const elder = shape.age === 'elder';
  const child = shape.age === 'child';
  const faint = random() < 0.15;
  const crease = child ? 0.00015 : (faint ? 0.0001 : 0.0003 + random() * 0.0003) + (elder ? 0.0004 : 0);
  return {
    upper: { crease: Math.min(MAX_CREASE, crease), creaseAt: 0.3 + (random() - 0.5) * 0.1 - (elder ? 0.04 : 0), puff: elder ? 0.0006 : 0.00015 + random() * 0.00015 },
    lower: { crease: elder ? 0.00025 : 0, creaseAt: 0.28, puff: elder ? 0.0007 : child ? 0.0003 : 0.0002 + random() * 0.0002 },
  };
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

/**
 * A band of sphere between two polar angles, skin-coloured with the lash line on the `edge` row:
 * its margin rolled in towards the ball, then `shape`'s fullness and crease (sunk, and darker).
 */
function lidGeometry(thetaStart: number, thetaLength: number, skin: THREE.Color, lash: THREE.Color, edge: 'top' | 'bottom', shape: LidShape): THREE.BufferGeometry {
  const widthSegments = 28;
  const heightSegments = 16;
  const geometry = new THREE.SphereGeometry(LID_R, widthSegments, heightSegments, 0, Math.PI * 2, thetaStart, thetaLength);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  const edgeTheta = edge === 'bottom' ? thetaStart + thetaLength : thetaStart;
  for (let iy = 0; iy <= heightSegments; iy++) {
    const from = Math.abs(thetaStart + (thetaLength * iy) / heightSegments - edgeTheta);
    const crease = shape.crease * gaussian(from, shape.creaseAt, 0.05);
    const r = LID_R - ROLL * ramp(from, 0.07, 0) + shape.puff * gaussian(from, shape.creaseAt * 0.5, shape.creaseAt * 0.3) - crease;
    const k = r / LID_R;
    c.copy(skin).lerp(lash, (edge === 'bottom' ? 0.85 : 0.4) * ramp(from, 0.09, 0));
    c.multiplyScalar(1 - (0.25 * crease) / MAX_CREASE);
    for (let ix = 0; ix <= widthSegments; ix++) {
      const i = iy * (widthSegments + 1) + ix;
      position.setXYZ(i, position.getX(i) * k, position.getY(i) * k, position.getZ(i) * k);
      c.toArray(colors, i * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  weldNormals(geometry);
  return geometry;
}

/** A tube along the circle at polar angle `theta` on a sphere of radius `r` about the ball's centre, over the front `span` radians. */
function edgeArc(r: number, theta: number, tube: number, span: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r * Math.sin(theta), tube, 5, 28, span)
    .rotateX(Math.PI / 2)
    .rotateY(span / 2 - Math.PI / 2)
    .translate(0, r * Math.cos(theta), 0);
}

/**
 * A fanned card of lashes rooted along a lid's edge (polar angle `theta`), over the front `span`
 * radians: out from the eye, curling by `curl` (radians up from level, root and tip; negative
 * down), longest towards the outer corner (`side`), tapering to nothing at the ends.
 */
function lashGeometry(side: -1 | 1, theta: number, length: number, curl: readonly [number, number], span: number): THREE.BufferGeometry {
  const columns = 28;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  const out = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let j = 0; j <= columns; j++) {
    const t = j / columns;
    const phi = (t - 0.5) * span;
    const outer = (side * Math.sin(phi) + 1) / 2;
    const k = length * (0.45 + 0.55 * outer) * Math.sin(Math.PI * (0.03 + 0.94 * t)) ** 0.6;
    p.set(LID_R * Math.sin(theta) * Math.sin(phi), LID_R * Math.cos(theta), LID_R * Math.sin(theta) * Math.cos(phi));
    out.set(Math.sin(phi), 0, Math.cos(phi));
    for (let i = 0; i <= 2; i++) {
      positions.push(p.x, p.y, p.z);
      uvs.push(t * LASH_REPEAT, i / 2);
      if (i < 2) p.addScaledVector(dir.copy(out).multiplyScalar(Math.cos(curl[i]!)).setY(Math.sin(curl[i]!)), k / 2);
    }
    if (j < columns) {
      for (let i = 0; i < 2; i++) {
        const a = j * 3 + i;
        index.push(a, a + 3, a + 1, a + 3, a + 4, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function lashes(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}

/** Lash strands cut out of their card: alpha to coverage where the frame is multisampled (an alpha test elsewhere). */
function lashMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
  // Coverage keeps the canvas's alpha (the video cut-out) whole at the strands' edges.
  return coverageKeepsAlpha(new THREE.MeshStandardMaterial({ color, map: cachedTexture('lashes', lashTexture), roughness: 0.75, alphaTest: 0.35, alphaToCoverage: QUALITY.msaa > 0, side: THREE.DoubleSide }));
}

/** Strands in white on clear, rooted along the bottom (v = 0), tapering to their tips; tiles across (u). */
function lashTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [canvas, ctx] = createCanvas(W, H);
  const random = lcg(2741);
  ctx.clearRect(0, 0, W, H);
  const strands = 26;
  for (let i = 0; i < strands; i++) {
    const x = ((i + random() * 0.8) / strands) * W;
    const h = H * (0.55 + random() * 0.45);
    const lean = (random() - 0.5) * 10;
    const w = 1.3 + random() * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${(0.75 + random() * 0.25).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(x - w, H);
    ctx.quadraticCurveTo(x + lean * 0.3, H - h * 0.5, x + lean, H - h);
    ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.3, H - h * 0.5, x + w, H);
    ctx.fill();
  }
  const texture = toTexture(canvas, 'facing');
  texture.wrapS = THREE.RepeatWrapping; // convention-ok: wraps one way only
  return texture;
}

/**
 * Where the caruncle goes (the eye group's frame): on the ball between the lids, towards the nose,
 * just short of where the head's skin covers the ball; null if the skin covers it all the way.
 */
function innerCorner(side: -1 | 1, centre: THREE.Vector3, shape: FaceShape): THREE.Vector3 | null {
  const e = Math.PI / 2 - (UPPER_EDGE + LOWER_EDGE) / 2;
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  const at = (a: number, r: number): THREE.Vector3 => p.set(-side * Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(r);
  let open = -1;
  for (let a = 0.3; a < 1.5; a += 0.02) {
    at(a, BALL_R).add(centre);
    if (p.length() < headRadius(d.copy(p).normalize(), shape)) break;
    open = a;
  }
  return open < 0 ? null : at(Math.max(0.3, open - 0.05), BALL_R + 0.0006).clone();
}

/** Sclera with veins and pinker corners, a fibrous iris with a collarette and a soft limbal ring, the pupil. No catchlight: the cornea's coat reflects the real lights. */
function eyeTexture(irisColor: number): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  const random = lcg(irisColor + 11);
  const c = S / 2;
  // Never paper white: an off-white that greys, warms and pinks towards the corners.
  ctx.fillStyle = '#ddd5ca';
  ctx.fillRect(0, 0, S, S);
  const shade = ctx.createRadialGradient(c, c, S * 0.2, c, c, S * 0.5);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.55, 'rgba(200,120,110,0.18)');
  shade.addColorStop(1, 'rgba(170,90,85,0.5)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, S, S);
  // A few fine veins from the corners inwards.
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = random() * Math.PI * 2;
    const start = S * (0.49 - random() * 0.04);
    let x = c + Math.cos(a) * start;
    let y = c + Math.sin(a) * start;
    ctx.strokeStyle = `rgba(170,40,40,${(0.12 + random() * 0.18).toFixed(2)})`;
    ctx.lineWidth = 0.6 + random() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 5 + Math.floor(random() * 5);
    for (let s = 0; s < steps; s++) {
      const inward = Math.atan2(c - y, c - x) + (random() - 0.5) * 1.2;
      x += Math.cos(inward) * S * 0.025;
      y += Math.sin(inward) * S * 0.025;
      if (Math.hypot(x - c, y - c) < S * 0.3) break;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const iris = S * 0.24;
  const r = (irisColor >> 16) & 255;
  const g = (irisColor >> 8) & 255;
  const b = irisColor & 255;
  const tint = (k: number, alpha = 1): string => `rgba(${Math.min(255, Math.round(r * k))},${Math.min(255, Math.round(g * k))},${Math.min(255, Math.round(b * k))},${alpha})`;
  const base = ctx.createRadialGradient(c, c, iris * 0.2, c, c, iris);
  base.addColorStop(0, tint(1.45));
  base.addColorStop(0.6, tint(1.05));
  base.addColorStop(1, tint(0.6));
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(c, c, iris, 0, Math.PI * 2);
  ctx.fill();
  // Radial fibres, lighter and darker.
  ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + (random() - 0.5) * 0.04;
    ctx.strokeStyle = i % 2 ? tint(1.7, 0.3) : tint(0.55, 0.35);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * iris * (0.34 + random() * 0.05), c + Math.sin(a) * iris * (0.34 + random() * 0.05));
    ctx.lineTo(c + Math.cos(a) * iris * (0.8 + random() * 0.15), c + Math.sin(a) * iris * (0.8 + random() * 0.15));
    ctx.stroke();
  }
  // The collarette: a lighter wavy ring round the pupil.
  ctx.strokeStyle = tint(1.6, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = iris * (0.52 + 0.04 * Math.sin(a * 9 + 1.3));
    ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
  }
  ctx.stroke();
  // The limbal ring: dark at the iris's edge, soft into the white.
  const limbus = ctx.createRadialGradient(c, c, iris * 0.82, c, c, iris * 1.08);
  limbus.addColorStop(0, 'rgba(15,12,10,0)');
  limbus.addColorStop(0.62, 'rgba(15,12,10,0.7)');
  limbus.addColorStop(1, 'rgba(15,12,10,0)');
  ctx.fillStyle = limbus;
  ctx.fillRect(c - iris * 1.1, c - iris * 1.1, iris * 2.2, iris * 2.2);
  // The pupil, its edge soft.
  const pupil = S * 0.085;
  const hole = ctx.createRadialGradient(c, c, pupil * 0.85, c, c, pupil * 1.15);
  hole.addColorStop(0, '#060505');
  hole.addColorStop(1, 'rgba(6,5,5,0)');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(c, c, pupil * 1.15, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas, 'facing');
}

/**
 * The eyeball's material: a clear coat over the painted ball where the renderer affords it
 * (`QUALITY.physicalMaterials`). Its shader looks at the iris through the cornea (refracted onto
 * `IRIS_PLANE`), opens or closes the pupil by the light at the eye (point, spot, hemisphere,
 * ambient and directional lights summed at the ball's centre) plus `shade.widen`, and shades the
 * ball under the lids and in the corners, in the eye group's frame (`shade.turn`, `shade.lids`):
 * the colour, and the room's reflections, which are dimmer anyway (a ball sits in a socket).
 */
function wetEye(parameters: THREE.MeshStandardMaterialParameters, shade: EyeShade): THREE.MeshStandardMaterial {
  const material = QUALITY.physicalMaterials ? new THREE.MeshPhysicalMaterial({ ...parameters, clearcoat: 1, clearcoatRoughness: 0.04 }) : new THREE.MeshStandardMaterial({ ...parameters, roughness: 0.12 });
  return patchShader(material, 'eyeBall', (shader) => {
    shader.uniforms.eyeTurn = shade.turn;
    shader.uniforms.eyeLids = shade.lids;
    shader.uniforms.eyeWiden = shade.widen;
    shader.vertexShader = `uniform mat3 eyeTurn;\nvarying vec3 vEyeLocal;\nvarying vec3 vEyeFrame;\nvarying vec3 vEyeView;\nvarying vec3 vEyeCentre;\n${afterChunk(
      shader.vertexShader,
      'begin_vertex',
      /* glsl */ `
      vEyeLocal = position;
      vEyeFrame = eyeTurn * position;
      vEyeView = transpose(mat3(modelViewMatrix)) * -(modelViewMatrix * vec4(position, 1.0)).xyz;
      vEyeCentre = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;`,
    )}`;
    const fragment = beforeChunk(
      shader.fragmentShader,
      'map_fragment',
      /* glsl */ `
      float eyeShade = 1.0;
      vec2 eyeUv = vMapUv;
      {
        // The iris through the cornea: the view ray refracted onto the iris's plane, behind the ball's front.
        vec3 p = vEyeLocal / ${BALL_R.toFixed(4)};
        float ring = length(p.xy);
        float cornea = (1.0 - smoothstep(${IRIS.toFixed(3)}, ${(IRIS * 1.25).toFixed(3)}, ring)) * step(0.0, p.z);
        if (cornea > 0.0) {
          vec3 r = refract(-normalize(vEyeView), normalize(p), 0.75);
          float t = max(0.0, (${IRIS_PLANE.toFixed(3)} - p.z) / min(r.z, -0.05));
          eyeUv = mix(eyeUv, 0.5 + 0.5 * (p.xy + r.xy * t), cornea);
        }
        // The light at the eye opens or closes the pupil.
        vec3 eyeLight = ambientLightColor;
        #if NUM_HEMI_LIGHTS > 0
          for (int i = 0; i < NUM_HEMI_LIGHTS; i++) eyeLight += 0.5 * (hemisphereLights[i].skyColor + hemisphereLights[i].groundColor);
        #endif
        #if NUM_DIR_LIGHTS > 0
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) eyeLight += 0.5 * directionalLights[i].color;
        #endif
        #if NUM_POINT_LIGHTS > 0
          for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
            float d = length(pointLights[i].position - vEyeCentre);
            eyeLight += pointLights[i].color * getDistanceAttenuation(d, pointLights[i].distance, pointLights[i].decay);
          }
        #endif
        #if NUM_SPOT_LIGHTS > 0
          for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
            vec3 l = spotLights[i].position - vEyeCentre;
            float d = length(l);
            float cone = getSpotAttenuation(spotLights[i].coneCos, spotLights[i].penumbraCos, dot(l / max(d, 1e-4), spotLights[i].direction));
            eyeLight += spotLights[i].color * cone * getDistanceAttenuation(d, spotLights[i].distance, spotLights[i].decay);
          }
        #endif
        float lum = dot(eyeLight, vec3(0.2126, 0.7152, 0.0722));
        float pupil = min(0.7, mix(0.6, 0.24, smoothstep(-3.5, 3.5, log2(max(lum, 1e-3)))) + eyeWiden);
        vec2 c = eyeUv - 0.5;
        float rr = length(c) / 0.24;
        if (rr < 1.0) {
          float m = rr < pupil ? rr * ${PAINTED_PUPIL.toFixed(4)} / pupil : ${PAINTED_PUPIL.toFixed(4)} + (rr - pupil) * ${(1 - PAINTED_PUPIL).toFixed(4)} / (1.0 - pupil);
          eyeUv = 0.5 + c * (m / max(rr, 1e-4));
        }
        // The lids' shade, in the head's frame: dark under the upper lid and its lashes, a little over the lower one, the corners.
        vec3 f = normalize(vEyeFrame);
        float el = asin(clamp(f.y, -1.0, 1.0));
        float under = smoothstep(eyeLids.x + 0.03, eyeLids.x - 0.32, el);
        float over = smoothstep(eyeLids.y - 0.03, eyeLids.y + 0.1, el);
        float corner = smoothstep(0.3, 0.95, abs(atan(f.x, f.z)));
        eyeShade = mix(0.38, 1.0, under) * mix(0.75, 1.0, over) * mix(1.0, 0.78, corner);
      }
      #define vMapUv eyeUv`,
    );
    shader.fragmentShader = `uniform vec2 eyeLids;\nuniform float eyeWiden;\nvarying vec3 vEyeLocal;\nvarying vec3 vEyeFrame;\nvarying vec3 vEyeView;\nvarying vec3 vEyeCentre;\n${afterChunk(
      afterChunk(fragment, 'map_fragment', '#undef vMapUv\ndiffuseColor.rgb *= eyeShade;'),
      'lights_fragment_maps',
      /* glsl */ `
      {
        float socket = 0.5 * eyeShade;
        #if defined( RE_IndirectSpecular )
          radiance *= socket;
          #ifdef USE_CLEARCOAT
            clearcoatRadiance *= socket;
          #endif
        #endif
      }
    `,
    )}`;
  });
}
