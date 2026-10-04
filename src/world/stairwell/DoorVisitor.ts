import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import { playKnock } from '@/audio/doorbell';
import { HEARING, loudness } from '@/audio/hearing';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import type { DoorRinger, Doorstep } from '../hallway/Doorstep';
import { randomLook, type PersonLook } from '../people/looks';
import { Prop } from '../props/Prop';
import { StairWalker, type StairWalkerOptions } from './StairWalker';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREY, landingY } from '@/world/measures/building';

/**
 * Someone from downstairs coming up to the flat's door for a word (`DoorVisitor.come`): who, how
 * they knock, and what they do once the door is opened to them (or they are spoken to on the landing).
 */
interface DoorVisit {
  /** Their name: the door's caption while they wait ("Front door · open to A. Leclerc") and on what they say. */
  who: string;
  /** Knocks before they give up (a knock every `KNOCK_EVERY` s). */
  knocks: number;
  /**
   * The door was opened to them, or they were clicked on the landing: they say their piece
   * (`walker.speak`). Returns how long (s) they stay on the landing before going back down.
   */
  answer(session: SessionActions, walker: StairWalker): number;
  /** Nobody came after their last knock: they go back down (a note under the door, the cat left on the mat...). */
  gaveUp(walker: StairWalker): void;
  /** Just before they turn to go back down (a last word, `walker.speak`). */
  leaving?(walker: StairWalker): void;
  /** Gone from the stairs again. */
  gone?(): void;
}

interface DoorVisitorOptions {
  viewer: THREE.Object3D;
  doorstep: Doorstep;
  ground: StairWalkerOptions['ground'];
  /** Walls between the listener and the door (the hallway's side of it). */
  acoustics?: SoundOcclusion;
  /** World point of the door's outside face, where the knock is. */
  door: THREE.Vector3;
  /** Who comes (their look's seed, or a look): one visitor is one person. */
  seed: number;
  look?: PersonLook;
}

/** Seconds between knocks; seconds to wait for the doorstep when someone else is at the door, then to give up. */
const KNOCK_EVERY = 14;
const RETRY_S = 5;
const GIVE_UP_WAITING_S = 60;
/** The knock's loudness at the door, and at least this anywhere in the flat. */
const KNOCK_LEVEL = 0.32;
const KNOCK_FLOOR = 0.04;

type State = 'away' | 'coming' | 'queueing' | 'waiting' | 'talking' | 'leaving';

/**
 * A neighbour coming up the stairs to the flat's door: up flight A from the half landing below
 * ours, to the spot by the door (the postman's), knocks (`Doorstep.ring`: one caller at a time),
 * waits, and once answered says what they came to say, stays a moment and goes back down. One
 * person, one visit at a time (`come` refuses while busy). Used by the noise complaints and the cat brought
 * back (`building/noiseComplaints`, `cat/CatOuting`). An empty prop; `walker` is placed by the builder.
 */
export class DoorVisitor extends Prop implements Updatable, DoorRinger {
  readonly contactShadow = false;
  readonly walker: StairWalker;
  private visit: DoorVisit | null = null;
  private state: State = 'away';
  private timer = 0;
  private knocks = 0;
  private primed = false;
  private readonly ear = new THREE.Vector3();

  constructor(private readonly options: DoorVisitorOptions) {
    super();
    this.name = 'DoorVisitor';
    const self = this;
    this.walker = new (class extends StairWalker {
      override label(): string | null {
        const visit = self.visit;
        if (!visit || (self.state !== 'waiting' && self.state !== 'queueing' && self.state !== 'coming')) return null;
        return `${visit.who} · talk`;
      }
      override activate(session: SessionActions): void {
        if (self.state !== 'waiting' && self.state !== 'queueing' && self.state !== 'coming') return;
        options.doorstep.leave(self);
        self.answer(session);
      }
    })({ viewer: options.viewer, seed: options.seed, look: options.look ?? randomLook(options.seed), ground: options.ground, talk: () => '' });
    this.walker.setPresent(true, spot());
    this.walker.position.y = landingY(0);
  }

