import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { getPrize } from '@/economy/Prizes';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { standard } from '../materials/palette';
import { playCabinetJingle, playGlobeShake, playTapeTune } from '@/audio/shelfToySounds';
import { random } from '@/random';

/** What a click on each trophy-row toy does: the globe snows confetti, the tape plays its side B, the mini cabinet runs its attract tune. */
type ShelfToyKind = 'snowGlobe' | 'jukeboxTape' | 'miniCabinet';

interface ShelfToyOptions {
  kind: ShelfToyKind;
  /** Where the prize stands on the shelf now (shelf-local), or null while it is not there (`PrizeShelf.spotOf`). */
  spot: () => THREE.Vector3 | null;
}

/** Far under the floor: the hitbox while the prize is not on the shelf. */
const HIDDEN_Y = -50;
const CONFETTI = { count: 14, seconds: 2.2, colours: [0xff2fa0, 0x33e0ff, 0xffd23a, 0x7ee787, 0xffffff] };
/** The confetti's palette materials (shared, asked for once a globe is shaken). */
const confettiMaterial = (i: number): THREE.Material => {
  const color = CONFETTI.colours[i % CONFETTI.colours.length]!;
  return standard({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.3 });
};
const LINES: Record<ShelfToyKind, { label: string; says: readonly string[] }> = {
  snowGlobe: { label: 'Arcade snow globe · shake it', says: ['A blizzard of confetti over the tiny hall.', 'Neon snow settles on the little cabinets.'] },
  jukeboxTape: { label: 'Jukebox tape · play side B', says: ['Side B, all italo. You can hear the hall in it.', 'A synth line from the jukebox, a little warbly on tape.'] },
  miniCabinet: { label: 'Mini cabinet · press start', says: ['Its little speaker plays the attract tune.', 'Plink-plonk: the shoebox cabinet’s jingle.'] },
};

/**
 * One of the trophy row's toys made to be played with (docs/household.md "The arcade's prizes at home"): an invisible
 * hitbox where the prize stands on the prize shelf, a click shakes, plays or starts it. Placed with the shelf at the
 * shelf's origin (`placeWith`, shelf-local), the hitbox follows the prize's slot as the row fills; out of reach while
 * the prize is not home. Never collides.
 */
export class ShelfToy extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly hitbox: THREE.Object3D;
  private readonly flakes: { mesh: THREE.Mesh; vy: number; vx: number; spin: number }[] = [];
  private flakeClock = 0;
  private said = 0;

  constructor(private readonly options: ShelfToyOptions) {
    super();
    this.name = `ShelfToy:${options.kind}`;
    this.hitbox = invisibleHitbox(0.09, 0.12, 0.09, { y: 0.06 });
    this.hitboxes = [this.hitbox];
    this.add(this.hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {}

  label(): string | null {
    return this.options.spot() ? LINES[this.options.kind].label : null;
  }

  activate(session: SessionActions): void {
    const spot = this.options.spot();
    if (!spot) return;
    const { kind } = this.options;
    if (kind === 'snowGlobe') {
      playGlobeShake();
      this.snow(spot);
    } else if (kind === 'jukeboxTape') playTapeTune();
    else playCabinetJingle();
    const says = LINES[kind].says;
    session.react(says[this.said++ % says.length]!);
  }

  update(dt: number): void {
    const spot = this.options.spot();
    // The hitbox's centre half its height over the prize's foot (as built: `y` 0.06).
    if (spot) this.hitbox.position.set(spot.x, spot.y + 0.06, spot.z);
    else this.hitbox.position.y = HIDDEN_Y;
    if (!this.flakes.length) return;
    this.flakeClock -= dt;
    for (const f of this.flakes) {
      f.mesh.position.y = Math.max(f.mesh.userData.floor as number, f.mesh.position.y + f.vy * dt);
      f.mesh.position.x += f.vx * dt;
      f.mesh.rotation.z += f.spin * dt;
      f.vy -= 0.05 * dt;
    }
    if (this.flakeClock <= 0) this.clearSnow();
  }

  /** A puff of confetti over the globe, drifting down onto its base. */
  private snow(spot: THREE.Vector3): void {
    this.clearSnow();
    for (let i = 0; i < CONFETTI.count; i++) {
      const mesh = boxMesh(0.004, 0.004, 0.001, confettiMaterial(i));
      mesh.castShadow = false;
      mesh.position.set(spot.x + (random() - 0.5) * 0.04, spot.y + 0.07 + random() * 0.02, spot.z + (random() - 0.5) * 0.03);
      mesh.userData.floor = spot.y + 0.025;
      this.add(mesh);
      this.flakes.push({ mesh, vy: 0.01 + random() * 0.02, vx: (random() - 0.5) * 0.01, spin: (random() - 0.5) * 6 });
    }
    this.flakeClock = CONFETTI.seconds;
  }

  private clearSnow(): void {
    for (const f of this.flakes) this.remove(f.mesh);
    this.flakes.length = 0;
  }
}

/** The toys a prize shelf offers to play with, those whose prize exists. */
export const SHELF_TOYS: readonly ShelfToyKind[] = (['snowGlobe', 'jukeboxTape', 'miniCabinet'] as const).filter((id) => getPrize(id) !== undefined);
