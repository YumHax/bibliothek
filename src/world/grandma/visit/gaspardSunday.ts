import * as THREE from 'three';
import type { TalkExtra, TalkSession } from '@/social/talk';
import { GASPARD_ID, MEME_ID } from '@/social/people/family';
import { addMemory, nudge } from '@/social/standing';
import type { FamilyStory, GaspardEnd } from '@/family/FamilyStory';
import { GASPARD_TALK } from '@/grandma/gaspardLines';
import { LineBag } from '@/grandma/lineBag';
import { Walker } from '../../people/Walker';
import { bodyOf, talkHook } from '../../people/socialHook';
import { gaspardLook } from '../familyLooks';
import { GASPARD_PLAN as PLAN } from '../gaspardPlan';
import type { MemeArrival, MemeFeature, MemeFeatureLive, MemeScene } from '../memeScene';

/** Seconds after her hello before he says his word, and after he is gone before she says hers. */
const AFTER_HELLO = 0.8;
const AFTER_HIM = 2.5;

/** Where the reckoning stands this Sunday: not begun, the player's first line said, played out. */
type Stage = 'idle' | 'asked' | 'done';

/**
 * GASPARD AT HER SUNDAY TABLE (docs/grandma.md "The end of the story"): once the row is seen in her album, some Sundays
 * at lunch he is on the door-end chair when the player comes in (`FamilyStory.gaspardAt`): a word, a conversation of
 * his own (polite or cold as the player likes; the sale dodged), then his watch and the traffic. Once the sale is
 * seen he is there every Sunday until it is had out: "We need to talk about the sale.", and three ways on, with Mémé
 * standing up for what she saw, his apology, or the door.
 */
export const gaspardAtTable: MemeFeature = {
  id: 'gaspard',
  start(scene) {
    const family = scene.ctx.family;
    return family ? new GaspardSunday(scene, family) : {};
  },
};

class GaspardSunday implements MemeFeatureLive {
  private readonly body: Walker;
  private readonly openings = new LineBag(() => GASPARD_TALK.opening);
  private readonly chats = new LineBag(() => GASPARD_TALK.chat);
  private readonly dodges = new LineBag(() => GASPARD_TALK.dodge);
  private readonly leavings = new LineBag(() => GASPARD_TALK.leaving);
  private readonly afters = new LineBag(() => GASPARD_TALK.afterHim);
  /** At the table now (from the player's coming in until he walks out). */
  private here = false;
  private going = false;
  private wasIn = false;
  private talking = false;
  private stage: Stage = 'idle';
  /** Seconds he has sat there since the player came in (not counting a conversation with him). */
  private sat = 0;

  constructor(
    private readonly scene: MemeScene,
    private readonly family: FamilyStory,
  ) {
    const { zone, ctx } = scene;
    const social = talkHook(ctx.social, GASPARD_ID, () => this.session());
    const [x, z] = PLAN.seat.at;
    this.body = zone.place(
      new Walker({ viewer: ctx.listener, seed: 1958, look: gaspardLook(), label: 'Gaspard', speaker: 'Gaspard', talk: () => this.chats.next(), ...(social ? { social } : {}) }),
      new THREE.Vector3(x, 0, z),
      PLAN.seat.yaw,
    );
    this.body.setPresent(false);
  }

  arrived(arrival: MemeArrival): void {
    if (!this.here) return;
    this.scene.zone.after(arrival.helloEnds + AFTER_HELLO, () => {
      if (this.here && !this.going && this.scene.playerIn) this.body.speak(this.openings.next());
    });
  }

  left(): void {
    this.here = this.going = false;
    this.body.setPresent(false);
  }

  update(dt: number): void {
    const { scene } = this;
    const filming = scene.ctx.memories?.filming ?? false;
    // In (not coming back from a memory filmed elsewhere): is it one of his Sundays?
    if (scene.playerIn && !this.wasIn && !filming) this.comeIn();
    this.wasIn = scene.playerIn;
    // Today's people stay out of the past's pictures.
    this.body.visible = this.here && !filming;
    if (!this.here || this.going || this.talking || this.stage === 'asked') return;
    this.sat += dt;
    if (this.sat >= PLAN.stay && this.stage === 'idle') this.leave(true);
  }

  /** The player in: on his Sunday, he is at the table already. */
  private comeIn(): void {
    const { scene, family } = this;
    if (this.here || !family.gaspardAt(scene.day(), scene.hour())) return;
    family.gaspardCame(scene.day());
    const [x, z] = PLAN.seat.at;
    this.body.rotation.y = PLAN.seat.yaw;
    this.body.setPresent(true, new THREE.Vector3(x, 0, z));
    this.body.sit(PLAN.seat.yaw, PLAN.seat.height, 'lap', scene.world(...PLAN.gaze));
    this.here = true;
    this.going = false;
    this.stage = 'idle';
    this.sat = 0;
  }

  /** His conversation: the sale dodged before it is seen, the reckoning after. */
  private session(): TalkSession {
    this.talking = true;
    return {
      person: GASPARD_ID,
      place: 'theirFlat',
      body: bodyOf(this.body),
      extras: this.entries(),
      onClose: () => {
        this.talking = false;
      },
    };
  }

