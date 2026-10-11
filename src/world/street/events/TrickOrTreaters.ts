import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { randomLook, type PersonLook } from '../../people/looks';
import { inHours } from '@/time/clock';
import { pick, random, within } from '@/random';
import { TRICK_OR_TREAT_HOURS } from '@/holidays/trickOrTreat';
import { Figure } from '../life/Figure';
import { streetLook } from '../life/streetLook';
import type { HalloweenDoor } from '../streetPlacesPlan';

interface TrickOrTreatersOptions {
  /** The doors that answer tonight (walkable ones). */
  doors: readonly HalloweenDoor[];
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  hours: () => number;
  drawDistance: number;
  fade: number;
}

/** The pavements' walking lines (|z|) along Front Street, and Park Street's (x); how far out of a door the children stand. */
const LANE_Z = 10.6;
const PARK_LANE_X = -20.8;
const AT_DOOR = 0.9;
/** Seconds at a door (the knock, the answer, the sweets), and between two rounds of a group. */
const AT_DOOR_S = [4, 7] as const;
const BETWEEN = [60, 160] as const;
const CALLS = ['Trick or treat!', 'Trick or treat! Smell my feet!', 'Sweets, please!'];
const THANKS = ['Thank you!', 'Yesss!', 'Look how many!'];
/** The costumes, in turn: a witch, a ghost, a pumpkin, a skeleton, a black cat. */
type Costume = 'witch' | 'ghost' | 'pumpkin' | 'skeleton' | 'cat';
const COSTUMES: readonly Costume[] = ['witch', 'ghost', 'pumpkin', 'skeleton', 'cat'];

interface Group {
  kids: Figure[];
  parent: Figure;
  /** The doors of its side, in the order it goes round them, its way in and its way out. */
  doors: HalloweenDoor[];
  from: THREE.Vector3;
  to: THREE.Vector3;
  state: 'away' | 'out';
  clock: number;
}

/**
 * Children in costume going door to door on Halloween's evenings (`TRICK_OR_TREAT_HOURS`), a grown-up with them holding
 * the littlest's hand: a group to each side of the street, along its pavement to every door that answers tonight, a
 * call of "Trick or treat!" at each, a hop over the sweets, then on and away; again a while later. They never cross
 * the road (each side its own group). Witches' hats, ghosts' sheets, a pumpkin, a skeleton, cat's ears, a pumpkin pail.
 */
export class TrickOrTreaters extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly groups: Group[] = [];
  private readonly eye = new THREE.Vector3();
  /** The groups waiting at a door, ticked on the street's clock. */
  private readonly waits = new Set<(dt: number) => void>();

  constructor(private readonly dayNight: DayNight, private readonly options: TrickOrTreatersOptions) {
    super();
    this.name = 'TrickOrTreaters';
    let seed = 1901;
    let costume = 0;
    for (const side of [-1, 1] as const) {
      const doors = options.doors.filter((d) => sideOf(d) === side).sort((a, b) => a.at[0] - b.at[0]);
      if (!doors.length) continue;
      const make = (look: PersonLook, label: string, s: number): Figure => {
        const walker = new Walker({ viewer: options.viewer, seed: s, look, speed: 0.95, label, labelWithin: 4, corners: 0.6, fade: true, stopsToTalk: true, lines: ['Trick or treat!', 'We’ve done the whole street!', 'I’m a scary one, look.'] });
        walker.traverse((o) => {
          o.castShadow = false;
        });
        options.place(walker, new THREE.Vector3());
        return new Figure(walker);
      };
      const kids: Figure[] = [];
      for (let k = 0; k < 2 + (side > 0 ? 1 : 0); k++) {
        const s = seed++;
        const dress = COSTUMES[costume++ % COSTUMES.length]!;
        const kid = make(costumeLook(randomLook(s + 200, 'shopper', { age: 'child', season: 'autumn' }), dress), `Trick-or-treater · say hi`, s);
        dressUp(kid.walker, dress);
        kid.walker.hold('pail');
        kids.push(kid);
      }
      const parent = make(streetLook(seed, 'adult'), 'Parent · say hello', seed++);
      // In from the far end of their pavement nearest the first door, out at the other.
      const first = doors[0]!;
      const last = doors[doors.length - 1]!;
      const from = first.id === 'parkStreet' ? new THREE.Vector3(PARK_LANE_X, 0, -32) : new THREE.Vector3(first.at[0] - 8, 0, side * LANE_Z);
      const to = new THREE.Vector3(last.at[0] + 8, 0, side * LANE_Z);
      this.groups.push({ kids, parent, doors, from, to, state: 'away', clock: 5 + this.groups.length * 25 });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.options.viewer.getWorldPosition(this.eye);
    const on = inHours(this.options.hours(), TRICK_OR_TREAT_HOURS) && this.dayNight.state.rain < 0.4;
    for (const wait of [...this.waits]) wait(dt);
    for (const g of this.groups) {
      if (g.state === 'away' && on && (g.clock -= dt) <= 0) this.setOff(g);
      for (const f of [...g.kids, g.parent]) f.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    }
  }

  /** Out along their pavement: door after door, then away. */
  private setOff(g: Group): void {
    g.state = 'out';
    const walkers = [...g.kids, g.parent];
    walkers.forEach((f, i) => f.show(g.from.clone().add(new THREE.Vector3(i * 0.5 - 0.5, 0, 0))));
    // The grown-up holds the littlest's hand.
    g.parent.walker.holdHand(g.kids[0]!.walker);
    g.kids[0]!.walker.holdHand(g.parent.walker);
    this.toDoor(g, 0);
  }

  /** To door `i` (all of them, a little apart), or off the end once they have been to every one. */
  private toDoor(g: Group, i: number): void {
    const door = g.doors[i];
    const all = [...g.kids, g.parent];
    if (!door) {
      let left = all.length;
      all.forEach((f, k) =>
        f.walker.walk([g.to.clone().add(new THREE.Vector3(k * 0.4, 0, 0))], () => {
          f.hide();
          if (--left === 0) {
            g.state = 'away';
            g.clock = within(random, BETWEEN);
            g.parent.walker.holdHand(null);
            g.kids[0]!.walker.holdHand(null);
          }
        }),
      );
      return;
    }
    const out = new THREE.Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw));
    const across = new THREE.Vector3(out.z, 0, -out.x);
    const front = new THREE.Vector3(door.at[0], 0, door.at[1]).addScaledVector(out, AT_DOOR);
    const lane = laneOf(door);
    let arrived = 0;
    all.forEach((f, k) => {
      const spot = front.clone().addScaledVector(across, (k - (all.length - 1) / 2) * 0.55).addScaledVector(out, f === g.parent ? 0.6 : 0);
      const path = [lane.clone().addScaledVector(across, (k - 1) * 0.4), spot];
      // Down Park Street from the corner, or along Front Street to the corner first.
      if (door.id === 'parkStreet' && i > 0) path.unshift(new THREE.Vector3(PARK_LANE_X, 0, -LANE_Z));
      if (i > 0 && g.doors[i - 1]!.id === 'parkStreet') path.unshift(new THREE.Vector3(PARK_LANE_X, 0, -LANE_Z));
      f.walker.walk(path, () => {
        f.walker.stand(door.yaw + Math.PI, f === g.parent ? 'crossed' : 'stand', null);
        if (++arrived === all.length) this.atDoor(g, i);
      });
    });
  }

  /** At the door: the call, the sweets, a hop, then on to the next. */
  private atDoor(g: Group, i: number): void {
    const caller = g.kids[Math.floor(random() * g.kids.length)]!;
    caller.walker.say(pick(random, CALLS), 1.8);
    const wait = within(random, AT_DOOR_S);
    let t = 0;
    const tick = (dt: number): void => {
      t += dt;
      if (t < wait) return;
      this.waits.delete(tick);
      for (const kid of g.kids) {
        kid.walker.react('good');
        if (random() < 0.5) kid.walker.gesture('cheerHop');
      }
      g.kids[g.kids.length - 1]!.walker.say(pick(random, THANKS), 1.4);
      this.toDoor(g, i + 1);
    };
    this.waits.add(tick);
  }

}

