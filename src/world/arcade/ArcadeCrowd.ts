import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Timers } from '@/core/Timers';
import type { ArcadeResult } from '@/game/SessionActions';
import type { Sfx } from '@/audio/ChipSpeaker';
import { type HallRegular, regularIn, regularSkill } from '@/economy/hallRegulars';
import type { Walker } from '../people/Walker';
import type { Station } from './Station';
import { CrowdNav, type CrowdStation, type NavNode } from './crowdNav';
import { CrowdReactions, reactionOf } from './crowdReactions';
import { HallKid, type HangoutSpot, type KidMood } from './HallKid';
import { type GuestOptions, HallGuest } from './HallGuest';
import { Prop } from '../props/Prop';
import { pick, random, within } from '@/random';

/** A regular of the hall (`hallRegulars`) and their body. */
interface CrowdRegular {
  walker: Walker;
  who: HallRegular;
}

/** The kid's own game: which machine, how well he plays it by now, what he signs. */
interface KidGamePlan {
  gameId: string;
  skill: () => number;
  initials: string;
  odds: number;
  seconds: readonly [number, number];
}

interface ArcadeCrowdOptions {
  /** The hall's walkable graph; every station's stand spot and every hangout is reached from its nearest node. */
  nav: NavNode[];
  /** The node at the door: everyone comes in and goes out there. */
  door: string;
  stations: CrowdStation[];
  /** The regulars who come and go at their hours (hidden when out). */
  regulars: CrowdRegular[];
  /** The kid who stays and watches, and the game he plays himself. */
  kid: Walker | null;
  kidGame?: KidGamePlan;
  hangouts: HangoutSpot[];
  /** People the player knows who come on their own days (Marco, Hugo). */
  guests?: readonly GuestOptions[];
  /** At most this many regulars in the hall at once, right now (the hall fills up in the evening). */
  maxInside: () => number;
  /** The game clock's hour: each regular comes in their own hours. */
  hour: () => number;
  /** The game a station runs: a regular's favourite and skill go by it. */
  gameOf: (station: Station) => string | undefined;
  /**
   * A game of someone's ended on `station` with `score`: the builder may put it on the hall of fame under `name`;
   * a line when it did (the regular says their own instead), else null.
   */
  onRegularScore?: (station: Station, score: number, name: string) => string | null;
  /** A play of the player's ended (after the people round it had their say). */
  onPlayerResult?: (station: Station, result: ArcadeResult) => void;
  /** A machine the regulars leave to the player right now (the Saturday tournament's cabinet), or null. */
  reserved?: () => Station | null;
  /**
   * Something worth crowding round right now (the Saturday tournament): zone-local spots where
   * regulars stand to watch, and the world point they look at; null when there is nothing to see.
   */
  gathering?: () => { spots: readonly THREE.Vector3[]; focus: THREE.Vector3 } | null;
  /** The camera: nobody walks in or out while the player is looking at the door. */
  viewer: THREE.Object3D;
  /** Zone-local to world. */
  toWorld: (p: THREE.Vector3) => THREE.Vector3;
  /** How the kid takes the player's games (`KidMood`). Default `devoted` (the kid as he always was). */
  kidMood?: () => KidMood;
}

/** How long a regular plays a machine, and waits outside between visits (seconds). */
const PLAY_SECONDS: [number, number] = [40, 110];
const AWAY_SECONDS: [number, number] = [8, 35];
/** The odds a regular coming in or moving on goes to their favourite machine when it is free. */
const FAVOURITE_ODDS = 0.6;
/** How long a regular stands watching the tournament before doing something else (seconds), and what they mutter meanwhile. */
const WATCH_SECONDS: [number, number] = [45, 120];
const WATCH_CHATTER = ['Who is next?', 'My money is on the new one.', 'Quarter-finals already.', 'I got knocked out by a kid once.', 'Shh, they are playing.', 'Tournament day. Best day.'];
/** How long after a regular's game ends they put the next coin in (s): before the machine starts it. */
const NEXT_COIN_AFTER = 1.4;
/** An ordinary regular at the pinball nudges it this often (per second). */
const NUDGE_RATE = 0.12;

