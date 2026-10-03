import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { SessionActions } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { seeded } from '@/economy/seeded';
import { ROOM_PLAN } from '../../roomPlan';
import { FRIENDS, VISIT_RULES } from '../friendsPlan';
import { fill, tasteScore } from '../friendLines';
import type { GatheringDeps } from './deps';
import { GATHERING_LINES, GATHERING_RULES } from './gatheringPlan';
import { PaddleWarsProgram } from './PaddleWarsProgram';
import { Party, type PartyMember } from './Party';

/** The match as the program runner knows it (no box: it is the evening's, not the collection's). */
const MATCH_GAME: Game = { id: 'games-night:paddle-wars', title: 'PADDLE WARS', platform: 'nes' };
/** Seconds between two friends heading for the door once the evening winds down. */
const LEAVE_STAGGER = 4;

/**
 * A games night (docs/visitors.md "Gatherings"): the three friends, asked round on the bedroom's phone, come up the
 * stairs one behind the other in the evening, look at a shelf each and stand round the TV armchair (the player's);
 * player two (the one who rang) offers a match of PADDLE WARS on the TV (a click on them starts it: the player picks
 * the pad up where they are), the others cheer each goal and the score. After `matches` matches, or `stay` s, they go
 * home one after the other. An evening with a match leaves a photo on the hallway's string, and maybe a game or a
 * few coins from one of them; one without costs nothing.
 */
export class GamesNight {
  readonly party: Party;
  private readonly rules = GATHERING_RULES.gamesNight;
  private matches = 0;
  private lastScore = '';
  private matchOn: PaddleWarsProgram | null = null;
  private settledAt = -1;
  private firstInAt = -1;
  private offeredAt = -1;
  /** When player two first stood at their spot, and how many offers went unanswered since the last match. */
  private p2At = -1;
  private unanswered = 0;
  private windDownAt = -1;
  private awayFor = 0;
  private speaker: ChipSpeaker | null = null;
  private unlisten: (() => void) | null = null;
  private finished = false;
  private readonly spots: { at: THREE.Vector3; yaw: number }[];

  constructor(private readonly deps: GatheringDeps, private readonly day: number) {
    const { host } = deps;
    this.spots = ROOM_PLAN.visitor.party.map((s) => ({ at: new THREE.Vector3(s.at[0], 0, s.at[1]), yaw: s.yaw }));
    const shelves = host.route.browse.filter((b) => b.kind === 'shelf');
    const night = this;
    this.party = new Party(host, {
      enterLine: (m) => host.line(m.index === 0 ? 'nightLead' : 'nightFollow', m.index === 0 ? GATHERING_LINES.nightLead : GATHERING_LINES.nightFollow),
      browse: (m, kind, at, yaw) => host.browse(m.plan, kind, at, yaw),
      sitLine: () => host.line('nightSpot', GATHERING_LINES.nightSpot),
      leaveLine: () => host.line('nightLeave', GATHERING_LINES.nightLeave),
      chat: (m) => host.line(`${m.plan.id}:smalltalk`, m.plan.lines.smalltalk),
      // Nobody takes an armchair: the TV's is the player's, the other faces the projector wall.
      route: (_m, base) => ({ ...base, seats: [] }),
      visitOptions: (m) => ({
        stops: () => (shelves.length ? [shelves[m.index % shelves.length]!] : []),
        standIn: () => this.spots[m.index % this.spots.length] ?? null,
        stayUntil: { done: () => night.mayLeave(m), max: this.rules.stay + 90 },
      }),
      cameIn: (m) => {
        if (night.firstInAt < 0) night.firstInAt = night.party.time;
        if (m.index === 0) host.options.journal?.note('visit', 'Games night: everyone came round');
      },
      gaveUp: () => {
        if (!night.party.members.some((m) => m.cameIn)) host.options.notices?.react('Nobody answered: your friends went home. Another night.');
      },
    });
    // The one who rings first, the others up the stairs behind; who leads changes with the day.
    const lead = Math.floor(seeded(`night:${day}`)() * FRIENDS.length);
    FRIENDS.forEach((_, i) => {
      const plan = FRIENDS[(lead + i) % FRIENDS.length]!;
      const [min, max] = this.rules.stagger;
      this.party.add(plan, i === 0 ? 0 : min + Math.random() * (max - min), i > 0);
    });
  }

