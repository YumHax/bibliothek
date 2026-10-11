import * as THREE from 'three';
import type { Station } from './Station';

/** A walkable point of the hall (zone-local) and the points it connects to in a straight, clear line. */
export interface NavNode {
  id: string;
  at: [x: number, z: number];
  links: string[];
}

/** A machine people can use, and (optionally) where a watcher stands to see it played. */
export interface CrowdStation {
  station: Station;
  /** Zone-local spot to watch from; default: behind and a little to the side of whoever plays. */
  watchAt?: [x: number, z: number];
}

/** How far round the player must be looking for the door to count as out of sight (cos of the angle). */
const DOOR_UNSEEN_COS = 0.35;

/**
 * The hall's floor as its people walk it: routes along the nav graph (straight, clear lines between its points, so
 * nobody walks through a cabinet), where a machine's player, watcher and second player stand and look, and whether
 * the player is looking at the door (nobody pops in or out under their nose). Zone-local points, world foci.
 */
export class CrowdNav {
  private readonly nodes = new Map<string, NavNode>();
  private readonly scratch = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor(
    private readonly nav: readonly NavNode[],
    private readonly door: string,
    /** The camera, and zone-local to world. */
    private readonly viewer: THREE.Object3D,
    readonly toWorld: (p: THREE.Vector3) => THREE.Vector3,
  ) {
    for (const node of nav) this.nodes.set(node.id, node);
  }

  /** The door's floor point. */
  doorPoint(): THREE.Vector3 {
    return this.nodePoint(this.door);
  }

  /** Zone-local spot in front of a machine where its player stands. */
  standSpot(cs: CrowdStation): THREE.Vector3 {
    const { station } = cs;
    return station.standAt.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, station.rotation.y).add(station.position).setY(0);
  }

  /** Facing the machine: the machine's +z turned round. */
  standYaw(cs: CrowdStation): number {
    return cs.station.rotation.y + Math.PI;
  }

  /** World point on the machine where eyes go. */
  focusOf(cs: CrowdStation): THREE.Vector3 {
    return cs.station.localToWorld(cs.station.focus.clone());
  }

  /** Zone-local spot a watcher takes: the plan's, or behind the player's shoulder. */
  watchSpot(cs: CrowdStation): THREE.Vector3 {
    if (cs.watchAt) return new THREE.Vector3(cs.watchAt[0], 0, cs.watchAt[1]);
    const { station } = cs;
    const local = station.standAt.clone().add(new THREE.Vector3(0.38, 0, 0.6));
    return local.applyAxisAngle(THREE.Object3D.DEFAULT_UP, station.rotation.y).add(station.position).setY(0);
  }

  /** Zone-local spot at a two-player machine's second stick, or null. */
  partnerSpot(cs: CrowdStation): THREE.Vector3 | null {
    const partner = cs.station.partner;
    if (!partner) return null;
    return partner.standAt.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, cs.station.rotation.y).add(cs.station.position).setY(0);
  }

  /** The yaw from zone-local `spot` towards world point `focus`. */
  yawTo(spot: THREE.Vector3, focus: THREE.Vector3): number {
    const world = this.toWorld(spot.clone());
    return Math.atan2(focus.x - world.x, focus.z - world.z);
  }

  /** From `from` to `to` (zone-local): to the nearest node, along the graph (shortest by distance), then straight to the spot. */
  route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const start = this.nearestNode(from);
    const goal = this.nearestNode(to);
    const dist = new Map<string, number>([[start.id, 0]]);
    const prev = new Map<string, string>();
    const open = new Set([start.id]);
    while (open.size) {
      let id = '';
      let best = Infinity;
      for (const o of open) if ((dist.get(o) ?? Infinity) < best) [id, best] = [o, dist.get(o)!];
      open.delete(id);
      if (id === goal.id) break;
      const node = this.nodes.get(id)!;
      for (const link of node.links) {
        const other = this.nodes.get(link);
        if (!other) continue;
        const d = best + Math.hypot(other.at[0] - node.at[0], other.at[1] - node.at[1]);
        if (d < (dist.get(link) ?? Infinity)) {
          dist.set(link, d);
          prev.set(link, id);
          open.add(link);
        }
      }
    }
    const ids: string[] = [];
    for (let id: string | undefined = goal.id; id; id = prev.get(id)) {
      ids.unshift(id);
      if (id === start.id) break;
    }
    const path = ids.map((id) => this.nodePoint(id));
    // Skip the first node when we are already past it towards the second.
    if (path.length > 1 && from.distanceTo(path[1]!) < path[0]!.distanceTo(path[1]!)) path.shift();
    path.push(to.clone());
    return path;
  }

  /** Whether the player is looking towards the door. */
  doorInView(): boolean {
    const door = this.toWorld(this.doorPoint());
    this.viewer.getWorldPosition(this.scratch);
    this.viewer.getWorldDirection(this.forward);
    const to = door.sub(this.scratch).setY(0).normalize();
    this.forward.setY(0).normalize();
    return this.forward.dot(to) > DOOR_UNSEEN_COS;
  }

  private nodePoint(id: string): THREE.Vector3 {
    const node = this.nodes.get(id)!;
    return new THREE.Vector3(node.at[0], 0, node.at[1]);
  }

  private nearestNode(p: THREE.Vector3): NavNode {
    let best = this.nav[0]!;
    let bestD = Infinity;
    for (const node of this.nav) {
      const d = Math.hypot(node.at[0] - p.x, node.at[1] - p.z);
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }
}
