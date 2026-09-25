import * as THREE from 'three';
import { Prop, matte } from './Prop';

export interface NightLightOptions {
  /** Colour of the glow. Default a warm amber. */
  color?: number;
}

const BASE_R = 0.045;
const BASE_H = 0.018;
const DOME_R = 0.04;
/** Glow of the silicone dome after dark; by day its light sensor keeps it off. */
const NIGHT_GLOW = 1.4;
const DAY_GLOW = 0;

/**
 * A little bedside night light: a white puck with a frosted silicone dome that glows amber after
 * dark (a light sensor turns it off by day). Emissive only, no light of its own: it reads as a
 * glow on the nightstand without costing a light in every shader. `setNight()` follows the clock
 * (the builder wires it). Origin at the bottom of the base: place it on what it stands on.
 */
export class NightLight extends Prop {
  private readonly dome: THREE.MeshStandardMaterial;

  constructor(options: NightLightOptions = {}) {
    super();
    this.name = 'NightLight';
    const color = options.color ?? 0xffb35a;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R * 0.95, BASE_R, BASE_H, 20), matte(0xf2efe8, 0.5));
    base.position.y = BASE_H / 2;
    // Own material: the glow is per lamp.
    this.dome = new THREE.MeshStandardMaterial({ color: 0xfff1dc, roughness: 0.7, emissive: color, emissiveIntensity: DAY_GLOW });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.dome);
    dome.position.y = BASE_H;
    dome.scale.y = 1.15;
    for (const m of [base, dome]) m.castShadow = false;
    this.add(base, dome);
  }

  setNight(night: boolean): void {
    this.dome.emissiveIntensity = night ? NIGHT_GLOW : DAY_GLOW;
  }
}
