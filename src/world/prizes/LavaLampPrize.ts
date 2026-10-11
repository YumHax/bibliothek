import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { standard } from '../materials/palette';
import { bakedGlow, poolTexture } from '../showcase/glow';
import { FLOOR, WALL, decal } from '../surface/layers';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

interface LavaLampPrizeOptions {
  prizes: OwnedPrizes;
  /** How far behind its base the wall is (m): its glow is thrown there. */
  wallBehind: number;
  /** The prize that brings it home. Default 'lavaLamp'. */
  prizeId?: string;
}

const CHROME = standard({ color: 0xc4c7cc, metalness: 1, roughness: 0.2 });
const WAX = 0xff2fa0;
/** The wax blobs: their size, the height band they drift in, how fast (rad/s) and out of step. */
const BLOBS = [
  { r: 0.012, speed: 0.31, phase: 0 },
  { r: 0.009, speed: 0.23, phase: 2.1 },
  { r: 0.008, speed: 0.41, phase: 4.0 },
] as const;
const RISE = { from: 0.068, to: 0.15 };

/**
 * The arcade's lava lamp at home, at the right end of the prize shelf's bottom board: chrome base and cap, a pink glass
 * and its magenta wax drifting up and down, lighting the trophies beside it with no light of its own (the flat's
 * shader budget, CLAUDE.md "Gotchas"): a glow baked on the board under it and on the wall behind. Hidden until the
 * prize is owned. Origin on the board under its base; decoration, never collides.
 */
export class LavaLampPrize extends Prop implements Updatable {
  private readonly body = new THREE.Group();
  private readonly blobs: THREE.Mesh[] = [];
  private readonly own: THREE.Material[] = [];
  private readonly unsubscribe: () => void;
  private owned = false;
  private clock = 0;

  constructor(options: LavaLampPrizeOptions) {
    super();
    this.name = 'LavaLampPrize';
    this.body.add(cylinderMesh(0.02, 0.05, CHROME, { y: 0.025 }, { radiusBottom: 0.03, segments: 16 }));
    const glass = cylinderMesh(0.012, 0.11, standard({ color: 0xffd0e8, emissive: 0xff7ab8, emissiveIntensity: 0.6, transparent: true, opacity: 0.6, roughness: 0.1 }), { y: 0.105 }, { radiusBottom: 0.022, segments: 16 });
    glass.castShadow = false;
    this.body.add(glass);
    const wax = standard({ color: WAX, emissive: WAX, emissiveIntensity: 1.6, roughness: 0.4 });
    for (const { r } of BLOBS) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), wax);
      blob.castShadow = false;
      this.blobs.push(blob);
      this.body.add(blob);
    }
    this.body.add(cylinderMesh(0.008, 0.025, CHROME, { y: 0.172 }, { radiusBottom: 0.014, segments: 12 }));
    // Its light, baked: a pool on the board round its base, a wash up the wall behind it.
    const pool = poolTexture();
    const onBoard = bakedGlow(WAX, 0.45, pool);
    const onWall = bakedGlow(WAX, 0.3, pool);
    this.own.push(onBoard, onWall);
    // Kept on the board: its right end is a slot's half beyond the lamp.
    const boardGlow = decal(0.2, 0.15, onBoard, FLOOR.glowPool, 'up');
    boardGlow.position.x = -0.03;
    const wallGlow = decal(0.36, 0.34, onWall, WALL.overlay);
    wallGlow.position.set(0, 0.12, -options.wallBehind + WALL.overlay.lift);
    for (const glow of [boardGlow, wallGlow]) {
      glow.receiveShadow = false;
      glow.raycast = () => {};
      this.body.add(glow);
    }
    this.add(this.body);
    this.unsubscribe = showWhenOwned(options.prizes, options.prizeId ?? 'lavaLamp', this.body, null, (owned) => (this.owned = owned));
  }

  update(dt: number): void {
    if (!this.owned) return;
    this.clock += dt;
    BLOBS.forEach(({ speed, phase }, i) => {
      const k = (Math.sin(this.clock * speed + phase) + 1) / 2;
      const blob = this.blobs[i]!;
      blob.position.y = RISE.from + (RISE.to - RISE.from) * k;
      // Stretched as it climbs, squat as it sinks back.
      blob.scale.set(1 - 0.15 * k, 1 + 0.4 * k, 1 - 0.15 * k);
    });
  }

  dispose(): void {
    this.unsubscribe();
    for (const material of this.own) material.dispose();
  }
}
