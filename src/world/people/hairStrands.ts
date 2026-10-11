import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { ramp } from '@/math/scalar';
import { lcg } from '@/random';
import { QUALITY } from '@/graphics/quality';
import { afterChunk, patchShader, VALUE_NOISE } from '../materials/shaderPatch';
import { coverageKeepsAlpha } from '../materials/palette';
import { filterTriangles, radialSurface } from './geometry';
import { headRadius, type FaceShape } from './head';
import { beardCover, beardThickness, CURTAIN_GRID, cutOf, hairCover, hairlineAt, hairRadius, hairStrandMap, hairThickness, ponytailAnchor, ponytailCurve, ponytailRadius, shellRadius, strandSheen } from './hair';
import type { PersonLook } from './looks';
import { cachedTexture } from './textureCache';
import { seedOfLook } from './motion/temperament';

/*
 * What makes the hair's mass (`hair.ts`, a shell over the skull) read as hair rather than a
 * helmet: loose strands where the eye finds the outline. Cards, each a narrow strip of strands
 * painted with alpha, walked over the hair's surface along the way it grows (`flow`): at the
 * hairline (a fringe's ends over the forehead, the swept-back front, temples, nape), lifting off
 * the mass so the silhouette is ragged, a few long flyaways arcing off the crown that light up
 * against a lamp, the ends of long hair below its falling sheet and of a ponytail, a full beard's
 * ragged edge under the jaw. Over the mass, a fine fuzz shell, cut by noise into strands, softens
 * the hairline and the outline. Both are cut out by alpha to coverage (MSAA), so they need
 * `QUALITY.msaa` (none on `low`: the shell alone). Neither casts a shadow; both fade with the face's
 * details (their alpha follows the material's opacity, no alpha hash).
 */

/** Points along a card, root to tip. */
const ROWS = 4;
/** Strands lying on bare skin stand this far off it (a hair's thickness or two): anatomy, not a surface layer. */
const ON_SKIN = 0.0012;
/** Cards rooted in the hair's mass start this far under its surface, so they grow out of it. */
const IN_MASS = 0.003;
/** Long hair's ends lie either side of its falling sheet by this much. */
const OFF_SHEET = 0.0015;
/** The card texture's dense part (clumps, u 0..DENSE) and its sparse part (a few lone strands, for flyaways). */
const DENSE = 0.78;

/** The cards' material for `look`, or null where there is no MSAA to cut them out smoothly. */
export function hairCardMaterial(look: PersonLook): THREE.MeshStandardMaterial | null {
  if (!QUALITY.msaa) return null;
  const curly = look.hairStyle === 'curly';
  const map = cachedTexture(`hairCard|${look.hair}|${curly}`, () => cardTexture(look.hair, curly, look.hair * 13 + 5));
  const material = coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map, roughness: 0.55, alphaToCoverage: true, side: THREE.DoubleSide }));
  patchShader(material, 'hairCard', (shader) => {
    shader.fragmentShader = afterChunk(
      afterChunk(
        shader.fragmentShader,
        'map_fragment',
        // Strands as coverage: the painted alpha firmed up (a mipmapped strand's soft edge stays soft), times the fade.
        'diffuseColor.a = smoothstep(0.12, 0.6, diffuseColor.a / max(opacity, 1e-3)) * opacity;',
      ),
      // A card shades as the hair's volume it belongs to: its normal is the head's outward one from either side.
      'normal_fragment_begin',
      '#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif',
    );
  });
  return QUALITY.detailedMaterials ? strandSheen(material, curly ? 0.4 : 1, 0.6) : material;
}

