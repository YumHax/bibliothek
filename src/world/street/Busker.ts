import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { BuskerTune } from '@/audio/BuskerTune';
import { playCoins } from '@/audio/coins';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { snowPaint, snowStandard } from './snowCover';
import type { DayNight } from '../props/DayNight';
import { Walker } from '../people/Walker';
import { KEYS as SAVE_KEYS } from '@/persistence';
import { DailyTally } from '@/time/DailyTally';
import { Timers } from '@/core/Timers';
import { inHours } from '@/time/clock';
import { keptAway } from '@/time/schedule';
import { BUSKER } from './events/streetSchedules';
import { outOfSight } from './life/sight';
import { pocket } from '@/errands/pocket';
import { pick, random } from '@/random';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { socialCaption } from '@/social/caption';
import { findPerson } from '@/social/people';
import { has } from '@/social/perks';
import { isMet, nudge } from '@/social/standing';
import type { SocialServices, TalkExtra, TalkSession } from '@/social/talk';
import { actReaction } from '../people/socialHook';
import { favouriteRequest, giveTape, noteRequest, tapeGiven } from './buskerBook';
import { formatTickets } from '@/text/money';
import { loudness } from '@/audio/hearing';

interface BuskerOptions {
  /** The ears (the camera): the tune's level and side follow it. */
  viewer: THREE.Object3D;
  /** Game hours they play between. */
  hours: readonly [number, number];
  /** Tips they take a day. */
  tipsPerDay: number;
  /** How far the tune carries (metres). */
  reach: number;
  seed?: number;
  /** The zone's collision set (world boxes): the stand collides only while they are there. */
  collisions?: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
  /** The people the player talks to (docs/social.md): a click opens the conversation with him, the requests among its entries. */
  social?: SocialServices;
  /** The game day (a tip's warmth counts once a day). */
  day?: () => number;
  /** The flat's goods: his record goes on the sideboard's turntable (`record`). */
  upgrades?: Pick<HomeUpgrades, 'has' | 'canBuy' | 'add'>;
  /** Tickets, when there is no turntable for his record. */
  wallet?: { addTickets(tickets: number): void };
}

const LINES = [
  'This one is from a game you never finished.',
  'Requests? A coin in the case and I’ll play you another overworld.',
  'The kiosk says the market had a good week.',
  'I learnt this on a cartridge with a dead save battery.',
  'Rain? I pack up. Synths and puddles don’t mix.',
  'The collector with the suitcase never tips. Never.',
];
/** What they play on request, one after another: each a tune of its own (`BuskerTune`'s seed). */
const REQUESTS = ['the castle theme', 'a boss tune, slowed down', 'the game over jingle, as a waltz', 'a racing game’s menu music', 'the first level, but sad'];
/** His person card (`social/people/town`). */
const ME = 'busker';
/** A friend this near (m) hears their favourite tune struck up, once a visit. */
const FAVOURITE_RANGE = 7;
/** Tickets instead of his record, for a flat with no turntable (or every record already there). */
const TAPE_TICKETS = 40;
/** After a word, this long (s) for a click to tip a coin for a request. */
const ASK_WINDOW = 6;
/** Beyond this the busker is not drawn nor posed (the tune still carries). */
const DRAW_DISTANCE = 40;
/** Tips given today, saved so the daily limit holds across reloads. */
const tips = new DailyTally(SAVE_KEYS.busker, 'tips');
const THANKS = ['Cheers! This one is for you.', 'Thank you kindly!', 'You are a legend.'];
/** Where the keyboard's keys are, in the busker's frame (the stand faces them, +z is towards the passers-by). */
const KEYS = { y: 0.93, z: 0.42, spread: 0.17 };

/**
 * A street musician by the bus shelter: a person (`people/Walker`, standing, hands on a little
 * keyboard on a stand, the case open on the pavement for coins) playing a synthesised chiptune
 * (`BuskerTune`) that carries a street's width, louder and to one side as the player comes
 * near. They play by day and into the evening, not in the rain or snow (then they have packed up
 * and gone). A click gets a word (free); clicked again while they wait, a coin in the case
 * (`SessionActions.pay`) buys a request: a thank-you in a bubble, a flourish and the next tune of
 * their book, a few tips a day at most (remembered across reloads). A croissant or a bunch of
 * flowers from the pocket (`errands/`) buys a request too. Not drawn beyond `DRAW_DISTANCE`.
 */
