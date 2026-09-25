import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { ArcadeResult } from '@/game/SessionActions';
import type { Walker } from '../people/Walker';
import type { Station } from './Station';
import { Prop } from '../props/Prop';

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

/** Somewhere the kid likes to stand when nobody is worth watching: facing `yaw`, eyes on `look` (zone-local). */
export interface HangoutSpot {
  at: [x: number, z: number];
  yaw: number;
  look?: [x: number, y: number, z: number];
}

export interface ArcadeCrowdOptions {
  /** The hall's walkable graph; every station's stand spot and every hangout is reached from its nearest node. */
  nav: NavNode[];
  /** The node at the door: regulars come in and go out there. */
  door: string;
  stations: CrowdStation[];
  /** The regulars who come and go (hidden when out), and the kid who stays and watches. */
  regulars: Walker[];
  kid: Walker | null;
  hangouts: HangoutSpot[];
  /** At most this many regulars in the hall at once, right now (the hall fills up in the evening). */
  maxInside: () => number;
  /** Each regular's initials, as they sign the hall of fame (same order as `regulars`). */
  names?: readonly string[];
  /**
   * A regular's game ended on `station` with `score`: the builder may put it on the hall of fame
   * under their initials; what it returns (if anything) the regular says.
   */
  onRegularScore?: (station: Station, score: number, name: string) => string | null;
  /** The camera: nobody walks in or out while the player is looking at the door. */
  viewer: THREE.Object3D;
  /** Zone-local to world and back. */
  toWorld: (p: THREE.Vector3) => THREE.Vector3;
}

/** How long a regular plays a machine, and waits outside between visits (seconds). */
const PLAY_SECONDS: [number, number] = [40, 110];
const AWAY_SECONDS: [number, number] = [8, 35];
/** How far round the player must be looking for the door to count as out of sight (cos of the angle). */
const DOOR_UNSEEN_COS = 0.35;
const REGULAR_CHATTER = ['Yes!', 'Come on...', 'Argh!', 'So close!', 'Ha!', 'No no no...'];
const PARTNER_LINES = ['Player two! Me! Me!', 'I call the blue stick!', 'Two players? I am in.'];
const PARTNER_RESULTS = { won: ['Rematch. Now.', 'I let you win.', 'The blue stick is broken.'], lost: ['Ha! Kid wins!', 'Too easy.', 'Again? I will go easy.'] };

type RegularState =
  | { kind: 'out'; left: number }
  | { kind: 'going'; to: CrowdStation }
  | { kind: 'playing'; at: CrowdStation; left: number; chatter: number }
  | { kind: 'leaving' };

type KidState =
  | { kind: 'hanging'; left: number }
  | { kind: 'walking' }
  | { kind: 'watching'; at: CrowdStation; byPlayer: boolean; left: number }
  | { kind: 'partner'; at: CrowdStation };

const rand = ([a, b]: [number, number]): number => a + Math.random() * (b - a);

/**
 * Who is in the arcade and what they do: a few regulars walk in through the door (only when the
 * player is not looking at it), take a free machine (it plays itself, `Station.occupy`), play it
 * a minute or two with the odd exclamation, then try another or leave; the kid hangs about the
 * hall of fame and the machines, and whenever the player starts a play comes to watch over their
 * shoulder, cheering a record ("NEW RECORD!", arms up), groaning at a flop. Paths follow the
 * hall's nav graph, so nobody walks through a cabinet. An empty `Prop` the zone ticks; the builder
 * places the walkers.
 */
export class ArcadeCrowd extends Prop implements Updatable {
  private readonly options: ArcadeCrowdOptions;
  private readonly nodes = new Map<string, NavNode>();
  private readonly regulars: { walker: Walker; state: RegularState; name: string }[];
  private kidState: KidState = { kind: 'hanging', left: 2 };
  /** Stations a regular is heading for, so two never pick the same. */
  private readonly claimed = new Set<CrowdStation>();
  private readonly scratch = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor(options: ArcadeCrowdOptions) {
    super();
    this.name = 'ArcadeCrowd';
    this.options = options;
    for (const node of options.nav) this.nodes.set(node.id, node);
    this.regulars = options.regulars.map((walker, i) => ({ walker, state: { kind: 'out', left: i * 6 + 1 } as RegularState, name: options.names?.[i] ?? 'REG' }));
    for (const r of this.regulars) r.walker.setPresent(false);
    for (const cs of options.stations) {
      cs.station.stationEvents.onPlayerStart = () => this.playerStarted(cs);
      cs.station.stationEvents.onPlayerResult = (result) => this.playerResult(cs, result);
      cs.station.stationEvents.onPlayerLeave = () => this.playerLeft(cs);
      cs.station.stationEvents.onRegularResult = (score) => this.regularResult(cs, score);
    }
  }

