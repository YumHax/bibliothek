import * as THREE from 'three';
import type { MediaShape, MediaSpec } from '@/catalog/media';

/** A band of raised grip ribs on one face of a shell, in metres from the face's centre. */
export interface Ribs {
  face: 'front' | 'back';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  count: number;
}

/** What a cartridge shell looks like besides its size: its outline and its ribs. */
interface ShellShape {
  outline: THREE.Shape;
  ribs: readonly Ribs[];
  /** Depth of the label's fold over the top edge (m); 0 when the end label is separate or absent. */
  fold: number;
  /** Width of the bottom edge's opening, where the board's contacts show (m). */
  mouth: number;
}

const MM = 0.001;

/**
 * The front outline of each shell, centred on the origin, from the measured sizes in
 * `catalog/media` and photographs of the real carts: the NES's plain slab, the SNES's flat top
 * (North America) or domed one (Europe, Japan), the N64's arched top over tapering shoulders, the
 * Game Boy's notched corner, the Genesis's wide grip over a narrower foot.
 */
export function shellShape(spec: MediaSpec): ShellShape {
  const w = spec.size.width;
  const h = spec.size.height;
  const make = SHAPES[spec.shape as Exclude<MediaShape, 'disc'>];
  return make(w / 2, h / 2);
}

type Maker = (hw: number, hh: number) => ShellShape;

const SHAPES: Record<Exclude<MediaShape, 'disc'>, Maker> = {
  nes: (hw, hh) => ({
    outline: rounded(hw, hh, 1.5 * MM, 1.5 * MM, 1 * MM),
    // The grip: grooves down the front's left, beside the label.
    ribs: [{ face: 'front', x0: -hw + 6 * MM, x1: -hw + 42 * MM, y0: -hh + 16 * MM, y1: hh - 14 * MM, count: 22 }],
    fold: 7 * MM,
    mouth: 2 * hw - 16 * MM,
  }),
  famicom: (hw, hh) => ({
    outline: rounded(hw, hh, 4 * MM, 4 * MM, 2 * MM),
    ribs: [],
    fold: 0,
    mouth: 2 * hw - 20 * MM,
  }),
  snes: (hw, hh) => ({
    outline: rounded(hw, hh, 3 * MM, 3 * MM, 2 * MM),
    // Grooves down both ends of the front, either side of the label and the recess under it.
    ribs: [
      { face: 'front', x0: -hw + 3 * MM, x1: -hw + 22 * MM, y0: -hh + 6 * MM, y1: hh - 6 * MM, count: 7 },
      { face: 'front', x0: hw - 22 * MM, x1: hw - 3 * MM, y0: -hh + 6 * MM, y1: hh - 6 * MM, count: 7 },
    ],
    fold: 7 * MM,
    mouth: 2 * hw - 40 * MM,
  }),
  sfc: (hw, hh) => ({
    outline: arched(hw, hh, 12 * MM, 5 * MM, 2 * MM, 0),
    ribs: [{ face: 'back', x0: -hw + 16 * MM, x1: hw - 16 * MM, y0: -hh + 6 * MM, y1: -hh + 30 * MM, count: 7 }],
    fold: 0,
    mouth: 2 * hw - 40 * MM,
  }),
  n64: (hw, hh) => ({
    // A 325 mm arc across the top, the shoulders tapering in to meet it.
    outline: arched(hw, hh, 4 * MM, 10.7 * MM, 3 * MM, 4 * MM),
    ribs: [{ face: 'back', x0: -hw + 20 * MM, x1: hw - 20 * MM, y0: hh - 30 * MM, y1: hh - 14 * MM, count: 6 }],
    fold: 0,
    mouth: 2 * hw - 34 * MM,
  }),
  gb: (hw, hh) => ({
    outline: notched(hw, hh, 1.5 * MM, 4 * MM, 6 * MM),
    ribs: [{ face: 'back', x0: -hw + 8 * MM, x1: hw - 8 * MM, y0: -hh + 5 * MM, y1: -hh + 16 * MM, count: 5 }],
    fold: 0,
    mouth: 2 * hw - 10 * MM,
  }),
  genesis: (hw, hh) => ({
    // 95 mm where it goes into the slot, 109 mm across the grip above it.
    outline: stepped(hw, hh, 47.5 * MM, 22 * MM, 5 * MM),
    ribs: [{ face: 'back', x0: -hw + 14 * MM, x1: hw - 14 * MM, y0: -hh + 30 * MM, y1: hh - 8 * MM, count: 9 }],
    fold: 7 * MM,
    mouth: 2 * 47.5 * MM - 12 * MM,
  }),
  megadrive: (hw, hh) => ({
    outline: rounded(hw, hh, 8 * MM, 8 * MM, 3 * MM),
    ribs: [{ face: 'back', x0: -hw + 12 * MM, x1: hw - 12 * MM, y0: -hh + 26 * MM, y1: hh - 10 * MM, count: 8 }],
    fold: 0,
    mouth: 2 * hw - 14 * MM,
  }),
};

