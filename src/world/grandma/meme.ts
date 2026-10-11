import * as THREE from 'three';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import { Prop } from '../props/Prop';
import { Walker, type WalkerOptions } from '../people/Walker';
import { bodyOf, talkHook } from '../people/socialHook';
import type { SessionActions } from '@/game/SessionActions';
import type { TalkExtra } from '@/social/talk';
import { MEME_ID } from '@/social/people/family';
import { GRANDMA, GRANDMA_TALK } from '@/grandma/grandma';
import { GrandmaTalk, momentAt } from '@/grandma/GrandmaTalk';
import type { GrandmaGift, GrandmaVisits } from '@/grandma/GrandmaVisits';
import { isAuctionDay } from '@/economy/AuctionHouse';
import { memeLook } from './familyLooks';
import { MEME_FEATURES } from './memeFeatures';
import type { MemeFeatureLive, MemeScene, MemeThings } from './memeScene';
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';
import { PRESENCE_PLAN } from './presencePlan';
import { seated, walkHer, walkHome, yawTo } from './visit/herWay';
import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { playGrandmaVoice } from '@/audio/grandmaVoice';
import { loudness } from '@/audio/hearing';
import { stereoPan } from '@/audio/spatial';
import { random } from '@/random';

/** Seconds after the player is in before she says hello (the curtain is still lifting), and between two of her lines. */
const GREET_AFTER = 1;
const LINE_GAP = 3.2;
/**
 * Game hours between two of her flat's frames past which it was dormant (the player gone further than her landing):
 * a step out onto the landing and back keeps the visit (no second hello), a way back up from the avenue is a new one.
 */
const DORMANT_GAP = 0.04;
/** Her voice's babble (`playGrandmaVoice`): its level at her mouth, how far it carries, her mouth's height. */
const VOICE = { level: 0.07, maxDistance: 9, y: 1.5 };


/** Where she is at an hour: at the table over the paper, or in her armchair watching the set or knitting. */
type Spot = 'table' | 'set' | 'knitting';

/** Mémé as the flat's builder keeps her: the body (the memories put her aside) and her sitting down again where she is. */
interface PlacedMeme {
  walker: Walker;
  reseat(): void;
}

/** What she can be given, as the player does it (the conversation's entry, or the caption without the social layer). */
const GIFT_ACT: Record<GrandmaGift, (title: string) => string> = {
  flowers: () => 'Give her the flowers',
  cake: () => 'Bring her a slice of your cake',
  game: (title) => `Show her ${title}`,
};

/**
 * MÉMÉ IN HER FLAT (docs/story.md "Mémé"): Odette in her day by the hour (`GRANDMA_DAY`: the paper at the table in the
 * morning, the set in the afternoon, knitting in the evening, sleepy late), moved only while the player is away; her
 * hello on the way in (`GrandmaTalk`: the Sunday envelope paid at once, the album when a memory waits); her chat when
 * clicked; and what she is given when the player has something for her (flowers, cake, the latest game).
 */