  /** Someone already at a machine when the player walks in (the hall is never empty). */
  seat(regular: number, station: number): void {
    const r = this.regulars[regular];
    const cs = this.options.stations[station];
    if (!r || !cs || !cs.station.occupy()) return;
    r.walker.setPresent(true, this.standSpot(cs));
    r.walker.rotation.y = this.standYaw(cs);
    this.standAtMachine(r.walker, cs);
    r.state = { kind: 'playing', at: cs, left: rand(PLAY_SECONDS), chatter: 5 + Math.random() * 10 };
  }

  update(dt: number): void {
    for (const r of this.regulars) this.updateRegular(r, dt);
    this.updateKid(dt);
  }

  /** How many regulars are in the hall now (walking in, playing, leaving). */
  get inside(): number {
    return this.regulars.filter((r) => r.state.kind !== 'out').length;
  }

  // --- Regulars ---------------------------------------------------------------------------------

  private updateRegular(r: { walker: Walker; state: RegularState; name: string }, dt: number): void {
    const s = r.state;
    switch (s.kind) {
      case 'out': {
        s.left -= dt;
        if (s.left > 0 || this.inside >= this.options.maxInside() || this.doorInView()) return;
        const target = this.freeStation();
        if (!target) {
          s.left = 5;
          return;
        }
        r.walker.setPresent(true, this.nodePoint(this.options.door));
        this.goTo(r, target);
        return;
      }
      case 'going':
        return; // the walker's `then` moves the state on
      case 'playing': {
        s.left -= dt;
        s.chatter -= dt;
        if (s.chatter <= 0) {
          s.chatter = 12 + Math.random() * 20;
          r.walker.say(REGULAR_CHATTER[Math.floor(Math.random() * REGULAR_CHATTER.length)]!, 1.6);
        }
        // Time to go, or the hall is emptying out for the night.
        if (s.left > 0 && this.inside <= this.options.maxInside() + 1) return;
        s.at.station.release();
        // Another go somewhere else, or home.
        const next = Math.random() < 0.45 ? this.freeStation() : null;
        if (next) this.goTo(r, next);
        else this.leave(r);
        return;
      }
      case 'leaving':
        return;
    }
  }

  private goTo(r: { walker: Walker; state: RegularState; name: string }, target: CrowdStation): void {
    this.claimed.add(target);
    r.state = { kind: 'going', to: target };
    r.walker.walk(this.route(r.walker.position, this.standSpot(target)), () => {
      this.claimed.delete(target);
      // Taken meanwhile (the player got there first): try another, or give up.
      if (!target.station.occupy()) {
        const other = this.freeStation();
        if (other) this.goTo(r, other);
        else this.leave(r);
        return;
      }
      this.standAtMachine(r.walker, target);
      r.state = { kind: 'playing', at: target, left: rand(PLAY_SECONDS), chatter: 4 + Math.random() * 8 };
    });
  }

  private leave(r: { walker: Walker; state: RegularState; name: string }): void {
    r.state = { kind: 'leaving' };
    r.walker.walk(this.route(r.walker.position, this.nodePoint(this.options.door)), () => {
      r.walker.setPresent(false);
      r.state = { kind: 'out', left: rand(AWAY_SECONDS) };
    });
  }

  /** At the controls: facing the machine, bent over it as it asks, hands on its controls, eyes on its screen. */
  private standAtMachine(walker: Walker, cs: CrowdStation): void {
    walker.stand(this.standYaw(cs), 'play', this.focusOf(cs), () => cs.station.handsAt(), cs.station.lean);
  }