/** The side of Front Street a door opens onto: +1 across the street, -1 ours (Park Street's too). */
function sideOf(door: HalloweenDoor): -1 | 1 {
  return door.at[1] > 0 ? 1 : -1;
}

/** Where a door's walkers leave the pavement's line for it. */
function laneOf(door: HalloweenDoor): THREE.Vector3 {
  if (door.id === 'parkStreet') return new THREE.Vector3(PARK_LANE_X, 0, door.at[1]);
  return new THREE.Vector3(door.at[0], 0, sideOf(door) * LANE_Z);
}

/** A child's look for a costume: the clothes under it. */
function costumeLook(look: PersonLook, costume: Costume): PersonLook {
  const out = { ...look, hat: undefined, scarf: undefined, bag: undefined };
  switch (costume) {
    case 'witch':
      return { ...out, top: 'tee', topColor: 0x1c1a22, skirt: 'dress', skirtColor: 0x1c1a22, tights: 0x5a2a6a, shoes: 'boot', shoeColor: 0x1a1a1a, longSleeves: true };
    case 'ghost':
      return { ...out, top: 'tee', topColor: 0xf2f0ea, trousers: 0xe8e6e0, longSleeves: true };
    case 'pumpkin':
      return { ...out, top: 'tee', topColor: 0xe8701a, topAccent: 0x1a1a1a, trousers: 0x2a4a2a, longSleeves: true };
    case 'skeleton':
      return { ...out, top: 'stripes', topColor: 0x141414, topAccent: 0xe8e6e0, trousers: 0x141414, longSleeves: true };
    case 'cat':
      return { ...out, top: 'tee', topColor: 0x141414, trousers: 0x141414, longSleeves: true };
  }
}

/** What goes on the head: a witch's pointed hat, a ghost's sheet, a pumpkin's stalk cap, cat's ears (the skull's frame). */
function dressUp(walker: Walker, costume: Costume): void {
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
  const head = new THREE.Group();
  switch (costume) {
    case 'witch': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 16), black);
      brim.position.y = 0.07;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 14), black);
      cone.position.set(0, 0.23, -0.02);
      cone.rotation.x = -0.18;
      head.add(brim, cone);
      break;
    }
    case 'ghost': {
      // A white sheet over the head and down to the knees, two dark eye holes.
      const sheet = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.95, side: THREE.DoubleSide });
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), sheet);
      const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.3, 0.75, 14, 1, true), sheet);
      fall.position.y = -0.375;
      for (const side of [-1, 1]) {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), black);
        hole.position.set(side * 0.045, 0.02, 0.14);
        head.add(hole);
      }
      head.add(top, fall);
      break;
    }
    case 'pumpkin': {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x3a5a1e, roughness: 0.8 }));
      stalk.position.y = 0.14;
      head.add(stalk);
      break;
    }
    case 'skeleton':
      break;
    case 'cat':
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), black);
        ear.position.set(side * 0.06, 0.12, -0.01);
        ear.rotation.z = -side * 0.3;
        head.add(ear);
      }
      break;
  }
  if (head.children.length) walker.wearOnHead(head);
}

