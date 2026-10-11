import * as THREE from 'three';
import type { ArcadeResult } from '@/game/SessionActions';
import type { Reaction } from '../people/performer';
import type { Walker } from '../people/Walker';
import type { Station } from './Station';
import type { CrowdNav, CrowdStation } from './crowdNav';
import type { CrowdReactions } from './crowdReactions';
import { pick, random, within } from '@/random';

/** Somewhere the kid likes to stand when nobody is worth watching: facing `yaw`, eyes on `look` (zone-local). */
export interface HangoutSpot {
  at: [x: number, z: number];
  yaw: number;
  look?: [x: number, y: number, z: number];
}

/**
 * How the kid takes the player's games (how the player stands with him, docs/social.md): `devoted` comes over for
 * every one and always takes player two, `cheer` comes over and cheers louder, `plain` comes over now and then,
 * `heckle` comes to jeer and leaves the second stick alone.
 */
export type KidMood = 'devoted' | 'cheer' | 'plain' | 'heckle';

/** His own game: the machine he plays when it is free and nobody needs him, how well by now, what he signs. */
interface KidGame {
  station: () => CrowdStation | null;
  skill: () => number;
  initials: string;
  /** The odds, each time he looks for something to do, that he goes and plays it. */
  odds: number;
  /** How long he plays it (seconds). */
  seconds: readonly [number, number];
}

interface HallKidOptions {
  walker: Walker;
  nav: CrowdNav;
  stations: readonly CrowdStation[];
  hangouts: readonly HangoutSpot[];
  reactions: CrowdReactions;
  mood: () => KidMood;
  /** Whether the mood came from the player's standing with him (a social game): a fan shouts. */
  moody: boolean;
  game?: KidGame;
  /** The second stick of `cs` is someone else's right now (a friend of the player's came to play). */
  partnerTaken: (cs: CrowdStation) => boolean;
  /** The machine the regulars leave to the player today (the Saturday cup's). */
  reserved: () => Station | null;
  /** His game ended with `score`: maybe on the board under his initials; the line he says about it, or null. */
  onScore: (station: Station, score: number, name: string) => string | null;
}

const PARTNER_LINES = ['Player two! Me! Me!', 'I call the blue stick!', 'Two players? I am in.'];
/** What he says at the second stick when the game is over: the player won it, he did, or nobody did. */
const PARTNER_RESULTS = { won: ['Rematch. Now.', 'I let you win.', 'The blue stick is broken.'], lost: ['Ha! Kid wins!', 'Too easy.', 'Again? I will go easy.'], drawn: ['A draw! Rematch!', 'Nobody wins. Again!'] };
/** The kid not getting on with the player: what he jeers at their games. */
const KID_HECKLES = ['Boo!', 'My nan plays better.', 'Is that it?', 'Ha! Ouch.', 'Give someone else a go.'];
/** The kid a fan of the player's: what he shouts at a decent game. */
const KID_LOUD = ['GO GO GO!', 'YES! Did you see that?', 'That’s my player!', 'Teach me that!'];
/** A kid who is neither: the odds he comes over to a game of the player's, and takes a free second stick. */
const KID_PLAIN = { watch: 0.6, partner: 0.6 };
/** What the kid says, now and then, watching a game go well or badly. */
const KID_OOH = ['Ooh!', 'Nooo...', 'Ouch!'];
const KID_NICE = ['Nice!', 'Whoa!', 'Yes!'];
/** At his own game: a word now and then, and what he says off the board. */
const KID_PLAYING = ['Row nine. Row nine. Row nine...', 'Come on!', 'Nooo!', 'Almost!'];
const KID_OFF_BOARD = ['One day.', 'Next time, board.', 'Rigged.'];

type KidState =
  | { kind: 'hanging'; left: number }
  | { kind: 'walking' }
  | { kind: 'watching'; at: CrowdStation; byPlayer: boolean; left: number }
  | { kind: 'partner'; at: CrowdStation }
  | { kind: 'playing'; at: CrowdStation; left: number; chatter: number };

/**
 * Nico, the kid who lives at the arcade: hangs about the hall of fame, the counter and the claw, watches a regular now
 * and then, comes over whenever the player starts a play (how keen depends on how he gets on with them: `KidMood`),
 * cheering a record and groaning at a flop, takes player two at a two-player machine, and, when nobody needs him,
 * plays his own game, a little better every week, signing his own initials when it makes the board.
 */
export class HallKid {
  private state: KidState = { kind: 'hanging', left: 2 };

  constructor(private readonly options: HallKidOptions) {}

