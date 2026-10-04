import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { MailPost } from '@/collection/MailPost';
import { playDoorbell } from '@/audio/doorbell';
import { spatialOf } from '@/audio/spatial';
import { HEARING, loudness } from '@/audio/hearing';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import type { DoorRinger, Doorstep } from '../hallway/Doorstep';
import { randomLook } from '../people/looks';
import { Prop } from '../props/Prop';
import { StairWalker, type StairWalkerOptions } from './StairWalker';
import { liftGate } from './stairRoutes';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREYS, landingY } from '@/world/measures/building';
import type { LiftRides } from './Lift';
import { rememberLook } from '@/social/lookBook';
import type { SocialServices } from '@/social/talk';
import { bodyOf, talkHook } from '../people/socialHook';

interface PostmanOptions {
  viewer: THREE.Object3D;
  post: MailPost;
  doorstep: Doorstep;
  ground: StairWalkerOptions['ground'];
  /** Walls between the listener and the bell (the hallway's side of the front door). */
  acoustics?: SoundOcclusion;
  /** World point of the bell: inside the flat, by the front door. */
  bell: THREE.Vector3;
  /** The lift he comes up and goes down in, for real when it is free (else he steps out of its gate, and fades into it). */
  lift?: LiftRides;
  /** The people the player talks to (docs/social.md): clicked, he talks, the parcel the first entry. */
  social?: SocialServices;
}

/** His person in the social layer (`social/people/building`). */
const PERSON = 'postman';

/** Seconds between rings, and how many before the parcel is left with the concierge. */
const RING_EVERY = 18;
const RINGS = 3;
/** Seconds after a round before he comes again (a second order in the same round waits for the next one). */
const REST = 30;
/** The bell's loudness at the door, and at least this anywhere in the flat. */
const BELL_LEVEL = 0.22;
const BELL_FLOOR = 0.035;

type State = 'away' | 'coming' | 'waiting' | 'leaving';

/**
 * The postman with the mail orders (`MailPost`). Once a round has come and the player is home, he
 * steps out of the lift onto our landing, walks to the front door and rings (`Doorstep.ring`, the
 * bell heard through the flat); opening the front door from inside (`Doorstep.answered`) or clicking
 * him hands the parcel over: it goes under the hall console with the rest. Nobody answering after
 * a few rings, he leaves it with the concierge (it is in the parcel anyway, and a card on the mat
 * says so). Then he goes back into the lift. An empty prop; `walker` is placed by the builder.
 */
export class Postman extends Prop implements Updatable, DoorRinger {
  readonly contactShadow = false;
  readonly who = 'the postman';
  readonly walker: StairWalker;
  private state: State = 'away';
  private timer = 0;
  private rings = 0;
  private primed = false;
  private readonly ear = new THREE.Vector3();

  constructor(private readonly options: PostmanOptions) {
    super();
    this.name = 'Postman';
    const self = this;
    // Clicked on the landing: the same as opening the door to him (with someone to talk to, the conversation's first entry).
    const look = { ...randomLook(plan.postman.seed, 'vendor'), apron: undefined, bag: 'tote' as const };
    rememberLook(PERSON, look);
    const here = (): boolean => self.state === 'waiting' || self.state === 'coming';
    const take = (session: SessionActions): void => {
      if (!here()) return;
      options.doorstep.leave(self);
      self.answer(session);
    };
    const social = talkHook(options.social, PERSON, (session) => ({
      person: PERSON,
      place: 'stairs',
      body: bodyOf(self.walker),
      extras: [{ id: 'parcel', group: 'trade', label: 'Take the parcel', disabled: () => (here() ? null : 'He has handed it over'), run: () => take(session) }],
    }), 'take the parcel');
    this.walker = new (class extends StairWalker {
      override label(): string | null {
        if (!here()) return null;
        return social ? social.caption() : 'The postman · take the parcel';
      }
      override activate(session: SessionActions): void {
        if (!here()) return;
        if (social) social.open(session);
        else take(session);
      }
    })({ viewer: options.viewer, seed: plan.postman.seed, look, ground: options.ground, talk: () => '', speaker: 'Mr Diallo' });
    // Standing at his spot until the first frame, so the start-up compile sees his materials.
    this.walker.setPresent(true, this.spot());
    this.walker.position.y = landingY(0);
  }