/** The loose strands over the head (the head's frame) and at a ponytail's end (the tail's frame, about its tie); null where none. */
export function hairStrands(look: PersonLook, shape: FaceShape): { head: THREE.BufferGeometry | null; tail: THREE.BufferGeometry | null } {
  const random = lcg(seedOfLook(look) * 4513 + 29);
  const strips = new Strips();
  const style = look.hairStyle;
  const curly = style === 'curly';
  const cut = cutOf(look);
  const scalp: Field = {
    surface: (d) => Math.max(headRadius(d, shape) + ON_SKIN, hairRadius(d, look, shape, cut)),
    flow: scalpFlow(look, shape),
    cover: (d) => hairCover(d, look),
  };
  const under = underHat(look);
  if (style !== 'bald' && style !== 'buzz') {
    hairline(strips, scalp, look, under, random);
    outline(strips, scalp, look, under, random);
    if (!look.hat) {
      const flyaways = curly ? 3 : 5 + Math.floor(random() * 4);
      scatter(flyaways, random, (d) => hairCover(d, look) > 0.9 && d.y > 0.35 && hairThickness(d, style, false, cut) > 0.005, (d) => {
        marchCard(strips, scalp, d, {
          length: 0.05 + random() * 0.04,
          width: 0.005,
          depth: -IN_MASS * 0.66,
          lift: 0,
          arc: 0.012 + random() * 0.012,
          twist: (random() - 0.5) * 0.9,
          overhang: 0.02,
          u0: DENSE + 0.03 + random() * 0.12,
          uSpan: 0.06,
        });
      });
    }
  }
  if (look.beard === 'full') beardEdge(strips, shape, random);
  const head = strips.geometry();
  const tail = style === 'ponytail' ? tailEnds(shape, random) : null;
  return { head, tail };
}

/**
 * Long hair's ends below its falling sheet and a few strands lifting off it, from the sheet itself
 * (`hair.hairCurtain`): with the sheet's `hairFollow`, so they stay with the shoulders as it does.
 */
export function curtainStrands(look: PersonLook, curtain: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const random = lcg(seedOfLook(look) * 6271 + 31);
  const position = curtain.getAttribute('position');
  const { cols, rows } = CURTAIN_GRID;
  const at = (i: number, j: number): THREE.Vector3 => {
    const k = j * (cols + 1) + THREE.MathUtils.clamp(i, 0, cols);
    return new THREE.Vector3(position.getX(k), position.getY(k), position.getZ(k));
  };
  const follow = (s: number): number => ramp(s, 0.2, 0.85);
  const strips = new Strips();
  const card = (root: THREE.Vector3, down: THREE.Vector3, across: THREE.Vector3, length: number, width: number, lift: number, s0: number, s1: number): void => {
    const out = new THREE.Vector3(root.x, 0, root.z).normalize();
    const centre: THREE.Vector3[] = [];
    const sides: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    const half: number[] = [];
    const shares: number[] = [];
    for (let k = 0; k <= ROWS; k++) {
      const t = k / ROWS;
      centre.push(root.clone().addScaledVector(down, length * t).addScaledVector(out, lift * t));
      sides.push(across);
      normals.push(out);
      half.push(width * 0.5 * (1 - 0.45 * t));
      shares.push(follow(THREE.MathUtils.lerp(s0, s1, t)));
    }
    const u0 = random() * (DENSE - 0.35);
    strips.add(centre, sides, normals, half, u0, 0.25 + random() * 0.1, shares);
  };
  // The ends: rooted up inside the sheet, reaching past its lower edge, some in front and some behind it.
  for (let i = 0.5; i < cols; i += 1.3 + random() * 0.6) {
    const c = Math.round(i);
    const j0 = rows - 3;
    const root = at(c, j0);
    const tip = at(c, rows);
    const down = tip.clone().sub(root);
    const span = down.length();
    down.normalize();
    const across = at(c + 1, rows).sub(at(c - 1, rows)).normalize();
    root.addScaledVector(new THREE.Vector3(root.x, 0, root.z).normalize(), (random() < 0.5 ? 1 : -1) * OFF_SHEET);
    card(root, down, across, span + 0.025 + random() * 0.035, 0.022 + random() * 0.01, 0.002, j0 / rows, 1);
  }
  // Strands lifting off the sheet's outside, where its outline shows.
  for (let n = 0; n < 14; n++) {
    const c = Math.floor(random() * cols);
    const j0 = 2 + Math.floor(random() * (rows - 7));
    const root = at(c, j0);
    const down = at(c, j0 + 3).sub(root).normalize();
    const across = at(c + 1, j0).sub(at(c - 1, j0)).normalize();
    root.addScaledVector(new THREE.Vector3(root.x, 0, root.z).normalize(), 0.001);
    card(root, down, across, 0.05 + random() * 0.03, 0.016 + random() * 0.008, 0.004 + random() * 0.004, j0 / rows, (j0 + 4) / rows);
  }
  return strips.geometry(true);
}