  update(dt: number): void {
    const s = this.state;
    if (s.kind === 'hanging') {
      s.left -= dt;
      if (s.left > 0) return;
      const own = this.ownGame();
      // His own game when it is free, else a regular to watch, else somewhere else to stand.
      const busy = this.options.stations.filter((cs) => cs.station.occupant === 'regular');
      if (own && random() < (this.options.game?.odds ?? 0)) this.goPlay(own);
      else if (busy.length && random() < 0.4) this.watch(pick(random, busy), false);
      else this.hangOut();
    } else if (s.kind === 'watching' && !s.byPlayer) {
      s.left -= dt;
      if (s.left <= 0 || s.at.station.occupant !== 'regular') this.hangOut();
    } else if (s.kind === 'playing') {
      s.left -= dt;
      s.chatter -= dt;
      if (s.chatter <= 0) {
        s.chatter = 14 + random() * 20;
        this.options.walker.say(pick(random, KID_PLAYING), 1.6);
      }
      if (s.left <= 0) {
        s.at.station.release();
        this.hangOut();
      }
    }
  }

  /** Whether he is at `cs`'s second stick. */
  partners(cs: CrowdStation): boolean {
    return this.state.kind === 'partner' && this.state.at === cs;
  }

  /** Whether he is playing `cs` himself. */
  plays(cs: CrowdStation): boolean {
    return this.state.kind === 'playing' && this.state.at === cs;
  }

  /** The player put a coin in `cs`: over he comes, to watch or to take player two, as he feels about them. */
  playerStarted(cs: CrowdStation): void {
    const s = this.state;
    if ((s.kind === 'watching' || s.kind === 'partner') && s.at === cs) return;
    const mood = this.options.mood();
    // At his own game, only a fan leaves it for the player's.
    if (s.kind === 'playing') {
      if (mood !== 'devoted' && mood !== 'cheer') return;
      s.at.station.release();
    }
    const partner = cs.station.partner && !this.options.partnerTaken(cs) && mood !== 'heckle' && (mood === 'devoted' || random() < KID_PLAIN.partner);
    if (partner) this.takePlayerTwo(cs);
    else if (mood !== 'plain' || random() < KID_PLAIN.watch) this.watch(cs, true);
  }

  /** The player's play at `cs` ended: a word about it, if he was there to see it. */
  playerResult(cs: CrowdStation, result: ArcadeResult): void {
    const kid = this.options.walker;
    const s = this.state;
    if (s.kind === 'partner' && s.at === cs) {
      this.partnerResult(cs, result);
      return;
    }
    if (s.kind !== 'watching' || s.at !== cs) return;
    const mood = this.options.mood();
    if (mood === 'heckle') {
      kid.say(pick(random, KID_HECKLES), 2.4);
      kid.react(result.best ? 'fail' : 'great');
      return;
    }
    let line: string;
    let cheer = false;
    if (result.prize) {
      line = 'NO WAY! It actually let go!';
      cheer = true;
    } else if (cs.station.name === 'ClawMachine') {
      line = random() < 0.5 ? 'Rigged. Told you.' : 'Nearly had it!';
    } else if (result.best) {
      line = random() < 0.5 ? 'NEW RECORD!' : 'WHOA!';
      cheer = true;
    } else if (result.score === 0) {
      line = 'Ouch.';
    } else {
      line = pick(random, ['Nice one!', 'Not bad!', 'Aww...', 'So close!', 'Again! Again!']);
    }
    // A fan of the player's shouts a decent game from the rooftops.
    if (!cheer && result.score > 0 && (mood === 'cheer' || mood === 'devoted') && this.options.moody) {
      kid.say(pick(random, KID_LOUD), 2.4);
      kid.react('great');
      return;
    }
    kid.say(line, 2.4);
    kid.react(cheer ? 'record' : result.score === 0 ? 'fail' : 'good');
  }

  /** The player walked away from `cs`: he lets go of the second stick and drifts off. */
  playerLeft(cs: CrowdStation): void {
    const s = this.state;
    if (s.kind === 'partner' && s.at === cs) cs.station.partner?.setPartner(null);
    if ((s.kind === 'watching' || s.kind === 'partner') && s.at === cs) this.state = { kind: 'hanging', left: 2 + random() * 3 };
  }

