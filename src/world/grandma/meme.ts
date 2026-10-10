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
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';

/** Seconds after the player is in before she says hello (the curtain is still lifting), and between two of her lines. */
const GREET_AFTER = 1;
const LINE_GAP = 3.2;

/** What Mémé reads of the build. */
type MemeContext = Pick<BuildContext, 'sky' | 'listener' | 'money' | 'today' | 'notices' | 'grandma' | 'memories' | 'social'>;

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
export function placeMeme(zone: Zone, ctx: MemeContext): PlacedMeme {
  const { sky, listener } = ctx;
  const hour = (): number => sky.dayNight.state.hours;
  const visits = ctx.grandma ?? null;
  const talk = visits ? new GrandmaTalk(visits) : null;
  const [ax, az] = PLAN.armchair.at;
  // Clicked, she opens the conversation like anyone (docs/social.md "Mémé"): what she has for the player's ear, and
  // what the player has for her, are its entries.
  const social = talkHook(ctx.social, MEME_ID, () => ({
    person: MEME_ID,
    place: 'theirFlat',
    body: bodyOf(meme),
    opening: () => talk?.chat(hour()) ?? null,
    extras: talk && visits ? memeExtras(meme, visits, talk, () => ctx.today.gameDay, hour) : [],
  }));
  const meme: Meme = zone.place(
    new Meme(
      {
        viewer: listener,
        seed: 1931,
        look: memeLook(),
        talk: () => talk?.chat(hour()) ?? GRANDMA_TALK.chat.always[0],
        label: `${GRANDMA.name} · chat`,
        speaker: GRANDMA.name,
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

  if (visits && talk) {
    // On the way in: her spot for the hour, the envelope paid at once, her words a moment later, a line at a time.
    zone.place(
      new Arrivals(() => {
        // Back from a memory filmed elsewhere (the camera took the zone away and back): no visit, she is reseated by it.
        if (ctx.memories?.filming) return;
        settle();
        const day = ctx.today.gameDay;
        const arrival = visits.arrive(day);
        if (arrival.envelope) ctx.money.purse?.earnCoins(arrival.envelope);
        const greeting = talk.greeting(arrival, hour());
        zone.after(GREET_AFTER, () => {
          meme.gesture(greeting.yawn ? 'stretch' : 'wave');
          if (greeting.yawn) meme.feel({ jaw: 0.8, squint: 0.7 }, 1.8);
          if (arrival.envelope) ctx.notices.reward({ ...(isAuctionDay(day) ? GRANDMA_TALK.envelopeSale : GRANDMA_TALK.envelope), coins: arrival.envelope });
          greeting.lines.forEach((line, i) => (i === 0 ? meme.speak(line) : zone.after(i * LINE_GAP, () => meme.speak(line))));
        });
      }),
      new THREE.Vector3(),
    );
  }
  return { walker: meme, reseat };
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
  constructor(
    options: WalkerOptions,
    private readonly visits: GrandmaVisits | null,
    private readonly words: GrandmaTalk | null,
    private readonly day: () => number,
    private readonly talks: boolean,
  ) {
    super(options);
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

  /** The latest game's title, for the caption (her `forHer` said there is one). */
  private findTitle(): string {
    return this.visits?.latestTitle() ?? 'your latest find';
  }
}

/** Hears the player come in (the zone occupied): the arrival's hello, once a visit. */
class Arrivals extends Prop {
  private inside = false;

  constructor(private readonly arrived: () => void) {
    super();
    this.name = 'GrandmaArrivals';
  }

  setOccupied(occupied: boolean): void {
    if (occupied && !this.inside) this.arrived();
    this.inside = occupied;
  }
}