/** The fuzz shells over the hair's mass and a full beard (the head's frame), each its own mesh; none without MSAA. */
export function hairFuzz(look: PersonLook, shape: FaceShape): THREE.Mesh[] {
  if (!QUALITY.msaa) return [];
  const material = fuzzMaterial(look);
  const cut = cutOf(look);
  const style = look.hairStyle;
  const lift = style === 'curly' ? 0.0035 : style === 'buzz' ? 0.001 : style === 'bald' ? 0.0008 : 0.0018;
  // None under a hat (the fuzz would show through its crown).
  const under = underHat(look);
  const shells = [fuzzShell(shape, (d) => (under(d) ? 0 : hairCover(d, look)), (d) => hairThickness(d, style, !!look.hat, cut), lift)];
  if (look.beard === 'full') shells.push(fuzzShell(shape, beardCover, beardThickness, 0.0015));
  return shells.flatMap((geometry) => {
    if (!geometry) return [];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return [mesh];
  });
}

// --- How the hair grows -------------------------------------------------------------------------

/** A surface to walk cards over: its radius by direction, the unit direction the hair runs there (in its tangent plane), and where it grows (0..1). */
interface Field {
  surface: (d: THREE.Vector3) => number;
  flow: (d: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;
  cover: (d: THREE.Vector3) => number;
}

/**
 * The way the hair runs over the scalp: away from the crown's whorl (on the parting's side), with a
 * little gravity; tied back towards the bun or the ponytail; a front without a fringe swept up and
 * back (short cuts) or to the sides (long hair).
 */
function scalpFlow(look: PersonLook, shape: FaceShape): Field['flow'] {
  const cut = cutOf(look);
  const style = look.hairStyle;
  const whorl = new THREE.Vector3(cut.part * 0.22, 0.82, -0.5).normalize();
  const fringe = look.brows > 1;
  const tie = style === 'bun' ? new THREE.Vector3(0, 0.55, -0.83).normalize() : style === 'ponytail' ? ponytailAnchor(shape).normalize() : null;
  const back = new THREE.Vector3();
  return (d, out) => {
    if (tie) out.copy(tie).sub(d);
    else {
      out.copy(d).sub(whorl);
      const front = ramp(d.z, 0.25, 0.65) * ramp(d.y, 0.1, 0.45);
      if (!fringe && front > 0) {
        if (style === 'long') out.x += Math.sign(d.x || 1) * 0.6 * front;
        else out.lerp(back.copy(whorl).sub(d), front);
      }
      out.y -= style === 'long' ? 0.6 : 0.35;
    }
    return tangent(d, out);
  };
}

/** `out` laid into the tangent plane at `d` and normalised (straight down the surface if it has no tangent part). */
function tangent(d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.addScaledVector(d, -out.dot(d));
  if (out.lengthSq() < 1e-8) out.set(0, -1, 0).addScaledVector(d, d.y);
  if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
  return out.normalize();
}

/** Whether a hat hides the scalp in direction `d` (the brim rides higher at the front, the hat being tipped back). */
function underHat(look: PersonLook): (d: THREE.Vector3) => boolean {
  if (!look.hat) return () => false;
  return (d) => d.y > 0.16 + 0.12 * d.z;
}

// --- Where the cards go -------------------------------------------------------------------------

/** Along the hairline: a fringe's ends over the forehead, a swept front, temples, sideburns, the nape. */
function hairline(strips: Strips, field: Field, look: PersonLook, under: (d: THREE.Vector3) => boolean, random: () => number): void {
  const style = look.hairStyle;
  const curly = style === 'curly';
  const fringe = look.brows > 1;
  const count = style === 'long' ? 22 : curly ? 26 : 34;
  const d = new THREE.Vector3();
  const flow = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = -Math.PI + ((i + random() * 0.8) / count) * 2 * Math.PI;
    const au = Math.abs(a);
    // Long hair's sides and back are its falling sheet's.
    if (style === 'long' && au > 1.25) continue;
    const fringeHere = fringe && au < 1.1 && style !== 'bun' && style !== 'ponytail';
    const line = hairlineAt(look, au);
    let e = line + 0.01 + random() * 0.03;
    d.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
    // Hair falling out over the edge (a fringe, the sides, the nape) is rooted further in, its ends just past the line; swept back, it starts on the line.
    up.set(-Math.sin(e) * Math.sin(a), Math.cos(e), -Math.sin(e) * Math.cos(a));
    if (-field.flow(d, flow).dot(up) > 0.3) {
      e += 0.12;
      d.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
    }
    if (under(d)) continue;
    const nape = au > 2.3 ? 0.6 : 1;
    marchCard(strips, field, d, {
      length: (curly ? 0.014 + random() * 0.008 : 0.018 + random() * 0.016) * nape,
      width: curly ? 0.016 : 0.012 + random() * 0.008,
      depth: 0.0004,
      lift: curly ? 0.004 : 0.0012,
      arc: 0,
      twist: (random() - 0.5) * 0.35,
      overhang: fringeHere ? 0.006 : au > 2.3 ? 0.007 : 0.008,
      u0: random() * (DENSE - 0.3),
      uSpan: 0.22 + random() * 0.08,
    });
  }
}

