import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { METAL, paint, standard, timber } from '../../materials/palette';
import { GLASS, asGlass } from '../../materials/glass';
import { PooledLight } from '../../lighting/LightPool';
import { Glows } from '../common/fitting';
import { lcg } from '@/random';

export interface TerrariumOptions {
  /** Along the wall. Default 0.8. */
  width?: number;
  seed?: number;
}

const DEPTH = 0.42;
const CABINET = 0.7;
const TANK = 0.42;
const SAND = paint(0xd8b878, 1);

/**
 * A glass terrarium on a low cabinet, a heat lamp in its dome clamped over the mesh lid glowing orange: sand, a slab of
 * rock to bask on, a water dish, a little cactus and the shop's tortoise under the lamp, head out. The lamp's warmth
 * on the room is a `PooledLight` (never switched: the tortoise needs it). The shop's, not for sale. Wall-hung with
 * `y: 0`: origin on the floor at the wall, +z into the room. Collides as its box.
 */
export class Terrarium extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: TerrariumOptions = {}) {
    super();
    this.name = 'Terrarium';
    const W = options.width ?? 0.8;
    const random = lcg(options.seed ?? 31);
    const wood = timber(0x5a4030, 0.6);
    // The cabinet, its doors and knobs.
    part(this, W, CABINET, DEPTH, wood, { y: CABINET / 2, z: DEPTH / 2 });
    for (const s of [-1, 1]) {
      part(this, W / 2 - 0.03, CABINET - 0.12, 0.012, timber(0x6a4a36, 0.55), { x: (s * W) / 4, y: CABINET / 2, z: DEPTH + 0.006 });
      const knob = cylinderMesh(0.012, 0.02, METAL.brass(), { x: s * 0.05, y: CABINET * 0.55, z: DEPTH + 0.02 }, { segments: 10 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    const bottom = CABINET;
    const tw = W - 0.04;
    const td = DEPTH - 0.04;
    const zc = DEPTH / 2;
    // The black trim of the tank, the sand, the rock, the dish, a cactus.
    const trim = paint(0x1c1c1e, 0.5);
    part(this, tw, 0.03, td, trim, { y: bottom + 0.015, z: zc });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(this, 0.014, TANK, 0.014, trim, { x: (sx * (tw - 0.014)) / 2, y: bottom + TANK / 2, z: zc + (sz * (td - 0.014)) / 2 });
    part(this, tw - 0.02, 0.05, td - 0.02, SAND, { y: bottom + 0.055, z: zc });
    // The backdrop stands on the sand (sunk into it, its back and sides would lie in the sand's).
    const sandTop = bottom + 0.08;
    const backdropTop = bottom + TANK - 0.03;
    part(this, tw - 0.02, backdropTop - sandTop, 0.01, paint(0x8a6a4a, 0.95), { y: (sandTop + backdropTop) / 2, z: zc - td / 2 + 0.015 });
    const rock = paint(0x7a6a5a, 0.95);
    part(this, 0.22, 0.05, 0.14, rock, { x: -tw * 0.18, y: bottom + 0.1, z: zc - 0.04 });
    part(this, 0.12, 0.08, 0.1, rock, { x: -tw * 0.32, y: bottom + 0.12, z: zc - 0.08 });
    this.add(cylinderMesh(0.06, 0.02, paint(0x4a4a50, 0.4), { x: tw * 0.3, y: bottom + 0.09, z: zc + 0.06 }, { segments: 16 }));
    this.add(cylinderMesh(0.052, 0.004, standard({ color: 0x6a9ab0, roughness: 0.05 }), { x: tw * 0.3, y: bottom + 0.1, z: zc + 0.06 }, { segments: 16 }));
    const cactus = paint(0x4a7a3a, 0.8);
    this.add(cylinderMesh(0.025, 0.14, cactus, { x: tw * 0.36, y: bottom + 0.15, z: zc - 0.1 }, { segments: 8 }));
    this.add(cylinderMesh(0.014, 0.06, cactus, { x: tw * 0.36 + 0.035, y: bottom + 0.17, z: zc - 0.1 }, { segments: 6 }));
    // The tortoise basking on the slab, under the lamp.
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 0.82), paint(0x6a5a2a, 0.7));
    shell.position.set(-tw * 0.18, bottom + 0.125, zc - 0.04);
    shell.rotation.y = 0.5 + random() * 0.3;
    const skin = paint(0x8a8a5a, 0.8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8).scale(1.3, 1, 1), skin);
    head.position.set(0.085, 0.01, 0);
    shell.add(head);
    for (const [lx, lz] of [[0.045, 0.04], [0.045, -0.04], [-0.045, 0.04], [-0.045, -0.04]] as const) {
      const leg = cylinderMesh(0.012, 0.022, skin, { x: lx, y: -0.004, z: lz }, { segments: 6 });
      shell.add(leg);
    }
    // The scutes: a few darker plates.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), paint(0x4a3a1a, 0.7));
      plate.position.set(Math.cos(a) * 0.04, 0.028, Math.sin(a) * 0.035);
      shell.add(plate);
    }
    this.add(shell);
    // The glass and the mesh lid.
    const glass = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.006, TANK, td - 0.006), GLASS.pane);
    glass.position.set(0, bottom + TANK / 2, zc);
    this.add(asGlass(glass));
    part(this, tw, 0.012, td, paint(0x2a2a2c, 0.6), { y: bottom + TANK + 0.006, z: zc });
    // The heat lamp: an aluminium dome on the lid over the slab, its bulb glowing, the thermometer on the glass.
    const glows = new Glows();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL.satinSteel());
    dome.position.set(-tw * 0.18, bottom + TANK + 0.014, zc - 0.04);
    this.add(dome);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), glows.add({ color: 0xffb070, emissive: 0xff7a2a, strength: 2.4 }));
    bulb.position.set(-tw * 0.18, bottom + TANK + 0.02, zc - 0.04);
    bulb.castShadow = false;
    this.add(bulb);
    glows.set(1);
    part(this, 0.03, 0.08, 0.004, paint(0xf0ece0, 0.5), { x: tw * 0.4, y: bottom + TANK * 0.6, z: zc + td / 2 + 0.004 });
    // The warmth it throws: orange, low, always on.
    const light = new PooledLight(0xff8a3a, 0.5, 1.8, 2);
    light.position.set(-tw * 0.18, bottom + TANK - 0.05, zc + 0.2);
    this.add(light);
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, bottom + TANK + 0.12, DEPTH));
  }
}
