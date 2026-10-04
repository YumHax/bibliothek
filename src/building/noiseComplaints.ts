import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { NoticeActions } from '@/notices';
import { playBroomThumps } from '@/audio/throughFloor';
import { playMurmur } from '@/audio/murmur';
import { Prop } from '@/world/props/Prop';
import type { DoorVisitor } from '@/world/stairwell/DoorVisitor';
import type { MailPiece } from '@/world/props/MailDrop';
import { NEIGHBOUR_NOISE as plan } from './neighbourNoisePlan';
import { flatNoise, flatNoiseSource } from './flatNoise';
import { befriend, lastCounted } from './friendship';
import { pinSource, refreshBoard } from './boardNotes';
import { inHours, nightOf } from '@/time/clock';
import { BUILDING_SOCIAL } from './buildingSocialPlan';
import { effectValue, has } from '@/social/perks';
import { markMood } from '@/social/mood';
import { addMemory } from '@/social/standing';

/** Who complains, to the social layer (`social/people`): his standing moves the threshold, the hours, what he does. */
const COMPLAINER = 'leclerc';
/** A Cold syndic makes his reminder cost the building's goodwill this much more. */
const STRICT_FACTOR = 1.5;

interface NoiseWatchOptions {
  /** The ears (the camera): the broom is heard where the player is. */
  listener: THREE.Object3D;
  inFlat: (p: THREE.Vector3) => boolean;
  /** The downstairs neighbour coming up to the door (`DoorVisitor`, him). */
  visitor: DoorVisitor;
  /** A note under the flat's door. */
  slipNote: (piece: MailPiece) => void;
  hours: () => number;
  day: () => number;
  /** The subtitle for a voice through the floor. */
  notices?: NoticeActions;
}

/** Quiet this long (s) after the broom and downstairs lets it go. */
const SETTLED_S = 10;
/** The broom's loudness in the flat; on the stairs (the landing's door shut) it is barely heard. */
const BROOM_LEVEL = { flat: 0.55, elsewhere: 0 };

type Stage = 'calm' | 'broomed' | 'atDoor' | 'answered' | 'done';

/**
 * The flat too loud after ten (`flatNoise`, `NEIGHBOUR_NOISE.quietHours`), and the neighbour
 * underneath minds, by steps: a broom handle on his ceiling first (heard through the flat's floor,
 * his shout as a subtitle), then up the stairs to knock on the door (`DoorVisitor`): answered, a
 * word and a little cooler (`friendship`); not answered, a note under the door and colder; still
 * loud after his visit, it goes to the syndic, a reminder on the hall's board the next two days and
 * the whole 4th floor cooler. Turned down at the broom, nothing more comes of it. Once a night at
 * most. Counted in real seconds while it plays; an empty prop of the stairwell's zone.
 */
export class NoiseWatch extends Prop implements Updatable {
  readonly contactShadow = false;
  private stage: Stage = 'calm';
  private loudFor = 0;
  private quietFor = 0;
  private timer = 0;
  private night = NaN;
  private nth = 0;
  /** He was answered at the door this visit: a quick turn-down gets a thank-you as he goes. */
  private answered = false;
  private readonly ear = new THREE.Vector3();
  private readonly unpin: () => void;

  constructor(private readonly options: NoiseWatchOptions) {
    super();
    this.name = 'NoiseWatch';
    const { key } = plan.complainer;
    const { board } = plan;
    this.unpin = pinSource('noiseComplaints', (day) => {
      const when = lastCounted(key, 'escalated');
      if (when === null || day < when || day - when > board.days) return [];
      return [{ id: board.id, title: board.title, lines: board.lines, signed: board.signed, paper: board.paper, weight: board.weight }];
    });
  }

  update(dt: number): void {
    const { hours, day } = this.options;
    const h = hours();
    const night = nightOf(day(), h);
    if (night !== this.night) {
      this.night = night;
      this.stage = 'calm';
      this.loudFor = 0;
    }
    // How he stands with the player moves when the quiet hours start for him and how loud is too loud (docs/social.md).
    const quietHours = { from: effectValue(COMPLAINER, 'noiseFrom', plan.quietHours.from), to: plan.quietHours.to };
    if (!inHours(h, quietHours)) {
      if (this.stage !== 'atDoor') this.stage = 'calm';
      this.loudFor = 0;
      return;
    }
    const loud = flatNoise() >= effectValue(COMPLAINER, 'noiseThreshold', plan.loud);
    this.quietFor = loud ? 0 : this.quietFor + dt;
    this.timer += dt;
    switch (this.stage) {
      case 'calm':
        this.loudFor = loud ? this.loudFor + dt : Math.max(0, this.loudFor - dt * 2);
        if (this.loudFor >= plan.broomAfterS) {
          // A close friend downstairs does not complain: he comes up once a night to listen a while.
          if (has(COMPLAINER, 'noComplaints')) this.comeToListen();
          else this.broom();
        }
        break;
      case 'broomed':
        if (this.quietFor > SETTLED_S) this.stage = 'calm';
        // Hostile, he does not bother knocking: straight to the syndic.
        else if (this.timer > plan.knockAfterS && loud && has(COMPLAINER, 'straightToSyndic')) this.escalate();
        else if (this.timer > plan.knockAfterS && loud) this.comeUp();
        break;
      case 'answered':
        if (this.quietFor > SETTLED_S) this.stage = 'done';
        else if (this.timer > plan.escalateAfterS) this.escalate();
        break;
      case 'atDoor':
      case 'done':
        break;
    }
  }