/** Over the mass: strands rooted in it, their ends lifting off it, so the outline is ragged. */
function outline(strips: Strips, field: Field, look: PersonLook, under: (d: THREE.Vector3) => boolean, random: () => number): void {
  const style = look.hairStyle;
  const curly = style === 'curly';
  const cut = cutOf(look);
  const count = curly ? 46 : style === 'long' ? 26 : style === 'bun' || style === 'ponytail' ? 18 : 40;
  scatter(count, random, (d) => hairCover(d, look) > 0.8 && !under(d) && hairThickness(d, style, !!look.hat, cut) > 0.004, (d) => {
    marchCard(strips, field, d, {
      length: curly ? 0.014 + random() * 0.01 : 0.025 + random() * 0.02,
      width: curly ? 0.018 + random() * 0.008 : 0.014 + random() * 0.008,
      depth: -IN_MASS,
      lift: curly ? 0.008 + random() * 0.004 : 0.004 + random() * 0.004,
      arc: 0,
      twist: (random() - 0.5) * 0.5,
      overhang: 0.004,
      u0: random() * (DENSE - 0.3),
      uSpan: 0.22 + random() * 0.08,
    });
  });
}

/** A full beard's ragged edge: short strands along the jaw and under the chin, growing down. */
function beardEdge(strips: Strips, shape: FaceShape, random: () => number): void {
  const field: Field = {
    surface: (d) => Math.max(headRadius(d, shape) + ON_SKIN, shellRadius(d, shape, beardCover(d), beardThickness)),
    flow: (d, out) => tangent(d, out.set(0, -1, 0.25)),
    cover: beardCover,
  };
  scatter(26, random, (d) => d.y < -0.35 && beardCover(d) > 0.7, (d) => {
    marchCard(strips, field, d, {
      length: 0.012 + random() * 0.008,
      width: 0.012 + random() * 0.006,
      depth: -IN_MASS * 0.5,
      lift: 0.003 + random() * 0.002,
      arc: 0,
      twist: (random() - 0.5) * 0.6,
      overhang: 0.005,
      u0: random() * (DENSE - 0.3),
      uSpan: 0.2,
    });
  });
}

