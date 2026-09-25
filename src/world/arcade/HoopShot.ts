import * as THREE from 'three';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { type ArcadeControls, NO_CONTROLS, drawText } from './games/ArcadeGame';
import { TicketMachine, type TicketMachineWiring } from './TicketMachine';
import { TicketStrip } from './TicketStrip';

export interface HoopShotOptions {
  title?: string;
  color?: number;
}

const WIDTH = 0.96;
/** The cage, from the player's end (+z) to the backboard (-z). */
const FRONT_Z = 0.95;
const BACK_Z = -1.35;
const CAGE_H = 2.55;
/** The ramp the balls roll back down: high at the back, low at the front gutter. */
const RAMP = { backZ: -1.25, backY: 1.08, frontZ: 0.72, frontY: 0.86 };
const GUTTER_Z = 0.8;
/** How hard the ramp pulls a ball back to the front (gravity along its slope, helped a little so nothing dawdles), m/s². */
const RAMP_PULL = 9.81 * Math.sin(Math.atan2(RAMP.backY - RAMP.frontY, RAMP.frontZ - RAMP.backZ)) * 1.6;
const BALL_R = 0.09;
const BALLS = 3;
const HOOP = { x: 0, y: 2.0, z: -0.98, r: 0.21, tube: 0.012 };
const BOARD = { z: -1.18, w: 0.8, h: 0.55, y: 2.12 };
const GRAVITY = 9.81;
const SUBSTEP = 1 / 240;
/** Where the ball leaves the hand, machine-local, and how the throw works: speed from the meter, a lift above the look. */
const RELEASE = new THREE.Vector3(0.08, 1.45, 0.62);
const THROW_SPEED: [number, number] = [3.2, 7.4];
const LIFT = 1.3;
const POWER_PERIOD = 1.2;
const ROUND_SECONDS = 30;
/** The final seconds pay more per basket. */
const FINAL_SECONDS = 10;
const BASKET_POINTS = 20;
const FINAL_POINTS = 30;
/** Baskets in a row multiply (to this). */
const STREAK_MAX = 3;
/** After this many baskets the hoop starts sliding from side to side; faster after twice as many. */
const MOVE_AFTER = 10;
const SLIDE = 0.2;
const STAND_Z = 1.3;

interface Ball {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  state: 'rest' | 'flying';
  /** Above the rim on this flight (a basket must come down through it). */
  above: boolean;
  scored: boolean;
  touched: boolean;
}

/**
 * HOOP FEVER: the basketball cage every arcade has. Three balls roll back down the ramp to the
 * front; aim where you look, hold Space and the power meter on the scoreboard swings, let go to
 * throw (the ball leaves with a lift above the line of sight). Thirty seconds; a basket pays 20
 * (30 in the last ten seconds), baskets in a row multiply up to three times, a miss breaks the
 * run. After ten baskets the hoop starts to slide; after twenty it slides faster. The balls are
 * simulated (gravity, the rim, the backboard, the cage's nets, the ramp), so a ball can rattle
 * round the rim and out. Regulars throw well-aimed shots with a little error. Pays tickets from a
 * slot at the front; keeps a table. Origin on the floor under the middle of the cage, +z the
 * player's end. Collides.
 */
