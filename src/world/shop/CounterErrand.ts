import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { currentSeason } from '@/time/season';
import { errandOf, type ErrandId } from '@/errands/errands';
import { buyErrand } from '@/errands/buy';
import { pocket } from '@/errands/pocket';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { formatCoins } from '@/text/money';
import { capitalise } from '@/text/strings';

/** The season's blooms in the florist's bunches. */
const BLOOMS = { spring: 0xd8344a, summer: 0xf2c230, autumn: 0xc8502a, winter: 0xe8e0e8 } as const;

/**
 * Something on a walk-in shop's counter that is sold to be used up (`errands/`), not for the flat: the pet shop's
 * pouches of treats, the florist's bunches of the season's flowers (three for two). The caption says what and how much,
 * and how many the player carries; a click buys it (the clerk's thanks and the till follow, `onBought`). Origin on the
 * counter's top, +z towards the customer; never collides.
 */
export class CounterErrand extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  /** `portions` may change how many one buy puts in the pocket (a friend of the florist's: four bunches for two). */
  constructor(private readonly errand: ErrandId, private readonly onBought: () => void, private readonly portions?: (errand: ErrandId, base: number) => number) {
    super();
    this.name = `CounterErrand:${errand}`;
    if (errand === 'bunch') this.buildBunches();
    else this.buildPouches(errand === 'treats' ? 0x2f7a8a : 0xe8dcc6);
    const hitbox = invisibleHitbox(0.3, 0.18, 0.2, { y: 0.09 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // On the counter: the caption says it all.
  }

  label(): string {
    const e = errandOf(this.errand, currentSeason().name);
    const carried = pocket.count(this.errand);
    return `${capitalise(e.title)} · ${formatCoins(e.price)}${carried ? ` · you carry ${carried}` : ''}`;
  }

  activate(session: SessionActions): void {
    const e = errandOf(this.errand, currentSeason().name);
    const portions = this.portions?.(this.errand, e.portions) ?? e.portions;
    const bought = portions > e.portions ? `${e.bought} And one more: “For a friend.”` : e.bought;
    buyErrand(session, { ...e, portions, bought }, '“That’s the last of them till tomorrow.”', this.onBought);
  }

  /** Three pouches standing in a row, a fish on each (a paper band). */
  private buildPouches(color: number): void {
    const body = paint(color, 0.5);
    const band = paint(0xf2ecdc, 0.8);
    for (const [i, x] of [-0.08, 0, 0.08].entries()) {
      const pouch = boxMesh(0.07, 0.11, 0.025, body, { x, y: 0.055, z: i === 1 ? 0.02 : 0 });
      pouch.rotation.z = (i - 1) * 0.06;
      pouch.add(boxMesh(0.072, 0.025, 0.027, band, { y: 0.01 }));
      this.add(pouch);
    }
  }

  /** Bunches lying in brown paper, their heads in the season's colour. */
  private buildBunches(): void {
    const paper = paint(0xa8865a, 0.9);
    const stems = paint(0x3f6a2a, 0.8);
    const bloom = paint(BLOOMS[currentSeason().name], 0.7);
    for (const [i, z] of [-0.05, 0.03].entries()) {
      const bunch = new THREE.Group();
      const wrap = cylinderMesh(0.035, 0.24, paper, { x: 0 }, { radiusBottom: 0.012, segments: 10 });
      wrap.rotation.z = Math.PI / 2;
      bunch.add(wrap);
      bunch.add(cylinderMesh(0.004, 0.08, stems, { x: -0.15 }, { segments: 5 }).rotateZ(Math.PI / 2));
      for (const [dy, dz] of [[0.012, 0], [-0.01, 0.018], [0.004, -0.02]] as const) bunch.add(cylinderMesh(0.022, 0.03, bloom, { x: 0.13, y: dy, z: dz }, { segments: 8 }));
      bunch.position.set(i * 0.02, 0.036, z);
      bunch.rotation.y = (i - 0.5) * 0.3;
      this.add(bunch);
    }
  }
}