/** A ponytail's end splaying out past its tip, in the tail's frame (about its tie). */
function tailEnds(shape: FaceShape, random: () => number): THREE.BufferGeometry | null {
  const strips = new Strips();
  const curve = ponytailCurve(shape);
  const anchor = ponytailAnchor(shape);
  const length = curve.getLength();
  const n = 9;
  for (let k = 0; k < n; k++) {
    const t0 = 0.6 + random() * 0.15;
    const along = curve.getTangentAt(t0);
    const normal = new THREE.Vector3().crossVectors(along, new THREE.Vector3(1, 0, 0)).normalize();
    const aside = new THREE.Vector3().crossVectors(along, normal);
    const angle = ((k + random() * 0.6) / n) * Math.PI * 2;
    const out = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(aside, Math.sin(angle));
    const root = curve.getPointAt(t0).addScaledVector(out, ponytailRadius(t0) * 0.85).sub(anchor);
    const reach = (1 - t0) * length + 0.03 + random() * 0.025;
    const across = new THREE.Vector3().crossVectors(along, out).normalize();
    const centre: THREE.Vector3[] = [];
    const half: number[] = [];
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      centre.push(root.clone().addScaledVector(along, reach * t).addScaledVector(out, 0.005 * t * t));
      half.push(0.007 * (1 - 0.45 * t));
    }
    strips.add(centre, centre.map(() => across), centre.map(() => out), half, random() * (DENSE - 0.3), 0.22, undefined);
  }
  return strips.geometry();
}

/** Up to `count` directions spread evenly over the sphere (a jittered Fibonacci spiral, from `random`) that pass `keep`, each handed to `use`. */
function scatter(count: number, random: () => number, keep: (d: THREE.Vector3) => boolean, use: (d: THREE.Vector3) => void): void {
  const tries = count * 6;
  const offset = random() * tries;
  let placed = 0;
  for (let i = 0; i < tries && placed < count; i++) {
    const k = (i * 7 + Math.floor(offset)) % tries;
    const y = 1 - (2 * (k + 0.5 + (random() - 0.5) * 0.8)) / tries;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = k * 2.39996 + (random() - 0.5) * 0.3;
    const d = new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
    if (!keep(d)) continue;
    use(d);
    placed++;
  }
}

interface CardOptions {
  /** Along the hair (m) and across it at the root (m). */
  length: number;
  width: number;
  /** Off the surface at the root (m; negative: inside the mass), and how far the tip lifts from there. */
  depth: number;
  lift: number;
  /** A flyaway's bow away from the surface at its middle (m). */
  arc: number;
  /** Turned off the flow by this (radians), the same all along. */
  twist: number;
  /** How far (m) it may run on past the edge of where the hair grows: it is shortened to stop there. */
  overhang: number;
  /** Which strands of the texture it wears. */
  u0: number;
  uSpan: number;
}

