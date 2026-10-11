import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { reduceMotion } from '@/settings/motion';
import { radialGlow } from '@/world/materials/glowTextures';
import { additive } from '@/world/materials/blend';
import { FLOOR, RENDER_ORDER, onSurface } from '../surface/layers';
import { Prop } from '../props/Prop';
import type { MirrorBall } from '../props/MirrorBall';
import type { NeonTube } from '../props/NeonTube';

/** What the whole hall celebrates: the wheel's jackpot falling, the player taking the top of a machine's table. */
type Celebration = 'jackpot' | 'record';

const listeners = new Set<(kind: Celebration) => void>();

/** Something worth the whole hall's lights happened (a machine's run says so, `MachineRun`). */
export function celebrateHall(kind: Celebration): void {
  for (const cb of listeners) cb(kind);
}

/** How long each celebration lasts (s), and how fast the mirror ball turns at its height (times its usual speed). */
const SECONDS: Record<Celebration, number> = { jackpot: 9, record: 6 };
const SPIN = 7;
/** The tubes blink this often (Hz) for the first seconds of it. */
const BLINK_HZ = 4;
const BLINK_SECONDS = 2.2;
/** The spots the ball throws on the carpet: how many, their size (m), how bright, how fast they sweep (rad/s). */
const SPOTS = 14;
const SPOT_SIZE = 0.32;
const SPOT_STRENGTH = 0.55;
const SWEEP = 0.9;
const COLOURS = [0xffffff, 0xff8ad8, 0x8ae8ff, 0xfff08a, 0xb48aff];

interface HallCelebrationOptions {
  balls: readonly MirrorBall[];
  tubes: readonly NeonTube[];
  /** Where on the floor the spots sweep round (zone-local x, z: under the ball), and out to how far (m). */
  centre: [number, number];
  reach: number;
  /** The wheel's jackpot: a hit (its pot falling back) is celebrated, whoever hit it. */
  jackpot?: { readonly value: number; subscribe(cb: () => void): () => void };
}

/**
 * The hall going off: when the jackpot falls or the player takes the top of a table, the mirror
 * ball spins up, spots of light sweep the carpet round it (additive glows on the floor, no light:
 * alpha kept, docs/graphics.md) and the neon tubes along the walls blink, then it all settles back.
 * The crowd's cheer is theirs (`ArcadeCrowd`). Under reduced motion only the spots show, steady.
 * Origin at the zone's origin, on the floor.
 */
export class HallCelebration extends Prop implements Updatable {
  private readonly spots: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly geometry = new THREE.PlaneGeometry(SPOT_SIZE, SPOT_SIZE);
  private readonly unsubscribe: (() => void)[] = [];
  /** Seconds left of the celebration under way, and how long it was. */
  private left = 0;
  private length = 1;
  private clock = 0;
  private lit = true;

  constructor(private readonly options: HallCelebrationOptions) {
    super();
    this.name = 'HallCelebration';
    const map = radialGlow({ width: 64, height: 64, stops: [[0, 1], [0.4, 0.6], [1, 0]] });
    for (let i = 0; i < SPOTS; i++) {
      const material = new THREE.MeshBasicMaterial({ map, color: COLOURS[i % COLOURS.length]!, transparent: true, depthWrite: false, opacity: 0 });
      additive(material);
      const spot = new THREE.Mesh(this.geometry, onSurface(material, FLOOR.glowPool));
      spot.rotation.x = -Math.PI / 2;
      spot.position.y = FLOOR.glowPool.lift;
      spot.renderOrder = RENDER_ORDER.groundGlow;
      spot.visible = false;
      this.spots.push(spot);
      this.add(spot);
    }
    const hear = (kind: Celebration): void => this.start(kind);
    listeners.add(hear);
    this.unsubscribe.push(() => listeners.delete(hear));
    const { jackpot } = options;
    if (jackpot) {
      let pot = jackpot.value;
      this.unsubscribe.push(
        jackpot.subscribe(() => {
          if (jackpot.value < pot) this.start('jackpot');
          pot = jackpot.value;
        }),
      );
    }
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    this.left = Math.max(0, this.left - dt);
    this.clock += dt;
    const elapsed = this.length - this.left;
    // Up fast, held, then fading over its last third.
    const level = Math.min(1, elapsed / 0.4, this.left / (this.length / 3));
    const still = reduceMotion();
    for (const ball of this.options.balls) ball.setSpin(still ? 1 : 1 + (SPIN - 1) * level);
    this.layoutSpots(level, still);
    const lit = still || elapsed > BLINK_SECONDS || this.left === 0 || Math.floor(elapsed * BLINK_HZ * 2) % 2 === 0;
    if (lit !== this.lit) {
      this.lit = lit;
      for (const tube of this.options.tubes) tube.setLit(lit);
    }
    if (this.left === 0) {
      for (const spot of this.spots) spot.visible = false;
      for (const ball of this.options.balls) ball.setSpin(1);
    }
  }

  dispose(): void {
    for (const off of this.unsubscribe.splice(0)) off();
    this.geometry.dispose();
    for (const spot of this.spots) spot.material.dispose();
  }

  private start(kind: Celebration): void {
    this.length = Math.max(this.left, SECONDS[kind]);
    this.left = this.length;
  }

  /** The spots round the ball's foot, each on its own ring and pace, sweeping one way, at `level` of their brightness. */
  private layoutSpots(level: number, still: boolean): void {
    const [cx, cz] = this.options.centre;
    const reach = this.options.reach;
    this.spots.forEach((spot, i) => {
      const ring = 0.25 + ((i * 0.618) % 1) * 0.75;
      const angle = (i / SPOTS) * Math.PI * 2 + (still ? 0 : this.clock * SWEEP * (0.8 + ring * 0.4));
      spot.position.x = cx + Math.cos(angle) * ring * reach;
      spot.position.z = cz + Math.sin(angle) * ring * reach;
      spot.material.opacity = SPOT_STRENGTH * level;
      spot.visible = level > 0.01;
    });
  }
}
