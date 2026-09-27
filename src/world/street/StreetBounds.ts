import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { FacadeSpec } from './streetPlan';

/** How deep the box behind a face is: the facade's own wall, no deeper (our door's sas stands right behind it). */
const THICK = 0.2;
const HIGH = 3;

/**
 * What stops the player at the street's edges, where they see it: a box behind every building face
 * (`FACADES`, the street-level holes in them left open: our building's door into its sas), plus the
 * `extra` obstacles drawn by instanced meshes that cannot collide themselves (lamp posts, tree
 * trunks). The railings, the hoardings and barriers of the roadworks and the roadworker in the
 * road's gap collide on their own (`StreetFurniture`, `StreetDetails`, `Flagger`). Nothing is drawn.
 */
export class StreetBounds extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];

  constructor(facades: readonly FacadeSpec[], extra: readonly THREE.Box3[] = []) {
    super();
    this.name = 'StreetBounds';
    this.colliders = [...facades.flatMap(behind), ...extra];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}

/** The boxes behind a face (every face runs along x or z), `THICK` deep away from the way it looks, round its openings. */
function behind(spec: FacadeSpec): THREE.Box3[] {
  const [ax, az] = spec.from;
  const [bx, bz] = spec.to;
  const length = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / length;
  const uz = (bz - az) / length;
  // The face looks along the left-hand normal (-uz, ux); the wall's body lies the other way.
  const nx = -uz;
  const nz = ux;
  const box = (s0: number, s1: number): THREE.Box3 => {
    const p0 = new THREE.Vector3(ax + ux * s0, 0, az + uz * s0);
    const p1 = new THREE.Vector3(ax + ux * s1 - nx * THICK, HIGH, az + uz * s1 - nz * THICK);
    return new THREE.Box3().setFromPoints([p0, p1]);
  };
  const boxes: THREE.Box3[] = [];
  let s0 = 0;
  for (const hole of [...(spec.openings ?? [])].sort((a, b) => a.at - b.at)) {
    boxes.push(box(s0, hole.at - hole.width / 2));
    s0 = hole.at + hole.width / 2;
  }
  boxes.push(box(s0, length));
  return boxes;
}
