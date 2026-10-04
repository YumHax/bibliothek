import * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import { isLandscape, type CaseKind, type MediaSpec } from '@/catalog/media';
import { clamp } from '@/math/scalar';
import { slab, type Slab } from './slabs';

/**
 * How a box opens: a cardboard box by its tuck flap, across its top (`top`, hinged along the top of
 * the back) or, lying landscape like the North American SNES and N64 boxes, across its right end
 * (`end`, hinged up the back's right edge): the contents then slide out of it that way. A plastic
 * clamshell or a jewel case opens like a book (`side`), the front hinged on the left edge.
 */
export type Opening = 'top' | 'end' | 'side';

/** Where every part of an openable box sits, in box-local metres (origin at the box centre). */
export interface ShellLayout {
  kind: CaseKind;
  opening: Opening;
  outer: Slab;
  /** Thickness of the tray walls (card or plastic). */
  wall: number;
  /** Thickness of the moving part: the top flap, or the hinged front. */
  lid: number;
  /** The fixed part's walls; `front` only for a top-opening box (its front stays put). */
  tray: { left: Slab; right: Slab; top?: Slab; bottom: Slab; back: Slab; front?: Slab };
  /** The moving part when closed, in box coordinates: the front (side opening) or the top flap. */
  lidSlab: Slab;
  /** The flap's tuck tongue, hanging inside the front wall when shut (top opening only). */
  tongue?: Slab;
  /** The hinge axis through this point: vertical (side, end), or along x (top). */
  hinge: THREE.Vector3;
  /** Air inside the closed box. */
  cavity: Slab;
  /** The printed cover's frame: where x runs from its left edge, y from its middle, z out from it (a lent tag sits there). */
  cover: { origin: THREE.Vector3; width: number; height: number; thickness: number; onLid: boolean };
  /**
   * The centre of the game's media in the closed box; its label (or print) faces +z, its top +y
   * like the box's, unless `sideways`: then it lies turned a quarter (its top to the left), the way
   * a wide cartridge sits in a narrow box (a Famicom's, a Super Famicom's).
   */
  media: { centre: THREE.Vector3; sideways: boolean };
  /** The booklet; null when the case carries none of its own (a jewel case's booklet is its front). */
  manual: Slab | null;
  /** Whether the booklet rides on the lid (a clamshell's clip) rather than in the tray. */
  manualOnLid: boolean;
  /** How far the contents slide out of a cardboard box once it is open (m): up out of the top, right out of the end. */
  rise: { media: number; manual: number };
}

export function computeShellLayout(dims: BoxDimensions, kind: CaseKind, media: MediaSpec): ShellLayout {
  if (kind !== 'cardboard') return sideOpening(dims, kind, media);
  return isLandscape(dims) ? endOpening(dims, media) : topOpening(dims, media);
}

/**
 * A cardboard box: five walls, a flap across the top hinged on the back edge with its tongue tucked
 * inside the front. The cartridge stands inside against the front, the manual behind it.
 */