  private freeStation(): CrowdStation | null {
    const free = this.options.stations.filter((cs) => !cs.station.occupant && !cs.station.outOfOrder && !this.claimed.has(cs) && !this.partnered(cs));
    return free[Math.floor(Math.random() * free.length)] ?? null;
  }

  // --- The kid ----------------------------------------------------------------------------------

  private updateKid(dt: number): void {
    const kid = this.options.kid;
    if (!kid) return;
    const s = this.kidState;
    if (s.kind === 'hanging') {
      s.left -= dt;
      if (s.left > 0) return;
      // Watch a regular for a bit, or go and stand somewhere else.
      const busy = this.options.stations.filter((cs) => cs.station.occupant === 'regular');
      if (busy.length && Math.random() < 0.4) this.kidWatch(busy[Math.floor(Math.random() * busy.length)]!, false);
      else this.kidHangOut();
    } else if (s.kind === 'watching' && !s.byPlayer) {
      s.left -= dt;
      if (s.left <= 0 || s.at.station.occupant !== 'regular') this.kidHangOut();
    }
  }

  private kidHangOut(): void {
    const kid = this.options.kid;
    const spots = this.options.hangouts;
    if (!kid || !spots.length) return;
    const spot = spots[Math.floor(Math.random() * spots.length)]!;
    this.kidState = { kind: 'walking' };
    kid.walk(this.route(kid.position, new THREE.Vector3(spot.at[0], 0, spot.at[1])), () => {
      kid.stand(spot.yaw, Math.random() < 0.5 ? 'pockets' : 'crossed', spot.look ? this.options.toWorld(new THREE.Vector3(...spot.look)) : null);
      this.kidState = { kind: 'hanging', left: 6 + Math.random() * 12 };
    });
  }

  private kidWatch(cs: CrowdStation, byPlayer: boolean): void {
    const kid = this.options.kid;
    if (!kid) return;
    this.kidState = { kind: 'walking' };
    const spot = this.watchSpot(cs);
    kid.walk(this.route(kid.position, spot), () => {
      const focus = this.focusOf(cs);
      const local = this.options.toWorld(spot.clone());
      const yaw = Math.atan2(focus.x - local.x, focus.z - local.z);
      kid.stand(yaw, byPlayer ? 'crossed' : 'pockets', focus);
      this.kidState = { kind: 'watching', at: cs, byPlayer, left: 10 + Math.random() * 15 };
    });
  }

  private playerStarted(cs: CrowdStation): void {
    const s = this.kidState;
    if ((s.kind === 'watching' || s.kind === 'partner') && s.at === cs) return;
    if (cs.station.partner) this.kidPartner(cs);
    else this.kidWatch(cs, true);
  }