/** A rectangle with its top corners rounded by `tl` / `tr` and its bottom ones by `b`. */
function rounded(hw: number, hh: number, tl: number, tr: number, b: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hw + b, -hh);
  s.lineTo(hw - b, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + b);
  s.lineTo(hw, hh - tr);
  s.quadraticCurveTo(hw, hh, hw - tr, hh);
  s.lineTo(-hw + tl, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - tl);
  s.lineTo(-hw, -hh + b);
  s.quadraticCurveTo(-hw, -hh, -hw + b, -hh);
  return s;
}

/**
 * Straight sides and a domed top: the sides rise to `sag` under the top, turn in by `taper` over
 * their last `corner`, and an arc through the top centre joins them.
 */
function arched(hw: number, hh: number, corner: number, sag: number, b: number, taper: number): THREE.Shape {
  const s = new THREE.Shape();
  const shoulder = hh - sag; // where the arc meets the sides
  const top = hw - taper;
  s.moveTo(-hw + b, -hh);
  s.lineTo(hw - b, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + b);
  s.lineTo(hw, shoulder - corner);
  s.quadraticCurveTo(hw, shoulder, top, shoulder + corner * 0.25);
  // A quadratic's middle is halfway between its ends' height and its control point's: the apex lands on hh.
  const ends = shoulder + corner * 0.25;
  s.quadraticCurveTo(0, 2 * hh - ends, -top, ends);
  s.quadraticCurveTo(-hw, shoulder, -hw, shoulder - corner);
  s.lineTo(-hw, -hh + b);
  s.quadraticCurveTo(-hw, -hh, -hw + b, -hh);
  return s;
}

/** The Game Boy's: rounded corners but the top right, where a step `nw` wide and `nh` deep is cut. */
function notched(hw: number, hh: number, r: number, nw: number, nh: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - nh);
  s.lineTo(hw - nw, hh - nh);
  s.lineTo(hw - nw, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

/** A narrow foot (`footHw` either side, `footH` high) under a wider grip with rounded top corners `r`. */
function stepped(hw: number, hh: number, footHw: number, footH: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const step = -hh + footH;
  s.moveTo(-footHw + 1 * MM, -hh);
  s.lineTo(footHw - 1 * MM, -hh);
  s.quadraticCurveTo(footHw, -hh, footHw, -hh + 1 * MM);
  s.lineTo(footHw, step - 2 * MM);
  s.quadraticCurveTo(footHw, step, footHw + 2 * MM, step);
  s.lineTo(hw - 1.5 * MM, step);
  s.quadraticCurveTo(hw, step, hw, step + 1.5 * MM);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, step + 1.5 * MM);
  s.quadraticCurveTo(-hw, step, -hw + 1.5 * MM, step);
  s.lineTo(-footHw - 2 * MM, step);
  s.quadraticCurveTo(-footHw, step, -footHw, step - 2 * MM);
  s.lineTo(-footHw, -hh + 1 * MM);
  s.quadraticCurveTo(-footHw, -hh, -footHw + 1 * MM, -hh);
  return s;
}