/** A card walked over `field` from the direction `root` along the hair's flow, lying on the surface (normal: straight out). */
function marchCard(strips: Strips, field: Field, root: THREE.Vector3, o: CardOptions): void {
  const d = root.clone().normalize();
  const length = reach(field, d, o.length, o.overhang);
  const flow = new THREE.Vector3();
  const side = new THREE.Vector3();
  const centre: THREE.Vector3[] = [];
  const sides: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const half: number[] = [];
  const cos = Math.cos(o.twist);
  const sin = Math.sin(o.twist);
  for (let k = 0; k <= ROWS; k++) {
    const t = k / ROWS;
    field.flow(d, flow);
    side.crossVectors(d, flow);
    flow.multiplyScalar(cos).addScaledVector(side, sin);
    side.crossVectors(d, flow).normalize();
    const r = field.surface(d);
    // Past the edge of the hair the lift settles: ends lie on the skin rather than hovering off it.
    const settle = ramp(field.cover(d), 0.15, 0.6);
    centre.push(d.clone().multiplyScalar(r + o.depth + o.lift * t * settle + o.arc * Math.sin(Math.PI * 0.85 * t)));
    sides.push(side.clone());
    normals.push(d.clone());
    half.push(o.width * 0.5 * (1 - 0.5 * t));
    d.addScaledVector(flow, length / ROWS / r).normalize();
  }
  strips.add(centre, sides, normals, half, o.u0, o.uSpan, undefined);
}

/** How far (m, at most `length`) a card from `root` can run along the flow before it leaves where the hair grows, plus `overhang` past that edge. */
function reach(field: Field, root: THREE.Vector3, length: number, overhang: number): number {
  const d = root.clone();
  const flow = new THREE.Vector3();
  const step = 0.004;
  for (let s = 0; s < length; s += step) {
    if (field.cover(d) < 0.5) return Math.min(length, s + overhang);
    field.flow(d, flow);
    d.addScaledVector(flow, step / field.surface(d)).normalize();
  }
  return length;
}

/** Cards gathered into one geometry: two vertices a row (either side of the centre line), v = 1 at the root. */
class Strips {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly shares: number[] = [];
  private readonly index: number[] = [];
  private count = 0;

  add(centre: THREE.Vector3[], sides: THREE.Vector3[], normals: THREE.Vector3[], half: number[], u0: number, uSpan: number, follow: number[] | undefined): void {
    const rows = centre.length;
    for (let k = 0; k < rows; k++) {
      const c = centre[k]!;
      const s = sides[k]!;
      const n = normals[k]!;
      const h = half[k]!;
      const v = 1 - k / (rows - 1);
      for (const side of [-1, 1]) {
        this.positions.push(c.x + s.x * h * side, c.y + s.y * h * side, c.z + s.z * h * side);
        this.normals.push(n.x, n.y, n.z);
        this.uvs.push(u0 + (side > 0 ? uSpan : 0), v);
        this.shares.push(follow?.[k] ?? 0);
      }
    }
    for (let k = 0; k < rows - 1; k++) {
      const a = this.count + k * 2;
      this.index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.count += rows * 2;
  }

  /** The cards as one geometry (with the `hairFollow` share per vertex when `follow`), or null if there are none. */
  geometry(follow = false): THREE.BufferGeometry | null {
    if (!this.count) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (follow) geometry.setAttribute('hairFollow', new THREE.Float32BufferAttribute(this.shares, 1));
    geometry.setIndex(this.index);
    return geometry;
  }
}

// --- The fuzz -----------------------------------------------------------------------------------

/** A shell a little over the hair's mass where `cover` is above nothing, with the cover per vertex (`hairFuzz`) for its alpha. */
function fuzzShell(shape: FaceShape, cover: (d: THREE.Vector3) => number, thickness: (d: THREE.Vector3) => number, lift: number): THREE.BufferGeometry | null {
  const covered: number[] = [];
  const geometry = radialSurface(
    (d) => {
      const c = cover(d);
      covered.push(c);
      return Math.max(headRadius(d, shape) + 0.0006, shellRadius(d, shape, c, thickness)) + lift;
    },
    112,
    84,
  );
  filterTriangles(geometry, (a, b, c) => covered[a]! > 0.02 || covered[b]! > 0.02 || covered[c]! > 0.02);
  if (!geometry.getIndex()?.count) {
    geometry.dispose();
    return null;
  }
  geometry.setAttribute('hairFuzz', new THREE.Float32BufferAttribute(covered, 1));
  return geometry;
}

/**
 * The fuzz: the hair's own strand texture, its alpha cut by noise into fine strands running along
 * it, thinning out towards the hairline (the cover); finer than a pixel the strands become an even
 * veil rather than shimmering.
 */
function fuzzMaterial(look: PersonLook): THREE.MeshStandardMaterial {
  const material = coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map: hairStrandMap(look), roughness: 0.6, alphaToCoverage: true }));
  patchShader(material, 'hairFuzz', (shader) => {
    shader.vertexShader = `attribute float hairFuzz;\nvarying float vHairFuzz;\n${afterChunk(shader.vertexShader, 'begin_vertex', 'vHairFuzz = hairFuzz;')}`;
    shader.fragmentShader = `varying float vHairFuzz;\n${VALUE_NOISE}\n${afterChunk(
      shader.fragmentShader,
      'map_fragment',
      /* glsl */ `{
        vec2 q = vMapUv * vec2(360.0, 48.0);
        float n = patchNoise(q) * 0.6 + patchNoise(q * vec2(2.7, 1.3) + 17.0) * 0.4;
        float strands = smoothstep(0.42, 0.72, n);
        float blur = clamp(length(fwidth(q)) - 0.5, 0.0, 1.0);
        diffuseColor.a *= mix(strands, 0.45, blur) * pow(vHairFuzz, 0.6);
      }`,
    )}`;
  });
  return QUALITY.detailedMaterials ? strandSheen(material, look.hairStyle === 'curly' ? 0.4 : 1, 0.4) : material;
}

