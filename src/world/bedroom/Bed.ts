import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { FACING_OUT, eyePoseAt, invisibleHitbox } from '../meshUtils';
import { part } from '../props/Prop';
import { actionKeyLabel } from '@/ui/keys';
import { useCap } from '@/ui/verb';
import { timber, cloth as paletteCloth } from '@/world/materials/palette';
import { HoverGlint } from '../props/hoverGlint';
import { softPart } from '../props/softBlock';
import { ticking, wovenCloth } from '../materials/weave';

interface BedOptions {
  /** Width of the frame across the room (a double is 1.6). */
  width?: number;
  /** Length from the headboard to the foot (2.0 for a standard double). */
  length?: number;
  /** Colour of the duvet cover. */
  duvet?: number;
  /** Colour of the throw folded across the foot. */
  throw?: number;
  /** Which side the slippers are kicked off on, seen from the foot facing the headboard. */
  slippers?: 'left' | 'right' | 'none';
  /** False: no frame, legs or headboard, the mattress straight on the floor against the wall (the bare flat's bed). Default true. */
  frame?: boolean;
}

/** Frame: legs, a low platform and the headboard. */
const LEG = 0.1;
const PLATFORM = 0.22;
const HEADBOARD_H = 1.0;
const HEADBOARD_T = 0.05;
/** Mattress inset inside the frame on each side, and its thickness. */
const MATTRESS_INSET = 0.04;
const MATTRESS_H = 0.2;
/** How far from the headboard the duvet is turned back (the sheet and pillows show above it). */
const DUVET_FOLD = 0.7;
const DUVET_H = 0.11;
const PILLOW_W = 0.62;
const PILLOW_D = 0.42;
const PILLOW_H = 0.13;
/** How the bedding is stuffed (`props/softBlock`): pillows plump and pinched at the rim, a folded throw nearly flat. */
const PILLOW = { round: 3, pinch: 0.5 };
/** The fitted sheet: how far it stands over the mattress (top and sides), and how far down the sides it wraps. */
const SHEET_OVER = 0.006;
const SHEET_WRAP = 0.05;
const FOLDED = { round: 6, pinch: 0.1 };
/** Eye height above the mattress of someone sitting up against the pillows. */
const PROPPED_EYE = 0.62;

const OAK = timber(0x9c7a52, 0.55);
const SLATS = timber(0x7d6141, 0.7);
const TICKING = ticking();
const LINEN = wovenCloth(0xfaf7f0, 0.95);
const FELT = cloth(0x5a4a3e, 1);

/** The shared `fabric` of this colour and roughness (bedding, the slippers). */
function cloth(color: number, roughness: number): THREE.MeshStandardMaterial {
  return paletteCloth(color, roughness);
}

/**
 * A double bed with its head against a wall: oak platform frame on short legs, a plain
 * headboard, a mattress with the sheet showing, a duvet turned back below two pillows leaning
 * on the headboard, a throw folded across the foot and a pair of slippers kicked off beside it.
 * Wall-hung with `y: 0`: origin on the floor at the middle of the headboard, +z down the bed
 * into the room. Collides over the whole frame (mattress height). Clicking it gets the player into
 * bed, sitting up against the pillows on the left side and facing the foot (where a TV would stand);
 * clicking it again from there sleeps until morning (`SessionActions.sleep`). `setMade` swaps the
 * bedding between made and slept in (the builder follows the clock). `restingSpot` is where a cat curls up on the duvet at the other side.
 * `frame: false` is the bare flat's mattress on the floor, used the same way until a bed is bought.
 */
export class Bed extends THREE.Group implements Furniture, Interactable {
  readonly footprint: THREE.Box3;
  readonly hitboxes: THREE.Object3D[];
  private readonly eye: THREE.Vector3;
  private readonly catSpot: THREE.Vector3;
  private readonly catApproach: THREE.Vector3;
  /** The bedding as the day leaves it: made (duvet squared, pillows up, the throw folded), and slept in. */
  private readonly glint = HoverGlint.fittings(this);
  private readonly made = new THREE.Group();
  private readonly rumpled = new THREE.Group();
  private isMade = true;

