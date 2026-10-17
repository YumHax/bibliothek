import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Pastimes } from '@/household/pastime';
import { findPerson } from '@/social/people';
import { nudge } from '@/social/standing';
import type { SocialServices } from '@/social/talk';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { castDress } from '@/world/people/castLook';
import { random } from '@/random';
import { bodyOf, talkHook } from '../../people/socialHook';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { paint, timber } from '../../materials/palette';
import { snowPaint } from '../snowCover';
import { outOfSight } from '../life/sight';
import { PARK_CONCERT, onNow } from '../events/streetSchedules';
import type { Vec2 } from '@/world/measures/street';

interface ParkConcertOptions {
  viewer: THREE.Object3D;
  /** Stage-local x of each of the band (bass, drums, keys). */
  band: readonly number[];
  /** The folding chairs before the stage (zone-local). */
  chairs: readonly Vec2[];
  /** Places a person in the zone (ticked, clickable, in the people budget), zone-local. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** The game day: the schedule's day, a listen's warmth once a day. */
  day: () => number;
  social?: SocialServices;
  /** A while spent listening: a fade, the clock wound on (`household/pastime`). */
  pastimes?: Pastimes;
}

/** The stage: width (local x), depth, height; the banner over its back. */
const STAGE = { width: 3.4, depth: 2.2, height: 0.42 };
/** Seconds of a song, then a breather between two (the hands off the instruments). */
const SONG = 150;
const BREATHER = 12;
/** The band's person card for the bass (Lou, the barista: `social/people/town`). */
const LOU = 'lou';
/** A listen: how long it lasts (game minutes), the warmth it brings Lou (once a game day). */
const LISTEN_MINUTES = 40;
const LISTEN_WARMTH = 3;
const BAND_LINES = ['We’re called The Save States. We had a cooler name. Somebody took it.', 'This next one’s a cover of a cover of a game tune.', 'Same time next Sunday. Bring a friend. Bring two.'];

/**
 * Sunday afternoon's concert on the lawn of the park's gardens (`STREET_PLACES.park.concert`, docs/zones.md "The
 * street"): a low wooden stage beside the path from the gate with a banner over it, and on the game's Sundays in its
 * hours, dry weather only (`events/streetSchedules` `PARK_CONCERT`), Lou's band on it (Lou on bass, someone at a little
 * drum kit, someone at the keys) playing (`street/audio/LiveMusic`, placed by the builder), and people on the
 * folding chairs before it. They come and go only out of the player's sight. Lou opens the conversation (docs/social.md);
 * the stage, clicked while they play, is a while spent listening (a fade, the clock wound on, Lou's warmth once a day).
 * Origin: the stage's middle on the lawn, local +z the audience's side. The stage and its chairs collide.
 */