// --- The cards' texture -------------------------------------------------------------------------

/**
 * Strands on a clear ground, running down (v = 1 the root, darker; the tips lighter and fading
 * out): clumps across the dense part, a few lone hairs in the sparse part. The ground keeps the
 * hair's colour at a trace of alpha, so filtering at a strand's edge never darkens it.
 */
function cardTexture(color: number, curly: boolean, seed: number): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  const random = lcg(seed);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const shade = (k: number, alpha: number): string => `rgba(${Math.min(255, Math.round(r * k + 8 * (k - 1)))},${Math.min(255, Math.round(g * k + 8 * (k - 1)))},${Math.min(255, Math.round(b * k + 8 * (k - 1)))},${alpha})`;
  ctx.fillStyle = shade(1, 0.08);
  ctx.fillRect(0, 0, S, S);
  const strand = (x: number, length: number, width: number, k: number): void => {
    const gradient = ctx.createLinearGradient(0, 0, 0, length);
    gradient.addColorStop(0, shade(k * 0.78, 0.95));
    gradient.addColorStop(0.7, shade(k * 1.05, 0.85));
    gradient.addColorStop(1, shade(k * 1.2, 0));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    if (curly) {
      const period = 9 + random() * 6;
      const amplitude = 2.5 + random() * 2.5;
      const phase = random() * 6;
      for (let y = 3; y <= length; y += 3) ctx.lineTo(x + Math.sin(y / period + phase) * amplitude, y);
    } else {
      ctx.bezierCurveTo(x + (random() - 0.5) * 8, length / 3, x + (random() - 0.5) * 8, (2 * length) / 3, x + (random() - 0.5) * 6, length);
    }
    ctx.stroke();
  };
  for (let c = 0; c < 16; c++) {
    const cx = random() * S * DENSE;
    const cw = 5 + random() * 12;
    for (let i = 0; i < 18; i++) {
      const x = THREE.MathUtils.clamp(cx + (random() - 0.5) * cw, 1, S * DENSE - 1);
      strand(x, S * (0.55 + random() * 0.45), 0.9 + random() * 1.3, 0.7 + random() * 0.6);
    }
  }
  for (let i = 0; i < 4; i++) strand(S * (0.83 + 0.045 * i), S * (0.85 + random() * 0.15), 1.2, 1.1 + random() * 0.2);
  return toTexture(canvas, 'facing');
}