  /** A two-player machine: the kid takes the second stick (the machine plays it until they get there). */
  private kidPartner(cs: CrowdStation): void {
    const kid = this.options.kid;
    const partner = cs.station.partner;
    if (!kid || !partner) return;
    this.kidState = { kind: 'walking' };
    const spot = partner.standAt.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, cs.station.rotation.y).add(cs.station.position).setY(0);
    kid.say(PARTNER_LINES[Math.floor(Math.random() * PARTNER_LINES.length)]!, 2);
    kid.walk(this.route(kid.position, spot), () => {
      if (cs.station.occupant !== 'player') {
        this.kidState = { kind: 'hanging', left: 1 };
        return;
      }
      kid.stand(this.standYaw(cs), 'play', this.focusOf(cs), () => partner.handsAt(), cs.station.lean);
      partner.setPartner('KID');
      this.kidState = { kind: 'partner', at: cs };
    });
  }

  /** Whether the kid is at this machine's second stick (a regular leaves it be). */
  private partnered(cs: CrowdStation): boolean {
    return this.kidState.kind === 'partner' && this.kidState.at === cs;
  }

  private playerResult(cs: CrowdStation, result: ArcadeResult): void {
    const kid = this.options.kid;
    const s = this.kidState;
    if (kid && s.kind === 'partner' && s.at === cs) {
      const lines = result.best || result.score > 0 ? PARTNER_RESULTS.won : PARTNER_RESULTS.lost;
      kid.say(lines[Math.floor(Math.random() * lines.length)]!, 2.4);
      return;
    }
    if (!kid || s.kind !== 'watching' || s.at !== cs) return;
    let line: string;
    let cheer = false;
    if (result.prize) {
      line = 'NO WAY! It actually let go!';
      cheer = true;
    } else if (cs.station.name === 'ClawMachine') {
      line = Math.random() < 0.5 ? 'Rigged. Told you.' : 'Nearly had it!';
    } else if (result.best) {
      line = Math.random() < 0.5 ? 'NEW RECORD!' : 'WHOA!';
      cheer = true;
    } else if (result.score === 0) {
      line = 'Ouch.';
    } else {
      line = ['Nice one!', 'Not bad!', 'Aww...', 'So close!', 'Again! Again!'][Math.floor(Math.random() * 5)]!;
    }
    kid.say(line, 2.4);
    if (cheer) {
      kid.setPose('cheer');
      window.setTimeout(() => kid.setPose('crossed'), 1800);
    }
  }

  private playerLeft(cs: CrowdStation): void {
    const s = this.kidState;
    cs.station.partner?.setPartner(null);
    if ((s.kind === 'watching' || s.kind === 'partner') && s.at === cs) this.kidState = { kind: 'hanging', left: 2 + Math.random() * 3 };
  }

  /** A regular's game ended: their score may go on the board, and they have something to say about it. */
  private regularResult(cs: CrowdStation, score: number): void {
    const r = this.regulars.find((o) => o.state.kind === 'playing' && o.state.at === cs);
    if (!r) return;
    const line = this.options.onRegularScore?.(cs.station, score, r.name);
    if (line) {
      r.walker.say(line, 2.6);
      r.walker.setPose('cheer');
      // Then back to the controls, if still at them.
      window.setTimeout(() => {
        if (r.state.kind === 'playing' && r.state.at === cs) this.standAtMachine(r.walker, cs);
      }, 1500);
    }
  }

  // --- Geometry ---------------------------------------------------------------------------------

  /** Zone-local spot in front of a machine where its player stands. */
  private standSpot(cs: CrowdStation): THREE.Vector3 {
    const { station } = cs;
    return station.standAt.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, station.rotation.y).add(station.position).setY(0);
  }

  /** Facing the machine: the machine's +z turned round. */
  private standYaw(cs: CrowdStation): number {
    return cs.station.rotation.y + Math.PI;
  }

  /** World point on the machine where eyes go. */
  private focusOf(cs: CrowdStation): THREE.Vector3 {
    return cs.station.localToWorld(cs.station.focus.clone());
  }

  /** Zone-local spot a watcher takes: the plan's, or behind the player's shoulder. */
  private watchSpot(cs: CrowdStation): THREE.Vector3 {
    if (cs.watchAt) return new THREE.Vector3(cs.watchAt[0], 0, cs.watchAt[1]);
    const { station } = cs;
    const local = station.standAt.clone().add(new THREE.Vector3(0.38, 0, 0.6));
    return local.applyAxisAngle(THREE.Object3D.DEFAULT_UP, station.rotation.y).add(station.position).setY(0);
  }

  private nodePoint(id: string): THREE.Vector3 {
    const node = this.nodes.get(id)!;
    return new THREE.Vector3(node.at[0], 0, node.at[1]);
  }

  private nearestNode(p: THREE.Vector3): NavNode {
    let best = this.options.nav[0]!;
    let bestD = Infinity;
    for (const node of this.options.nav) {
      const d = Math.hypot(node.at[0] - p.x, node.at[1] - p.z);
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  /** From `from` to `to` (zone-local): to the nearest node, along the graph (shortest by distance), then straight to the spot. */
  private route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
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

  /** Whether the player is looking towards the door (nobody pops in or out under their nose). */
  private doorInView(): boolean {
    const door = this.options.toWorld(this.nodePoint(this.options.door));
    this.options.viewer.getWorldPosition(this.scratch);
    this.options.viewer.getWorldDirection(this.forward);
    const to = door.sub(this.scratch).setY(0).normalize();
    this.forward.setY(0).normalize();
    return this.forward.dot(to) > DOOR_UNSEEN_COS;
  }
}
