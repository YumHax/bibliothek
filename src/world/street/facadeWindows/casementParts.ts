import * as THREE from 'three';
import type { Casement } from '../facadePainter';
import type { TriBuilder } from '../relief/TriBuilder';
import { gapAt } from '../../surface/layers';

/*
 * One window of a framed facade in 3D, in its facade's frame (`relief/facadeFrame`: s along, y up, out towards the
 * street). The facade's quad is the glass's plane (out 0): the painted glass, curtains and blind stay there, lit at
 * night (`Buildings`), and everything else stands in front of it. Each part has a front of its own a real gap from
 * every other (one mesh: no polygon offset between its faces, `surface/layers.gapAt`) and runs back into the wall by
 * a depth of its own, so no two faces ever share a plane, at the far end of the street as next to it.
 */

/** The gap between two parts' faces that holds as far as a near facade is seen from (the street's far end). */
const G = gapAt(80);
/** How far each part's face stands out of the glass. */
const FRONT = { bar: 2 * G, frame: 3 * G, shutter: 2 * G, louvre: 3.4 * G, surround: 5.5 * G, lintel: 7 * G, sill: 8 * G, pediment: 8.5 * G, keystone: 9 * G, cornice: 10 * G, box: 13 * G, flower: 11 * G };
/** How far each part runs back into the wall (behind the glass, out of sight). */
const BACK = { bar: -0.8 * G, frame: -1.2 * G, shutter: -0.6 * G, surround: -1.6 * G, lintel: -2 * G, sill: -2.4 * G, keystone: -2.8 * G, pediment: -3.2 * G, cornice: -3.6 * G, box: -0.4 * G, flower: 3 * G };
/** Widths across the face: the surround's jambs, the frame's stiles and rails, a glazing bar, an arch's voussoirs at the crown. */
const WIDE = { surround: 0.09, frame: 0.055, bar: 0.035, voussoir: 0.16 };
/** How far one part runs into the next where they meet in the face's plane (an end buried, never flush). */
const INTO = 0.01;
/** Where a sash's transom crosses, up its glass. */
const TRANSOM = 0.62;
/** Arch segments (the painter's sine segment, `facadePainter.paintWindow`). */
const ARC_STEPS = 8;
const FLOWER_BOX = '#6a4a32';

const color = new THREE.Color();

function tone(hex: string, k: number): THREE.Color {
  return color.set(hex).multiplyScalar(k).clone();
}

/** A box from (s0, y0) to (s1, y1) across the face, from `back` to `front` out of it. */
function block(b: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, y0: number, y1: number, back: number, front: number, paint: THREE.ColorRepresentation): void {
  b.box(m, (s0 + s1) / 2, (y0 + y1) / 2, (back + front) / 2, s1 - s0, y1 - y0, front - back, paint);
}

/** The arch's line, right springing to left (as the painter's): `up` over `spring` at the crown, a sine segment. */
function arc(s0: number, s1: number, spring: number, up: number): [number, number][] {
  return Array.from({ length: ARC_STEPS + 1 }, (_, i): [number, number] => [s1 - ((s1 - s0) * i) / ARC_STEPS, spring + up * Math.sin((Math.PI * i) / ARC_STEPS)]);
}

/** The side face along an outline's edge p -> q (the outline counter-clockwise seen from the street), from `back` to `front`. */
function side(b: TriBuilder, m: THREE.Matrix4, [ps, py]: readonly [number, number], [qs, qy]: readonly [number, number], back: number, front: number, paint: THREE.ColorRepresentation): void {
  b.quad(m, [qs, qy, front], [ps, py, front], [ps, py, back], [qs, qy, back], paint);
}

/**
 * Builds `c` into `b` (vertex colours, placed by `m`, the facade's frame): the surround its glass is set back in (a
 * render band, or the stone of its jambs), the frame and its glazing bars, the sill, the head (a lintel, a pediment
 * on its cornice over the first floor of a grand front, or a ring of voussoirs on its keystone), the open shutters
 * with their louvres and the flower box.
 */
