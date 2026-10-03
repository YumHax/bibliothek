import * as THREE from 'three';
import type { Friend } from '../Friend';
import type { FriendPlan } from '../friendsPlan';
import { Visit, type VisitRoute, type VisitScript } from '../Visit';
import { GATHERING_RULES } from './gatheringPlan';
import type { VisitHost } from './host';

/** One of a gathering's people: their plan, body and visit, and where they are in it. */
export interface PartyMember {
  readonly plan: FriendPlan;
  readonly friend: Friend;
  /** Their place in the gathering (0 the first to come). */
  readonly index: number;
  visit: Visit | null;
  /** Party clock (s) at which they set off up the stairs; Infinity while they wait for the one before to be let in. */
  startAt: number;
  /** Coming up behind the one before: this long (s) after that one is let in. */
  readonly behind: number | null;
  /** Waiting on the landing for the door. */
  atDoor: boolean;
  cameIn: boolean;
  /** Reached their spot (sat or stood in) once. */
  settled: boolean;
  gone: boolean;
}

/** What a gathering's own rules answer for each member (the rest of a visit's script is the host's). */
export interface PartyScript {
  /** Just inside the front door, after their hello: a line (an open house's guest pays here). */
  enterLine(member: PartyMember): string;
  /** At a stop: what they look at and say. */
  browse(member: PartyMember, kind: 'shelf' | 'window', at: THREE.Vector3, yaw: number): { look: THREE.Vector3 | null; line: string | null };
  /** Sat down or stood in at their spot: a line. */
  sitLine(member: PartyMember): string;
  leaveLine(member: PartyMember): string;
  /** A click on them: a line. */
  chat(member: PartyMember): string;
  /** The member's visit: their stops, whether they sit, where they stand, how long they stay. */
  visitOptions(member: PartyMember): Pick<ConstructorParameters<typeof Visit>[5], 'stops' | 'sits' | 'standIn' | 'stayUntil' | 'linger'>;
  /** The route they walk (default the host's): a games night keeps the TV armchair for the player. */
  route?(member: PartyMember, base: VisitRoute): VisitRoute;
  /** Let in. */
  cameIn?(member: PartyMember): void;
  /** Gone down the stairs (or cut short). */
  left?(member: PartyMember): void;
  /** Nobody answered the door: the ones on the landing went back down. */
  gaveUp?(members: readonly PartyMember[]): void;
}

/** How far down from the landing towards the stairs the second of two waiting there stands (share of the way). */
const QUEUE_BACK = 0.6;

/**
 * Several people round at once, each a `Visit` played by the host's rules (docs/visitors.md "Gatherings"): they set off
 * up the stairs when told (`add`: after a delay, or behind the one before once that one is let in); the first on the
 * landing rings (again after a while; nobody answering, those waiting go back down), the door opened lets in all who
 * wait, and one arriving at an open door walks in. A second one waiting stands a step down. `update` ticks every
 * visit; `done` once all are gone and nobody is left to come.
 */
export class Party {
  readonly members: PartyMember[] = [];
  private clock = 0;
  private ringing = { since: -1, rings: 0 };
  private cancelled = false;

  constructor(
    private readonly host: VisitHost,
    private readonly script: PartyScript,
  ) {}

  /** Seconds since the party began. */
  get time(): number {
    return this.clock;
  }

  /** `plan` comes `delay` s from now, or (`behind`) `delay` s after the one added before them is let in. */
  add(plan: FriendPlan, delay: number, behind = false): PartyMember {
    const member: PartyMember = {
      plan, friend: this.host.person(plan), index: this.members.length, visit: null,
      startAt: behind ? Infinity : this.clock + delay, behind: behind ? delay : null, atDoor: false, cameIn: false, settled: false, gone: false,
    };
    this.members.push(member);
    return member;
  }

  /** Everyone came and went (or never will). */
  get done(): boolean {
    return this.cancelled || this.members.every((m) => m.gone);
  }

  /** In the flat (or on their way in or out) right now. */
  get present(): number {
    return this.members.filter((m) => m.visit && !m.gone).length;
  }

  /** Who rings, while one waits on the landing. */
  caller(): string | null {
    const waiting = this.members.filter((m) => m.atDoor);
    if (!waiting.length) return null;
    return waiting.length === 1 ? waiting[0]!.plan.name : `${waiting[0]!.plan.name} and ${waiting.length - 1 === 1 ? waiting[1]!.plan.name : 'friends'}`;
  }