  update(dt: number): void {
    if (!this.primed) {
      this.primed = true;
      this.walker.away();
    }
    const { post, doorstep } = this.options;
    this.timer += dt;
    switch (this.state) {
      case 'away':
        if (this.timer > REST && post.isHome && post.due().length) this.come();
        break;
      case 'coming':
        break;
      case 'waiting':
        if (!post.isHome) {
          // The player went out meanwhile: the concierge takes it in (coming home finds it).
          doorstep.leave(this);
          this.leave();
        } else if (this.timer > RING_EVERY) {
          if (this.rings >= RINGS) this.leaveWithConcierge();
          else this.ring();
        }
        break;
      case 'leaving':
        break;
    }
  }

  /** The door was opened to him (or he was clicked): the parcel changes hands. */
  answer(session: SessionActions): void {
    const games = this.options.post.deliver();
    if (!games.length) {
      session.react('The postman checks his list: nothing for you after all.');
      this.walker.speak('Sorry, wrong flat!', 'Postman');
    } else {
      const titles = games.length <= 2 ? games.map((g) => g.title).join(' and ') : `${games.length} games`;
      session.reward({ title: 'A parcel for you!', detail: `${titles}. It goes under the hall console with the rest.` });
      this.walker.speak('Have a nice day!', 'Postman');
    }
    this.leave();
  }

  private come(): void {
    this.state = 'coming';
    this.timer = 0;
    this.rings = 0;
    const stepOut = (): void => {
      if (this.state !== 'coming') return;
      this.walker.appear(liftGate(), landingY(0));
      const path = [new THREE.Vector3(-1.2, 0, plan.walk.landingZ), this.spot()];
      this.walker.walk(path, () => {
        if (this.state !== 'coming') return;
        this.walker.stand(plan.postman.yaw, 'stand');
        this.state = 'waiting';
        if (this.options.doorstep.ring(this)) this.ring();
        else this.leave(); // someone else at the door: he comes back on the next round
      });
    };
    // Up from the hall in the lift, the car really riding when it is free; else he just steps out of its gate.
    if (!this.options.lift?.carry(STOREYS, 0, { arrive: stepOut })) stepOut();
  }

  private ring(): void {
    this.timer = 0;
    this.rings++;
    const { viewer, acoustics, bell } = this.options;
    viewer.getWorldPosition(this.ear);
    const walls = acoustics?.wallsBetween(this.ear, bell) ?? 0;
    const level = BELL_LEVEL * loudness(this.ear.distanceTo(bell), HEARING.bell, walls);
    playDoorbell(Math.max(BELL_FLOOR, level), spatialOf(viewer, bell, walls));
  }

  /** Nobody came: the parcel is left with the concierge, a card slipped under the door. */
  private leaveWithConcierge(): void {
    const { post, doorstep } = this.options;
    doorstep.leave(this);
    if (post.deliver().length) {
      doorstep.slipNote({ title: 'SORRY WE MISSED YOU', lines: ['Your parcel is with the concierge', 'She put it inside your door', 'The Post Office'], accent: 0xd8b21e });
    }
    this.leave();
  }

  private leave(): void {
    this.state = 'leaving';
    this.timer = 0;
    const gone = (): void => {
      this.state = 'away';
      this.timer = 0;
    };
    let atGate = false;
    const riding = this.options.lift?.carry(0, STOREYS, { ready: () => atGate, board: () => this.walker.vanish(gone) });
    this.walker.walk([new THREE.Vector3(-1.2, 0, plan.walk.landingZ), liftGate()], () => {
      atGate = true;
      if (!riding) this.walker.vanish(gone);
    });
  }

  private spot(): THREE.Vector3 {
    const [x, z] = plan.postman.at;
    return new THREE.Vector3(x, 0, z);
  }
}
