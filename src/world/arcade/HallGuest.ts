import * as THREE from 'three';
import type { ArcadeResult } from '@/game/SessionActions';
import type { Reaction } from '../people/performer';
import type { Walker } from '../people/Walker';
import type { Station } from './Station';
import type { CrowdNav, CrowdStation } from './crowdNav';
import type { CrowdReactions } from './crowdReactions';
import type { HangoutSpot } from './HallKid';
import { pick, random, within } from '@/random';

/** How a game the player played with a guest at the second stick went, for the player. */
type DuelOutcome = 'won' | 'lost' | 'drawn';

/** What a guest says. */
interface GuestLines {
  /** Taking the second stick. */
  partner: readonly string[];
  /** At the second stick when the game is over, by how it went for the player. */
  partnerResult: Readonly<Record<DuelOutcome, readonly string[]>>;
  /** Watching the player's game on their own machine: a record, an ordinary game. */
  watched: { best: readonly string[]; plain: readonly string[] };
  /** At their own game now and then, and when their score lands on the board. */
  playing: readonly string[];
  board: readonly string[];
}

export interface GuestOptions {
  walker: Walker;
  /** Their initials on the boards and the second stick's screen. */
  initials: string;
  /** Whether they are at the arcade now (their day and hours). */
  here: () => boolean;
  /** Their machine: they play it when it is free, and come to watch the player on it. */
  station: () => CrowdStation | null;
  /** How well they play it, by now. */
  skill: () => number;
  /** They take the second stick of a two-player machine the player puts a coin in. */
  partner: boolean;
  /** Where they stand between two games. */
  spot: HangoutSpot;
  /** How long they play a game of theirs, and stand between two (seconds). */
  seconds: readonly [number, number];
  rest: readonly [number, number];
  lines: GuestLines;
  /** A game the player played with them at the second stick ended. */
  onPartnerResult?: (outcome: DuelOutcome) => void;
  /** A game of the player's on their machine ended with them watching. */
  onWatched?: (result: ArcadeResult) => void;
}

interface GuestSetup {
  nav: CrowdNav;
  reactions: CrowdReactions;
  reserved: () => Station | null;
  /** Their game ended: on the board under their initials maybe; the line for it, or null. */
  onScore: (station: Station, score: number, name: string) => string | null;
}

type GuestState =
  | { kind: 'out' }
  | { kind: 'walking' }
  | { kind: 'resting'; left: number }
  | { kind: 'playing'; at: CrowdStation; left: number; chatter: number }
  | { kind: 'watching'; at: CrowdStation }
  | { kind: 'partner'; at: CrowdStation }
  | { kind: 'leaving' };

/**
 * Someone the player knows who comes to the arcade on their own days (docs/social.md "Front Street and the arcade"):
 * Marco on the day he and the player fixed, Hugo on Wednesday mornings. In through the door unseen, they play their
 * machine when it is free (their hands its autopilot at their own skill; a score that makes the board signs their
 * initials), stand by it between two games, come to watch when the player plays it, and (Marco) take the second stick
 * of a two-player machine the player starts. Out again when their time is up.
 */
export class HallGuest {
  private state: GuestState = { kind: 'out' };

  constructor(
    private readonly options: GuestOptions,
    private readonly setup: GuestSetup,
  ) {
    options.walker.setPresent(false);
  }

  update(dt: number): void {
    const s = this.state;
    const { walker } = this.options;
    if (s.kind === 'out') {
      if (!this.options.here() || this.setup.nav.doorInView()) return;
      walker.setPresent(true, this.setup.nav.doorPoint());
      this.next();
      return;
    }
    if (s.kind === 'leaving' || s.kind === 'walking') return;
    if (!this.options.here() && s.kind !== 'partner' && s.kind !== 'watching') {
      if (s.kind === 'playing') s.at.station.release();
      this.leave();
      return;
    }
    if (s.kind === 'resting') {
      s.left -= dt;
      if (s.left <= 0) this.next();
    } else if (s.kind === 'playing') {
      s.left -= dt;
      s.chatter -= dt;
      if (s.chatter <= 0) {
        s.chatter = 15 + random() * 20;
        walker.say(pick(random, this.options.lines.playing), 1.6);
      }
      if (s.left <= 0) {
        s.at.station.release();
        this.rest();
      }
    }
  }

  /** Whether they are at `cs`'s second stick. */
  partners(cs: CrowdStation): boolean {
    return this.state.kind === 'partner' && this.state.at === cs;
  }

  /** Whether they are playing `cs` themselves. */
  plays(cs: CrowdStation): boolean {
    return this.state.kind === 'playing' && this.state.at === cs;
  }

  /** Whether they would take `cs`'s second stick now (in the hall, not on their way out). */
  wouldPartner(cs: CrowdStation): boolean {
    const k = this.state.kind;
    return this.options.partner && Boolean(cs.station.partner) && k !== 'out' && k !== 'leaving';
  }

  /** The player put a coin in `cs`: a two-player machine, they take player two; their own machine, they watch. */
  playerStarted(cs: CrowdStation): void {
    const s = this.state;
    if (s.kind === 'out' || s.kind === 'leaving') return;
    if (this.wouldPartner(cs)) {
      if (s.kind === 'playing') s.at.station.release();
      this.takePlayerTwo(cs);
    } else if (cs === this.options.station() && s.kind === 'resting') {
      this.watch(cs);
    }
  }