  get done(): boolean {
    return this.party.done;
  }

  /** Player two: the one who rang. */
  private get p2(): PartyMember | undefined {
    return this.party.members[0];
  }

  update(dt: number): void {
    const { host } = this.deps;
    this.party.update(dt);
    const t = this.party.time;
    const inFlat = this.party.members.filter((m) => m.cameIn && !m.gone);
    // The player gone out (or asleep) for a while: they let themselves out.
    if (inFlat.length) {
      const home = host.options.atHome() && !host.options.busy?.();
      this.awayFor = home || this.party.passing() ? 0 : this.awayFor + dt;
      if (this.awayFor > VISIT_RULES.aloneFor) {
        host.options.notices?.react('Your friends let themselves out.');
        this.stopMatch();
        this.party.cancel();
        return;
      }
    }
    if (this.settledAt < 0 && inFlat.length && this.party.members.every((m) => m.gone || m.settled)) this.settledAt = t;
    if (this.windDownAt < 0 && this.firstInAt >= 0 && !this.matchOn) {
      const played = this.matches >= this.rules.matches && this.settledAt >= 0 && t - this.settledAt > this.rules.minStay;
      if (played || t - this.firstInAt > this.rules.stay) this.windDownAt = t;
    }
    this.offer(t);
  }

  /** Whether `m` may head home: once the evening winds down, one after the other. */
  private mayLeave(m: PartyMember): boolean {
    if (this.windDownAt < 0 || this.matchOn) return false;
    const order = this.party.members.filter((o) => o.cameIn).indexOf(m);
    return this.party.time - this.windDownAt > Math.max(0, order) * LEAVE_STAGGER;
  }

  /** Player two at their spot, no match on: they offer one (again a while later if unanswered). */
  private offer(t: number): void {
    const p2 = this.p2;
    const { host } = this.deps;
    if (!p2?.settled || p2.gone || this.matchOn || this.windDownAt >= 0 || this.matches > this.rules.matches) return;
    if (this.p2At < 0) this.p2At = t;
    // Asked three times without an answer: they stop asking (the request stays up for a click).
    if (this.unanswered >= 3) return;
    const wait = this.offeredAt < 0 ? this.rules.offerAfter : this.rules.offerAgain;
    if (t - (this.offeredAt < 0 ? this.p2At : this.offeredAt) < wait) return;
    this.offeredAt = t;
    this.unanswered += 1;
    host.say(p2.plan, host.line('offer', GATHERING_LINES.offer), 'ask', true);
    p2.friend.request = {
      label: `${p2.plan.name} · play PADDLE WARS (they are player two)`,
      answer: (session: SessionActions) => this.startMatch(session),
    };
  }

  private startMatch(session: SessionActions): void {
    const p2 = this.p2;
    const { tv, programs } = this.deps;
    const runner = programs?.() ?? null;
    if (!p2 || !tv || !runner) {
      session.refuse('The TV is not ready for a match.');
      return;
    }
    p2.friend.request = null;
    this.unanswered = 0;
    this.speaker ??= new ChipSpeaker(tv, this.deps.host.options.viewer, { volume: 0.2, refDistance: 1.6 });
    const program = new PaddleWarsProgram(p2.plan.name.toUpperCase(), this.speaker, {
      goal: (forPlayer) => this.goal(forPlayer),
      over: (tally) => this.over(tally),
    });
    this.unlisten ??= runner.listen({
      stopped: (stopped) => {
        // Put down before the end (walk-away twice): no score, player two shrugs.
        if (stopped === this.matchOn) this.endMatch();
      },
    });
    if (!runner.run(tv, program, MATCH_GAME)) {
      session.refuse('The TV will not show it.');
      return;
    }
    this.matchOn = program;
    p2.friend.setPose('play');
    for (const m of this.watchers()) m.friend.react('ready');
  }

