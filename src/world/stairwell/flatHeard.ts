import * as THREE from 'three';
import type { SoundRoute } from '../acoustics/SoundOcclusion';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREY, STOREYS, landingY } from '@/world/measures/building';

/*
 * How the flat and the stairwell hear each other. The stairwell has no `Room`, so its walls and
 * slabs are not occluders: a straight ray from a TV in the flat to a landing below goes under the
 * flat's walls and counts none, and the floors below would hear the set better than our landing.
 * The real way is round: from the flat to the inside of the front door (its walls counted), through
 * the door (its leaf: a wall while shut, nothing while open), out onto our landing and down the
 * stone well (`WELL_WALLS` a storey). Both ways: the flat's longplay down the stairs, a neighbour's
 * piano up into the flat.
 */

/** A storey of well between the landing and the ear damps like this many walls. */
const WELL_WALLS = 0.8;
/** The points either side of the front door the route goes through (m off the door's plane, height over the floor). */
const DOOR_SIDE = 0.45;
const DOOR_HEIGHT = 1.2;
/** The flat's height band (world y): its floor is at 0, its ceilings under 3.3. */
const FLAT_Y = { min: -0.4, max: 3.3 };
/** How far out the flat reaches (world x, z): every room of it, the balcony; nothing else in the world is near. */
const FLAT_XZ = { x0: -26, x1: 9, z0: -16, z1: 12 };
/** The shaft's top (local), over our landing's ceiling. */
const TOP = landingY(0) + 2.8;

/** The stairwell's spaces (zone-local boxes): the shaft all the way up, our strip of landing, the entrance hall. */
function stairSpaces(): THREE.Box3[] {
  const { shaft, strip, hall } = plan;
  const top0 = landingY(0);
  return [
    new THREE.Box3(new THREE.Vector3(shaft.x0, 0, shaft.z0), new THREE.Vector3(shaft.x1, TOP, shaft.z1)),
    new THREE.Box3(new THREE.Vector3(strip.x0, top0, strip.z0), new THREE.Vector3(strip.x1, top0 + strip.ceiling, strip.z1)),
    new THREE.Box3(new THREE.Vector3(hall.x0, 0, hall.z0), new THREE.Vector3(hall.x1, hall.height, hall.z1)),
  ];
}

/**
 * Where things are, building-wise, for the sounds and the cat: inside the stairwell (its shaft, our
 * strip, the hall), inside the flat, or neither. World points; `origin` is the stairwell zone's.
 */
export class BuildingSpaces {
  private readonly boxes: THREE.Box3[];
  private readonly local = new THREE.Vector3();

  constructor(private readonly origin: THREE.Vector3) {
    this.boxes = stairSpaces();
  }

  /** Whether the world point `p` is in the stairwell. */
  inStairwell(p: THREE.Vector3): boolean {
    this.local.subVectors(p, this.origin);
    return this.boxes.some((box) => box.containsPoint(this.local));
  }

  /** Whether the world point `p` is in the flat (its rooms, the hallway, the balcony). */
  inFlat(p: THREE.Vector3): boolean {
    return p.y > FLAT_Y.min && p.y < FLAT_Y.max && p.x > FLAT_XZ.x0 && p.x < FLAT_XZ.x1 && p.z > FLAT_XZ.z0 && p.z < FLAT_XZ.z1 && !this.inStairwell(p);
  }

  /** Storeys of well between our landing and the world point `p` (0 on our landing and above). */
  storeysBelowUs(p: THREE.Vector3): number {
    const ours = this.origin.y + landingY(0);
    return Math.max(0, Math.min(STOREYS, (ours + 0.5 - p.y) / STOREY));
  }

  /** The world points just inside and just outside the flat's front door. */
  doorSides(): { inside: THREE.Vector3; outside: THREE.Vector3 } {
    const { strip, frontDoor } = plan;
    const at = (dx: number) => new THREE.Vector3(strip.x0 + dx, landingY(0) + DOOR_HEIGHT, frontDoor.z).add(this.origin);
    return { inside: at(-DOOR_SIDE), outside: at(DOOR_SIDE) };
  }
}

/** The route round through the front door, for `SoundOcclusion.addRoute`. */
export function flatStairwellRoute(spaces: BuildingSpaces): SoundRoute {
  const { inside, outside } = spaces.doorSides();
  return (listener, source, walls) => {
    let stair: THREE.Vector3;
    let flat: THREE.Vector3;
    if (spaces.inStairwell(listener) && spaces.inFlat(source)) {
      stair = listener;
      flat = source;
    } else if (spaces.inFlat(listener) && spaces.inStairwell(source)) {
      stair = source;
      flat = listener;
    } else return null;
    const storeys = spaces.storeysBelowUs(stair);
    const round = walls(flat, inside) + walls(inside, outside) + walls(outside, stair) + storeys * WELL_WALLS;
    // On our landing the straight line may be the shorter way (through the one wall between the strip and the flat).
    return storeys < 0.3 ? Math.min(round, walls(listener, source)) : round;
  };
}