  /** Who is at the door, for its caption (`DoorRinger`). */
  get who(): string {
    return this.visit?.who ?? 'a neighbour';
  }

  /** Whether someone is on their way, waiting or talking. */
  get busy(): boolean {
    return this.state !== 'away';
  }

  /** `visit` comes up to the door; false while another is under way. */
  come(visit: DoorVisit): boolean {
    if (this.state !== 'away') return false;
    this.visit = visit;
    this.state = 'coming';
    this.timer = 0;
    this.knocks = 0;
    const foot = new THREE.Vector3(plan.walk.flightAX, 0, plan.walk.flightFootZ);
    this.walker.appear(foot, landingY(0) - STOREY / 2);
    this.walker.walk([new THREE.Vector3(plan.walk.flightAX, 0, plan.walk.flightTopZ), new THREE.Vector3(plan.walk.flightAX, 0, plan.walk.landingZ), spot()], () => {
      if (this.state !== 'coming') return;
      this.walker.stand(plan.postman.yaw, 'stand');
      this.state = 'queueing';
      this.timer = RETRY_S;
    });
    return true;
  }

  update(dt: number): void {
    if (!this.primed) {
      this.primed = true;
      this.walker.away();
    }
    this.timer += dt;
    const { doorstep } = this.options;
    switch (this.state) {
      case 'queueing':
        // Someone else at the door (the postman): wait for them to be done.
        if (this.timer < RETRY_S) break;
        if (doorstep.ring(this)) {
          this.state = 'waiting';
          this.knock();
        } else if (this.timer > GIVE_UP_WAITING_S) this.giveUp();
        else this.timer = 0;
        break;
      case 'waiting':
        if (this.timer > KNOCK_EVERY) {
          if (this.knocks >= (this.visit?.knocks ?? 3)) this.giveUp();
          else this.knock();
        }
        break;
      case 'talking':
        if (this.timer > 0) this.leave();
        break;
      case 'away':
      case 'coming':
      case 'leaving':
        // Nothing to time: gone, or walking (the walk's own callbacks move the state on).
        break;
    }
  }

  /** The door was opened to them (`DoorRinger`), or they were clicked: their piece, then back down. */
  answer(session: SessionActions): void {
    const visit = this.visit;
    if (!visit) return;
    const stay = visit.answer(session, this.walker);
    this.walker.stand(plan.postman.yaw, 'stand');
    this.state = 'talking';
    this.timer = -Math.max(0.5, stay);
  }

  private knock(): void {
    this.timer = 0;
    this.knocks++;
    const { viewer, acoustics, door } = this.options;
    viewer.getWorldPosition(this.ear);
    const walls = acoustics?.wallsBetween(this.ear, door) ?? 0;
    const level = KNOCK_LEVEL * loudness(this.ear.distanceTo(door), HEARING.knock, walls);
    playKnock(3, Math.max(KNOCK_FLOOR, level));
  }

  private giveUp(): void {
    this.options.doorstep.leave(this);
    this.visit?.gaveUp(this.walker);
    this.leave();
  }

  private leave(): void {
    const visit = this.visit;
    if (this.state === 'leaving' || this.state === 'away') return;
    visit?.leaving?.(this.walker);
    this.options.doorstep.leave(this);
    this.state = 'leaving';
    this.timer = 0;
    this.walker.walk([new THREE.Vector3(plan.walk.flightAX, 0, plan.walk.landingZ), new THREE.Vector3(plan.walk.flightAX, 0, plan.walk.flightTopZ), new THREE.Vector3(plan.walk.flightAX, 0, plan.walk.flightFootZ)], () => {
      this.walker.vanish(() => {
        this.state = 'away';
        this.visit = null;
        visit?.gone?.();
      });
    });
  }
}

/** Where a visitor stands to wait: the postman's spot by the door, clear of its leaf's swing. */
function spot(): THREE.Vector3 {
  const [x, z] = plan.postman.at;
  return new THREE.Vector3(x, 0, z);
}
