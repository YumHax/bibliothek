import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { FACING_OUT, cylinderMesh, eyePoseAt, invisibleHitbox } from '../meshUtils';
import { part } from './Prop';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { fabric } from '@/world/materials/finishes';

export interface BedroomChairOptions {
  /** Colour of the shirt thrown over the back; `null` for a bare chair. */
  shirt?: number | null;
  /** Colour of the jeans folded on the seat; `null` for none. */
  jeans?: number | null;
}

const SEAT = 0.42;
const SEAT_Y = 0.45;
const BACK_Y = 0.9;
const LEG_R = 0.018;
/** Eye height of someone sitting on it, above the floor. */
const SEATED_EYE = 1.18;
/** Colours the day's extra clothes come in: knitwear, cotton, a flannel check's red. */
const GARMENT_COLOURS = [0x8a4b3c, 0x3f5a4a, 0xd9cdb4, 0x2e3a52, 0xb9893f, 0x6b5a7a, 0x9aa6ad, 0x5b3b2e];
/** How many extra garments a day brings, drawn from this list: most days one or two, now and then a heap. */
const PILE_SIZES = [0, 1, 1, 2, 2, 3, 4];

const BEECH = woodMaterial(0xc9a97a, 0.6);

/** One of the day's extra clothes: its parts, its cloth (recoloured by the day), how thick it is once piled on the seat (0 = it hangs). */
interface Garment {
  group: THREE.Group;
  cloth: THREE.MeshStandardMaterial;
  pile: number;
}

/**
 * A plain wooden bedroom chair, the kind clothes end up on: four turned legs, a seat, two back
 * posts with two slats, a shirt thrown over the back and a pair of jeans folded on the seat, and
 * whatever else the day added (`setDay`: a jumper, a T-shirt, a cardigan over the back, a scarf
 * down a post, seeded by the day so the heap changes each morning and stays put through the day).
 * Clicking it sits the player down. Origin on the floor under the middle of the seat; the back
 * is at -z, so it faces +z. Collides at its seat.
 */
export class BedroomChair extends THREE.Group implements Furniture, Interactable {
  readonly footprint: THREE.Box3;
  readonly hitboxes: THREE.Object3D[];
  private readonly garments: Garment[] = [];
  /** Top of the folded jeans (or the seat): where the day's pile starts. */
  private readonly pileBase: number;
  private day = -1;

