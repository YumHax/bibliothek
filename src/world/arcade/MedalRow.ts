import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { basic, paint, standard } from '../materials/palette';
import { radialGlow } from '@/world/materials/glowTextures';
import { additive } from '@/world/materials/blend';
import { reduceMotion } from '@/settings/motion';
import type { Updatable } from '@/core/Engine';
import { Prop } from '../props/Prop';
import type { MedalBook, MedalTier } from './scoreTable';

const TIERS: MedalTier[] = ['bronze', 'silver', 'gold'];
const LIT: Record<MedalTier, number> = { bronze: 0xe0995a, silver: 0xe4e8f0, gold: 0xffd23a };
const RADIUS = 0.02;
const GAP = 0.052;
const UNLIT = paint(0x2a2630, 0.4);
const RIM = standard({ color: 0xb9bcc0, metalness: 1, roughness: 0.35 });
const FLASH_WHITE = basic({ color: 0xffffff });
/** A medal just won: its lamp blinks white and a halo swells and fades round it for this long (s). */
const FLASH_S = 3;
const BLINK_HZ = 6;

/**
 * Three medal lamps in a row, bronze to gold, lit once the player has earned that medal on the
 * machine (`MedalBook`): a glance down the hall says where there is still something to win.
 * Follows the book live; a medal won there and then flashes (the lamp blinks white, a halo
 * swells round it; its owner ticks it, `update`, or a `MedalRowTicker`) and `onEarned` lets the
 * machine play its sting. Origin at the middle lamp, facing +z; ~0.15 m wide.
 */
export class MedalRow extends THREE.Group implements Updatable {
  private readonly lamps: THREE.Mesh[] = [];
  private readonly unsubscribe: () => void;
  private readonly halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private earned: readonly MedalTier[];
  /** The lamp flashing, and how long it has been at it (s). */
  private flash: { lamp: THREE.Mesh; tier: MedalTier; t: number } | null = null;

  constructor(
    private readonly book: MedalBook,
    private readonly gameId: string,
    private readonly onEarned?: (tier: MedalTier) => void,
  ) {
    super();
    this.name = 'MedalRow';
    TIERS.forEach((tier, i) => {
      const x = (i - 1) * GAP;
      const rim = cylinderMesh(RADIUS + 0.004, 0.006, RIM, { x, z: 0.002 }, { segments: 18 });
      rim.rotation.x = Math.PI / 2;
      const lamp = cylinderMesh(RADIUS, 0.008, UNLIT, { x, z: 0.004 }, { segments: 18 });
      lamp.rotation.x = Math.PI / 2;
      lamp.userData.tier = tier;
      this.lamps.push(lamp);
      this.add(rim, lamp);
    });
    const material = new THREE.MeshBasicMaterial({ map: radialGlow({ width: 64, height: 64, stops: [[0, 1], [0.3, 0.5], [1, 0]] }), transparent: true, depthWrite: false, opacity: 0 });
    additive(material);
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), material);
    this.halo.position.z = 0.01;
    this.halo.visible = false;
    this.add(this.halo);
    this.earned = book.earned(gameId);
    this.refresh();
    this.unsubscribe = book.subscribe(() => this.refresh());
  }

  dispose(): void {
    this.unsubscribe();
    this.halo.geometry.dispose();
    this.halo.material.dispose();
  }

  private refresh(): void {
    const earned = this.book.earned(this.gameId);
    const fresh = TIERS.filter((tier) => earned.includes(tier) && !this.earned.includes(tier)).pop();
    this.earned = earned;
    for (const lamp of this.lamps) {
      const tier = lamp.userData.tier as MedalTier;
      lamp.material = earned.includes(tier) ? litMaterial(tier) : UNLIT;
    }
    if (!fresh) return;
    this.onEarned?.(fresh);
    const lamp = this.lamps[TIERS.indexOf(fresh)];
    if (!lamp || reduceMotion()) return;
    this.flash = { lamp, tier: fresh, t: 0 };
    this.halo.position.x = lamp.position.x;
    this.halo.material.color.setHex(LIT[fresh]);
    this.halo.visible = true;
  }

  /** One frame of a medal's flash: the lamp blinks white, the halo swells and fades; then the lamp stays lit. */
  update(dt: number): void {
    const flash = this.flash;
    if (!flash) return;
    flash.t += dt;
    const t = flash.t;
    if (t >= FLASH_S) {
      flash.lamp.material = litMaterial(flash.tier);
      this.halo.visible = false;
      this.flash = null;
      return;
    }
    const k = t / FLASH_S;
    flash.lamp.material = Math.floor(t * BLINK_HZ) % 2 === 0 ? FLASH_WHITE : litMaterial(flash.tier);
    this.halo.scale.setScalar(0.6 + k * 1.4);
    this.halo.material.opacity = (1 - k) * 0.9;
  }
}

/** Ticks medal rows that hang on a machine with no update of its own to call them (the physical machines'). */
export class MedalRowTicker extends Prop implements Updatable {
  constructor(private readonly rows: readonly MedalRow[]) {
    super();
    this.name = 'MedalRowTicker';
  }

  update(dt: number): void {
    for (const row of this.rows) row.update(dt);
  }
}

function litMaterial(tier: MedalTier): THREE.MeshBasicMaterial {
  return basic({ color: LIT[tier] });
}