export class Busker extends THREE.Group implements Furniture, Updatable, Interactable {
  /** The pose back to playing after a thank-you: on the street's own time. */
  private readonly timers = new Timers();
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly person: Walker;
  private tune: BuskerTune;
  /** Seconds left in which a click tips for a request (set by a word). */
  private asking = 0;
  private requestIndex = 0;
  /** Between two songs (`BuskerTune.betweenSongs`): hands off the keys, arms crossed, a word free. */
  private resting = false;
  private readonly kit = new THREE.Group();
  private present = true;
  private beat = 0;
  private lineIndex = 0;
  private readonly hands: readonly [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly ear = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly toMe = new THREE.Vector3();
  /** The stand's box in world space, in the zone's collisions while they play (built on the first update, once placed). */
  private collider: THREE.Box3 | null = null;
  /** Just (re)activated: the first update takes what the clock says, seen or not (the player has only just arrived). */
  private fresh = true;
  /** Their favourite was struck up for the player this visit. */
  private favouritePlayed = false;

  constructor(private readonly dayNight: DayNight, private readonly options: BuskerOptions) {
    super();
    this.name = 'Busker';
    this.person = new Walker({ viewer: options.viewer, seed: options.seed ?? 77, label: 'Busker · tip' });
    this.add(this.person);
    this.person.stand(0, 'play', null, () => this.handPoints(), 0.12);
    this.hitboxes = this.person.hitboxes;
    this.tune = new BuskerTune(options.seed ?? 77);
    this.buildKit();
    this.add(this.kit);
  }

  /** Empty: the stand's box comes and goes with them (`collider`), so no ghost is left once they have packed up. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    this.tune.dispose();
    if (this.collider && this.present) this.options.collisions?.remove(this.collider);
  }

  setZoneActive(active: boolean): void {
    if (!active) return;
    this.fresh = true;
    this.favouritePlayed = false;
  }

  setHovered(): void {
    // A person does not glow.
  }

  label(): string | null {
    if (!this.present) return null;
    if (this.options.social) return socialCaption(ME, 'talk', { day: this.options.social.day(), hour: this.options.social.hour() });
    if (pocket.count('croissant') > 0 || pocket.count('bunch') > 0) return 'Busker · give them something for a request';
    if (this.asking > 0 && this.tipsToday() < this.options.tipsPerDay) return 'Busker · tip a coin for a request';
    return 'Busker · chat';
  }

  /**
   * A word first (free); clicked again while they wait for an answer, a coin in the case for a request (a few a day).
   * A croissant or a bunch of flowers from the pocket buys a request too, any time.
   */
  activate(session: SessionActions): void {
    if (!this.present) return;
    const { social } = this.options;
    if (social) {
      social.open(session, this.talk(session));
      return;
    }
    const gift = pocket.take('croissant', 'bunch');
    if (gift) {
      this.playRequest(gift === 'croissant' ? 'Half a croissant? You’re a saint.' : 'Flowers! Nobody ever gives a busker flowers.');
      session.react(gift === 'croissant' ? 'You hand over the croissant. They play your request.' : 'You hand over a bunch. They play your request.');
      return;
    }
    if (this.asking <= 0 || this.tipsToday() >= this.options.tipsPerDay) {
      const line = this.resting ? 'Taking five between songs. Got a request for the next one?' : LINES[this.lineIndex++ % LINES.length]!;
      this.person.speak(line, 'Busker');
      this.asking = this.tipsToday() < this.options.tipsPerDay ? ASK_WINDOW : 0;
      return;
    }
    this.asking = 0;
    session.pay({
      price: 1,
      paid: () => {
        this.recordTip();
        playCoins();
        this.playRequest(THANKS[Math.floor(random() * THANKS.length)]!);
        return 'You drop a coin in the keyboard case.';
      },
    });
  }

  /** A flourish, a cheer, then the next tune of their book (a request, or `tune`: the player's favourite), their word over it. */
  private playRequest(thanks: string, tune?: number): void {
    const index = tune ?? this.requestIndex % REQUESTS.length;
    if (tune === undefined) {
      this.requestIndex++;
      noteRequest(index);
    }
    const request = REQUESTS[index]!;
    this.tune.flourish();
    this.person.speak(`${thanks} Here’s ${request}.`, this.speaker());
    this.person.setPose('cheer');
    this.timers.after(1.4, () => {
      this.person.setPose(this.resting ? 'crossed' : 'play');
      // The tune of their book: each request its own seed, its own chiptune.
      this.tune.dispose();
      this.tune = new BuskerTune((this.options.seed ?? 77) + 101 * (index + 1));
    });
  }

  /** The name over his lines: his own once met. */
  private speaker(): string {
    return this.options.social && isMet(ME) ? (findPerson(ME)?.short ?? 'Busker') : 'Busker';
  }

  /** The conversation with him: his word, the requests (a coin, free for a friend; a croissant, a bunch), his record. */
  private talk(session: SessionActions): TalkSession {
    const day = (): number => this.options.day?.() ?? 0;
    const full = (): string | null => (this.tipsToday() >= this.options.tipsPerDay ? 'Enough requests for today' : null);
    const thanked = (why: string): void => {
      nudge(ME, { warmth: 2, why, reason: 'buskerRequest', day: day() });
    };
    const forFood = (errand: 'croissant' | 'bunch', label: string, thanks: string): TalkExtra => ({
      id: errand,
      group: 'trade',
      label,
      disabled: () => (pocket.count(errand) === 0 ? `No ${errand === 'bunch' ? 'flowers' : 'croissant'} on you` : null),
      run: () => {
        if (pocket.take(errand) !== errand) return;
        this.playRequest(thanks);
        thanked(errand === 'bunch' ? 'loved the flowers' : 'loved the croissant');
      },
    });
    const extras: TalkExtra[] = [
      {
        id: 'request',
        group: 'trade',
        label: has(ME, 'freeRequests') ? 'Play me one (free, for a friend)' : 'Play me one (1 coin)',
        disabled: full,
        run: () => {
          if (has(ME, 'freeRequests')) {
            this.recordTip();
            this.playRequest('For you? Always.');
            thanked('happy to play for a friend');
            return;
          }
          session.pay({
            price: 1,
            paid: () => {
              this.recordTip();
              playCoins();
              this.playRequest(pick(random, THANKS));
              thanked('liked the tip');
              return 'You drop a coin in the keyboard case.';
            },
          });
        },
      },
      forFood('croissant', 'A croissant for a tune', 'Half a croissant? You’re a saint.'),
      forFood('bunch', 'Flowers for a tune', 'Flowers! Nobody ever gives a busker flowers.'),
    ];
    if (!tapeGiven()) {
      extras.push({
        id: 'tape',
        group: 'ask',
        label: 'That record of yours…',
        disabled: () => (!has(ME, 'tape') ? 'Only for a close friend' : null),
        run: () => this.giveRecord(session),
      });
    }
    return {
      person: ME,
      place: 'street',
      body: { speak: (line) => this.person.speak(line, this.speaker()), react: (reaction) => actReaction(this.person, reaction), anchor: this.person.speechAnchor },
      extras,
    };
  }

  /** His record, once: on the sideboard's turntable if there is one with room, else tickets and a card. */
  private giveRecord(session: SessionActions): { line: string } {
    if (tapeGiven()) return { line: 'You’ve got the only copy, friend.' };
    giveTape();
    const { upgrades, wallet } = this.options;
    if (upgrades?.has('sideboard') && upgrades.canBuy('record')) {
      upgrades.add('record');
      session.reward({ title: 'A record from Django', detail: 'A signed soundtrack LP, on the sideboard by the turntable.', big: true });
      return { line: 'Pressed a few last year. This one’s yours. Play it loud, the neighbours love it.' };
    }
    wallet?.addTickets(TAPE_TICKETS);
    session.read({ title: 'A cassette from Django', text: '“My tunes, on tape. Hiss included at no extra cost.” A hand-written label, a doodle of a keyboard. There is nothing at home to play it on, but the arcade’s attendant swaps it gladly.', effect: `${formatTickets(TAPE_TICKETS)}.`, look: 'note' });
    return { line: 'Got a tape deck? No? Then trade it at the arcade, Gus collects them.' };
  }

  /** A friend coming by: their favourite tune, struck up once a visit. */
  private greetFavourite(distance: number): void {
    if (this.favouritePlayed || distance > FAVOURITE_RANGE || !this.options.social || !has(ME, 'favouriteTune')) return;
    const favourite = favouriteRequest();
    if (favourite === null) return;
    this.favouritePlayed = true;
    this.playRequest('Oh, it’s you!', favourite);
  }

  update(dt: number): void {
    this.timers.update(dt);
    this.asking = Math.max(0, this.asking - dt);
    const s = this.dayNight.state;
    // Their hours and their weather are their schedule's (`events/streetSchedules`), the same the paper reads.
    const present = inHours(s.hours, this.options.hours) && !keptAway(BUSKER, s);
    if (!this.collider) {
      this.updateWorldMatrix(true, false);
      this.collider = new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.3), new THREE.Vector3(0.35, 1.8, 0.65)).applyMatrix4(this.matrixWorld);
      if (this.present) this.options.collisions?.add(this.collider);
    }
    // They come and go only while the player cannot see the spot (no one vanishes mid-song in view).
    if (present !== this.present && (this.fresh || outOfSight(this.options.viewer, this.getWorldPosition(this.here)))) {
      this.present = present;
      this.visible = present;
      this.person.setPresent(present);
      if (present) this.person.stand(0, 'play', null, () => this.handPoints(), 0.12);
      if (present) this.options.collisions?.add(this.collider);
      else this.options.collisions?.remove(this.collider);
    }
    this.fresh = false;
    let level = 0;
    if (this.present) {
      this.beat += dt;
      // The tune: fainter with distance, to the side it is on.
      this.options.viewer.getWorldPosition(this.ear);
      this.getWorldPosition(this.here);
      const distance = this.ear.distanceTo(this.here);
      // Far off they are not drawn nor posed (no one tells a busker's fingers at 40 m); the tune carries on.
      const near = distance < DRAW_DISTANCE;
      this.person.visible = near;
      // Between two songs the hands come off the keys (back on them for the next).
      const resting = this.tune.betweenSongs;
      if (resting !== this.resting) {
        this.resting = resting;
        this.person.setPose(resting ? 'crossed' : 'play');
      }
      if (near) this.person.update(dt);
      this.greetFavourite(distance);
      level = loudness(distance, { shape: 'rampSquared', referenceDistance: 0, maxDistance: this.options.reach });
      this.options.viewer.getWorldDirection(this.facing);
      this.toMe.copy(this.here).sub(this.ear).setY(0).normalize();
      // Right of the view is facing x up.
      const rightX = -this.facing.z;
      const rightZ = this.facing.x;
      const len = Math.hypot(rightX, rightZ) || 1;
      this.tune.setPan(((this.toMe.x * rightX + this.toMe.z * rightZ) / len) * 0.8);
    }
    this.tune.setLevel(level);
    this.tune.update();
  }

  /** The hands on the keys, hopping along with the beat (world points, read by the person every frame). */
  private handPoints(): readonly [THREE.Vector3, THREE.Vector3] {
    this.localToWorld(this.hands[0].set(-KEYS.spread + Math.sin(this.beat * 2.1) * 0.04, KEYS.y + this.hop(0), KEYS.z));
    this.localToWorld(this.hands[1].set(KEYS.spread + Math.sin(this.beat * 3.3) * 0.05, KEYS.y + this.hop(1.7), KEYS.z));
    return this.hands;
  }

  private hop(phase: number): number {
    return Math.max(0, Math.sin(this.beat * 8.4 + phase)) * 0.03;
  }

  private buildKit(): void {
    const metal = snowStandard({ color: 0x222428, roughness: 0.45 });
    // The X-stand and the keyboard on it.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.05, 0.025), metal);
      leg.position.set(side * 0.3, 0.45, KEYS.z + 0.05);
      leg.rotation.x = 0.5;
      const leg2 = leg.clone();
      leg2.rotation.x = -0.5;
      this.kit.add(leg, leg2);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.28), snowPaint(0xd8342a, 0.35));
    body.position.set(0, KEYS.y - 0.05, KEYS.z + 0.04);
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.5 }));
    keys.position.set(0, KEYS.y - 0.018, KEYS.z - 0.02);
    // The open case on the pavement, a few coins in it, and the sign.
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.32), snowPaint(0x5a1a2a, 0.9));
    caseMesh.position.set(0.1, 0.04, 1.0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.9 }));
    sign.position.set(0.1, 0.18, 1.14);
    sign.rotation.x = -0.9;
    for (const mesh of [body, keys, caseMesh, sign]) this.kit.add(mesh);
    this.kit.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
  }

  private tipsToday(): number {
    return tips.today();
  }

  private recordTip(): void {
    tips.add();
  }
}

function keysTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 48);
  ctx.fillStyle = '#f4f2ea';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#888';
  for (let i = 0; i <= 21; i++) ctx.fillRect(i * (256 / 21), 0, 1, 48);
  ctx.fillStyle = '#16161a';
  const black = [0, 1, 3, 4, 5];
  for (let octave = 0; octave < 3; octave++) {
    for (const b of black) ctx.fillRect((octave * 7 + b + 0.65) * (256 / 21), 0, 7, 28);
  }
  return toTexture(canvas, 'facing');
}

function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(160, 104);
  ctx.fillStyle = '#e9dfc8';
  ctx.fillRect(0, 0, 160, 104);
  ctx.fillStyle = '#2a2420';
  ctx.font = 'bold 30px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TIPS ♪', 80, 46);
  ctx.font = '18px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.fillText('8-bit covers', 80, 80);
  return toTexture(canvas, 'facing');
}