  /** A machine made a sound that means something: he reacts if watching or at it, now and then with a word. */
  heard(cs: CrowdStation, reaction: Reaction): void {
    const kid = this.options.walker;
    const s = this.state;
    const there = (s.kind === 'watching' || s.kind === 'partner' || s.kind === 'playing') && s.at === cs;
    if (!there || !this.options.reactions.once(kid, reaction) || random() >= 0.3) return;
    if (reaction === 'fail') kid.say(pick(random, KID_OOH), 1.4);
    else if (reaction === 'great' || reaction === 'record') kid.say(pick(random, KID_NICE), 1.4);
  }

  /** His own game at `cs` ended with `score`: on the board, maybe (arms up), else a shrug. */
  ownResult(cs: CrowdStation, score: number): void {
    const kid = this.options.walker;
    const line = this.options.onScore(cs.station, score, this.options.game?.initials ?? 'NIC');
    if (line) {
      kid.say(line, 2.6);
      kid.react('record');
    } else {
      if (random() < 0.3) kid.say(pick(random, KID_OFF_BOARD), 1.8);
      kid.react('over');
    }
    this.options.reactions.mark(kid);
  }

  /** At the second stick: who won, by the goals, and a word about it. */
  private partnerResult(cs: CrowdStation, result: ArcadeResult): void {
    const kid = this.options.walker;
    const tally = cs.station.partner?.tally() ?? null;
    const outcome = tally ? (tally.you > tally.them ? 'won' : tally.you < tally.them ? 'lost' : 'drawn') : result.best ? 'won' : 'drawn';
    kid.say(pick(random, PARTNER_RESULTS[outcome]), 2.4);
    kid.react(outcome === 'won' ? 'fail' : outcome === 'lost' ? 'great' : 'good');
  }

  /** His game's machine, when it is free for him (nobody on it, not the cup's, working). */
  private ownGame(): CrowdStation | null {
    const cs = this.options.game?.station() ?? null;
    if (!cs || cs.station.occupant || cs.station.outOfOrder || cs.station === this.options.reserved()) return null;
    return cs;
  }

  private goPlay(cs: CrowdStation): void {
    const { walker, nav, game } = this.options;
    if (!game) return;
    this.state = { kind: 'walking' };
    walker.walk(nav.route(walker.position, nav.standSpot(cs)), () => {
      if (!cs.station.occupy(walker.performer, game.skill())) {
        this.state = { kind: 'hanging', left: 2 };
        return;
      }
      walker.stand(nav.standYaw(cs), 'play', nav.focusOf(cs), cs.station.directs ? null : () => cs.station.handsAt(), cs.station.lean);
      walker.gesture('insertCoin');
      this.state = { kind: 'playing', at: cs, left: within(random, game.seconds), chatter: 6 + random() * 10 };
    });
  }

  private hangOut(): void {
    const { walker, nav, hangouts } = this.options;
    if (!hangouts.length) return;
    const spot = pick(random, hangouts);
    this.state = { kind: 'walking' };
    walker.walk(nav.route(walker.position, new THREE.Vector3(spot.at[0], 0, spot.at[1])), () => {
      walker.stand(spot.yaw, random() < 0.5 ? 'pockets' : 'crossed', spot.look ? nav.toWorld(new THREE.Vector3(...spot.look)) : null);
      this.state = { kind: 'hanging', left: 6 + random() * 12 };
    });
  }

  private watch(cs: CrowdStation, byPlayer: boolean): void {
    const { walker, nav } = this.options;
    this.state = { kind: 'walking' };
    const spot = nav.watchSpot(cs);
    walker.walk(nav.route(walker.position, spot), () => {
      const focus = nav.focusOf(cs);
      walker.stand(nav.yawTo(spot, focus), byPlayer ? 'crossed' : 'pockets', focus);
      this.state = { kind: 'watching', at: cs, byPlayer, left: 10 + random() * 15 };
    });
  }

  /** A two-player machine: he takes the second stick (the machine plays it until he gets there). */
  private takePlayerTwo(cs: CrowdStation): void {
    const { walker, nav } = this.options;
    const partner = cs.station.partner;
    const spot = nav.partnerSpot(cs);
    if (!partner || !spot) return;
    this.state = { kind: 'walking' };
    walker.say(pick(random, PARTNER_LINES), 2);
    walker.walk(nav.route(walker.position, spot), () => {
      if (cs.station.occupant !== 'player' || this.options.partnerTaken(cs)) {
        this.state = { kind: 'hanging', left: 1 };
        return;
      }
      walker.stand(nav.standYaw(cs), 'play', nav.focusOf(cs), () => partner.handsAt(), cs.station.lean);
      partner.setPartner(this.options.game?.initials ?? 'KID');
      this.state = { kind: 'partner', at: cs };
    });
  }
}