  constructor(options: BedOptions = {}) {
    super();
    this.name = 'Bed';
    const width = options.width ?? 1.6;
    const length = options.length ?? 2.0;
    const duvet = wovenCloth(options.duvet ?? 0x6c7f93, 0.95);
    const throwCloth = wovenCloth(options.throw ?? 0xc48a4a, 0.95);
    const slippers = options.slippers ?? 'left';
    const framed = options.frame ?? true;

    // Frame: a platform on four stubby legs, the headboard standing on the floor against the wall.
    if (framed) {
      const platformY = LEG + PLATFORM / 2;
      part(this, width, PLATFORM, length, OAK, { y: platformY, z: length / 2 });
      for (const dx of [-width / 2 + 0.06, width / 2 - 0.06])
        for (const dz of [0.06, length - 0.06]) part(this, 0.07, LEG, 0.07, SLATS, { x: dx, y: LEG / 2, z: dz });
      part(this, width + 0.06, HEADBOARD_H, HEADBOARD_T, OAK, { y: HEADBOARD_H / 2, z: HEADBOARD_T / 2 });
    }

    // Mattress, with the fitted sheet reading as its top; the frame's ledge shows all round (on the floor, no frame).
    const mattressY = framed ? LEG + PLATFORM : 0;
    const mw = width - 2 * MATTRESS_INSET;
    const ml = length - MATTRESS_INSET - HEADBOARD_T;
    // A soft block in striped ticking (flat faces, rounded edges); the fitted sheet wraps its top and the top of its sides.
    softPart(this, mw, MATTRESS_H, ml, TICKING, { y: mattressY + MATTRESS_H / 2, z: HEADBOARD_T + ml / 2 }, { round: 8, pinch: 0.05 });
    const top = mattressY + MATTRESS_H;
    softPart(this, mw + 2 * SHEET_OVER, SHEET_WRAP, ml + 2 * SHEET_OVER, LINEN, { y: top + SHEET_OVER - SHEET_WRAP / 2, z: HEADBOARD_T + ml / 2 }, { round: 8, pinch: 0 }).castShadow = false;

    // The bedding comes in two states, one shown at a time (`setMade`): made, and slept in.
    this.add(this.made, this.rumpled);
    this.buildMade(width, length, mw, top, duvet, throwCloth, framed);
    this.buildRumpled(width, length, mw, top, duvet, throwCloth, framed);
    this.rumpled.visible = false;

    // The slippers on the floor by the side.
    if (slippers !== 'none') {
      const side = slippers === 'left' ? -1 : 1;
      const x = side * (width / 2 + 0.16);
      for (const [dz, yaw] of [
        [0, 0.1],
        [0.14, -0.25],
      ] as const) {
        const slipper = softPart(this, 0.1, 0.035, 0.27, FELT, { x, y: 0.018, z: length * 0.55 + dz }, { round: 3, pinch: 0.2 });
        slipper.rotation.y = side * yaw;
        slipper.castShadow = false;
      }
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.03, 0, 0), new THREE.Vector3(width / 2 + 0.03, top + DUVET_H, length + 0.03));
    const hitbox = invisibleHitbox(width, top + DUVET_H, length, { y: (top + DUVET_H) / 2, z: length / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.eye = new THREE.Vector3(-width / 4, top + PROPPED_EYE, HEADBOARD_T + 0.45);
    this.catSpot = new THREE.Vector3(width / 4, top + DUVET_H + 0.02, length - 0.55);
    this.catApproach = new THREE.Vector3(width / 4, 0, length + 0.3);
  }

  /** Made (the evening's tidy bed) or slept in (the morning's); the builder follows the clock. */
  setMade(made: boolean): void {
    if (made === this.isMade) return;
    this.isMade = made;
    this.made.visible = made;
    this.rumpled.visible = !made;
  }

  get bedMade(): boolean {
    return this.isMade;
  }

  /**
   * The made bed: the duvet a soft slab from the fold to the foot, hanging a little over the
   * sides, its turned-back edge a thicker roll; two pillows leaning on the headboard, one plumper
   * than the other; a throw folded in three across the foot.
   */
  private buildMade(width: number, length: number, mw: number, top: number, duvet: THREE.Material, throwCloth: THREE.Material, framed: boolean): void {
    const g = this.made;
    const duvetFrom = DUVET_FOLD;
    const duvetLen = length - duvetFrom + 0.05;
    softPart(g, mw + 0.12, DUVET_H, duvetLen, duvet, { y: top + DUVET_H / 2, z: duvetFrom + duvetLen / 2 }, { round: 4, pinch: 0.3, lumps: 0.012, seed: 3 });
    // The turned-back edge: a fat roll.
    softPart(g, mw + 0.12, DUVET_H + 0.05, 0.22, duvet, { y: top + (DUVET_H + 0.05) / 2, z: duvetFrom + 0.11 }, { round: 2.4, pinch: 0 });
    // Its sides drape past the mattress edge down the frame.
    for (const dx of [-(mw + 0.12) / 2 + 0.015, (mw + 0.12) / 2 - 0.015]) softPart(g, 0.03, 0.14, duvetLen, duvet, { x: dx, y: top - 0.04, z: duvetFrom + duvetLen / 2 }, { round: 3, pinch: 0 });

    for (const [dx, tilt, squash] of [
      [-width / 4, 0.32, 1],
      [width / 4, 0.42, 0.85],
    ] as const) {
      // Against the headboard; a mattress on the floor has none, so they lie nearly flat by the wall.
      const pillow = framed
        ? softPart(g, PILLOW_W, PILLOW_H * squash, PILLOW_D, LINEN, { x: dx, y: top + 0.12, z: HEADBOARD_T + 0.2 }, PILLOW)
        : softPart(g, PILLOW_W, PILLOW_H * squash, PILLOW_D, LINEN, { x: dx, y: top + (PILLOW_H * squash) / 2 + 0.01, z: HEADBOARD_T + 0.16 }, PILLOW);
      pillow.rotation.x = framed ? -tilt : -0.1;
    }

    softPart(g, mw * 0.8, 0.045, 0.4, throwCloth, { y: top + DUVET_H + 0.022, z: length - 0.3 }, FOLDED);
    softPart(g, mw * 0.8, 0.02, 0.36, throwCloth, { y: top + DUVET_H + 0.055, z: length - 0.29 }, FOLDED).castShadow = false;
  }

  /**
   * The bed slept in: the duvet shoved down and askew towards the far side (+x), the sleeper's
   * side (-x) thrown back in a bunched diagonal roll with a corner flipped over, the sheet showing
   * there; one pillow squashed flat and turned, the other slumped against the headboard; the
   * throw slid half off the foot.
   */
  private buildRumpled(width: number, length: number, mw: number, top: number, duvet: THREE.Material, throwCloth: THREE.Material, framed: boolean): void {
    const g = this.rumpled;
    const from = DUVET_FOLD + 0.25;
    const duvetLen = length - from + 0.05;
    const slab = softPart(g, mw + 0.08, DUVET_H * 0.9, duvetLen, duvet, { x: 0.05, y: top + DUVET_H * 0.45, z: from + duvetLen / 2 }, { round: 3.5, pinch: 0.35, lumps: 0.02, seed: 7 });
    slab.rotation.y = 0.06;
    // Only the far side still drapes over the edge; the near side was kicked back.
    softPart(g, 0.03, 0.14, duvetLen * 0.8, duvet, { x: (mw + 0.08) / 2 + 0.04, y: top - 0.04, z: from + duvetLen * 0.55 }, { round: 3, pinch: 0 });
    // The thrown-back roll across the bed on a slant, bulkier on the near side, and folds on the slab.
    const roll = softPart(g, mw * 0.95, DUVET_H + 0.1, 0.34, duvet, { x: -0.02, y: top + (DUVET_H + 0.1) / 2, z: from + 0.08 }, { round: 2.2, pinch: 0.1, lumps: 0.02, seed: 11 });
    roll.rotation.y = 0.28;
    const lump = softPart(g, mw * 0.4, DUVET_H + 0.14, 0.3, duvet, { x: -mw * 0.26, y: top + (DUVET_H + 0.14) / 2, z: from + 0.02 }, { round: 2.2, pinch: 0.2 });
    lump.rotation.y = -0.2;
    lump.rotation.z = 0.08;
    // The corner flipped back over the roll, lying on the sheet by the pillows.
    const corner = softPart(g, 0.5, 0.05, 0.42, duvet, { x: -mw * 0.3, y: top + 0.07, z: from - 0.3 }, { round: 3, pinch: 0.3 });
    corner.rotation.set(0.12, 0.5, -0.05);
    for (const [x, z, yaw] of [
      [0.25, from + 0.7, 0.5],
      [-0.1, from + 1.0, -0.35],
    ] as const) {
      const fold = softPart(g, 0.5, 0.04, 0.12, duvet, { x, y: top + DUVET_H * 0.9 + 0.012, z }, { round: 2.4, pinch: 0 });
      fold.rotation.y = yaw;
      fold.castShadow = false;
    }

    // Pillows: the sleeper's flat and turned half across the bed, the other slumped over sideways.
    const flat = softPart(g, PILLOW_W, PILLOW_H * 0.6, PILLOW_D, LINEN, { x: -width / 4 + 0.06, y: top + PILLOW_H * 0.3, z: HEADBOARD_T + 0.3 }, PILLOW);
    flat.rotation.set(0.04, -0.35, 0.02);
    const slumped = framed
      ? softPart(g, PILLOW_W, PILLOW_H * 0.85, PILLOW_D, LINEN, { x: width / 4 + 0.03, y: top + 0.1, z: HEADBOARD_T + 0.2 }, PILLOW)
      : softPart(g, PILLOW_W, PILLOW_H * 0.85, PILLOW_D, LINEN, { x: width / 4 + 0.03, y: top + PILLOW_H * 0.425 + 0.015, z: HEADBOARD_T + 0.18 }, PILLOW);
    if (framed) slumped.rotation.set(-0.3, 0.12, 0.22);
    else slumped.rotation.set(-0.08, 0.12, 0.1);

    // The throw, half slid off the foot: a fold still on the duvet, the rest hanging down the end.
    const onBed = softPart(g, mw * 0.6, 0.03, 0.3, throwCloth, { x: 0.15, y: top + DUVET_H * 0.9 + 0.015, z: length - 0.2 }, FOLDED);
    onBed.rotation.y = -0.18;
    // Down the end of the frame; from a mattress on the floor it only reaches the floor, where it gathers.
    const drop = framed ? 0.3 : top - 0.012;
    const hanging = part(g, mw * 0.6, drop, 0.03, throwCloth, { x: 0.2, y: framed ? top - 0.1 : 0.006 + drop / 2, z: length + 0.04 });
    hanging.rotation.set(framed ? 0.12 : 0.04, -0.18, 0);
    if (!framed) part(g, mw * 0.6, 0.025, 0.12, throwCloth, { x: 0.21, y: 0.0125, z: length + 0.1 }).rotation.y = -0.18;
  }

  /** World-space eye and camera yaw of someone sitting up in bed, facing the foot (+z). */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, this.eye, FACING_OUT);
  }

  /** World point on the duvet where a cat curls up; `approachPoint` is the floor at the foot it hops up from. */
  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.catSpot));
  }

  approachPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.catApproach));
  }

  // --- Interactable -------------------------------------------------------------------------

  /** Its small parts (the legs, the slippers by it) catch the light, never the bedding. */
  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(player: PlayerState): string {
    // The sleep is offered only at bedtime: by day the bed is somewhere to lie down, no promise of a night it would refuse.
    if (player.seatedIn === this) return player.sleepy ? 'Bed · sleep until morning' : 'Bed';
    return player.sleepy ? 'Bed · get in' : 'Bed · lie down';
  }

  /** Out of bed, a click gets in (up from any other seat first); in bed, it sleeps (moving or E gets up, as from any seat). */
  activate(session: SessionActions): void {
    if (session.seatedIn === this) {
      session.sleep();
      return;
    }
    if (session.seated) session.stand();
    session.sit(this);
    session.prompt(`[${useCap()}] sleep till morning · [${actionKeyLabel('standUp')}] get up`, { id: 'seated', until: () => session.seatedIn !== this });
  }
}