function topOpening(dims: BoxDimensions, media: MediaSpec): ShellLayout {
  const { width: W, height: H, depth: D } = dims;
  const wall = clamp(D * 0.05, 0.0009, 0.0014);
  const lid = wall;
  const top = H / 2 - lid; // the walls stop under the flap
  const tongueH = Math.min(0.022, H * 0.14);
  const tongueT = 0.0005;
  const tray = {
    back: slab(-W / 2, W / 2, -H / 2, top, -D / 2, -D / 2 + wall),
    front: slab(-W / 2, W / 2, -H / 2, top, D / 2 - wall, D / 2),
    left: slab(-W / 2, -W / 2 + wall, -H / 2, top, -D / 2 + wall, D / 2 - wall),
    right: slab(W / 2 - wall, W / 2, -H / 2, top, -D / 2 + wall, D / 2 - wall),
    bottom: slab(-W / 2 + wall, W / 2 - wall, -H / 2, -H / 2 + wall, -D / 2 + wall, D / 2 - wall),
  };
  const inset = 0.0012; // the tongue clears the side walls
  const tongueFront = D / 2 - wall - 0.0002;
  const tongue = slab(-W / 2 + wall + inset, W / 2 - wall - inset, top - tongueH, top, tongueFront - tongueT, tongueFront);
  const cavity = slab(-W / 2 + wall, W / 2 - wall, -H / 2 + wall, top, -D / 2 + wall, tongueFront - tongueT);

  // The cartridge stands on the bottom against the front (on its side when only that fits); the manual, nearly the box's size, behind it.
  const sideways = needsSideways(media, cavity);
  const [, mh, md] = fit(media, cavity, sideways);
  const pad = 0.0006;
  const mediaCentre = new THREE.Vector3(0, cavity.y.min + mh / 2 + pad, cavity.z.max - md / 2 - pad);
  const room = mediaCentre.z - md / 2 - cavity.z.min;
  const manualT = clamp(room * 0.5, 0.0008, 0.0025);
  const manualW = (cavity.x.max - cavity.x.min) - 0.004;
  const manualH = Math.min((top - cavity.y.min) - 0.004, mh + (top - cavity.y.min - mh) * 0.8);
  const manualZ = mediaCentre.z - md / 2 - pad - manualT;
  const manual = room > 0.0012 ? slab(-manualW / 2, manualW / 2, cavity.y.min + pad, cavity.y.min + pad + manualH, manualZ, manualZ + manualT) : null;

  // Out far enough to show the whole label, never out of the box altogether.
  const riseMedia = Math.min(mh * 0.62, H * 0.5);
  return {
    kind: 'cardboard',
    opening: 'top',
    outer: slab(-W / 2, W / 2, -H / 2, H / 2, -D / 2, D / 2),
    wall,
    lid,
    tray,
    lidSlab: slab(-W / 2, W / 2, top, H / 2, -D / 2, D / 2),
    tongue,
    hinge: new THREE.Vector3(0, H / 2, -D / 2),
    cavity,
    cover: { origin: new THREE.Vector3(-W / 2, 0, D / 2 - wall), width: W, height: H, thickness: wall, onLid: false },
    media: { centre: mediaCentre, sideways },
    manual,
    manualOnLid: false,
    rise: { media: riseMedia, manual: manual ? Math.min(riseMedia * 0.75, H * 0.35) : 0 },
  };
}

/**
 * A landscape cardboard box: the flap is its right end, hinged up the back edge with its tongue
 * inside the front. The cartridge stands against the front by that end, the manual behind it.
 */
function endOpening(dims: BoxDimensions, media: MediaSpec): ShellLayout {
  const { width: W, height: H, depth: D } = dims;
  const wall = clamp(D * 0.05, 0.0009, 0.0014);
  const lid = wall;
  const end = W / 2 - lid; // the walls stop short of the flap
  const tongueW = Math.min(0.022, W * 0.12);
  const tongueT = 0.0005;
  const tray = {
    back: slab(-W / 2, end, -H / 2, H / 2, -D / 2, -D / 2 + wall),
    front: slab(-W / 2, end, -H / 2, H / 2, D / 2 - wall, D / 2),
    left: slab(-W / 2, -W / 2 + wall, -H / 2, H / 2, -D / 2 + wall, D / 2 - wall),
    top: slab(-W / 2 + wall, end, H / 2 - wall, H / 2, -D / 2 + wall, D / 2 - wall),
    bottom: slab(-W / 2 + wall, end, -H / 2, -H / 2 + wall, -D / 2 + wall, D / 2 - wall),
    right: slab(end, W / 2, -H / 2, H / 2, -D / 2, D / 2), // unused: the flap takes its place
  };
  const inset = 0.0012;
  const tongueFront = D / 2 - wall - 0.0002;
  const tongue = slab(end - tongueW, end, -H / 2 + wall + inset, H / 2 - wall - inset, tongueFront - tongueT, tongueFront);
  const cavity = slab(-W / 2 + wall, end, -H / 2 + wall, H / 2 - wall, -D / 2 + wall, tongueFront - tongueT);

  const sideways = needsSideways(media, cavity);
  const [mw, mh, md] = fit(media, cavity, sideways);
  const pad = 0.0006;
  const mediaCentre = new THREE.Vector3(cavity.x.max - mw / 2 - tongueW - pad, cavity.y.min + mh / 2 + pad, cavity.z.max - md / 2 - pad);
  const room = mediaCentre.z - md / 2 - cavity.z.min;
  const manualT = clamp(room * 0.5, 0.0008, 0.0025);
  const manualW = (cavity.x.max - cavity.x.min) - 0.004;
  const manualH = (cavity.y.max - cavity.y.min) - 0.004;
  const manualZ = mediaCentre.z - md / 2 - pad - manualT;
  const manual = room > 0.0012 ? slab(cavity.x.max - 0.002 - manualW, cavity.x.max - 0.002, cavity.y.min + 0.002, cavity.y.min + 0.002 + manualH, manualZ, manualZ + manualT) : null;

  const riseMedia = Math.min(mw * 0.62, W * 0.45);
  return {
    kind: 'cardboard',
    opening: 'end',
    outer: slab(-W / 2, W / 2, -H / 2, H / 2, -D / 2, D / 2),
    wall,
    lid,
    tray,
    lidSlab: slab(end, W / 2, -H / 2, H / 2, -D / 2, D / 2),
    tongue,
    hinge: new THREE.Vector3(W / 2, 0, -D / 2),
    cavity,
    cover: { origin: new THREE.Vector3(-W / 2, 0, D / 2 - wall), width: W, height: H, thickness: wall, onLid: false },
    media: { centre: mediaCentre, sideways },
    manual,
    manualOnLid: false,
    rise: { media: riseMedia, manual: manual ? Math.min(riseMedia * 0.7, W * 0.3) : 0 },
  };
}