export class HoopShot extends TicketMachine {
  readonly hitboxes: THREE.Object3D[];
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z - 0.15);
  readonly focus = new THREE.Vector3(HOOP.x, HOOP.y, HOOP.z);
  readonly lean = 0.05;
  protected readonly speaker: ChipSpeaker;
  protected readonly strip: TicketStrip;

  private readonly balls: Ball[] = [];
  private readonly hoop: THREE.Group;
  private readonly marquee: THREE.MeshBasicMaterial;
  private readonly display: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly look = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private readonly scratch = new THREE.Vector3();
  private points = 0;
  private baskets = 0;
  private streak = 0;
  private timeLeft = ROUND_SECONDS;
  private charging = false;
  private chargeClock = 0;
  private power = 0;
  private hoopX = 0;
  private slideClock = 0;
  private flashClock = 0;
  private flashText = '';
  private displayClock = 0;
  private demoWait = 0;

  constructor(options: HoopShotOptions, wiring: TicketMachineWiring) {
    super(wiring);
    this.name = 'HoopShot';
    const title = options.title ?? 'HOOP FEVER';
    this.game = { id: 'hoops', title, hint: 'Look to aim · hold Space, let go to throw' };
    const paint = matte(options.color ?? 0x1f4fa8, 0.5);
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.7, roughness: 0.3 });
    const dark = matte(0x131318, 0.6);
    const length = FRONT_Z - BACK_Z;
    const midZ = (FRONT_Z + BACK_Z) / 2;

    // The cabinet under the ramp, its sides painted, the front with the gutter and the ticket slot.
    this.add(boxMesh(WIDTH, RAMP.frontY - 0.04, length, dark, { y: (RAMP.frontY - 0.04) / 2, z: midZ }));
    for (const sx of [-1, 1]) this.add(boxMesh(0.04, 1.0, length, paint, { x: sx * (WIDTH / 2 - 0.02), y: 0.5, z: midZ }));
    this.add(boxMesh(WIDTH, 0.9, 0.06, paint, { y: 0.45, z: FRONT_Z - 0.03 }));
    const ramp = boxMesh(WIDTH - 0.08, 0.02, Math.hypot(RAMP.frontZ - RAMP.backZ, RAMP.backY - RAMP.frontY), matte(0x2a2a30, 0.7), { y: (RAMP.frontY + RAMP.backY) / 2 - 0.01, z: (RAMP.frontZ + RAMP.backZ) / 2 });
    ramp.rotation.x = -Math.atan2(RAMP.backY - RAMP.frontY, RAMP.frontZ - RAMP.backZ);
    this.add(ramp);
    this.add(boxMesh(WIDTH - 0.08, 0.05, 0.14, matte(0x2a2a30, 0.7), { y: RAMP.frontY - 0.03, z: GUTTER_Z + 0.03 }));
    // The cage: four posts, top rails, nets on the sides and over the top.
    for (const sx of [-1, 1]) {
      for (const z of [BACK_Z + 0.03, FRONT_Z - 0.06]) this.add(cylinderMesh(0.018, CAGE_H - 0.9, steel, { x: sx * (WIDTH / 2 - 0.02), y: 0.9 + (CAGE_H - 0.9) / 2, z }, { segments: 8 }));
      const rail = cylinderMesh(0.015, length - 0.06, steel, { x: sx * (WIDTH / 2 - 0.02), y: CAGE_H, z: midZ }, { segments: 8 });
      rail.rotation.x = Math.PI / 2;
      this.add(rail);
    }
    const net = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(length - 0.1, CAGE_H - 1.0), net);
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * (WIDTH / 2 - 0.02), 1.0 + (CAGE_H - 1.0) / 2, midZ);
      this.add(side);
    }
    // The back: the machine's tall panel, the backboard, the scoreboard and the marquee.
    this.add(boxMesh(WIDTH, CAGE_H + 0.15, 0.05, paint, { y: (CAGE_H + 0.15) / 2, z: BACK_Z - 0.025 }));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.3 }));
    board.position.set(0, BOARD.y, BOARD.z);
    this.add(board);
    this.add(boxMesh(BOARD.w + 0.03, BOARD.h + 0.03, 0.02, steel, { y: BOARD.y, z: BOARD.z - 0.012 }));
    for (const sx of [-1, 1]) this.add(boxMesh(0.03, 0.03, BOARD.z - BACK_Z, steel, { x: sx * 0.3, y: BOARD.y, z: (BOARD.z + BACK_Z) / 2 }));
    this.marquee = new THREE.MeshBasicMaterial({ map: paintMarquee(title), toneMapped: false, color: 0xdddddd });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.2), this.marquee);
    marquee.position.set(0, CAGE_H + 0.03, BACK_Z + 0.002);
    this.add(marquee);
    const [canvas, ctx] = createCanvas(256, 96);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.display = { ctx, texture };
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    screen.position.set(0, BOARD.y + BOARD.h / 2 + 0.12, BOARD.z + 0.002);
    this.add(screen);
    // The hoop: an orange ring on a bracket, a net hanging under it.
    this.hoop = new THREE.Group();
    this.hoop.position.set(HOOP.x, HOOP.y, HOOP.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(HOOP.r, HOOP.tube, 8, 32), matte(0xff5a1a, 0.4));
    ring.rotation.x = Math.PI / 2;
    this.hoop.add(ring, boxMesh(0.06, 0.02, BOARD.z - HOOP.z + HOOP.r, steel, { z: -(HOOP.r + (HOOP.z - BOARD.z - HOOP.r) / 2) - 0.01 }));
    const hoopNet = new THREE.Mesh(new THREE.CylinderGeometry(HOOP.r, HOOP.r * 0.65, 0.26, 16, 1, true), net);
    hoopNet.position.y = -0.13;
    this.hoop.add(hoopNet);
    this.add(this.hoop);
    // The balls, waiting in the gutter.
    const leather = new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.65 });
    for (let i = 0; i < BALLS; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), leather);
      mesh.castShadow = true;
      this.add(mesh);
      this.balls.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'rest', above: false, scored: false, touched: false });
    }
    this.strip = new TicketStrip(0.45);
    this.strip.position.set(WIDTH / 2 - 0.16, 0.45, FRONT_Z + 0.001);
    this.add(this.strip);

    const hitbox = invisibleHitbox(WIDTH + 0.04, CAGE_H + 0.2, length + 0.04, { y: (CAGE_H + 0.2) / 2, z: midZ });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== net && mesh !== marquee && mesh !== screen) mesh.receiveShadow = true;
    });
    this.speaker = new ChipSpeaker(screen, wiring.listener);
    this.newGame();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, BACK_Z - 0.05), new THREE.Vector3(WIDTH / 2, CAGE_H, FRONT_Z));
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    const position = this.localToWorld(new THREE.Vector3(0, 1.62, STAND_Z));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    return { position, yaw: Math.atan2(-forward.x, -forward.z) };
  }

  /** Both hands on the ball about to be thrown (or on the gutter's edge). */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.localToWorld(this.hands[0].set(RELEASE.x - 0.08, RELEASE.y - 0.02, RELEASE.z));
    this.localToWorld(this.hands[1].set(RELEASE.x + 0.08, RELEASE.y - 0.02, RELEASE.z));
    return this.hands;
  }

  setHovered(hovered: boolean): void {
    this.marquee.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  protected get score(): number {
    return this.points;
  }

  protected newGame(): void {
    this.points = 0;
    this.baskets = 0;
    this.streak = 0;
    this.timeLeft = ROUND_SECONDS;
    this.charging = false;
    this.power = 0;
    this.hoopX = 0;
    this.slideClock = 0;
    this.demoWait = 0.8;
    this.balls.forEach((b, i) => {
      b.state = 'rest';
      b.pos.set(-0.2 + i * 0.2, RAMP.frontY + BALL_R, GUTTER_Z);
      b.vel.set(0, 0, 0);
      b.mesh.position.copy(b.pos);
    });
  }

  protected attractLabel(price: string): string {
    return `${this.game.title} — click to insert a coin (${price}, thirty seconds)`;
  }

  protected playingLabel(): string {
    return 'Hold Space, let go to throw · E to walk away';
  }

  protected play(dt: number, controls: ArcadeControls): boolean {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.slide(dt);
    if (this.timeLeft > 0) {
      if (this.who === 'player') this.playerThrow(dt, controls);
      else if (controls.firePressed) this.regularThrow();
    }
    this.simulate(dt);
    // Over once the clock is out and nothing is in the air.
    return this.timeLeft <= 0 && this.balls.every((b) => b.state === 'rest');
  }

  protected demoControls(dt: number): ArcadeControls {
    this.demoWait -= dt;
    const ready = this.demoWait <= 0 && this.balls.some((b) => b.state === 'rest');
    if (ready) this.demoWait = 0.9 + Math.random() * 0.9;
    return { ...NO_CONTROLS, fire: ready, firePressed: ready };
  }

  protected paint(dt: number): void {
    this.flashClock = Math.max(0, this.flashClock - dt);
    for (const b of this.balls) b.mesh.position.copy(b.pos);
    this.displayClock += dt;
    if (this.displayClock < 1 / 20) return;
    this.displayClock = 0;
    const { ctx, texture } = this.display;
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, 256, 96);
    if (this.state === 'initials' && this.entry) {
      this.entry.draw(ctx, 128, 50);
    } else if (this.state === 'over') {
      drawText(ctx, `${this.last.score}`, 128, 30, 24, '#ffd23a');
      drawText(ctx, `${Math.floor(this.ticketsOf(this.last.score) * this.countUp)} TICKETS`, 128, 68, 14, '#ffe066');
    } else if (this.state === 'attract') {
      drawText(ctx, this.game.title, 128, 30, 18, '#ff8a3a');
      drawText(ctx, Math.floor(this.clock * 2) % 2 ? 'INSERT COIN' : '30 SECONDS', 128, 66, 14, '#ff8a80');
    } else {
      drawText(ctx, `${this.points}`, 56, 34, 22, '#ffffff');
      const final = this.timeLeft <= FINAL_SECONDS && this.timeLeft > 0;
      drawText(ctx, `${Math.ceil(this.timeLeft)}`, 200, 34, 22, final && Math.floor(this.clock * 4) % 2 ? '#ff5f5f' : '#ffd23a');
      if (this.flashClock > 0) drawText(ctx, this.flashText, 128, 72, 12, '#7ee787');
      else if (final) drawText(ctx, 'FINAL SECONDS x1.5', 128, 72, 10, '#ff8a3a');
      else if (this.streak > 1) drawText(ctx, `STREAK x${Math.min(STREAK_MAX, this.streak)}`, 128, 72, 10, '#7ee787');
      // The power meter along the bottom while charging.
      if (this.charging) {
        ctx.fillStyle = '#222233';
        ctx.fillRect(16, 86, 224, 6);
        ctx.fillStyle = this.power > 0.8 ? '#ff5f5f' : this.power > 0.45 ? '#ffe066' : '#7ee787';
        ctx.fillRect(16, 86, 224 * this.power, 6);
      }
    }
    texture.needsUpdate = true;
  }

  /** The player: hold fire and the meter swings, let go to throw where they look. */
  private playerThrow(dt: number, controls: ArcadeControls): void {
    if (controls.fire) {
      if (!this.charging) {
        this.charging = true;
        this.chargeClock = 0;
      }
      this.chargeClock += dt;
      const t = (this.chargeClock % POWER_PERIOD) / POWER_PERIOD;
      this.power = t < 0.5 ? t * 2 : 2 - t * 2;
      return;
    }
    if (!this.charging) return;
    this.charging = false;
    const ball = this.nextBall();
    if (!ball) return;
    // Where the player looks, in the machine's frame, lifted: the arc a throw takes.
    this.wiring.listener.getWorldDirection(this.look);
    this.getWorldQuaternion(this.camQuat).invert();
    this.look.applyQuaternion(this.camQuat).normalize();
    this.look.y += LIFT;
    this.look.normalize();
    const speed = THREE.MathUtils.lerp(THROW_SPEED[0], THROW_SPEED[1], this.power);
    this.launch(ball, this.look.multiplyScalar(speed));
  }

  /** A regular: the arc that would drop it in, with a little error. */
  private regularThrow(): void {
    const ball = this.nextBall();
    if (!ball) return;
    const skill = 0.7;
    const target = this.scratch.set(this.hoopX + (Math.random() - 0.5) * 0.12 * (1 - skill + 0.3), HOOP.y, HOOP.z + 0.02);
    const d = target.clone().sub(RELEASE);
    const horizontal = Math.hypot(d.x, d.z);
    const angle = THREE.MathUtils.degToRad(55);
    const denom = 2 * Math.cos(angle) ** 2 * (horizontal * Math.tan(angle) - d.y);
    const speed = Math.sqrt((GRAVITY * horizontal * horizontal) / Math.max(0.01, denom)) * (1 + (Math.random() - 0.5) * 0.08);
    const vel = new THREE.Vector3(d.x / horizontal, 0, d.z / horizontal).multiplyScalar(Math.cos(angle) * speed);
    vel.y = Math.sin(angle) * speed;
    this.launch(ball, vel);
  }

  private nextBall(): Ball | null {
    // The one nearest the hand.
    let best: Ball | null = null;
    for (const b of this.balls) if (b.state === 'rest' && (!best || b.pos.distanceTo(RELEASE) < best.pos.distanceTo(RELEASE))) best = b;
    return best;
  }

  private launch(ball: Ball, velocity: THREE.Vector3): void {
    ball.state = 'flying';
    ball.pos.copy(RELEASE);
    ball.vel.copy(velocity);
    ball.above = false;
    ball.scored = false;
    ball.touched = false;
    this.speaker.play('launch');
  }

  private slide(dt: number): void {
    const moving = this.baskets >= MOVE_AFTER;
    const fast = this.baskets >= MOVE_AFTER * 2;
    this.slideClock += dt * (fast ? 1.6 : 1);
    const target = moving ? Math.sin(this.slideClock * 1.3) * SLIDE : 0;
    this.hoopX += (target - this.hoopX) * Math.min(1, dt * 3);
    this.hoop.position.x = this.hoopX;
  }

  /** The balls in flight: gravity, the rim, the backboard, the nets and the ramp; a basket when one drops through the ring. */
  private simulate(dt: number): void {
    const steps = Math.ceil(dt / SUBSTEP);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const b of this.balls) {
        if (b.state === 'rest') continue;
        b.vel.y -= GRAVITY * h;
        b.pos.addScaledVector(b.vel, h);
        this.collideRim(b);
        // The backboard.
        if (b.pos.z - BALL_R < BOARD.z && Math.abs(b.pos.x) < BOARD.w / 2 && Math.abs(b.pos.y - BOARD.y) < BOARD.h / 2 && b.vel.z < 0) {
          b.pos.z = BOARD.z + BALL_R;
          b.vel.z *= -0.55;
          b.touched = true;
          this.speaker.play('thud', 1.3);
        }
        // The back panel, the side nets and the cage's top net.
        if (b.pos.z - BALL_R < BACK_Z) {
          b.pos.z = BACK_Z + BALL_R;
          b.vel.z = Math.abs(b.vel.z) * 0.4;
        }
        const side = WIDTH / 2 - 0.03 - BALL_R;
        if (Math.abs(b.pos.x) > side) {
          b.pos.x = Math.sign(b.pos.x) * side;
          b.vel.x *= -0.3;
        }
        if (b.pos.y + BALL_R > CAGE_H) {
          b.pos.y = CAGE_H - BALL_R;
          b.vel.y = -Math.abs(b.vel.y) * 0.3;
        }
        // Through the ring, coming down.
        const dx = b.pos.x - this.hoopX;
        const dz = b.pos.z - HOOP.z;
        const inside = dx * dx + dz * dz < (HOOP.r - BALL_R * 0.4) ** 2;
        if (b.pos.y > HOOP.y + 0.02) b.above = inside || b.above;
        if (!b.scored && b.above && inside && b.pos.y < HOOP.y - 0.05 && b.vel.y < 0) this.basket(b);
        // The ramp: it lands and rolls back to the gutter.
        const floor = this.rampY(b.pos.z) + BALL_R;
        if (b.pos.y < floor) {
          b.pos.y = floor;
          if (b.vel.y < -0.6) {
            b.vel.y *= -0.35;
            this.speaker.play('thud', 0.8);
          } else b.vel.y = 0;
          // Rolling: downhill towards the front, losing a little to the ramp.
          b.vel.x *= 1 - 3 * h;
          b.vel.z = b.vel.z * (1 - 1.5 * h) + RAMP_PULL * h;
          if (!b.scored && b.pos.z > HOOP.z + 0.4) this.missed(b);
        }
        if (b.pos.z >= GUTTER_Z && b.pos.y <= this.rampY(GUTTER_Z) + BALL_R + 0.01) {
          b.pos.z = GUTTER_Z;
          b.vel.set(0, 0, 0);
          if (!b.scored) this.missed(b);
          b.state = 'rest';
          this.spreadInGutter(b);
        }
      }
    }
  }

  /** The ring as a circle of tube: the nearest point of it pushes the ball out and takes some of its speed. */
  private collideRim(b: Ball): void {
    const dx = b.pos.x - this.hoopX;
    const dz = b.pos.z - HOOP.z;
    const flat = Math.hypot(dx, dz) || 1e-6;
    const nearest = this.scratch.set(this.hoopX + (dx / flat) * HOOP.r, HOOP.y, HOOP.z + (dz / flat) * HOOP.r);
    const away = b.pos.clone().sub(nearest);
    const dist = away.length();
    const reach = BALL_R + HOOP.tube;
    if (dist >= reach || dist === 0) return;
    const n = away.divideScalar(dist);
    b.pos.copy(nearest).addScaledVector(n, reach);
    const vn = b.vel.dot(n);
    if (vn < 0) {
      b.vel.addScaledVector(n, -(1 + 0.5) * vn);
      b.vel.multiplyScalar(0.85);
      if (!b.touched || vn < -0.8) this.speaker.play('rim', 0.9 + Math.random() * 0.2);
      b.touched = true;
    }
  }

  private basket(b: Ball): void {
    b.scored = true;
    this.baskets += 1;
    this.streak += 1;
    const final = this.timeLeft <= FINAL_SECONDS;
    const points = (final ? FINAL_POINTS : BASKET_POINTS) * Math.min(STREAK_MAX, this.streak);
    this.points += points;
    this.flashText = b.touched ? `+${points}` : `SWISH +${points}`;
    this.flashClock = 0.8;
    this.speaker.play('swish');
    this.speaker.play('score', 1 + Math.min(STREAK_MAX, this.streak) * 0.1);
    if (this.baskets === MOVE_AFTER || this.baskets === MOVE_AFTER * 2) {
      this.flashText = this.baskets === MOVE_AFTER ? 'HOOP ON THE MOVE!' : 'FASTER!';
      this.speaker.play('bonus');
    }
  }

  private missed(b: Ball): void {
    b.scored = true; // counted, one way or the other
    if (this.streak > 1) this.speaker.play('lose');
    this.streak = 0;
  }

  private rampY(z: number): number {
    const t = THREE.MathUtils.clamp((z - RAMP.backZ) / (RAMP.frontZ - RAMP.backZ), 0, 1);
    return THREE.MathUtils.lerp(RAMP.backY, RAMP.frontY, t);
  }

  /** A ball back in the gutter takes the first free place along it. */
  private spreadInGutter(b: Ball): void {
    const places = [-0.2, 0, 0.2];
    const taken = this.balls.filter((o) => o !== b && o.state === 'rest').map((o) => o.pos.x);
    const free = places.find((x) => taken.every((t) => Math.abs(t - x) > 0.1)) ?? 0;
    b.pos.set(free, RAMP.frontY + BALL_R, GUTTER_Z);
  }
}

function netTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(230,230,235,0.4)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

function boardTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(320, 220);
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, 320, 220);
  ctx.strokeStyle = '#e8303a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 308, 208);
  ctx.strokeRect(110, 100, 100, 76);
  return toTexture(canvas, 4);
}

function ballTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(128, 64);
  ctx.fillStyle = '#e0701e';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#2a1408';
  ctx.lineWidth = 2;
  for (const x of [0, 32, 64, 96]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(128, 32);
  ctx.stroke();
  return toTexture(canvas, 2);
}

function paintMarquee(title: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 96);
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#ff5a1a');
  g.addColorStop(1, '#ffd23a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 96);
  drawText(ctx, title, 256, 50, 40, '#1a0c04');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
