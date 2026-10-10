import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { CssLayer } from '@/core/CssLayer';
import type { Game } from '@/catalog/types';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { NoticeActions } from '@/notices/types';
import { poweredAt } from '@/building/mains';
import { CINEMA, audience, filmNightNow, filmShown, onCinemaChange, plannedFilm, type Viewer } from '@/building/yardCinema';
import { doorKey } from '../stairwell/building';
import { personAtDoor } from '@/social/people';
import type { SocialServices } from '@/social/talk';
import { playRockerClick } from '@/audio/furnitureSounds';
import { pick, random } from '@/random';
import type { Furniture } from '../Furniture';
import type { SoundOcclusion } from '../acoustics/SoundOcclusion';
import { Projector } from '../Projector';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import type { Reaction } from '../people/performer';
import { bodyOf, talkHook } from '../people/socialHook';
import { ChairPile, CinemaLead, CinemaSheet, CinemaTrestle, FoldingChair, TRESTLE_TOP, type SheetSpot } from './YardCinemaPieces';

/** What the film night places and takes away again: the zone. */
interface CinemaHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
  toWorld(point: THREE.Vector3): THREE.Vector3;
}

/** Where everything stands, zone-local (the builder turns `COURTYARD_PLAN.cinema` into these). */
interface CinemaSpots {
  /** The sheet's middle at the wall's foot (on its face), and its yaw (+x of the sheet into the yard). */
  sheet: THREE.Vector3;
  sheetYaw: number;
  cloth: SheetSpot & { picture: number; pictureY: number };
  rollY: number;
  /** The stacked chairs by the wall (same yaw as the sheet). */
  stack: THREE.Vector3;
  table: THREE.Vector3;
  tableYaw: number;
  /** Each chair, and the yaw they all face (the sheet). */
  chairs: THREE.Vector3[];
  chairYaw: number;
  /** From our back door to behind the chairs. */
  path: THREE.Vector3[];
  lead: THREE.Vector3[];
}

interface YardCinemaOptions {
  host: CinemaHost;
  spots: CinemaSpots;
  /** The camera: what the residents glance at, what hears the film. */
  viewer: THREE.Object3D;
  cssLayer: CssLayer;
  acoustics: SoundOcclusion;
  /** The sky now: the hour, the daylight, the rain. */
  sky: () => { hours: number; daylight: number; rain: number };
  today: { readonly gameDay: number; realDate(): Date };
  /** Whether the flat has its projector (the film night's prerequisite); `subscribe` hears it bought. */
  projector: { has(): boolean; subscribe(cb: () => void): () => void };
  /** The cold half of the year: a plaid on each chair, a thermos instead of the lemonade. */
  cold: boolean;
  /** The sheet clicked: the panel that picks the film. */
  pickFilm: (session: SessionActions) => void;
  notices: NoticeActions;
  social?: SocialServices;
  /** The one the film meant most to left something on their chair (zone-local, the seat's middle). */
  onGift: (seat: THREE.Vector3, viewer: Viewer) => void;
}

/** Seconds between two looks at the clock and the sky. */
const CHECK_EVERY = 1;
/** Seconds between two residents coming out of our back door. */
const ARRIVE_GAP: [number, number] = [3, 7];
/** Seconds they wait seated for a film that does not start (or a picture that does not come) before going back up. */
const PATIENCE = 150;
const NO_PICTURE = 10;
/** Seconds between two reactions to the film (one of them at a time). */
const REACT_GAP: [number, number] = [5, 12];
const FILM_REACTIONS: readonly Reaction[] = ['good', 'good', 'great', 'near', 'fail'];
/** After the claps: when the one it meant most to speaks, when they all start getting up. */
const SPEAK_AFTER = 2.5;
const LEAVE_AFTER: [number, number] = [9, 25];
/** How far past the last chair on the door's side the way into the rows turns (m). */
const ROW_END = 0.55;
/** What they say about the film, asked during it. */
const FILM_TALK = [
  'Shh! Oh, it’s you. This is the good bit.',
  'I never got past this part. Look at that!',
  'Better than the telly, this.',
  'The sheet’s a bit creased, but who cares.',
  'Same time next week?',
];