export function placeMeme(zone: Zone, ctx: BuildContext, things: MemeThings): PlacedMeme {
  const { sky, listener } = ctx;
  const hour = (): number => sky.dayNight.state.hours;
  const visits = ctx.grandma ?? null;
  const talk = visits ? new GrandmaTalk(visits) : null;
  const [ax, az] = PLAN.armchair.at;
  // Clicked, she opens the conversation like anyone (docs/social.md "Mémé"): what she has for the player's ear, and
  // what the player has for her, are its entries.
  const social = talkHook(ctx.social, MEME_ID, (session) => {
    // Opened: her little jobs and Gaspard's ring wait till it closes (`MemeScene.talking`).
    talking = true;
    return {
      person: MEME_ID,
      place: 'theirFlat',
      body: bodyOf(meme),
      opening: () => talk?.chat(hour()) ?? null,
      onClose: () => {
        talking = false;
      },
      extras: talk && visits ? [...memeExtras(meme, visits, talk, () => ctx.today.gameDay, hour), ...features.flatMap((feature) => feature.extras?.(session) ?? [])] : [],
    };
  });
  const meme: Meme = zone.place(
    new Meme(
      {
        viewer: listener,
        seed: 1931,
        look: memeLook(),
        talk: () => talk?.chat(hour()) ?? GRANDMA_TALK.chat.always[0],
        label: `${GRANDMA.name} · chat`,
        speaker: GRANDMA.name,
        speed: PRESENCE_PLAN.speed,
        corners: 0.3,
        stopsToTalk: true,
        ...(social ? { social } : {}),
      },
      visits,
      talk,
      () => ctx.today.gameDay,
      !!social,
    ),
    new THREE.Vector3(ax, 0, az),
    PLAN.armchair.yaw,
  );

  let spot: Spot = spotAt(hour());
  const world = ([x, y, z]: readonly [number, number, number]) => zone.toWorld(new THREE.Vector3(x, y, z));
  /** Sits her in her spot (where she is now: the memories call it back in the room). */
  const reseat = (): void => {
    meme.hold(null);
    if (spot === 'table') {
      const { table } = PLAN.memeDay;
      meme.sit(table.yaw, table.seat, 'read', world(table.gaze));
      meme.hold('book');
    } else meme.sit(PLAN.armchair.yaw, PLAN.seatHeight, 'lap', world(spot === 'knitting' ? PLAN.memeDay.knitting : PLAN.gaze));
  };
  /** Moves her to her spot at this hour (the player away: nobody sees her get up). */
  const settle = (): void => {
    spot = spotAt(hour());
    const at = spot === 'table' ? PLAN.memeDay.table : { at: PLAN.armchair.at, yaw: PLAN.armchair.yaw };
    meme.rotation.y = at.yaw;
    meme.setPresent(true, new THREE.Vector3(at.at[0], 0, at.at[1]));
    reseat();
  };
  settle();

  // The visit's features (docs/grandma.md "The scene"): tea, cards, her stories… each takes her body in turn (`claim`).
  const features: MemeFeatureLive[] = [];
  let busyWith: string | null = null;
  let playerIn = false;
  let talking = false;
  /** Her seat for the hour, and the way out of it (`presencePlan`). */
  const home = (): { at: readonly [number, number]; yaw: number; way: readonly (readonly [number, number])[] } =>
    spot === 'table'
      ? { at: PLAN.memeDay.table.at, yaw: PLAN.memeDay.table.yaw, way: PRESENCE_PLAN.leave.table }
      : { at: PLAN.armchair.at, yaw: PLAN.armchair.yaw, way: PRESENCE_PLAN.leave.armchair };
  let scene: MemeScene | null = null;
  // Her lines queue up: two features speaking on the way in (a hint, a favour, a word about Gaspard) take turns.
  let clock = 0;
  let freeAt = 0;
  const say = (lines: readonly string[], then?: () => void): void => {
    const wait = Math.max(0, freeAt - clock);
    lines.forEach((line, i) => {
      const at = wait + i * LINE_GAP;
      if (at === 0) meme.speak(line);
      else zone.after(at, () => meme.speak(line));
    });
    const span = Math.max(1, lines.length) * LINE_GAP;
    freeAt = clock + wait + (lines.length ? span : 0);
    if (then) zone.after(wait + span, then);
  };
  /** The features' `arrived`, still owed for this visit (her greeting walk not over yet). */
  let owed: (() => void) | null = null;
  /** The greeting cut short (a memory filmed, the player gone): she is given back and the features hear the way in. */
  const greetingCut = (): void => {
    if (busyWith === 'greet') busyWith = null;
    const pay = owed;
    owed = null;
    pay?.();
  };
  if (visits && talk) {
    scene = {
      zone,
      meme,
      ctx,
      things,
      visits,
      talk,
      hour,
      day: () => ctx.today.gameDay,
      world: (x, y, z) => world([x, y, z]),
      reseat: () => {
        reseat();
        greetingCut();
      },
      home,
      say,
      claim: (owner) => {
        if (busyWith !== null && busyWith !== owner) return false;
        busyWith = owner;
        return true;
      },
      release: (owner) => {
        if (busyWith === owner) busyWith = null;
      },
      get busyWith() {
        return busyWith;
      },
      get playerIn() {
        return playerIn;
      },
      get talking() {
        return talking;
      },
    };
    for (const feature of MEME_FEATURES) features.push(feature.start(scene));
  }

  if (visits && talk && scene) {
    const visit = scene;
    // The visit stays open while her flat keeps ticking: the player on her landing (a neighbour zone) and back in.
    const gameHours = (): number => ctx.today.gameDay * 24 + hour();
    let lastFrame: number | null = null;
    let visiting = false;
    /** The visit over (her flat dormant since, or unloaded): what was owed dropped, the features hear the player left. */
    const endVisit = (): void => {
      if (!visiting) return;
      visiting = false;
      owed = null;
      if (busyWith === 'greet') busyWith = null;
      for (const feature of features) feature.left?.();
    };
    zone.onUnload(endVisit);
    // On the way in: her spot for the hour, the envelope paid at once, her words a moment later, a line at a time.
    zone.place(
      new Arrivals(
        // A step onto her landing is still the visit: the features hear the player left once it is over (`endVisit`).
        (occupied) => {
          playerIn = occupied;
        },
        () => {
        // Back from a memory filmed elsewhere (the camera took the zone away and back): no visit, she is reseated by it.
        if (ctx.memories?.filming) return;
        // Back in from her landing: the same visit, no second hello (unless her flat lay dormant since its last frame).
        if (lastFrame !== null && gameHours() - lastFrame > DORMANT_GAP) endVisit();
        if (visiting) return;
        visiting = true;
        busyWith = null;
        talking = false;
        settle();
        seated(visit);
        const day = ctx.today.gameDay;
        const arrival = visits.arrive(day);
        if (arrival.envelope) ctx.money.purse?.earnCoins(arrival.envelope);
        const greeting = talk.greeting(arrival, hour());
        const envelope = (): void => {
          if (arrival.envelope) ctx.notices.reward({ ...(isAuctionDay(day) ? GRANDMA_TALK.envelopeSale : GRANDMA_TALK.envelope), coins: arrival.envelope });
        };
        const heard = (helloEnds: number): void => {
          const met = { first: arrival.first, envelope: arrival.envelope, helloEnds };
          for (const feature of features) feature.arrived?.(met);
        };
        zone.after(GREET_AFTER, () => {
          // Late, her knees have gone to bed: the hello from her seat, a yawn.
          if (greeting.yawn) {
            meme.gesture('stretch');
            meme.feel({ jaw: 0.8, squint: 0.7 }, 1.8);
            envelope();
            say([PRESENCE_TALK.stayingPut, ...greeting.lines]);
            heard((greeting.lines.length + 1) * LINE_GAP);
            return;
          }
          // Else she gets up and comes to the door, calling out on the way; the hello there, the envelope pressed in
          // the player's hand, then back to her seat. The visit's features hear the way in once she sits again.
          busyWith = 'greet';
          owed = () => heard(0);
          const came = ctx.sharedRide?.cameWith(day) ?? false;
          meme.speak(came ? PRESENCE_TALK.cameWith : (PRESENCE_TALK.coming[Math.floor(random() * PRESENCE_TALK.coming.length)] ?? PRESENCE_TALK.coming[0]));
          walkHer(visit, PRESENCE_PLAN.greet, () => {
            meme.stand(yawTo(visit, PRESENCE_PLAN.door), 'stand', 'viewer');
            meme.gesture('clap');
            meme.feel({ smile: 1, browsUp: 0.6 }, 4);
            envelope();
            say(greeting.lines, () => {
              meme.nod();
              walkHome(visit, greetingCut);
            });
          });
        });
        },
        (dt) => {
          const now = gameHours();
          if (lastFrame !== null && now - lastFrame > DORMANT_GAP && !playerIn && !ctx.memories?.filming) endVisit();
          lastFrame = now;
          clock += dt;
          for (const feature of features) feature.update?.(dt);
        },
      ),
      new THREE.Vector3(),
    );
  }
  // Back from a memory (the album reseats her): a greeting the film cut short is over.
  return {
    walker: meme,
    reseat: () => {
      reseat();
      greetingCut();
    },
  };
}

