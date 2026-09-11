import * as THREE from 'three';
import type { BoxDimensions, PlatformId } from '@/catalog/types';
import { slab, type Slab } from './slabs';

/** Real media sizes (width, height, depth in metres) for platforms whose cartridge is well known. */
const CARTRIDGE_SIZES: Partial<Record<PlatformId, [number, number, number]>> = {
  nes: [0.12, 0.135, 0.017],
};

/** Where every part of an openable box sits, in box-local metres (origin at the box centre). */
export interface ShellLayout {
  outer: Slab;
  /** Cardboard thickness of the tray walls. */
  wall: number;
  /** Thickness of the hinged front panel. */
  lid: number;
  tray: { left: Slab; right: Slab; top: Slab; bottom: Slab; back: Slab };
  /** The lid when closed, in box coordinates. */
  lidSlab: Slab;
  /** Hinge axis (vertical) position: inner front-left edge of the tray. */
  hinge: THREE.Vector3;
  /** Air inside the closed box. */
  cavity: Slab;
  cartridge: Slab;
  manual: Slab;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeShellLayout(dims: BoxDimensions, platform: PlatformId): ShellLayout {
  const { width: W, height: H, depth: D } = dims;
  const wall = clamp(D * 0.08, 0.0015, 0.0025);
  const lid = clamp(D * 0.12, 0.002, 0.004);
  const outer = slab(-W / 2, W / 2, -H / 2, H / 2, -D / 2, D / 2);
  const trayFront = D / 2 - lid; // z where the tray ends and the lid begins

  const tray = {
    left: slab(-W / 2, -W / 2 + wall, -H / 2, H / 2, -D / 2, trayFront),
    right: slab(W / 2 - wall, W / 2, -H / 2, H / 2, -D / 2, trayFront),
    top: slab(-W / 2 + wall, W / 2 - wall, H / 2 - wall, H / 2, -D / 2, trayFront),
    bottom: slab(-W / 2 + wall, W / 2 - wall, -H / 2, -H / 2 + wall, -D / 2, trayFront),
    back: slab(-W / 2 + wall, W / 2 - wall, -H / 2 + wall, H / 2 - wall, -D / 2, -D / 2 + wall),
  };
  const cavity = slab(-W / 2 + wall, W / 2 - wall, -H / 2 + wall, H / 2 - wall, -D / 2 + wall, trayFront);
  const cavW = cavity.x.max - cavity.x.min;
  const cavH = cavity.y.max - cavity.y.min;
  const cavD = cavity.z.max - cavity.z.min;

  // Cartridge: the real thing when known and it fits, else a slab proportional to the cavity.
  const known = CARTRIDGE_SIZES[platform];
  const pad = 0.001;
  let [cw, ch, cd] = known ?? [cavW * 0.92, cavH * 0.72, cavD * 0.7];
  cw = Math.min(cw, cavW - pad);
  ch = Math.min(ch, cavH - pad);
  cd = Math.min(cd, cavD * 0.85);
  const cartridge = slab(-cw / 2, cw / 2, cavity.y.min + pad / 2, cavity.y.min + pad / 2 + ch, cavity.z.min + pad / 4, cavity.z.min + pad / 4 + cd);

  // Manual: a booklet tucked in front of the cartridge, bottom-left, small enough to leave the label visible.
  const room = cavity.z.max - cartridge.z.max;
  const mt = clamp(room * 0.7, 0.0008, 0.0025);
  const mw = Math.min(cavW * 0.6, 0.09);
  const mh = Math.min(cavH * 0.5, 0.1);
  const mx = cavity.x.min + 0.004;
  const my = cavity.y.min + 0.004;
  const manual = slab(mx, mx + mw, my, my + mh, cartridge.z.max + (room - mt) / 2, cartridge.z.max + (room - mt) / 2 + mt);

  return {
    outer,
    wall,
    lid,
    tray,
    lidSlab: slab(-W / 2, W / 2, -H / 2, H / 2, trayFront, D / 2),
    hinge: new THREE.Vector3(-W / 2, 0, trayFront),
    cavity,
    cartridge,
    manual,
  };
}