export function buildCasement(b: TriBuilder, m: THREE.Matrix4, c: Casement): void {
  const { s0, s1, y0, y1, rise } = c;
  const w = s1 - s0;
  const mid = (s0 + s1) / 2;
  const arched = c.head === 'arched' && rise > 0;
  const spring = y1 - (arched ? rise : 0);
  const stone = c.trim;
  const band = c.head === 'plain' ? tone(c.wall, 1.1) : new THREE.Color(stone);
  const lintel = c.head === 'lintel' || c.head === 'pediment';
  const R = WIDE.surround;

  // The surround's jambs, from the sill (or the balcony's slab) up into the head.
  for (const [a, z] of [[s0 - R, s0], [s1, s1 + R]] as const) block(b, m, a, z, y0 - 2 * INTO, spring + (arched ? 0 : INTO), BACK.surround, FRONT.surround, band);
  if (arched) {
    // The ring of voussoirs, from the glass's arch out, deeper at the crown; its keystone.
    const inner = arc(s0, s1, spring, rise);
    const outer = arc(s0 - R, s1 + R, spring, rise + WIDE.voussoir);
    for (let i = 0; i < ARC_STEPS; i++) {
      const [is0, iy0] = inner[i]!;
      const [is1, iy1] = inner[i + 1]!;
      const [os0, oy0] = outer[i]!;
      const [os1, oy1] = outer[i + 1]!;
      b.quad(m, [is0, iy0, FRONT.surround], [os0, oy0, FRONT.surround], [os1, oy1, FRONT.surround], [is1, iy1, FRONT.surround], band);
      side(b, m, inner[i + 1]!, inner[i]!, BACK.surround, FRONT.surround, band);
      side(b, m, outer[i]!, outer[i + 1]!, BACK.surround, FRONT.surround, band);
    }
    block(b, m, mid - 0.08, mid + 0.08, y1 - 0.03, y1 + WIDE.voussoir + 0.08, BACK.keystone, FRONT.keystone, tone(stone, 0.94));
  } else if (lintel) {
    block(b, m, s0 - 0.12, s1 + 0.12, y1 - INTO, y1 + 0.2, BACK.lintel, FRONT.lintel, stone);
  } else {
    block(b, m, s0 - R, s1 + R, y1, y1 + R, BACK.surround, FRONT.surround, band);
  }
  if (c.pediment) {
    // A triangular pediment on its cornice over the lintel.
    const base = y1 + 0.22;
    block(b, m, s0 - 0.22, s1 + 0.22, base, base + 0.07, BACK.cornice, FRONT.cornice, stone);
    const foot = base + 0.07 - INTO;
    const left: [number, number] = [s0 - 0.2, foot];
    const right: [number, number] = [s1 + 0.2, foot];
    const apex: [number, number] = [mid, base + 0.42 + w * 0.1];
    b.triangle(m, [left[0], left[1], FRONT.pediment], [right[0], right[1], FRONT.pediment], [apex[0], apex[1], FRONT.pediment], stone);
    side(b, m, right, apex, BACK.pediment, FRONT.pediment, tone(stone, 1.04));
    side(b, m, apex, left, BACK.pediment, FRONT.pediment, tone(stone, 1.04));
  }

  // The frame: stiles, rails (a rail at the springing under an arch's fanlight), its run into the surround and head.
  const F = WIDE.frame;
  const top = arched ? spring : y1;
  // (The stiles' ends half as deep as the rails' and the jambs': no two buried ends in one plane.)
  block(b, m, s0 - INTO, s0 + F, y0 - INTO / 2, top + INTO / 2, BACK.frame, FRONT.frame, c.frame);
  block(b, m, s1 - F, s1 + INTO, y0 - INTO / 2, top + INTO / 2, BACK.frame, FRONT.frame, c.frame);
  block(b, m, s0 + F - INTO, s1 - F + INTO, y0 - INTO, y0 + F, BACK.frame, FRONT.frame, c.frame);
  block(b, m, s0 + F - INTO, s1 - F + INTO, top - F, top + INTO, BACK.frame, FRONT.frame, c.frame);
  // The glazing bars: a sash's mullion and transom, a French window's mullion and two transoms; none in frosted glass.
  if (c.glazing !== 'frosted') {
    block(b, m, mid - WIDE.bar / 2, mid + WIDE.bar / 2, y0 + F - INTO, top - F + INTO, BACK.bar, FRONT.bar, c.frame);
    const transoms = c.glazing === 'tall' ? [0.33, 0.66] : [TRANSOM];
    for (const t of transoms) {
      const y = y0 + (top - y0) * t;
      block(b, m, s0 + F - INTO, s1 - F + INTO, y - WIDE.bar / 2, y + WIDE.bar / 2, BACK.bar, FRONT.bar - G / 3, c.frame);
    }
  }
  if (c.sill) block(b, m, s0 - 0.1, s1 + 0.1, y0 - 0.08, y0, BACK.sill, FRONT.sill, stone);
  if (c.shutters) shutters(b, m, c.shutters, s0 - R, s1 + R, y0, spring, w * 0.44);
  if (c.flowers) flowerBox(b, m, c.flowers, s0 - 0.05, s1 + 0.05, y0);
}

/** Open louvred shutters folded back against the wall either side of the surround (`a` and `z` its outer edges), `width` each. */
function shutters(b: TriBuilder, m: THREE.Matrix4, paint: string, a: number, z: number, y0: number, y1: number, width: number): void {
  const slat = tone(paint, 0.82);
  for (const [l, r] of [[a - 0.02 - width, a - 0.02], [z + 0.02, z + 0.02 + width]] as const) {
    block(b, m, l, r, y0, y1, BACK.shutter, FRONT.shutter, paint);
    // Louvres leaning out at the top: one strip each, between the stiles and the top and bottom rails.
    for (let y = y0 + 0.1; y + 0.08 < y1 - 0.08; y += 0.1) {
      b.quad(m, [l + 0.05, y, FRONT.shutter], [r - 0.05, y, FRONT.shutter], [r - 0.05, y + 0.08, FRONT.louvre], [l + 0.05, y + 0.08, FRONT.louvre], slat);
    }
  }
}

/** A wooden box on the sill, standing out past it, and its six clumps of flowers. */
function flowerBox(b: TriBuilder, m: THREE.Matrix4, flowers: readonly string[], s0: number, s1: number, y: number): void {
  block(b, m, s0, s1, y - 1.5 * INTO, y + 0.17, BACK.box, FRONT.box, FLOWER_BOX);
  const w = (s1 - s0) / flowers.length;
  flowers.forEach((flower, i) => {
    const h = 0.12 + ((i * 7) % 3) * 0.025;
    block(b, m, s0 + i * w + 0.01, s0 + (i + 0.9) * w, y + 0.15, y + 0.15 + h, BACK.flower, FRONT.flower, flower);
  });
}