type RegularState =
  | { kind: 'out'; left: number }
  | { kind: 'going'; to: CrowdStation }
  | { kind: 'playing'; at: CrowdStation; left: number; chatter: number }
  | { kind: 'toWatch'; spot: number }
  | { kind: 'watching'; spot: number; left: number; chatter: number }
  | { kind: 'leaving' };

/** A regular: who they are, their body, where they are in their round. */
interface Regular {
  who: HallRegular;
  walker: Walker;
  state: RegularState;
}

/**
 * Who is in the arcade and what they do: the regulars walk in through the door at their own hours (only when the
 * player is not looking at it), take their favourite machine when it is free or another (it plays itself at their
 * skill, `Station.occupy`), play it a minute or two with their own words, then try another or leave (the sore loser
 * after a poor game); on Saturday they crowd round the cup. The kid (`HallKid`) and the player's friends who come on
 * their days (`HallGuest`) go their own ways. Paths follow the hall's nav graph (`CrowdNav`), so nobody walks through
 * a cabinet. An empty `Prop` the zone ticks; the builder places the walkers.
 */
export class ArcadeCrowd extends Prop implements Updatable {
  /** The reactions a moment later: on the hall's own time, dropped with it. */
  private readonly timers = new Timers();
  private readonly options: ArcadeCrowdOptions;
  private readonly nav: CrowdNav;
  private readonly reactions = new CrowdReactions();
  private readonly regulars: Regular[];
  private readonly kid: HallKid | null;
  private readonly guests: HallGuest[];
  /** Stations a regular is heading for, so two never pick the same. */
  private readonly claimed = new Set<CrowdStation>();

  constructor(options: ArcadeCrowdOptions) {
    super();
    this.name = 'ArcadeCrowd';
    this.options = options;
    this.nav = new CrowdNav(options.nav, options.door, options.viewer, options.toWorld);
    this.regulars = options.regulars.map(({ walker, who }, i) => ({ walker, who, state: { kind: 'out', left: i * 6 + 1 } as RegularState }));
    for (const r of this.regulars) r.walker.setPresent(false);
    const reserved = (): Station | null => options.reserved?.() ?? null;
    const onScore = (station: Station, score: number, name: string): string | null => options.onRegularScore?.(station, score, name) ?? null;
    const kidGame = options.kidGame;
    this.kid = options.kid
      ? new HallKid({
          walker: options.kid,
          nav: this.nav,
          stations: options.stations,
          hangouts: options.hangouts,
          reactions: this.reactions,
          mood: () => options.kidMood?.() ?? 'devoted',
          moody: Boolean(options.kidMood),
          ...(kidGame ? { game: { station: () => this.stationOf(kidGame.gameId), skill: kidGame.skill, initials: kidGame.initials, odds: kidGame.odds, seconds: kidGame.seconds } } : {}),
          partnerTaken: (cs) => this.guests.some((g) => g.partners(cs) || g.wouldPartner(cs)),
          reserved,
          onScore,
        })
      : null;
    this.guests = (options.guests ?? []).map((g) => new HallGuest(g, { nav: this.nav, reactions: this.reactions, reserved, onScore }));
    for (const cs of options.stations) {
      cs.station.stationEvents.onPlayerStart = () => this.playerStarted(cs);
      cs.station.stationEvents.onPlayerResult = (result) => this.playerResult(cs, result);
      cs.station.stationEvents.onPlayerLeave = () => this.playerLeft(cs);
      cs.station.stationEvents.onRegularResult = (score) => this.regularResult(cs, score);
      cs.station.stationEvents.onSound = (sfx) => this.sound(cs, sfx);
    }
  }