/**
 * A plastic case opening like a book, its front hinged on the left: the Mega Drive's clamshell
 * (the cartridge clipped in the tray, the manual under the lid's tabs) or a jewel case (the disc on
 * its hub, the booklet being the front itself).
 */
function sideOpening(dims: BoxDimensions, kind: CaseKind, media: MediaSpec): ShellLayout {
  const { width: W, height: H, depth: D } = dims;
  const jewel = kind === 'jewel';
  const wall = jewel ? 0.0012 : clamp(D * 0.07, 0.0015, 0.0022);
  const lid = jewel ? 0.0022 : clamp(D * 0.1, 0.002, 0.003);
  const trayFront = D / 2 - lid;
  const tray = {
    left: slab(-W / 2, -W / 2 + wall, -H / 2, H / 2, -D / 2, trayFront),
    right: slab(W / 2 - wall, W / 2, -H / 2, H / 2, -D / 2, trayFront),
    top: slab(-W / 2 + wall, W / 2 - wall, H / 2 - wall, H / 2, -D / 2, trayFront),
    bottom: slab(-W / 2 + wall, W / 2 - wall, -H / 2, -H / 2 + wall, -D / 2, trayFront),
    back: slab(-W / 2 + wall, W / 2 - wall, -H / 2 + wall, H / 2 - wall, -D / 2, -D / 2 + wall),
  };
  const cavity = slab(-W / 2 + wall, W / 2 - wall, -H / 2 + wall, H / 2 - wall, -D / 2 + wall, trayFront);
  const sideways = needsSideways(media, cavity);
  const [, , md] = fit(media, cavity, sideways);
  const pad = 0.0005;
  // A disc lies on its hub a little over the tray; a cartridge lies in its holder, label up.
  const centre = new THREE.Vector3(jewel ? 0.004 : 0, 0, cavity.z.min + md / 2 + (jewel ? 0.0016 : pad));

  // The clamshell's manual: under the lid's tabs, most of the lid's size, inside it (lid space is set by `BoxShell`).
  let manual: Slab | null = null;
  if (!jewel) {
    const mt = 0.0015;
    const mw = W - 2 * wall - 0.012;
    const mh = H - 2 * wall - 0.014;
    const zBack = trayFront - mt - 0.0003;
    manual = slab(-mw / 2, mw / 2, -mh / 2, mh / 2, zBack, zBack + mt);
  }
  return {
    kind,
    opening: 'side',
    outer: slab(-W / 2, W / 2, -H / 2, H / 2, -D / 2, D / 2),
    wall,
    lid,
    tray,
    lidSlab: slab(-W / 2, W / 2, -H / 2, H / 2, trayFront, D / 2),
    hinge: new THREE.Vector3(-W / 2, 0, trayFront),
    cavity,
    cover: { origin: new THREE.Vector3(-W / 2, 0, trayFront), width: W, height: H, thickness: lid, onLid: true },
    media: { centre, sideways },
    manual,
    manualOnLid: !jewel,
    rise: { media: 0, manual: 0 },
  };
}

/** Too wide to stand upright in the box, but it fits turned a quarter. */
function needsSideways(media: MediaSpec, cavity: Slab): boolean {
  const cw = cavity.x.max - cavity.x.min - 0.002;
  const ch = cavity.y.max - cavity.y.min - 0.002;
  const { width, height } = media.size;
  return width > cw && height <= cw && width <= ch;
}

/** The media's size as it sits in the box (width and height swapped on its side), shrunk to fit when a box is smaller than the real thing would allow. */
function fit(media: MediaSpec, cavity: Slab, sideways: boolean): [number, number, number] {
  const { depth } = media.size;
  const width = sideways ? media.size.height : media.size.width;
  const height = sideways ? media.size.width : media.size.height;
  const cw = cavity.x.max - cavity.x.min - 0.002;
  const ch = cavity.y.max - cavity.y.min - 0.002;
  const cd = cavity.z.max - cavity.z.min - 0.001;
  const s = Math.min(1, cw / width, ch / height);
  return [width * s, height * s, Math.min(depth, cd)];
}