export class ParkConcert extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly colliders: THREE.Box3[] = [];
  private readonly band: Walker[] = [];
  private readonly listeners: Walker[] = [];
  private readonly kit = new THREE.Group();
  private readonly chairs = new THREE.Group();
  /** Seconds into the current song (past `SONG`, the breather). */
  private beat = 0;
  private present = false;
  private fresh = true;
  private line = 0;
  private readonly here = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: ParkConcertOptions) {
    super();
    this.name = 'ParkConcert';
    const { width, depth, height } = STAGE;
    const boards = timber(0x8a6a48, 0.75);
    const frame = snowPaint(0x3a3a34, 0.7);
    this.add(boxMesh(width, height, depth, frame, { y: height / 2 - 0.01 }));
    this.add(boxMesh(width + 0.04, 0.04, depth + 0.04, boards, { y: height + 0.01 }));
    // Two steps up at the side, the banner on two posts over the back.
    this.add(boxMesh(0.6, height / 2, 0.35, boards, { x: width / 2 + 0.3, y: height / 4, z: depth / 2 - 0.3 }));
    for (const x of [-width / 2 + 0.08, width / 2 - 0.08]) this.add(cylinderMesh(0.035, 2.6, frame, { x, y: height + 1.3, z: -depth / 2 + 0.08 }, { segments: 10 }));
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.2, 0.55), new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.9, side: THREE.DoubleSide }));
    banner.position.set(0, height + 2.25, -depth / 2 + 0.09);
    this.add(banner);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2 + 0.6, height + 0.1, depth / 2)));
    this.buildKit();
    this.add(this.kit);
    this.add(this.chairs);

    // The band: Lou (as the café knows Lou), the drummer, the keys.
    const lou = findPerson(LOU);
    options.band.forEach((_x, i) => {
      const seed = i === 0 && lou ? lou.look.seed : 2301 + i * 37;
      const person: Walker = new Walker({
        viewer: options.viewer,
        seed,
        look: randomLook(seed, i === 0 && lou ? lou.look.role : 'shopper', i === 0 && lou ? castDress('lou') : undefined),
        label: i === 0 ? 'Lou, on bass' : 'The band',
        talk: () => BAND_LINES[this.line++ % BAND_LINES.length]!,
        labelWithin: 6,
        ...(i === 0 ? { social: talkHook(options.social, LOU, () => ({ person: LOU, place: 'street', body: bodyOf(person) })) } : {}),
      });
      this.band.push(person);
    });
    for (let i = 0; i < options.chairs.length; i++) {
      const seed = 2401 + i * 53;
      this.listeners.push(new Walker({ viewer: options.viewer, seed, look: randomLook(seed), label: 'Listening', talk: () => (i % 2 ? 'Shh, this is the good one.' : 'Every Sunday. It beats the telly.'), labelWithin: 4 }));
    }
    const hitbox = invisibleHitbox(width, height + 0.2, depth, { y: (height + 0.2) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Once the stage is placed: the band and the listeners go into the zone (absent until their hour), the chairs before it. */
  placePeople(): void {
    this.updateMatrixWorld(true);
    const { band, chairs, place } = this.options;
    this.band.forEach((person, i) => {
      place(person, this.toZone(new THREE.Vector3(band[i] ?? 0, STAGE.height + 0.02, -0.2)));
      person.setPresent(false);
    });
    this.listeners.forEach((person, i) => {
      const [x, z] = chairs[i]!;
      place(person, new THREE.Vector3(x, 0, z));
      person.setPresent(false);
    });
    this.placeChairs();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  /** The band is on (`street/audio/LiveMusic` plays while it is, the builder's). */
  get playing(): boolean {
    return this.present;
  }

  setHovered(): void {
    // Boards do not glow.
  }

  label(): string {
    return this.present ? 'The stage · stay and listen a while' : 'The stage · Sunday afternoons, the band plays here';
  }

  activate(session: SessionActions): void {
    if (!this.present) {
      session.react('A chalked board on the steps: LIVE MUSIC, SUNDAYS, AFTERNOONS.');
      return;
    }
    const pastimes = this.options.pastimes;
    if (!pastimes) {
      session.react('You stand a while and listen. The bass player catches your eye and grins.');
      return;
    }
    void pastimes.run({ minutes: LISTEN_MINUTES, outMs: 700, darkMs: 1600, inMs: 900 }, () => {
      nudge(LOU, { warmth: LISTEN_WARMTH, day: this.options.day(), reason: 'concert', why: 'saw you in the crowd', memory: 'you came to hear the band' });
    }).then((done) => {
      if (done !== null) session.react('Three songs and an encore. Lou waves the bass at you from the stage.');
    });
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const on = onNow(PARK_CONCERT, this.options.day(), s);
    this.getWorldPosition(this.here);
    // They come and go only while the stage cannot be seen (no band vanishing mid-song in view).
    if (on !== this.present && (this.fresh || outOfSight(this.options.viewer, this.here, 30))) this.setOn(on);
    this.fresh = false;
    if (!this.present) return;
    // Hands on the instruments through a song, off them for the breather between two.
    const was = this.beat > SONG;
    this.beat = (this.beat + dt) % (SONG + BREATHER);
    const resting = this.beat > SONG;
    if (resting !== was) for (const person of this.band) person.setPose(resting ? 'crossed' : 'play');
    // A song over: the chairs clap (most of them).
    if (resting && !was) for (const person of this.listeners) if (random() < 0.85) person.gesture('clap');
  }

  private setOn(on: boolean): void {
    this.present = on;
    this.kit.visible = on;
    this.chairs.visible = on;
    const yaw = this.rotation.y;
    this.band.forEach((person, i) => {
      person.setPresent(on);
      if (!on) return;
      if (i === 1) person.sit(yaw, 0.5, 'play', 'viewer');
      else person.stand(yaw, 'play', 'viewer');
    });
    this.listeners.forEach((person) => {
      person.setPresent(on);
      // Facing the stage from their chair.
      if (on) person.sit(yaw + Math.PI, 0.45, 'lap');
    });
  }

  /** A stage-local point in the zone's frame (the stage stands in the zone's root). */
  private toZone(local: THREE.Vector3): THREE.Vector3 {
    return local.applyMatrix4(this.matrix);
  }

  /** The instruments (shown while they play) and the folding chairs (put out on Sundays). */
  private buildKit(): void {
    const { band, chairs } = this.options;
    const y = STAGE.height + 0.02;
    const black = paint(0x1a1a1a, 0.4);
    const chrome = paint(0xb8bcc0, 0.3);
    // Drums by the drummer: a bass drum, a snare, a cymbal on its stand, the stool.
    const dx = band[1] ?? 0;
    const shell = paint(0x7a1e24, 0.35);
    const drum = cylinderMesh(0.26, 0.36, shell, { x: dx, y: y + 0.26, z: 0.35 }, { segments: 18 });
    drum.rotation.x = Math.PI / 2;
    this.kit.add(drum);
    this.kit.add(cylinderMesh(0.17, 0.12, shell, { x: dx + 0.32, y: y + 0.62, z: 0.25 }, { segments: 16 }));
    this.kit.add(cylinderMesh(0.012, 1.0, chrome, { x: dx - 0.42, y: y + 0.5, z: 0.2 }, { segments: 6 }));
    this.kit.add(cylinderMesh(0.22, 0.01, paint(0xc8a040, 0.3), { x: dx - 0.42, y: y + 1.0, z: 0.2 }, { segments: 18 }));
    this.kit.add(cylinderMesh(0.16, 0.48, black, { x: dx, y: y + 0.24, z: -0.25 }, { segments: 12 }));
    // The keys on their X-stand.
    const kx = band[2] ?? 0;
    this.kit.add(boxMesh(0.9, 0.07, 0.3, paint(0x2a2a2e, 0.35), { x: kx, y: y + 0.92, z: 0.38 }));
    this.kit.add(boxMesh(0.04, 0.88, 0.04, chrome, { x: kx - 0.3, y: y + 0.44, z: 0.38 }));
    this.kit.add(boxMesh(0.04, 0.88, 0.04, chrome, { x: kx + 0.3, y: y + 0.44, z: 0.38 }));
    // The bass amp behind Lou.
    const bx = band[0] ?? 0;
    this.kit.add(boxMesh(0.45, 0.6, 0.35, black, { x: bx - 0.3, y: y + 0.3, z: -0.75 }));
    // The chairs: folding, slatted, facing the stage (their positions are zone-local; the stage is in the zone's root).
    const seat = paint(0x2a4a6a, 0.6);
    for (const [x, z] of chairs) {
      const chair = new THREE.Group();
      chair.add(boxMesh(0.42, 0.03, 0.4, seat, { y: 0.45 }));
      chair.add(boxMesh(0.42, 0.36, 0.03, seat, { y: 0.66, z: -0.2 }));
      for (const sx of [-0.19, 0.19]) for (const sz of [-0.17, 0.17]) chair.add(boxMesh(0.025, 0.45, 0.025, chrome, { x: sx, y: 0.225, z: sz }));
      chair.userData.zoneAt = [x, z];
      this.chairs.add(chair);
    }
    // Laid out once the stage knows where it stands: `placeChairs`.
  }

  /** The chairs at their zone-local spots, facing the stage: the stage's inverse places them in its own frame. */
  private placeChairs(): void {
    this.updateMatrixWorld(true);
    const inverse = this.matrix.clone().invert();
    for (const chair of this.chairs.children) {
      const [x, z] = chair.userData.zoneAt as Vec2;
      chair.position.set(x, 0, z).applyMatrix4(inverse);
      // Facing the stage's middle (a chair faces its local +z).
      chair.rotation.y = Math.atan2(-chair.position.x, -chair.position.z);
    }
  }
}

/** The banner over the stage. */
function bannerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 84);
  ctx.fillStyle = '#2a4a3a';
  ctx.fillRect(0, 0, 512, 84);
  ctx.strokeStyle = '#e8d8a0';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 76);
  ctx.fillStyle = '#f2ead2';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUNDAYS IN THE PARK', 256, 44, 480);
  return toTexture(canvas, 'facing');
}