  /** The player's play at `cs` ended: the word it calls for, if they were in it or watching it. */
  playerResult(cs: CrowdStation, result: ArcadeResult): void {
    const s = this.state;
    const { walker, lines } = this.options;
    if (s.kind === 'partner' && s.at === cs) {
      const tally = cs.station.partner?.tally() ?? null;
      const outcome: DuelOutcome = tally ? (tally.you > tally.them ? 'won' : tally.you < tally.them ? 'lost' : 'drawn') : 'drawn';
      walker.say(pick(random, lines.partnerResult[outcome]), 2.4);
      walker.react(outcome === 'won' ? 'fail' : outcome === 'lost' ? 'great' : 'good');
      this.options.onPartnerResult?.(outcome);
    } else if (s.kind === 'watching' && s.at === cs) {
      walker.say(pick(random, result.best ? lines.watched.best : lines.watched.plain), 2.4);
      walker.react(result.best ? 'record' : 'good');
      this.options.onWatched?.(result);
    }
  }

  /** The player walked away from `cs`: back to their own corner. */
  playerLeft(cs: CrowdStation): void {
    const s = this.state;
    if ((s.kind === 'partner' || s.kind === 'watching') && s.at === cs) this.rest();
  }

  /** A machine made a sound that means something: they react if at it. */
  heard(cs: CrowdStation, reaction: Reaction): void {
    const s = this.state;
    if ((s.kind === 'playing' || s.kind === 'watching' || s.kind === 'partner') && s.at === cs) this.setup.reactions.once(this.options.walker, reaction);
  }

  /** Their own game at `cs` ended with `score`: on the board, maybe. */
  ownResult(cs: CrowdStation, score: number): void {
    const { walker, initials, lines } = this.options;
    const signed = this.setup.onScore(cs.station, score, initials);
    if (signed) {
      walker.say(pick(random, lines.board), 2.6);
      walker.react('record');
    } else walker.react('over');
    this.setup.reactions.mark(walker);
  }

  /** Their machine if it is free, else a rest by it. */
  private next(): void {
    const cs = this.options.station();
    if (cs && !cs.station.occupant && !cs.station.outOfOrder && cs.station !== this.setup.reserved()) this.goPlay(cs);
    else this.rest();
  }

  private goPlay(cs: CrowdStation): void {
    const { walker } = this.options;
    const { nav } = this.setup;
    this.state = { kind: 'walking' };
    walker.walk(nav.route(walker.position, nav.standSpot(cs)), () => {
      if (!cs.station.occupy(walker.performer, this.options.skill())) {
        this.rest();
        return;
      }
      walker.stand(nav.standYaw(cs), 'play', nav.focusOf(cs), cs.station.directs ? null : () => cs.station.handsAt(), cs.station.lean);
      walker.gesture('insertCoin');
      this.state = { kind: 'playing', at: cs, left: within(random, this.options.seconds), chatter: 6 + random() * 10 };
    });
  }

  private rest(): void {
    const { walker, spot } = this.options;
    const { nav } = this.setup;
    this.state = { kind: 'walking' };
    walker.walk(nav.route(walker.position, new THREE.Vector3(spot.at[0], 0, spot.at[1])), () => {
      walker.stand(spot.yaw, random() < 0.5 ? 'pockets' : 'crossed', spot.look ? nav.toWorld(new THREE.Vector3(...spot.look)) : null);
      this.state = { kind: 'resting', left: within(random, this.options.rest) };
    });
  }

  private watch(cs: CrowdStation): void {
    const { walker } = this.options;
    const { nav } = this.setup;
    const spot = nav.watchSpot(cs);
    this.state = { kind: 'walking' };
    walker.walk(nav.route(walker.position, spot), () => {
      if (cs.station.occupant !== 'player') {
        this.rest();
        return;
      }
      const focus = nav.focusOf(cs);
      walker.stand(nav.yawTo(spot, focus), 'crossed', focus);
      this.state = { kind: 'watching', at: cs };
    });
  }

  private takePlayerTwo(cs: CrowdStation): void {
    const { walker, initials, lines } = this.options;
    const { nav } = this.setup;
    const partner = cs.station.partner;
    const spot = nav.partnerSpot(cs);
    if (!partner || !spot) return;
    this.state = { kind: 'walking' };
    walker.say(pick(random, lines.partner), 2);
    walker.walk(nav.route(walker.position, spot), () => {
      if (cs.station.occupant !== 'player') {
        this.rest();
        return;
      }
      walker.stand(nav.standYaw(cs), 'play', nav.focusOf(cs), () => partner.handsAt(), cs.station.lean);
      partner.setPartner(initials);
      this.state = { kind: 'partner', at: cs };
    });
  }

  private leave(): void {
    const { walker } = this.options;
    const { nav } = this.setup;
    this.state = { kind: 'leaving' };
    walker.walk(nav.route(walker.position, nav.doorPoint()), () => {
      walker.setPresent(false);
      this.state = { kind: 'out' };
    });
  }
}