/** The conversation's entries at hers: what the player has for her (the gift of the moment), and Félix. */
function memeExtras(meme: Meme, visits: GrandmaVisits, talk: GrandmaTalk, day: () => number, hour: () => number): TalkExtra[] {
  return [
    {
      id: 'memeGift',
      group: 'give',
      get label(): string {
        const gift = visits.forHer(day());
        return gift ? GIFT_ACT[gift](visits.latestTitle() ?? 'your latest find') : 'Give her something';
      },
      disabled: () => (visits.forHer(day()) ? null : 'Nothing for her just now'),
      run: () => {
        const line = meme.receive();
        return line ? { line } : undefined;
      },
    },
    { id: 'memeFelix', group: 'talk', label: 'Tell me about Félix?', run: () => ({ line: talk.chat(hour()) }) },
  ];
}

/** Her spot at `hour`. */
function spotAt(hour: number): Spot {
  const moment = momentAt(hour);
  return moment === 'morning' ? 'table' : moment === 'day' ? 'set' : 'knitting';
}

/**
 * Mémé’s body: a click opens the conversation (`talks`), where what the player has for her is an entry; without the
 * social layer, the click hands it over straight away (the caption says what) or she says a line.
 */
class Meme extends Walker {
  /** The player's ears (the camera), and scratch points for her voice. */
  private readonly listener: THREE.Object3D;
  private readonly mouth = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();