  /** Someone already at a machine when the player walks in (the hall is never empty): a regular whose hours these are, if any is. */
  seat(station: number): void {
    const cs = this.options.stations[station];
    const hour = this.options.hour();
    const out = this.regulars.filter((o) => o.state.kind === 'out');
    const r = out.find((o) => regularIn(o.who, hour)) ?? out[0];
    if (!r || !cs || !cs.station.occupy(r.walker.performer, this.skillAt(r, cs))) return;
    r.walker.setPresent(true, this.nav.standSpot(cs));
    r.walker.rotation.y = this.nav.standYaw(cs);
    this.standAtMachine(r.walker, cs);
    r.state = { kind: 'playing', at: cs, left: within(random, PLAY_SECONDS), chatter: 5 + random() * 10 };
  }

  update(dt: number): void {
    this.timers.update(dt);
    this.reactions.tick(dt);
    for (const r of this.regulars) this.updateRegular(r, dt);
    this.kid?.update(dt);
    for (const g of this.guests) g.update(dt);
  }

  /** How many regulars are in the hall now (walking in, playing, leaving). */
  get inside(): number {
    return this.regulars.filter((r) => r.state.kind !== 'out').length;
  }

  // --- Regulars ---------------------------------------------------------------------------------

  private updateRegular(r: Regular, dt: number): void {
    const s = r.state;
    switch (s.kind) {
      case 'out':
        this.waitOutside(r, s, dt);
        return;
      case 'going':
      case 'toWatch':
        return; // the walker's `then` moves the state on
      case 'watching':
        this.watch(r, s, dt);
        return;
      case 'playing':
        this.play(r, s, dt);
        return;
      case 'leaving':
        return;
    }
  }

  /** Outside: the wait runs down, then (in their hours, unseen, with room in the hall) in through the door to watch the cup or to play. */
  private waitOutside(r: Regular, s: Extract<RegularState, { kind: 'out' }>, dt: number): void {
    s.left -= dt;
    if (s.left > 0 || this.inside >= this.options.maxInside() || this.nav.doorInView()) return;
    if (!regularIn(r.who, this.options.hour())) {
      s.left = 20;
      return;
    }
    const spot = random() < r.who.watches ? this.freeWatchSpot() : null;
    const target = spot === null ? this.freeStation(r) : null;
    if (spot === null && !target) {
      s.left = 5;
      return;
    }
    r.walker.setPresent(true, this.nav.doorPoint());
    if (spot !== null) this.goWatch(r, spot);
    else if (target) this.goTo(r, target);
  }

  /** Watching the cup: a mutter now and then; the watch over (or the hall emptying), a free machine or home. */
  private watch(r: Regular, s: Extract<RegularState, { kind: 'watching' }>, dt: number): void {
    s.left -= dt;
    s.chatter -= dt;
    if (s.chatter <= 0) {
      s.chatter = 15 + random() * 25;
      r.walker.say(pick(random, WATCH_CHATTER), 2);
    }
    if (s.left > 0 && this.options.gathering?.() && this.inside <= this.options.maxInside() + 1) return;
    const next = random() < r.who.stays ? this.freeStation(r) : null;
    if (next) this.goTo(r, next);
    else this.leave(r);
  }

  /** At a machine: their own word now and then, a hip to the pinball; the play over (or the hall emptying, or past their hours), the cup to watch, another go, or home. */
  private play(r: Regular, s: Extract<RegularState, { kind: 'playing' }>, dt: number): void {
    s.left -= dt;
    s.chatter -= dt;
    if (s.chatter <= 0) {
      s.chatter = within(random, r.who.chatterEvery);
      r.walker.say(pick(random, r.who.chatter), 1.6);
    }
    // Pinball players bump the table with their hips now and then (some more than others).
    if (s.at.station.name === 'Pinball' && random() < dt * NUDGE_RATE * (r.who.nudges ?? 1)) r.walker.gesture('nudge');
    if (s.left > 0 && this.inside <= this.options.maxInside() + 1 && regularIn(r.who, this.options.hour())) return;
    this.moveOn(r, s.at);
  }