/** A resident come down: their body, their chair, where they are in their evening. */
interface Seated {
  viewer: Viewer;
  walker: Walker;
  chair: FoldingChair;
  seat: THREE.Vector3;
  /** Behind their chair: where they come in and go out by. */
  behind: THREE.Vector3;
  /** The end of the gap behind their row, on the door's side: the way into it and out. */
  aisle: THREE.Vector3;
  /** Seconds until they come out of the door (arriving), or get up (leaving). */
  wait: number;
  stage: 'coming' | 'walking' | 'seated' | 'leaving';
}

/**
 * The film night in the courtyard (`building/yardCinema`): from the day the flat has its projector, the sheet rolled
 * up on the workshop's wall (a click picks a film: `pickFilm`) and the folding chairs stacked by it; once a film is
 * put on, the sheet hangs, the chairs stand in two rows, the projector stands on its trestle with its lead run to our
 * back door. On a dark, dry evening with the player in the yard the residents who come (`audience`) walk out of our
 * door one by one to their chair; the player starts the film at the projector; they react to it; when it has run its
 * course they clap, `filmShown` says who it meant most to, they say so (and may leave something on their chair), and
 * go back up. A film that never starts, or no picture, and they go up after a while: the film waits for another night.
 */
export class YardCinema extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly sheet: CinemaSheet;
  /** What stands out while a film is on (chairs, trestle, projector, lead), or the stacked chairs. */
  private placed: Furniture[] = [];
  private chairs: FoldingChair[] = [];
  private projector: YardProjector | null = null;
  private set = false;
  private seated: Seated[] = [];
  /** Tonight's evening is over (shown, given up, nobody came): the game day it was. */
  private overOn = -1;
  /** The game day the rain put it off, said once. */
  private wetOn = -1;
  /** The evening under way: the game day the residents came down. */
  private night = -1;
  private clock = CHECK_EVERY;
  private watched = 0;
  private waited = 0;
  private dark = 0;
  private nextReaction = 0;
  private finale = -1;
  /** Tonight's evening is over: whoever is seated gets up after their delay, whoever is still indoors stays there. */
  private dismissed: ((s: Seated) => number) | null = null;
  private afterwards: { seated: Seated; line: string; gift: boolean } | null = null;
  /** Where the seated look: the picture's middle (world). */
  private readonly focus = new THREE.Vector3();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(private readonly options: YardCinemaOptions) {
    super();
    this.name = 'YardCinema';
    const { host, spots } = options;
    this.sheet = new CinemaSheet(
      {
        label: () => this.sheetLabel(),
        use: (session) => this.useSheet(session),
      },
      spots.cloth,
      spots.rollY,
    );
    host.place(this.sheet, spots.sheet, spots.sheetYaw);
    const changed = (): void => {
      // A film (re)put on after tonight was given up: tonight may have it after all.
      if (plannedFilm() && !this.seated.length) this.overOn = -1;
      this.dress();
    };
    this.unsubscribe.push(onCinemaChange(changed), options.projector.subscribe(() => this.dress()));
    this.dress();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= CHECK_EVERY) {
      this.clock = 0;
      this.check();
    }
    this.evening(dt);
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    // The yard unloads before the one the film meant most to has left their chair: what they meant to leave there is
    // handed over all the same (`onGift` brings it up to the flat once the yard is gone).
    const after = this.afterwards;
    if (after?.gift && this.seated.includes(after.seated)) this.options.onGift(after.seated.seat.clone(), after.seated.viewer);
    this.afterwards = null;
    for (const s of this.seated) this.options.host.remove(s.walker);
    this.seated = [];
  }

  // --- What stands out ----------------------------------------------------------------------

  /** The sheet hung and the chairs out while a film is on (or tonight's evening is still about); otherwise rolled and stacked. */
  private dress(): void {
    const owned = this.options.projector.has();
    this.sheet.visible = owned;
    const set = owned && (plannedFilm() !== null || this.seated.length > 0 || this.night >= 0);
    this.sheet.setHung(set);
    if (set === this.set && this.placed.length) return;
    this.set = set;
    const { host, spots, cold } = this.options;
    for (const item of this.placed) {
      host.remove(item);
      item.dispose?.();
    }
    this.placed = [];
    this.chairs = [];
    this.projector = null;
    if (!owned) return;
    if (!set) {
      this.placed.push(host.place(new ChairPile(), spots.stack, spots.sheetYaw));
      return;
    }
    const plaids = [0x8a2a2a, 0x2a4a6a, 0x5a6a3a, 0x7a5a8a];
    this.chairs = spots.chairs.map((at, i) => host.place(new FoldingChair(cold ? plaids[i % plaids.length]! : null), at, spots.chairYaw));
    this.placed.push(...this.chairs);
    this.placed.push(host.place(new CinemaTrestle(cold), spots.table, spots.tableYaw));
    this.placed.push(host.place(new CinemaLead(spots.lead), new THREE.Vector3()));
    const projector = new YardProjector(this.options.cssLayer, {
      pictureWidth: spots.cloth.picture,
      listener: this.options.viewer,
      occlusion: this.options.acoustics,
      film: () => filmGame(),
      stage: () => this.stage(),
    });
    host.place(projector, spots.table.clone().setY(TRESTLE_TOP), spots.tableYaw);
    projector.updateMatrixWorld(true);
    const picture = spots.sheet.clone().add(new THREE.Vector3(spots.cloth.off + 0.012, spots.cloth.pictureY, 0).applyAxisAngle(UP, spots.sheetYaw));
    projector.aimAt(projector.worldToLocal(host.toWorld(picture)));
    this.projector = projector;
    this.placed.push(projector);
  }

  private sheetLabel(): string | null {
    if (!this.options.projector.has()) return null;
    if (this.seated.length) return null;
    const film = plannedFilm();
    return film ? `The sheet · ${film.title} tonight · change the film` : 'The sheet · put on a film night';
  }

  private useSheet(session: SessionActions): void {
    if (!this.options.projector.has() || this.seated.length) return;
    this.options.pickFilm(session);
  }

  // --- The evening ---------------------------------------------------------------------------

  private stage(): ReturnType<typeof filmNightNow> {
    const { today, sky } = this.options;
    return filmNightNow(today.gameDay, today.realDate(), sky());
  }

  /** Once a second: rain said, the residents coming down when the night is on, giving up when it never starts. */
  private check(): void {
    const { today, notices } = this.options;
    if (!this.options.projector.has() || !plannedFilm()) return;
    const day = today.gameDay;
    const stage = this.stage();
    if (stage === 'wet' && this.wetOn !== day && !this.seated.length) {
      this.wetOn = day;
      notices.react('Rain on the sheet: the film waits for a dry evening.');
    }
    if (stage === 'on' && !this.seated.length && this.overOn !== day && this.night < 0) this.comeDown();
  }

  private comeDown(): void {
    const { today, sky, host, spots, viewer } = this.options;
    const day = today.gameDay;
    const came = audience(day, sky().hours);
    this.night = day;
    this.watched = 0;
    this.waited = 0;
    this.dark = 0;
    this.finale = -1;
    this.dismissed = null;
    this.afterwards = null;
    this.nextReaction = between(REACT_GAP);
    this.focus.copy(host.toWorld(spots.sheet.clone().add(new THREE.Vector3(spots.cloth.off, spots.cloth.pictureY, 0).applyAxisAngle(UP, spots.sheetYaw))));
    if (!came.length) {
      this.overOn = day;
      this.night = -1;
      this.options.notices.react('Nobody came down tonight. The film waits for another evening.');
      return;
    }
    // Front row first, from the middle out.
    const order = this.chairs.map((chair, i) => ({ chair, i })).sort((a, b) => (spots.chairs[a.i]!.x - spots.chairs[b.i]!.x) || Math.abs(spots.chairs[a.i]!.z - spots.sheet.z) - Math.abs(spots.chairs[b.i]!.z - spots.sheet.z));
    let wait = 1;
    const door = spots.path[0]!;
    // The rows' end on the door's side: each comes round it into the gap behind their row, never through a chair.
    const rowsEnd = Math.max(...spots.chairs.map((c) => c.z)) + ROW_END;
    this.seated = came.slice(0, order.length).map((v, n) => {
      const { chair, i } = order[n]!;
      chair.taken = true;
      const seat = spots.chairs[i]!.clone();
      // Behind it, on the side away from the sheet.
      const behind = seat.clone().add(new THREE.Vector3(0, 0, -0.52).applyAxisAngle(UP, spots.chairYaw));
      const aisle = behind.clone().setZ(rowsEnd);
      const person = personAtDoor(doorKey(v.k, v.i));
      let line = n;
      const walker: Walker = new Walker({
        viewer,
        seed: v.seed,
        look: randomLook(v.seed + 900, 'shopper'),
        lines: FILM_TALK,
        label: `${v.name} · chat`,
        speaker: v.name,
        social: person
          ? talkHook(this.options.social, person, () => ({
              person,
              place: 'courtyard',
              body: bodyOf(walker),
              extras: [{ id: 'film', group: 'talk', label: 'Enjoying the film?', run: () => ({ line: FILM_TALK[line++ % FILM_TALK.length]! }) }],
            }))
          : undefined,
      });
      walker.setPresent(false);
      host.place(walker, door.clone());
      const s: Seated = { viewer: v, walker, chair, seat, behind, aisle, wait, stage: 'coming' };
      wait += between(ARRIVE_GAP);
      return s;
    });
    this.dress();
  }

  /** Every frame of the evening: arrivals, the film watched, reactions, the claps, the going back up. */
  private evening(dt: number): void {
    if (!this.seated.length) return;
    const { spots } = this.options;
    const focus = this.focus;
    for (const s of [...this.seated]) {
      if (s.stage === 'coming') {
        // Still indoors when the evening ended: they stay there.
        if (this.dismissed) {
          this.gone(s);
          continue;
        }
        s.wait -= dt;
        if (s.wait > 0) continue;
        s.stage = 'walking';
        s.walker.setPresent(true, spots.path[0]!.clone());
        s.walker.walk([...spots.path.slice(1), s.aisle, s.behind, s.seat], () => {
          s.stage = 'seated';
          s.walker.sit(spots.chairYaw, FoldingChair.seatHeight, 'lap', focus);
        });
      } else if (s.stage === 'seated' && this.dismissed) {
        s.stage = 'leaving';
        s.wait = this.dismissed(s);
      } else if (s.stage === 'leaving' && s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0) {
          s.chair.taken = false;
          s.walker.walk([s.behind, s.aisle, ...[...spots.path].reverse()], () => this.gone(s));
        }
      }
    }
    if (this.finale >= 0) return this.wrapUp(dt);

    const playing = this.projector?.state === 'playing';
    const anySeated = this.seated.some((s) => s.stage === 'seated');
    if (playing) {
      this.watched += dt;
      this.nextReaction -= dt;
      if (this.nextReaction <= 0 && anySeated) {
        this.nextReaction = between(REACT_GAP);
        const watching = this.seated.filter((s) => s.stage === 'seated');
        pick(random, watching).walker.react(pick(random, FILM_REACTIONS));
      }
      if (this.watched >= CINEMA.film && anySeated) this.applause();
    } else if (anySeated) {
      // Waiting for the film, or for a picture that will not come.
      this.waited += dt;
      this.dark = this.projector?.state === 'error' ? this.dark + dt : 0;
      const late = this.options.sky().hours >= CINEMA.until;
      if (this.dark > NO_PICTURE) this.giveUp('No picture? Never mind. Another evening, then.');
      else if (this.waited > PATIENCE || late) this.giveUp('Not tonight after all? We’ll go back up.');
    }
  }

  /** The film has run its course: they clap, it is shown, the one it meant most to says so. */
  private applause(): void {
    for (const s of this.seated) if (s.stage === 'seated') s.walker.gesture('clap');
    this.finale = 0;
    const came = this.seated.filter((s) => s.stage === 'seated');
    const after = filmShown(this.night, came.map((s) => s.viewer));
    this.overOn = this.night;
    const said = after ? came.find((s) => s.viewer === after.viewer) : undefined;
    this.afterwards = after && said ? { seated: said, line: after.line, gift: after.gift } : null;
  }

  private wrapUp(dt: number): void {
    const before = this.finale;
    this.finale += dt;
    const after = this.afterwards;
    if (after && before < SPEAK_AFTER && this.finale >= SPEAK_AFTER) {
      after.seated.walker.speak(after.line);
      after.seated.walker.setFocus('viewer');
    }
    if (before < SPEAK_AFTER + 0.5 && this.finale >= SPEAK_AFTER + 0.5) this.dismissed = (s) => between(LEAVE_AFTER) + (s === after?.seated ? 4 : 0);
  }

  /** They give up on tonight and go back up: the film stays on for another evening. */
  private giveUp(line: string): void {
    const speaker = this.seated.find((s) => s.stage === 'seated');
    speaker?.walker.speak(line);
    this.overOn = this.night;
    this.afterwards = null;
    this.finale = SPEAK_AFTER + 1;
    this.dismissed = (s) => (s === speaker ? 4 : between([2, 8]));
  }

  /** Back through our door: off the yard; the gift, if it was theirs, left on their chair. */
  private gone(s: Seated): void {
    this.options.host.remove(s.walker);
    this.seated = this.seated.filter((other) => other !== s);
    const after = this.afterwards;
    if (after?.seated === s && after.gift) this.options.onGift(s.seat.clone().setY(FoldingChair.seatHeight + 0.03), s.viewer);
    if (!this.seated.length) {
      this.night = -1;
      this.afterwards = null;
      this.finale = -1;
      this.dismissed = null;
      // The sheet stays up while the projector still runs; the next build of the yard rolls it up.
      if (!plannedFilm() && this.projector?.state === 'off') this.dress();
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function between([a, b]: readonly [number, number]): number {
  return a + (b - a) * random();
}

/** The film put on, as the screens play a game. */
function filmGame(): Game | null {
  const film = plannedFilm();
  return film ? { id: film.id, title: film.title, platform: film.platform, ...(film.year ? { releaseDate: String(film.year) } : {}), ...(film.genre ? { genre: film.genre } : {}) } : null;
}

interface YardProjectorOptions {
  pictureWidth: number;
  listener: THREE.Object3D;
  occlusion: SoundOcclusion;
  /** The film put on, if any. */
  film: () => Game | null;
  /** Whether the evening allows it now. */
  stage: () => ReturnType<typeof filmNightNow>;
}

/**
 * The projector on the trestle: the player's own, brought down for the evening. A click starts the film put on once
 * it is dark (and dry), switches it off while it runs; there is no box to bring.
 */
class YardProjector extends Projector {
  private film: Game | null = null;

  constructor(
    cssLayer: CssLayer,
    private readonly yard: YardProjectorOptions,
  ) {
    super(cssLayer, { pictureWidth: yard.pictureWidth, listener: yard.listener, occlusion: yard.occlusion, standing: true });
  }

  override label(player: PlayerState): string | null {
    if (this.state !== 'off') return super.label(player);
    const film = this.yard.film();
    if (!film) return this.film ? `Projector · play ${this.film.title} again` : null;
    const stage = this.yard.stage();
    return stage === 'on' ? `Projector · start ${film.title}` : stage === 'wet' ? 'Projector · not in the rain' : `Projector · ${film.title} · once it’s dark`;
  }

  override activate(session: SessionActions): void {
    if (this.state !== 'off') {
      playRockerClick();
      session.stopScreen(this);
      return;
    }
    if (!poweredAt(this)) return session.refuse('No power: the whole building is dark.');
    // The film shown tonight plays on as long as the player likes, even once the sheet's evening is over.
    const planned = this.yard.film();
    const film = planned ?? this.film;
    if (!film) return;
    const stage = this.yard.stage();
    if (planned && stage === 'wet') return session.refuse('Not in the rain: the sheet would be soaked.');
    if (planned && stage !== 'on') return session.refuse('Too light yet: a film wants the dark.');
    this.film = film;
    playRockerClick();
    void session.playOn(this, { game: film });
  }
}
