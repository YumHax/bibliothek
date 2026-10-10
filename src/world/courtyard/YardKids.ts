import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { Game } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import type { SeasonName } from '@/time/season';
import { random } from '@/random';
import type { KidPanels } from '@/building/kids/kidDeals';
import { KIDS, KIDS_LINES, KIDS_RULES, type KidId, type KidPlan } from '@/building/kids/kidsPlan';
import { beatKid, cartHandedOver, kidCarts, kidScore, swappedWithKid, type CartDraw } from '@/building/kids/yardKids';
import { kidsNews } from '@/building/kids/kidNews';
import { has } from '@/social/perks';
import { nudge } from '@/social/standing';
import { rememberLook } from '@/social/lookBook';
import type { SocialServices, TalkExtra, TalkSession } from '@/social/talk';
import type { Furniture } from '../Furniture';
import { randomLook, type PersonLook } from '../people/looks';
import { bodyOf, metName, talkHook } from '../people/socialHook';
import { disposeTree } from '../props/Prop';
import { YardKid } from './YardKid';
import { HandheldScreens, handheldModel } from './handheldModel';

/** What the kids place and take away again: the zone. */
interface KidsHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
}

/** Where a kid sits or stands (zone-local), facing which way, on a seat this high (or standing), leaning in. */
export interface KidSpot {
  at: THREE.Vector3;
  yaw: number;
  seat: number | null;
  lean?: number;
}

interface YardKidsOptions {
  host: KidsHost;
  /** The camera: they look at it; the kids come and go only out of its sight. */
  viewer: THREE.Object3D;
  spots: Readonly<Record<KidId, KidSpot>>;
  /** Who is down now (`yardKids.kidsOut`, read from the game day, the hour and the sky). */
  out(): readonly KidPlan[];
  day(): number;
  date(): Date;
  season(): SeasonName;
  /** The market's index, for what is in their pencil cases. */
  carts: CartDraw;
  panels?: KidPanels;
  notices: Pick<NoticeActions, 'reward'>;
  social?: SocialServices;
}

/** Seconds between two looks at who should be down. */
const CHECK_EVERY = 1;
/** A kid comes or goes only where the player does not see it: further than this, or out of the view's cone (cosine). */
const UNSEEN_BEYOND = 16;
const VIEW_COS = 0.35;
/** Nearer than this to a kid, the screens run and the news is shouted. */
const NEAR = 9;
/** Seconds between two cries from the bench while the player is near (a cheer, a groan), drawn in this range. */
const CRIES: [number, number] = [14, 32];

/** The game day the yard's news was last shouted to the player (once a day). */
let shoutedOn = -1;
/** Today's news told so far in conversation (its day, how far down the list). */
const told = { day: -1, next: 0 };

/**
 * The building's kids in the courtyard (docs/building.md "The kids in the yard"; their rules `building/kids`): down
 * after school, on Wednesdays and at weekends when it is dry and light, each in their spot with their handheld
 * (`YardKid`), Tuan leaning over Mai's. They come and go only where the player does not see. Near them, the screens
 * run, someone cheers or groans now and then, and on a day with news the first to see the player shouts it. Each is
 * someone to talk to (docs/social.md): their news ("Heard anything?"), a swap of carts (`ui/yard/KidSwapPanel`) and
 * a go on their handheld against their score (`ui/yard/HandheldPanel`). Origin: the zone's.
 */