  constructor(options: BedroomChairOptions = {}) {
    super();
    this.name = 'BedroomChair';
    const shirt = options.shirt === undefined ? 0xe8eef2 : options.shirt;
    const jeans = options.jeans === undefined ? 0x3d4d6b : options.jeans;
    const half = SEAT / 2;

    part(this, SEAT, 0.035, SEAT, BEECH, { y: SEAT_Y - 0.0175 });
    const legInset = half - 0.03;
    for (const dx of [-legInset, legInset]) {
      for (const dz of [-legInset, legInset]) this.add(cylinderMesh(LEG_R, SEAT_Y - 0.035, BEECH, { x: dx, y: (SEAT_Y - 0.035) / 2, z: dz }, { radiusBottom: LEG_R * 0.75, segments: 10 }));
      // Back posts continue up from the rear legs, leaning back a touch.
      const post = cylinderMesh(LEG_R, BACK_Y - SEAT_Y + 0.02, BEECH, { x: dx, y: SEAT_Y + (BACK_Y - SEAT_Y) / 2, z: -legInset - 0.02 }, { segments: 10 });
      post.rotation.x = 0.1;
      this.add(post);
    }
    for (const y of [BACK_Y - 0.06, BACK_Y - 0.22]) {
      const slat = part(this, SEAT - 0.06, 0.06, 0.016, BEECH, { y, z: -legInset - 0.02 - (y - SEAT_Y) * 0.1 });
      slat.rotation.x = 0.1;
    }

    if (shirt !== null) {
      // The shirt hangs over the top rail: a body folded in two down the back, sleeves dangling.
      const cloth = fabric({ color: shirt, roughness: 0.95 });
      const drape = part(this, 0.36, 0.42, 0.05, cloth, { y: BACK_Y - 0.2, z: -legInset - 0.07 });
      drape.rotation.x = 0.1;
      part(this, 0.34, 0.16, 0.04, cloth, { y: BACK_Y - 0.09, z: -legInset + 0.02 });
      for (const dx of [-0.2, 0.2]) part(this, 0.07, 0.3, 0.04, cloth, { x: dx, y: BACK_Y - 0.28, z: -legInset - 0.06 }).castShadow = false;
    }
    if (jeans !== null) {
      const denim = fabric({ color: jeans, roughness: 1 });
      const fold = part(this, 0.3, 0.05, 0.24, denim, { y: SEAT_Y + 0.025, z: 0.02 });
      fold.rotation.y = -0.2;
      part(this, 0.24, 0.03, 0.2, denim, { y: SEAT_Y + 0.065, z: 0.03 }).castShadow = false;
    }
    this.pileBase = jeans !== null ? SEAT_Y + 0.08 : SEAT_Y;
    this.buildGarments(legInset);
    this.setDay(1);

    this.footprint = new THREE.Box3(new THREE.Vector3(-half, 0, -half - 0.08), new THREE.Vector3(half, BACK_Y, half));
    const hitbox = invisibleHitbox(SEAT + 0.04, BACK_Y, SEAT + 0.1, { y: BACK_Y / 2, z: -0.04 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** Shows the clothes day `day` left on the chair (same day, same heap). */
  setDay(day: number): void {
    if (day === this.day) return;
    this.day = day;
    const random = seededRandom(day * 7919 + 17);
    const count = PILE_SIZES[Math.floor(random() * PILE_SIZES.length)]!;
    // Which garments, in which order: a shuffle of the list, the first `count` shown.
    const order = this.garments.map((_, i) => i).sort(() => random() - 0.5);
    const shown = new Set(order.slice(0, count));
    let y = this.pileBase;
    this.garments.forEach((garment, i) => {
      garment.group.visible = shown.has(i);
      if (!shown.has(i)) return;
      garment.cloth.color.setHex(GARMENT_COLOURS[Math.floor(random() * GARMENT_COLOURS.length)]!);
      if (garment.pile > 0) {
        garment.group.position.y = y;
        y += garment.pile;
      }
    });
  }

  /**
   * The extra clothes, all built once and shown by the day: two that pile on the seat (a folded
   * jumper, a T-shirt tossed on crooked; group origin at the bottom of each) and two that hang (a
   * cardigan over the top rail, a scarf down the left post).
   */
  private buildGarments(legInset: number): void {
    const garment = (pile: number): Garment => {
      const group = new THREE.Group();
      const cloth = fabric({ color: 0xffffff, roughness: 0.95 });
      this.add(group);
      const g = { group, cloth, pile };
      this.garments.push(g);
      return g;
    };
    const jumper = garment(0.055);
    const folded = part(jumper.group, 0.27, 0.055, 0.21, jumper.cloth, { x: 0.02, y: 0.0275, z: 0.04 });
    folded.rotation.y = 0.15;
    const tee = garment(0.035);
    const tossed = part(tee.group, 0.24, 0.035, 0.2, tee.cloth, { x: -0.04, y: 0.0175, z: 0.07 });
    tossed.rotation.set(0.05, -0.5, 0.06);
    const sleeve = part(tee.group, 0.07, 0.02, 0.16, tee.cloth, { x: 0.13, y: 0.01, z: 0.14 });
    sleeve.rotation.y = 0.4;
    sleeve.castShadow = false;

    const cardigan = garment(0);
    const back = part(cardigan.group, 0.4, 0.34, 0.03, cardigan.cloth, { y: BACK_Y - 0.15, z: -legInset - 0.1 });
    back.rotation.x = 0.1;
    part(cardigan.group, 0.38, 0.1, 0.03, cardigan.cloth, { y: BACK_Y - 0.04, z: -legInset + 0.005 }).castShadow = false;
    part(cardigan.group, 0.4, 0.03, 0.12, cardigan.cloth, { y: BACK_Y + 0.01, z: -legInset - 0.05 }).castShadow = false;
    const scarf = garment(0);
    part(scarf.group, 0.07, 0.62, 0.015, scarf.cloth, { x: -legInset - 0.01, y: BACK_Y - 0.3, z: -legInset - 0.045 }).castShadow = false;
    part(scarf.group, 0.07, 0.015, 0.06, scarf.cloth, { x: -legInset - 0.01, y: BACK_Y + 0.02, z: -legInset - 0.02 }).castShadow = false;
  }

  /** World-space eye and camera yaw of someone sitting on it, facing +z. */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, new THREE.Vector3(0, SEATED_EYE, 0.05), FACING_OUT);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(player: PlayerState): string {
    return player.seatedIn === this ? 'Click to get up' : 'Click to sit down';
  }

  activate(session: SessionActions): void {
    const here = session.seatedIn === this;
    if (session.seated) session.stand();
    if (!here) session.sit(this);
  }
}
