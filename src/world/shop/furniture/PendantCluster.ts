import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { PooledLight } from '../../lighting/LightPool';
import { LAMP_LIGHT } from '../../lighting/lampColours';
import { hangFromCeiling } from '../common/ceilingDrop';
import { Glows, type ShopFitting } from '../common/fitting';

export interface PendantClusterOptions {
  /** Each pendant: along local x, its drop from the ceiling, its shade's colour. Default three over a table. */
  pendants?: readonly { x: number; z?: number; drop: number; color: number }[];
  /** Light each pendant pours under it (a `PooledLight`), 0 for none. Default 0.8. */
  light?: number;
}

const DEFAULT: NonNullable<PendantClusterOptions['pendants']> = [
  { x: -0.3, drop: 1.0, color: 0x2f5a44 },
  { x: 0, z: 0.05, drop: 1.15, color: 0xc9a552 },
  { x: 0.3, drop: 0.95, color: 0xb85a3a },
];
const SHADE_R = 0.13;
const SHADE_H = 0.13;
const SHADE_GLOW = 0.6;
const BULB_GLOW = 2.4;

/**
 * Enamel dome pendants hung on cords at different drops over a table, the way a showroom sells them: each shade in
 * its own colour, its white inside and the bulb under it glowing warm, a `PooledLight` under each (lent a real light
 * by the shop's `LightPool` when near; no shadow). A `ShopFitting`: the shop's switch works them. Ceiling-hung:
 * origin on the ceiling. Decoration: never collides.
 */
export class PendantCluster extends Prop implements ShopFitting {
  private readonly glows = new Glows();
  private readonly lights: PooledLight[] = [];
  private readonly level: number;

  constructor(options: PendantClusterOptions = {}) {
    super();
    this.name = 'PendantCluster';
    this.level = options.light ?? 0.8;
    const inner = this.glows.add({ kind: 'incandescent', color: 0xf6f0e4, strength: SHADE_GLOW, roughness: 0.4 });
    // The lining is the cone seen from inside.
    inner.side = THREE.BackSide;
    const bulb = this.glows.add({ kind: 'incandescent', color: 0xfff4e0, strength: BULB_GLOW, roughness: 0.3 });
    const brass = paint(0x8a6a3a, 0.35);
    for (const p of options.pendants ?? DEFAULT) {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z ?? 0);
      const y = hangFromCeiling(g, p.drop, 'cord');
      const enamel = paint(p.color, 0.35);
      g.add(cylinderMesh(0.018, 0.05, brass, { y: y - 0.025 }, { segments: 12 }));
      // The dome, open at the bottom: an outer cone in the colour, a lining just inside it that glows.
      g.add(openCone(SHADE_R, SHADE_H, enamel, y - 0.05 - SHADE_H / 2));
      g.add(openCone(SHADE_R - 0.004, SHADE_H - 0.004, inner, y - 0.05 - SHADE_H / 2));
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), bulb);
      globe.position.y = y - 0.05 - SHADE_H + 0.03;
      g.add(globe);
      if (this.level > 0) {
        const light = new PooledLight(LAMP_LIGHT.incandescent, this.level, 2.4, 2);
        light.position.y = y - SHADE_H - 0.15;
        g.add(light);
        this.lights.push(light);
      }
      this.add(g);
    }
    this.traverse((o) => (o.castShadow = false));
    this.setLit(true);
  }

  setLit(on: boolean): void {
    this.glows.set(on ? 1 : 0);
    for (const light of this.lights) light.intensity = on ? this.level : 0;
  }
}

/** A dome shade as an open cone, narrow at the top (its material's side picks the outside or the lining). */
function openCone(r: number, h: number, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r, h, 24, 1, true), material);
  mesh.position.y = y;
  return mesh;
}
