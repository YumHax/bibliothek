import type { FacadeStyle } from './facadeStyle';
import { between, integer, lcg } from '@/random';

/*
 * What stands on a building's roof, drawn from its style's seed so both pictures put it in the same places: the window
 * view paints it (`props/outdoors/Facades` `paintRoof`), the walkable street builds it in 3D (`street/RoofClutter`) and
 * paints the roof windows on its slopes (`street/facadePainter` `paintRoof`). Positions are metres along the front
 * from its left end (as seen from the street); heights over the roof's top (its ridge, the mansard's top, a flat
 * roof's parapet).
 */

export interface Chimney {
  s: number;
  width: number;
  /** How far it stands over the roof's top. */
  rise: number;
  /** Clay pots on its cap. */
  pots: number;
  /** Brick (or the wall's render). */
  brick: boolean;
}

export interface RoofFurniture {
  chimneys: Chimney[];
  /** A dormer per bay of a mansard: its middle and the width of its pane. */
  dormers: { s: number; width: number; lit: number }[];
  /** Windows set in a pitched roof's slope (their left edge, 0.8 m wide, 1.1 m up the slope from 0.8 m over the foot). */
  roofWindows: { s: number; lit: number }[];
  /** A television aerial on its mast. */
  aerial: { s: number } | null;
  /** A satellite dish on a bracket. */
  dish: { s: number } | null;
  /** On a flat roof: air-conditioning units, vent stacks, a water tank on legs. */
  units: { s: number }[];
  vents: { s: number; height: number }[];
  tank: { s: number } | null;
}

/** An air-conditioning unit's width along the front (as `RoofClutter` builds it). */
const UNIT_WIDTH = 0.9;
/** Whether two things `s` along (their left ends) and `w` wide come within 10 cm of each other. */
const clash = (s0: number, w0: number, s1: number, w1: number): boolean => s0 < s1 + w1 + 0.1 && s1 < s0 + w0 + 0.1;

/**
 * The roof furniture of a front `width` long with `bays` window bays, its windows `winW` wide. `lit` on a dormer or a
 * roof window is the share of the night it stays lit for (0: dark): a curfew, as the window view's lights take it.
 */
export function roofFurniture(style: FacadeStyle, width: number, bays: number, winW: number): RoofFurniture {
  const random = lcg(style.seed * 4241 + 7);
  const pitch = width / Math.max(1, bays);
  const chimneys: Chimney[] = [];
  for (let i = integer(random, 1, 3); i > 0; i--) {
    const cw = between(random, 0.8, 1.6);
    const chimney = { s: between(random, 0.8, Math.max(1, width - 1.8)), width: cw, rise: between(random, 0.8, 1.6), pots: Math.max(1, Math.floor(cw / 0.35)), brick: style.kind === 'brick' || random() < 0.5 };
    // Never one stack through another (two faces in one plane): the second is not built. Drawn all the same, so the rest stays put.
    if (!chimneys.some((c) => clash(c.s, c.width, chimney.s, chimney.width))) chimneys.push(chimney);
  }
  const dormers = style.roof === 'mansard' ? Array.from({ length: bays }, (_, c) => ({ s: (c + 0.5) * pitch, width: winW * 0.7, lit: random() < 0.3 ? random() : 0 })) : [];
  const roofWindows: RoofFurniture['roofWindows'] = [];
  if (style.roof === 'pitched' && random() < 0.5) {
    for (let i = integer(random, 1, 2); i > 0; i--) roofWindows.push({ s: between(random, 1.8, Math.max(2, width - 2.8)), lit: random() < 0.4 ? random() : 0 });
  }
  const units: { s: number }[] = [];
  const vents: { s: number; height: number }[] = [];
  let tank: { s: number } | null = null;
  if (style.roof === 'flat') {
    for (let i = integer(random, 0, 3); i > 0; i--) {
      const s = between(random, 0.6, Math.max(1, width - 1.6));
      if (!units.some((u) => clash(u.s, UNIT_WIDTH, s, UNIT_WIDTH))) units.push({ s });
    }
    for (let i = integer(random, 0, 3); i > 0; i--) vents.push({ s: between(random, 0.5, Math.max(1, width - 0.5)), height: between(random, 0.4, 1.1) });
    if (random() < 0.18) tank = { s: between(random, 1, Math.max(2, width - 3.5)) };
  }
  const dish = random() < 0.4 ? { s: between(random, 0.8, Math.max(1, width - 1.2)) } : null;
  const aerial = random() < 0.35 ? { s: between(random, 1, Math.max(1.5, width - 1)) } : null;
  return { chimneys, dormers, roofWindows, aerial, dish, units, vents, tank };
}