  private goal(forPlayer: boolean): void {
    const p2 = this.p2;
    const { host } = this.deps;
    p2?.friend.react(forPlayer ? 'fail' : 'great');
    const watchers = this.watchers();
    for (const m of watchers) m.friend.react(forPlayer ? 'great' : 'near');
    const talker = watchers[Math.floor(Math.random() * watchers.length)];
    if (talker && p2 && Math.random() < 0.5) {
      const bucket = forPlayer ? 'goalFor' : 'goalAgainst';
      host.say(talker.plan, fill(host.line(bucket, GATHERING_LINES[bucket]), { name: p2.plan.name }), forPlayer ? 'yay' : 'ooh');
    }
  }

  private over(tally: { you: number; them: number }): void {
    const p2 = this.p2;
    const { host } = this.deps;
    this.matches += 1;
    this.lastScore = `${tally.you}–${tally.them}`;
    const result = tally.you > tally.them ? 'won' : tally.you < tally.them ? 'lost' : 'drew';
    if (p2) {
      host.say(p2.plan, fill(host.line(result, GATHERING_LINES[result]), { you: tally.you, them: tally.them }), result === 'lost' ? 'yay' : 'ok', true);
      p2.friend.react(result === 'lost' ? 'record' : 'over');
    }
    for (const m of this.watchers()) m.friend.react(result === 'won' ? 'record' : 'good');
    this.endMatch();
  }

  private endMatch(): void {
    this.matchOn = null;
    this.offeredAt = this.party.time;
    this.p2?.friend.setPose('pockets');
  }

  /** The friends in the flat but player two. */
  private watchers(): PartyMember[] {
    return this.party.members.filter((m) => m.index !== 0 && m.cameIn && !m.gone);
  }

  private stopMatch(): void {
    if (this.matchOn) this.deps.programs?.()?.stop();
    this.matchOn = null;
  }

  /** The evening is over: the book, and for an evening with a match, the photo and a friend's thanks. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.stopMatch();
    this.unlisten?.();
    this.unlisten = null;
    this.speaker?.dispose();
    this.speaker = null;
    const { book, host } = this.deps;
    const came = this.party.members.filter((m) => m.cameIn);
    book.heldNight(this.day, came.length > 0);
    if (!came.length || this.matches === 0) return;
    const names = came.map((m) => m.plan.name);
    book.addPhoto({ day: this.day, names, score: this.lastScore });
    const { collection, giftPool, purse, notices } = host.options;
    const random = seeded(`night-thanks:${this.day}`);
    const giver = came[Math.floor(random() * came.length)]!.plan;
    const unowned = giftPool?.filter((g) => !collection.owns(g.id) && tasteScore(giver.taste, g) >= 2) ?? [];
    const gift = random() < this.rules.giftChance ? unowned[Math.floor(random() * unowned.length)] : undefined;
    if (gift) {
      collection.add({ ...gift, status: 'owned', condition: 'noManual', acquired: { price: 0, where: `a gift from ${giver.name}`, day: this.day } });
      notices?.reward({ title: 'Games night', detail: `A photo of the evening is pegged up in the hallway.\n${giver.name} left you ${gift.title}: it waits in your parcel in the hall.` });
      return;
    }
    const [min, max] = this.rules.tip;
    const coins = min + Math.floor(random() * (max - min + 1));
    purse?.earnCoins(coins);
    notices?.reward({ title: 'Games night', detail: `A photo of the evening is pegged up in the hallway.\n${giver.name} left a few coins for the crisps.`, coins });
  }
}