  dispose(): void {
    this.unpin();
  }

  private inFlat(): boolean {
    this.options.listener.getWorldPosition(this.ear);
    return this.options.inFlat(this.ear);
  }

  /** Thump thump thump: the broom handle on his ceiling, and what he shouts with it. */
  private broom(): void {
    this.stage = 'broomed';
    this.timer = 0;
    this.quietFor = 0;
    const home = this.inFlat();
    playBroomThumps(home ? BROOM_LEVEL.flat : BROOM_LEVEL.elsewhere);
    if (!home) return;
    const line = plan.broomLines[this.nth % plan.broomLines.length]!;
    playMurmur(line, 0.08, { pan: 0, walls: 3 }, plan.complainer.pitch);
    this.options.notices?.say(line, plan.broomSpeaker);
  }

  /** Up the stairs he comes, to knock. */
  private comeUp(): void {
    const { complainer, cost, note } = plan;
    const visitor = this.options.visitor;
    const came = visitor.come({
      who: complainer.name,
      knocks: 3,
      answer: (_session, walker) => {
        this.answered = true;
        const line = plan.doorLines[this.nth % plan.doorLines.length]!;
        const what = flatNoiseSource();
        walker.speak(what && what !== 'TV' ? line.replace('that thing', `that ${what}`) : line, complainer.name);
        walker.gesture('checkWatch');
        if (befriend(complainer.key, cost.answered, 'noise', this.night)) this.remember();
        this.toAnswered();
        return plan.thanksWithinS;
      },
      gaveUp: () => {
        this.options.slipNote(note);
        if (befriend(complainer.key, cost.unanswered, 'noise', this.night)) this.remember();
        this.toAnswered();
      },
      leaving: (walker) => {
        if (this.answered && this.quietFor > 2) walker.speak(plan.thanks, complainer.name);
        else if (this.answered) walker.gesture('headShake');
        this.answered = false;
      },
    });
    if (!came) {
      // Someone else on the landing already (the cat brought back, the postman): he tries again in a while.
      this.timer = plan.knockAfterS / 2;
      return;
    }
    this.stage = 'atDoor';
  }

  /** He will remember the night, and wake up cross. */
  private remember(): void {
    addMemory(COMPLAINER, this.options.day(), BUILDING_SOCIAL.complaintMemory, -8);
    markMood(COMPLAINER, this.night + 1, -1, BUILDING_SOCIAL.complaintMood);
  }

  /** At Close, up the stairs he comes, not to complain: to listen at the door a while (once a night), and a little warmer for it. */
  private comeToListen(): void {
    const { complainer } = plan;
    const visit = BUILDING_SOCIAL.leclercVisit;
    const came = this.options.visitor.come({
      who: complainer.name,
      knocks: 2,
      answer: (_session, walker) => {
        walker.speak(visit.lines[this.nth % visit.lines.length]!, complainer.name);
        walker.gesture('wave');
        befriend(complainer.key, visit.warmth, 'listened', this.night);
        addMemory(COMPLAINER, this.options.day(), visit.memory, visit.warmth * 3);
        this.nth++;
        return plan.thanksWithinS;
      },
      gaveUp: () => {},
      leaving: () => {},
    });
    // Once a night either way: nothing more comes of the noise tonight.
    this.stage = came ? 'done' : 'calm';
    this.loudFor = 0;
  }

  private toAnswered(): void {
    this.stage = 'answered';
    this.timer = 0;
    this.nth++;
  }

  /** Still loud after all that: the syndic hears of it. */
  private escalate(): void {
    const { complainer, alsoMinds, cost } = plan;
    // A syndic cross with the player makes more of it.
    const strict = has('bertin', 'strictReminders') ? STRICT_FACTOR : 1;
    befriend(complainer.key, Math.round(cost.escalated * strict), 'escalated', this.options.day());
    for (const key of alsoMinds) befriend(key, Math.round(cost.alsoEscalated * strict), 'escalated', this.options.day());
    this.remember();
    this.stage = 'done';
    refreshBoard();
  }
}