export class YardKids extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly present = new Map<KidId, YardKid>();
  private readonly screens = new HandheldScreens();
  private readonly looks = new Map<KidId, PersonLook>();
  /** The handheld's sounds during a go: out of the kid whose go it is. */
  private speaker: ChipSpeaker | null = null;
  private readonly eye = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private clock = CHECK_EVERY;
  private cry = CRIES[0];
  /** The first look places who is down at once: the player is only arriving. */
  private primed = false;

  constructor(private readonly options: YardKidsOptions) {
    super();
    this.name = 'YardKids';
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= CHECK_EVERY) {
      this.clock = 0;
      this.comeAndGo();
    }
    const near = this.nearest() < NEAR;
    if (!near) return;
    this.screens.tick(dt);
    this.shoutNews();
    this.cry -= dt;
    if (this.cry <= 0) {
      this.cry = CRIES[0] + random() * (CRIES[1] - CRIES[0]);
      const kids = [...this.present.values()];
      const kid = kids[Math.floor(random() * kids.length)];
      if (kid) kid.say(pick(random() < 0.5 ? KIDS_LINES.cheer : KIDS_LINES.groan));
    }
  }

  dispose(): void {
    // The kids are the zone's placed items: it disposes them and frees their tree as it unloads (removing them here,
    // in the middle of its walk over its items, would skip them).
    this.present.clear();
    this.screens.dispose();
    this.speaker?.dispose();
  }

  /** Places who should be down and is not, takes away who should not be and is: each only out of the player's sight. */
  private comeAndGo(): void {
    const wanted = new Set(this.options.out().map((k) => k.id));
    for (const kid of KIDS) {
      const here = this.present.get(kid.id);
      if (wanted.has(kid.id) === !!here || (this.primed && this.seen(this.options.spots[kid.id].at))) continue;
      if (here) {
        this.options.host.remove(here);
        here.dispose();
        disposeTree(here);
        this.present.delete(kid.id);
      } else {
        this.present.set(kid.id, this.placeKid(kid));
      }
    }
    this.primed = true;
  }

  /** Whether the player would see something at `at` appear (zone-local): near enough and in front of them. */
  private seen(at: THREE.Vector3): boolean {
    const { viewer } = this.options;
    viewer.getWorldPosition(this.eye);
    viewer.getWorldDirection(this.forward);
    this.to.copy(at);
    this.localToWorld(this.to).sub(this.eye);
    const distance = this.to.length();
    return distance < UNSEEN_BEYOND && this.forward.dot(this.to.divideScalar(Math.max(distance, 1e-6))) > VIEW_COS;
  }

  private nearest(): number {
    this.options.viewer.getWorldPosition(this.eye);
    let best = Infinity;
    for (const kid of this.present.values()) best = Math.min(best, kid.getWorldPosition(this.to).distanceTo(this.eye));
    return best;
  }

  /** The first kid to see the player on a day with news shouts it across the yard. */
  private shoutNews(): void {
    const day = this.options.day();
    if (shoutedOn === day) return;
    const kid = this.present.values().next().value;
    if (!kid) return;
    shoutedOn = day;
    const [first] = kidsNews(day, this.options.date()).urgent;
    if (first) kid.say(first, 4);
  }

  /** A kid's body, their look for the season, their handheld, their conversation. */
  private placeKid(kid: KidPlan): YardKid {
    const { spots, viewer, social } = this.options;
    const spot = spots[kid.id];
    const look = this.lookOf(kid);
    const handheld = kid.handheld ? handheldModel(kid.handheld, this.screens.material(kid.handheld)) : null;
    const shares = kid.shares;
    const body: YardKid = new YardKid({
      viewer,
      look,
      seed: kid.look.seed,
      speaker: metName(kid.id, kid.name.split(' ')[0]!),
      seat: spot.seat,
      handheld,
      ...(shares ? { watch: (out: THREE.Vector3) => this.present.get(shares)?.screenAt(out) ?? null } : {}),
      ...(spot.lean ? { lean: spot.lean } : {}),
      lines: KIDS_LINES.hello,
      ...(social ? { social: talkHook(social, kid.id, (session) => this.talk(kid, body, session)) } : {}),
    });
    return this.options.host.place(body, spot.at.clone(), spot.yaw);
  }

  /** A child's look for the season, at their own height (twins alike), remembered for their portrait. */
  private lookOf(kid: KidPlan): PersonLook {
    const known = this.looks.get(kid.id);
    if (known) return known;
    const look = randomLook(kid.look.seed, 'shopper', { season: this.options.season(), age: 'child' });
    look.height = kid.look.height;
    look.headScale = 1.22 - (kid.look.height - 1.05) * 0.3;
    look.bag = undefined;
    if (kid.look.long) look.hairStyle = 'ponytail';
    // Twins: one skin, one hair colour.
    const twinId = kid.shares ?? KIDS.find((k) => k.shares === kid.id)?.id;
    const twin = twinId ? this.looks.get(twinId) : undefined;
    if (twin) {
      look.skin = twin.skin;
      look.hair = twin.hair;
    }
    this.looks.set(kid.id, look);
    rememberLook(kid.id, look);
    return look;
  }

  /** The conversation with `kid`: their news, a swap of carts, a go on their handheld. */
  private talk(kid: KidPlan, body: YardKid, session: SessionActions): TalkSession {
    return { person: kid.id, place: 'courtyard', body: bodyOf(body), extras: this.extras(kid, body, session) };
  }

  private extras(kid: KidPlan, body: YardKid, session: SessionActions): TalkExtra[] {
    const { panels } = this.options;
    const day = this.options.day();
    const news = kidsNews(day, this.options.date());
    if (told.day !== day) Object.assign(told, { day, next: 0 });
    const lines = [...news.urgent, ...news.rest];
    const extras: TalkExtra[] = [
      {
        id: 'kid-news',
        group: 'talk',
        label: 'Heard anything?',
        ...(told.next < news.urgent.length ? { tag: 'news' } : {}),
        run: () => {
          const line = lines[told.next];
          if (!line) return { line: pick(KIDS_LINES.noNews) };
          told.next++;
          nudge(kid.id, { warmth: KIDS_RULES.newsWarmth, reason: 'kidNews', day, why: 'listened to their news' });
          return { line };
        },
      },
    ];
    if (!panels) return extras;
    extras.push(
      {
        id: 'kid-swap',
        group: 'trade',
        label: 'Swap carts?',
        opensPanel: true,
        disabled: () => (has(kid.id, 'noSwaps') ? 'They won’t swap with you' : null),
        run: () => {
          panels.swap.prepare(this.swapDeal(kid, body));
          session.openPanel(panels.swap);
        },
      },
      {
        id: 'kid-challenge',
        group: 'invite',
        label: 'Bet I can beat your score!',
        opensPanel: true,
        run: () => {
          body.speak(pick(KIDS_LINES.challenge));
          panels.handheld.prepare(this.play(kid, body, panels));
          session.openPanel(panels.handheld);
        },
      },
    );
    return extras;
  }

  /** A swap with `kid`: their pencil case this week, their words and face in the yard, what a swap made keeps. */
  private swapDeal(kid: KidPlan, body: YardKid): Parameters<KidPanels['swap']['prepare']>[0] {
    const { carts } = this.options;
    return {
      kid,
      day: this.options.day(),
      carts: kidCarts(kid, this.options.day(), carts),
      say: (line) => body.speak(line),
      react: (kind) => {
        if (kind === 'yes') body.react('great');
        else if (kind === 'more') body.gesture('scratchHead');
        else body.gesture('headShake');
      },
      swapped: (theirs, mine) => {
        const day = this.options.day();
        swappedWithKid(kid, theirs, mine, day);
        nudge(kid.id, { warmth: KIDS_RULES.swapWarmth, trust: KIDS_RULES.swapTrust, reason: 'yardSwap', day, why: 'swapped carts with you', memory: `you swapped me ${mine.title}`, gossip: true });
        this.cheer(kid.id);
      },
    };
  }

  /** A go on `kid`'s handheld against their score of the day: they take the result as kids do. */
  private play(kid: KidPlan, body: YardKid, panels: KidPanels): Parameters<KidPanels['handheld']['prepare']>[0] {
    const day = this.options.day();
    const best = kidScore(kid, day);
    this.speaker?.dispose();
    const speaker = new ChipSpeaker(body, this.options.viewer, { volume: 0.18 });
    this.speaker = speaker;
    return {
      kid,
      best,
      sounds: (events) => {
        if (!events.length) return;
        speaker.follow();
        speaker.playAll(events);
      },
      over: (score) => {
        nudge(kid.id, { warmth: KIDS_RULES.challengeWarmth, reason: 'yardChallenge', day, why: 'took them on at their game' });
        if (score === null) {
          body.speak(pick(KIDS_LINES.quit));
          return;
        }
        if (score <= best) {
          body.react('record');
          body.speak(pick(KIDS_LINES.lost));
          this.cheer(kid.id);
          return;
        }
        body.react('fail');
        body.speak(pick(KIDS_LINES.won));
        this.groan(kid.id);
        if (beatKid(kid, day).bored) void this.handOver(kid, body, panels, day);
      },
    };
  }

  /** `kid` hands over a cart of theirs the player has not got, bored of it. */
  private async handOver(kid: KidPlan, body: YardKid, panels: KidPanels, day: number): Promise<void> {
    const carts = await kidCarts(kid, day, this.options.carts);
    const where = `a gift from ${kid.name.split(' ')[0]}`;
    let cart: Game | null = null;
    for (const c of carts) {
      if (!panels.give(c, where)) continue;
      cart = c;
      break;
    }
    if (!cart) return;
    cartHandedOver(kid, cart, day);
    const line = pick(KIDS_LINES.bored);
    body.speak(line);
    this.options.notices.reward({ title: `${kid.name.split(' ')[0]}’s ${cart.title}`, detail: `“${line}” It waits in the parcel under the hall console.` });
  }

  /** The others cheer (a swap, a win against the grown-up). */
  private cheer(except: KidId): void {
    for (const [id, kid] of this.present) {
      if (id === except) continue;
      kid.react('great');
      if (random() < 0.4) kid.say(pick(KIDS_LINES.cheer));
    }
  }

  /** The others groan (one of theirs beaten). */
  private groan(except: KidId): void {
    for (const [id, kid] of this.present) {
      if (id === except) continue;
      kid.react('near');
      if (random() < 0.4) kid.say(pick(KIDS_LINES.groan));
    }
  }
}

function pick(lines: readonly string[]): string {
  return lines[Math.floor(random() * lines.length)]!;
}