  private entries(): TalkExtra[] {
    const { family } = this;
    const asked = (): string | null => (this.stage === 'asked' ? null : 'not now');
    return [
      { id: 'gaspard:dodge', group: 'ask', label: 'About the sale…', disabled: () => (family.saleSeen ? 'seen' : null), run: () => ({ line: this.dodges.next() }) },
      {
        id: 'gaspard:confront',
        group: 'talk',
        label: GASPARD_TALK.confront.ask,
        disabled: () => (family.reckoning && this.stage === 'idle' && !this.going ? null : 'not now'),
        run: () => {
          this.stage = 'asked';
          return { line: GASPARD_TALK.confront.his };
        },
      },
      { id: 'gaspard:sawYou', group: 'talk', label: GASPARD_TALK.sawYou.ask, disabled: asked, run: () => this.reckon('apologised', GASPARD_TALK.sawYou.his) },
      {
        id: 'gaspard:catalogue',
        group: 'talk',
        label: GASPARD_TALK.catalogue.label,
        disabled: () => (this.stage === 'asked' && this.scene.ctx.keepsakes?.has('catalogue') ? null : 'not now'),
        run: () => this.reckon('apologised', GASPARD_TALK.catalogue.his),
      },
      { id: 'gaspard:crane', group: 'talk', label: GASPARD_TALK.crane.ask, disabled: asked, run: () => this.reckon('gone', GASPARD_TALK.crane.his) },
      { id: 'gaspard:silence', group: 'talk', label: GASPARD_TALK.silence.label, disabled: asked, run: () => this.reckon('silent', GASPARD_TALK.silence.his[0]) },
    ];
  }

  /** The player's choice made: the conversation closes on his answer and the scene plays out. */
  private reckon(end: GaspardEnd, line: string): { line: string; close: true } {
    this.stage = 'done';
    this.scene.zone.after(1.2, () => this.playOut(end));
    return { line, close: true };
  }

  /** Mémé's part and his, a beat apart; then it is settled for good. */
  private playOut(end: GaspardEnd): void {
    const { scene, body } = this;
    const { meme } = scene;
    const beat = PLAN.beat;
    const steps: (() => void)[] = [];
    const standsUp = (): void => {
      if (!scene.claim('gaspard')) return;
      meme.stand(yawTo(meme.position, body.position), 'stand', body.getWorldPosition(new THREE.Vector3()).setY(PLAN.headSeated));
      meme.feel({ frown: 0.8 }, beat * 2);
    };
    const sitsDown = (): void => {
      if (scene.busyWith !== 'gaspard') return;
      scene.reseat();
      scene.release('gaspard');
    };
    if (end === 'apologised') {
      const t = GASPARD_TALK.sawYou;
      steps.push(
        () => {
          standsUp();
          meme.speak(t.meme[0]);
        },
        () => meme.speak(t.meme[1]),
        () => {
          meme.speak(t.meme[2]);
          body.gesture('rubNeck');
          body.feel({ frown: 0.6, squint: 0.4 }, beat * 2);
        },
        () => body.speak(t.sorry[0]),
        () => {
          body.speak(t.sorry[1]);
          body.gesture('sigh');
        },
        () => meme.speak(t.memeLast),
        () => {
          body.speak(t.bye);
          this.leave(false);
        },
        () => {
          meme.speak(t.memeBye);
          sitsDown();
        },
      );
    } else if (end === 'gone') {
      const t = GASPARD_TALK.crane;
      steps.push(
        () => {
          standsUp();
          meme.speak(t.meme[0]);
        },
        () => meme.speak(t.meme[1]),
        () => {
          body.gesture('headShake');
          body.speak(t.bye);
          this.leave(false);
        },
        () => sitsDown(),
      );
    } else {
      const t = GASPARD_TALK.silence;
      steps.push(
        () => {
          body.gesture('checkWatch');
          body.speak(t.his[1]);
          this.leave(false);
        },
        () => {},
        () => meme.speak(t.meme[0]),
        () => meme.speak(t.meme[1]),
      );
    }
    steps.forEach((step, i) => scene.zone.after(i * beat, step));
    this.settle(end);
  }

  /** Settled with him: the journal, his memory of it, her warmth for the player standing by her (or not). */
  private settle(end: GaspardEnd): void {
    const { family, scene } = this;
    const day = scene.day();
    family.settleGaspard(end, day);
    family.note(GASPARD_TALK.journal[end], 'headline');
    const memory = GASPARD_TALK.memory[end];
    if (end === 'apologised') nudge(GASPARD_ID, { warmth: 12, trust: 15, day, memory, memoryWeight: 8 });
    else if (end === 'gone') nudge(GASPARD_ID, { warmth: -25, trust: -10, day, memory, memoryWeight: -20 });
    else addMemory(GASPARD_ID, day, memory, -4);
    if (end !== 'silent') nudge(MEME_ID, { warmth: 6, trust: 6, why: 'you stood by her', day, memory: 'you stood by me with Gaspard', memoryWeight: 15 });
  }

  /** Up, a look at his watch (on his own), and out by the landing door. */
  private leave(own: boolean): void {
    if (this.going) return;
    this.going = true;
    const { body, scene } = this;
    this.family.gaspardLeft(scene.day());
    if (own) {
      body.gesture('checkWatch');
      body.speak(this.leavings.next());
    }
    scene.zone.after(own ? 1.8 : 0.6, () => {
      body.walk(PLAN.leave.map(([x, z]) => new THREE.Vector3(x, 0, z)), () => {
        body.setPresent(false);
        this.here = this.going = false;
        if (own) scene.zone.after(AFTER_HIM, () => {
          if (scene.playerIn && !scene.busyWith) scene.say([this.afters.next()]);
        });
      });
    });
  }
}

/** The yaw (0 = +z) that turns someone at `from` to face `to` (zone-local). */
function yawTo(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