  constructor(
    options: WalkerOptions,
    private readonly visits: GrandmaVisits | null,
    private readonly words: GrandmaTalk | null,
    private readonly day: () => number,
    private readonly talks: boolean,
  ) {
    super(options);
    this.listener = options.viewer;
  }

  override label(): string | null {
    const gift = !this.talks && this.isPresent ? this.visits?.forHer(this.day()) : null;
    if (!gift) return super.label();
    return `${GRANDMA.name} · ${GIFT_ACT[gift](this.findTitle()).toLowerCase()}`;
  }

  override activate(session: SessionActions): void {
    if (this.talks || !this.isPresent) {
      super.activate(session);
      return;
    }
    const line = this.receive();
    if (line) this.speak(line);
    else super.activate(session);
  }

  /** What the player has for her handed over: her gesture and smile, and her thanks (to say); null when there was nothing. */
  receive(): string | null {
    const { visits, words } = this;
    const gift = visits?.forHer(this.day());
    if (!visits || !words || !gift) return null;
    const title = visits.give(gift, this.day());
    if (title === null) return null;
    this.gesture(gift === 'game' ? 'adjustGlasses' : 'clap');
    this.feel({ smile: 1, browsUp: 0.5 }, 2.5);
    return words.thanks(gift, title);
  }

  /** Her words heard as her babble, from where she is (by distance and side), as the bubble shows them. */
  protected override lineShown(text: string): void {
    super.lineShown(text);
    this.getWorldPosition(this.mouth);
    this.mouth.y += VOICE.y;
    this.listener.getWorldPosition(this.ear);
    const level = loudness(this.ear.distanceTo(this.mouth), { referenceDistance: 1, maxDistance: VOICE.maxDistance });
    playGrandmaVoice(text, VOICE.level * level, { pan: stereoPan(this.listener, this.mouth), walls: 0 });
  }

  /** The latest game's title, for the caption (her `forHer` said there is one). */
  private findTitle(): string {
    return this.visits?.latestTitle() ?? 'your latest find';
  }
}

/** Hears the player come in (the zone occupied): the arrival's hello, once a visit; and ticks the visit's features. */
class Arrivals extends Prop {
  private inside = false;

  constructor(
    private readonly occupancy: (occupied: boolean) => void,
    private readonly arrived: () => void,
    private readonly tick: (dt: number) => void,
  ) {
    super();
    this.name = 'GrandmaArrivals';
  }

  setOccupied(occupied: boolean): void {
    const was = this.inside;
    this.inside = occupied;
    if (occupied !== was) this.occupancy(occupied);
    if (occupied && !was) this.arrived();
  }

  update(dt: number): void {
    this.tick(dt);
  }
}
