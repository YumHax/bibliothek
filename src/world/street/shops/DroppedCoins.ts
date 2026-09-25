import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playCoins } from '@/audio/coins';
import { hashString, seededRandom } from '@/covers/generated/canvasUtils';
import { dayKey, fromUnpaddedDayKey } from '@/economy/calendar';
import { KEYS, PersistedStore } from '@/persistence';
import { withDay } from '../DailyTally';
import { invisibleHitbox } from '../../meshUtils';
import type { Furniture } from '../../Furniture';
import type { Vec2 } from '../streetPlan';

export interface DroppedCoinsOptions {
  /** Where a coin may lie (zone-local), and how many lie about a day. */
  spots: readonly Vec2[];
  perDay: number;
  /** Puts a coin in the zone (so it is clickable) and takes it out once picked up. */
  host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void };
  purse: { earnCoins(coins: number): void };
  /** The eye: a coin glints when the player is near enough to notice it. */
  viewer: THREE.Object3D;
}

/** A coin glints for the player within this distance. */
const GLINT_RANGE = 9;
const LINES = ['A coin in the gutter. Finders keepers.', 'A coin, face up. Lucky.', 'Someone’s change, lost between the slabs.', 'A coin, a little bent. It still counts.'];

interface FindsFile {
  /** The local day (`dayKey`). */
  day: string;
  /** The spots picked clean that day (indices into `spots`). */
  picked: number[];
}

/**
 * Version 2: `day` is a `dayKey` (YYYY-MM-DD); version 1 wrote it unpadded (`2026-9-5`), read as
 * the same day. Without storage (private mode) a coin comes back on the next visit.
 */
const store = new PersistedStore<FindsFile>({
  key: KEYS.finds,
  version: 2,
  defaults: () => ({ day: '', picked: [] }),
  read: (data) => {
    if (typeof data !== 'object' || data === null) return null;
    const { day, picked } = data as Partial<FindsFile>;
    if (typeof day !== 'string' || !Array.isArray(picked)) return null;
    return { day, picked: picked.filter((n) => Number.isInteger(n)) };
  },
  migrate: { 1: (data) => withDay(data, fromUnpaddedDayKey) },
});

/** The spots already picked clean today (remembered across reloads). */
function pickedToday(): number[] {
  const saved = store.load();
  return saved.day === dayKey() ? saved.picked : [];
}

function recordPicked(spot: number): void {
  store.save({ day: dayKey(), picked: [...pickedToday(), spot] });
}

/**
 * The coins people drop on Front Street: a few a (real) day at spots drawn from the date, each a
 * small worn disc on the slabs that glints now and then when the player is near (a star of light,
 * additive, alpha kept). Clicking one pockets it (a coin in the wallet, the clink); a picked spot
 * stays empty till tomorrow, reloads included.
 */
export class DroppedCoins extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly coins: DroppedCoin[] = [];

  constructor(private readonly options: DroppedCoinsOptions) {
    super();
    this.name = 'DroppedCoins';
    const random = seededRandom(hashString(`coins:${dayKey()}`));
    const picked = new Set(pickedToday());
    const order = options.spots.map((_, i) => i).sort(() => random() - 0.5);
    const layout = order.slice(0, options.perDay);
    // Picks off another layout (drawn under the old day format, or before `spots` changed) still count against today's few.
    let owed = [...picked].filter((spot) => !layout.includes(spot)).length;
    for (const spot of layout) {
      if (picked.has(spot)) continue;
      if (owed > 0) {
        owed--;
        continue;
      }
      const [x, z] = options.spots[spot]!;
      const coin: DroppedCoin = new DroppedCoin(random() * 10, (): string => this.pick(coin, spot));
      options.host.place(coin, new THREE.Vector3(x, 0, z), random() * Math.PI * 2);
      this.coins.push(coin);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    for (const coin of this.coins) coin.glint(dt, this.options.viewer);
  }

  private pick(coin: DroppedCoin, spot: number): string {
    recordPicked(spot);
    this.options.purse.earnCoins(1);
    playCoins(1, 0.1);
    this.coins.splice(this.coins.indexOf(coin), 1);
    this.options.host.remove(coin);
    return LINES[spot % LINES.length]!;
  }
}

const COIN_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.35 });
const GLINT_TEXTURE = glintTexture();

/** One coin on the pavement: the disc, its glint, the click. */
class DroppedCoin extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly spark: THREE.Sprite;
  private readonly here = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();

  constructor(private phase: number, private readonly onPick: () => string) {
    super();
    this.name = 'DroppedCoin';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.0022, 16), COIN_MATERIAL);
    disc.position.y = 0.0015;
    disc.rotation.x = 0.04;
    this.add(disc);
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLINT_TEXTURE,
      color: 0xfff2c0,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      opacity: 0,
    }));
    this.spark.scale.setScalar(0.09);
    this.spark.position.y = 0.012;
    this.spark.renderOrder = 3;
    this.add(this.spark);
    // A generous hitbox: a coin is tiny from eye height.
    const hitbox = invisibleHitbox(0.3, 0.12, 0.3, { y: 0.06 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // The caption says it all.
  }

  label(): string {
    return 'Click to pick up the coin';
  }

  activate(session: SessionActions): void {
    session.hint(this.onPick());
  }

  /** A short twinkle every few seconds while the player is close enough to catch it. */
  glint(dt: number, viewer: THREE.Object3D): void {
    this.phase += dt;
    viewer.getWorldPosition(this.eye);
    this.getWorldPosition(this.here);
    const near = this.here.distanceTo(this.eye) < GLINT_RANGE;
    const t = this.phase % 3.2;
    const flash = t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : 0;
    const material = this.spark.material;
    material.opacity = near ? flash : 0;
    material.rotation = this.phase * 0.6;
    this.spark.visible = material.opacity > 0.01;
  }
}

/** A four-pointed star of light. */
function glintTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    ctx.moveTo(c, c);
    ctx.lineTo(c + dx * c + dy * 2, c + dy * c + dx * 2);
    ctx.lineTo(c + dx * c - dy * 2, c + dy * c - dx * 2);
  }
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
