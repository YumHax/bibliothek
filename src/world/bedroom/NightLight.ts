import * as THREE from 'three';
import { Prop } from '../props/Prop';
import { paint } from '../materials/palette';

interface NightLightOptions {
  /** Colour of the glow. Default a warm amber. */
  color?: number;
}

const BASE_R = 0.045;
const BASE_H = 0.018;
const DOME_R = 0.04;
/** Glow of the silicone dome after dark; by day its light sensor keeps it off. */
const NIGHT_GLOW = 1.4;

/**
 * A little bedside night light: a white puck with a frosted silicone dome that glows amber after
 * dark (a light sensor turns it off by day). Emissive only, no light of its own: it reads as a
 * glow on the nightstand without costing a light in every shader. `setDark()` follows the dusk
 * (the builder wires it to the sun's height): it comes up as the room darkens, never in one step. Origin at the bottom of the base: place it on what it stands on.
 */
export class NightLight extends Prop {
  private readonly dome: THREE.MeshStandardMaterial;

  constructor(options: NightLightOptions = {}) {
    super();
    this.name = 'NightLight';
    const color = options.color ?? 0xffb35a;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R * 0.95, BASE_R, BASE_H, 20), paint(0xf2efe8, 0.5));
    base.position.y = BASE_H / 2;
    // Own material: the glow is per lamp.
    this.dome = new THREE.MeshStandardMaterial({ color: 0xfff1dc, roughness: 0.7, emissive: color, emissiveIntensity: 0 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.dome);
    dome.position.y = BASE_H;
    dome.scale.y = 1.15;
    for (const m of [base, dome]) m.castShadow = false;
    this.add(base, dome);
  }

  /** 0 by day .. 1 in the dark (`duskDarkness` of the sun's height). */
  setDark(darkness: number): void {
    this.dome.emissiveIntensity = darkness * NIGHT_GLOW;
  }
}