  /** Done at `at`: the cup to watch, another go somewhere else, or home. */
  private moveOn(r: Regular, at: CrowdStation): void {
    at.station.release();
    const inHours = regularIn(r.who, this.options.hour());
    const spot = inHours && random() < r.who.watches ? this.freeWatchSpot() : null;
    if (spot !== null) {
      this.goWatch(r, spot);
      return;
    }
    const next = inHours && random() < r.who.stays ? this.freeStation(r) : null;
    if (next) this.goTo(r, next);
    else this.leave(r);
  }

  private goTo(r: Regular, target: CrowdStation): void {
    this.claimed.add(target);
    r.state = { kind: 'going', to: target };
    r.walker.walk(this.nav.route(r.walker.position, this.nav.standSpot(target)), () => {
      this.claimed.delete(target);
      // Taken meanwhile (the player got there first): try another, or give up.
      if (!target.station.occupy(r.walker.performer, this.skillAt(r, target))) {
        const other = this.freeStation(r);
        if (other) this.goTo(r, other);
        else this.leave(r);
        return;
      }
      this.standAtMachine(r.walker, target);
      // A coin in first.
      r.walker.gesture('insertCoin');
      r.state = { kind: 'playing', at: target, left: within(random, PLAY_SECONDS), chatter: 4 + random() * 8 };
    });
  }

  private leave(r: Regular): void {
    r.state = { kind: 'leaving' };
    r.walker.walk(this.nav.route(r.walker.position, this.nav.doorPoint()), () => {
      r.walker.setPresent(false);
      r.state = { kind: 'out', left: within(random, AWAY_SECONDS) };
    });
  }

  /** At the controls: facing the machine, bent over it as it asks, hands on its controls (or the machine directing them), eyes on its screen. */
  private standAtMachine(walker: Walker, cs: CrowdStation): void {
    walker.stand(this.nav.standYaw(cs), 'play', this.nav.focusOf(cs), cs.station.directs ? null : () => cs.station.handsAt(), cs.station.lean);
  }

  /** How well `r` plays the machine at `cs`. */
  private skillAt(r: Regular, cs: CrowdStation): number {
    const game = this.options.gameOf(cs.station);
    return game ? regularSkill(r.who, game) : r.who.skill;
  }

  /** A machine `r` may take: their favourite when it is free (most times), else any free one. */
  private freeStation(r: Regular): CrowdStation | null {
    const reserved = this.options.reserved?.() ?? null;
    const free = this.options.stations.filter((cs) => cs.station !== reserved && !cs.station.occupant && !cs.station.outOfOrder && !this.claimed.has(cs) && !this.secondStickTaken(cs));
    const favourite = free.find((cs) => this.options.gameOf(cs.station) === r.who.favourite);
    if (favourite && random() < FAVOURITE_ODDS) return favourite;
    return free.length ? pick(random, free) : null;
  }

  /** Someone stands at `cs`'s second stick (the kid, a friend): a regular leaves it be. */
  private secondStickTaken(cs: CrowdStation): boolean {
    return Boolean(this.kid?.partners(cs)) || this.guests.some((g) => g.partners(cs));
  }

  /** A station by its game. */
  private stationOf(gameId: string): CrowdStation | null {
    return this.options.stations.find((cs) => this.options.gameOf(cs.station) === gameId) ?? null;
  }

  // --- A crowd round the tournament ---------------------------------------------------------------

  /** A watching spot nobody has taken or is heading for, or null (nothing to watch, or all taken). */
  private freeWatchSpot(): number | null {
    const gathering = this.options.gathering?.();
    if (!gathering) return null;
    const taken = new Set(this.regulars.map((o) => (o.state.kind === 'toWatch' || o.state.kind === 'watching' ? o.state.spot : -1)));
    const free = gathering.spots.map((_, i) => i).filter((i) => !taken.has(i));
    return free.length ? pick(random, free) : null;
  }

