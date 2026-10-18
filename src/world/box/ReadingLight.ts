import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { GameBox } from '../GameBox';
import { frameKey } from '@/graphics/framing';
import { setReadingDim } from '@/graphics/readingDim';
import { dampFactor } from '@/math/damp';
import { reduceMotion } from '@/settings/motion';

/**
 * How bright the reading lamp is, as a share of the scene luminance the eye reads as middle grey (`graphics/framing`
 * `frameKey`): the same soft lift in a dark flat at night as at noon, never a glowing sticker.
 */
const LAMP = 1.4;
/** How fast the lamp and the shade come and go (1/s). */
const RATE = 6;

/** The hands as the lamp sees them: the box held, and whether the player is examining it (the Inspector's). */
interface ExaminingHands {
  readonly examining: boolean;
  readonly current: GameBox | null;
}

/** A paper out of the box read in front of the eye (`papers/PaperReader`): the lamp is on it rather than on the box. */
interface ReadPaper {
  readonly object: THREE.Object3D | null;
  setReading(radiance: number): void;
}

/**
 * The box examined up close (docs/media.md "Longplays and the box in hand") reads as if held under a lamp: its print
 * lights itself a little (`GameBox.setReading`) and the room round it goes into shade (`graphics/readingDim`), eased
 * in and out with the examining. Nothing is added to the scene.
 */
export class ReadingLight implements Updatable {
  private amount = 0;
  private lit: GameBox | null = null;
  private readonly bounds = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();
  private readonly eye = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(
    private readonly hands: ExaminingHands,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly paper: ReadPaper | null = null,
  ) {}

  update(dt: number): void {
    const box = this.hands.current;
    if (box !== this.lit) {
      this.lit?.setReading(0);
      this.lit = box;
    }
    // A paper out of the box takes the lamp (the box waits low in the hand, in the shade).
    const read = this.paper?.object ?? null;
    const wanted = (box && this.hands.examining) || read ? 1 : 0;
    this.amount += (wanted - this.amount) * dampFactor(reduceMotion() ? 30 : RATE, dt);
    if (wanted === 0 && this.amount < 0.002) this.amount = 0;
    const radiance = this.amount * LAMP * frameKey();
    box?.setReading(read ? 0 : radiance);
    this.paper?.setReading(read ? radiance : 0);
    const lit = read ?? box;
    if (!lit || this.amount === 0) return setReadingDim(0, 0.5, 0.5, 0.3);

    // The shade leaves a disc round what is read as it shows now (the box open, its cartridge lifted; a paper).
    this.bounds.setFromObject(lit);
    this.bounds.getBoundingSphere(this.sphere);
    this.camera.getWorldPosition(this.eye);
    const distance = Math.max(0.05, this.sphere.center.distanceTo(this.eye));
    this.at.copy(this.sphere.center).project(this.camera);
    if (this.at.z > 1) return setReadingDim(0, 0.5, 0.5, 0.3);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.getEffectiveFOV()) / 2);
    const radius = this.sphere.radius / (distance * halfHeight) / 2;
    setReadingDim(this.amount, (this.at.x + 1) / 2, (this.at.y + 1) / 2, radius);
  }
}
