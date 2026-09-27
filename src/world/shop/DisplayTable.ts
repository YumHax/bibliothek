import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { paint, timber } from '../materials/palette';

export interface DisplayTableOptions {
  width?: number;
  depth?: number;
  height?: number;
  /** The top's wood. */
  wood?: number;
  /** A repairer's bench: a chassis opened up, a soldering iron in its stand, a coil of solder, valves in a tray. */
  bench?: boolean;
}

const LEG = 0.045;
const TOP = 0.04;

/**
 * A plain shop table the smaller pieces stand on (the TV repair shop's sets and radios, the florist's pots, the pet
 * shop's baskets): four square legs, a rail, a wooden top; a `bench` has the repairer's things at its back. The pieces
 * on it are placed on their own (`topHeight` is where they stand). Origin on the floor under its middle, its front +z.
 * Collides as its box.
 */
export class DisplayTable extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  readonly topHeight: number;

  constructor(options: DisplayTableOptions = {}) {
    super();
    this.name = 'DisplayTable';
    const W = options.width ?? 1.4;
    const D = options.depth ?? 0.6;
    const H = options.height ?? 0.78;
    this.topHeight = H;
    const wood = timber(options.wood ?? 0xa0784a, 0.55);
    const legs = paint(0x2e2a26, 0.6);
    part(this, W, TOP, D, wood, { y: H - TOP / 2 });
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) part(this, LEG, H - TOP, LEG, legs, { x, y: (H - TOP) / 2, z });
    for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) part(this, W - 0.1 - LEG, 0.06, 0.02, legs, { y: H - TOP - 0.03, z });
    if (options.bench) this.clutter(W, D, H);
    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, H, D / 2));
  }

  /** The repairer's things along the back of the bench. */
  private clutter(W: number, D: number, H: number): void {
    const z = -D / 2 + 0.12;
    const green = paint(0x2f5a3a, 0.5);
    const steel = paint(0x9a9ea4, 0.35);
    // A radio chassis opened up: the green board, a transformer, three valves.
    part(this, 0.3, 0.012, 0.18, green, { x: -W / 2 + 0.3, y: H + 0.006, z });
    part(this, 0.06, 0.05, 0.05, steel, { x: -W / 2 + 0.2, y: H + 0.037, z });
    for (let i = 0; i < 3; i++) this.add(cylinderMesh(0.012, 0.05, paint(0xc8b890, 0.2), { x: -W / 2 + 0.3 + i * 0.05, y: H + 0.037, z: z + 0.04 }, { segments: 10 }));
    // The soldering iron in its coil stand, the reel of solder.
    const stand = cylinderMesh(0.035, 0.015, paint(0x1e1e20, 0.5), { x: W / 2 - 0.25, y: H + 0.0075, z }, { segments: 14 });
    this.add(stand);
    const iron = cylinderMesh(0.008, 0.2, paint(0x2a2a2a, 0.5), { x: W / 2 - 0.25, y: H + 0.1, z }, { segments: 8 });
    iron.rotation.z = 0.6;
    this.add(iron);
    const reel = cylinderMesh(0.03, 0.025, steel, { x: W / 2 - 0.12, y: H + 0.0125, z }, { segments: 14 });
    this.add(reel);
  }
}