  /** Off to stand at a watching spot, arms crossed, eyes on the tournament's screen. */
  private goWatch(r: Regular, spot: number): void {
    const gathering = this.options.gathering?.();
    const at = gathering?.spots[spot];
    if (!gathering || !at) {
      this.leave(r);
      return;
    }
    r.state = { kind: 'toWatch', spot };
    r.walker.walk(this.nav.route(r.walker.position, at.clone()), () => {
      const now = this.options.gathering?.();
      if (!now) {
        this.leave(r);
        return;
      }
      r.walker.stand(this.nav.yawTo(at, now.focus), random() < 0.5 ? 'crossed' : 'hips', now.focus);
      r.state = { kind: 'watching', spot, left: within(random, WATCH_SECONDS), chatter: 6 + random() * 10 };
    });
  }

  /** The watchers react to a tournament round (a cheer with arms up, or a groan), each a moment after the other. */
  spectatorsReact(lines: readonly string[], cheer: boolean): void {
    this.regulars
      .filter((r) => r.state.kind === 'watching')
      .forEach((r, i) => {
        this.timers.after(0.3 + i * 0.45, () => {
          if (r.state.kind !== 'watching') return;
          r.walker.say(pick(random, lines), 2.4);
          r.walker.react(cheer ? 'great' : 'fail');
        });
      });
  }

  // --- The player's plays, and everyone's results -----------------------------------------------

  private playerStarted(cs: CrowdStation): void {
    for (const g of this.guests) g.playerStarted(cs);
    this.kid?.playerStarted(cs);
  }

  private playerResult(cs: CrowdStation, result: ArcadeResult): void {
    this.kid?.playerResult(cs, result);
    for (const g of this.guests) g.playerResult(cs, result);
    this.options.onPlayerResult?.(cs.station, result);
  }

  private playerLeft(cs: CrowdStation): void {
    cs.station.partner?.setPartner(null);
    this.kid?.playerLeft(cs);
    for (const g of this.guests) g.playerLeft(cs);
  }

  /** A game ended with someone of the hall's at the controls: the kid's, a guest's, or a regular's (their own line when it signs the board). */
  private regularResult(cs: CrowdStation, score: number): void {
    if (this.kid?.plays(cs)) {
      this.kid.ownResult(cs, score);
      return;
    }
    const guest = this.guests.find((g) => g.plays(cs));
    if (guest) {
      guest.ownResult(cs, score);
      return;
    }
    const r = this.regulars.find((o) => o.state.kind === 'playing' && o.state.at === cs);
    if (!r) return;
    const signed = this.options.onRegularScore?.(cs.station, score, r.who.initials);
    if (signed) {
      r.walker.say(pick(random, r.who.boardLines), 2.6);
      r.walker.react('record');
    } else {
      r.walker.react('over');
      // The sore loser walks off after a game that did not make the board.
      if (r.who.soreLoser && random() < 0.5 && r.state.kind === 'playing') {
        r.walker.say(pick(random, r.who.chatter), 1.6);
        r.state.left = 0;
      }
    }
    this.reactions.mark(r.walker);
    // Then the next coin, if they are staying on.
    this.timers.after(NEXT_COIN_AFTER + random() * 0.6, () => {
      if (r.state.kind === 'playing' && r.state.at === cs && r.state.left > 0 && !r.walker.performer.gesturing) r.walker.gesture('insertCoin');
    });
  }

  /**
   * A machine made a sound that means something (a point, a bonus, a life lost, a record): whoever plays it reacts
   * (unless the machine directs their body and shows it itself), and whoever watches it.
   */
  private sound(cs: CrowdStation, sfx: Sfx): void {
    const reaction = reactionOf(sfx);
    if (!reaction) return;
    if (cs.station.occupant === 'regular' && !cs.station.directs) {
      const r = this.regulars.find((o) => o.state.kind === 'playing' && o.state.at === cs);
      if (r) this.reactions.once(r.walker, reaction);
    }
    this.kid?.heard(cs, reaction);
    for (const g of this.guests) g.heard(cs, reaction);
  }
}