  /** The door opened: whoever waits comes in. */
  answered(): void {
    for (const m of this.members) if (m.atDoor) this.letIn(m);
    this.ringing = { since: -1, rings: 0 };
  }

  passing(): boolean {
    return this.members.some((m) => m.visit?.passingFront ?? false);
  }

  /** Ends it on the spot: everyone is gone. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const m of this.members) {
      if (m.visit && !m.gone) m.visit.cancel();
      m.gone = true;
    }
  }

  update(dt: number): void {
    if (this.cancelled) return;
    this.clock += dt;
    for (const m of this.members) {
      if (!m.visit && !m.gone && this.clock >= m.startAt) this.start(m);
      m.visit?.update(dt);
    }
    // An open door (the player holds it, or it has not swung shut yet): whoever arrives walks in.
    const front = this.host.options.frontDoor;
    if (front?.isOpen) for (const m of this.members) if (m.atDoor) this.letIn(m);
    this.ringBell();
  }

  private start(m: PartyMember): void {
    const { host, script } = this;
    const base = script.route?.(m, host.route) ?? host.route;
    // Two waiting on the landing at once: the second stands a step down towards the stairs.
    const queued = this.members.some((o) => o !== m && o.visit && !o.cameIn && !o.gone);
    const route: VisitRoute = queued ? { ...base, landing: base.landing.clone().lerp(base.stairs, QUEUE_BACK) } : base;
    const friend = m.friend;
    friend.request = null;
    friend.chat = () => {
      m.visit?.faceViewer();
      return script.chat(m);
    };
    const visitScript: VisitScript = {
      say: (line, word) => host.say(m.plan, line, word),
      arrived: () => this.arrived(m),
      enterLine: () => script.enterLine(m),
      handBack: () => null,
      shelve: () => undefined,
      browse: (kind, at, yaw) => script.browse(m, kind, at, yaw),
      ask: () => undefined,
      greetCat: () => host.greetCat(),
      sitLine: () => {
        m.settled = true;
        return script.sitLine(m);
      },
      leaveLine: () => script.leaveLine(m),
      excuse: () => host.excuse(),
      step: (at) => host.footstep(at),
      shutFront: () => host.shutFront(),
      left: () => this.left(m),
    };
    const { viewer, frontDoor, livingDoor } = host.options;
    m.visit = new Visit(friend, route, viewer, { front: frontDoor, living: livingDoor }, visitScript, {
      returning: false,
      ...host.visitOptions(),
      ...script.visitOptions(m),
    });
    m.visit.start();
  }

  private arrived(m: PartyMember): void {
    m.atDoor = true;
    // At an open door they walk in: next frame (`update`), once their visit waits for it.
    if (this.host.options.frontDoor?.isOpen) return;
    if (this.ringing.since >= 0) return;
    this.ringing = { since: this.clock, rings: 1 };
    this.host.ring();
  }

  /** The bell again a while after, then those waiting give up and go back down. */
  private ringBell(): void {
    const ringing = this.ringing;
    if (ringing.since < 0) return;
    if (!this.members.some((m) => m.atDoor)) {
      this.ringing = { since: -1, rings: 0 };
      return;
    }
    const waited = this.clock - ringing.since;
    if (ringing.rings === 1 && waited > GATHERING_RULES.ringAgainAfter) {
      ringing.rings = 2;
      this.host.ring();
    } else if (waited > GATHERING_RULES.giveUpAfter) {
      this.ringing = { since: -1, rings: 0 };
      const waiting = this.members.filter((m) => m.atDoor);
      for (const m of waiting) {
        m.atDoor = false;
        m.visit?.turnAway();
      }
      // Those who were to come up behind them do not.
      for (const m of this.members) if (!m.visit && !m.gone && m.startAt === Infinity) m.gone = true;
      this.script.gaveUp?.(waiting);
    }
  }

  private letIn(m: PartyMember): void {
    if (!m.atDoor) return;
    m.atDoor = false;
    m.cameIn = true;
    this.host.say(m.plan, this.host.line(`${m.plan.id}:greet`, m.plan.lines.greet), 'hi', true);
    m.visit?.letIn();
    this.script.cameIn?.(m);
    // The next one behind sets off now.
    const next = this.members[m.index + 1];
    if (next && next.startAt === Infinity) next.startAt = this.clock + (next.behind ?? 0);
  }

  private left(m: PartyMember): void {
    if (m.gone) return;
    m.gone = true;
    m.atDoor = false;
    m.friend.request = null;
    m.friend.chat = null;
    this.script.left?.(m);
  }
}
