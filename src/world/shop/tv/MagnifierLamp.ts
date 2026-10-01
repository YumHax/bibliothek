import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, standard } from '../../materials/palette';
import { PooledLight } from '../../lighting/LightPool';
import { LAMP_LIGHT } from '../../lighting/lampColours';
import { Glows, type ShopFitting } from '../common/fitting';

export interface MagnifierLampOptions {
  /** How much light it throws on the bench (a `PooledLight`), 0 for none. Default 0.45. */
  light?: number;
}

const ENAMEL = paint(0xe8e4dc, 0.45);
const JOINT = paint(0x3a3c40, 0.5);
const SPRING = paint(0x9a9ea4, 0.35);
const LENS = standard({ color: 0xe8f0f0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false, envMapIntensity: 2 });
/** The arm's two limbs, metres, and how they are bent. */
const LOWER = 0.34;
const UPPER = 0.32;

/**
 * The repairer's magnifier lamp clamped to the back of the bench: a cream enamel arm in two limbs with its springs,
 * the round head with the lens and the ring tube glowing cool white round it, bent forward over the work. A
 * `ShopFitting` (the shop's switch works it); its light on the bench is a `PooledLight` (no shadow). Origin on the
 * bench top at the clamp, the head reaching +z. Decoration: never collides.
 */
export class MagnifierLamp extends Prop implements ShopFitting {
  readonly contactShadow = false;
  private readonly glows = new Glows();
  private readonly light: PooledLight | null;
  private readonly level: number;

  constructor(options: MagnifierLampOptions = {}) {
    super();
    this.name = 'MagnifierLamp';
    // The clamp over the bench's back edge, the pivot post.
    part(this, 0.05, 0.03, 0.06, JOINT, { y: 0.015 });
    this.add(cylinderMesh(0.01, 0.06, JOINT, { y: 0.06 }, { segments: 10 }));
    const shoulder = new THREE.Group();
    shoulder.position.y = 0.09;
    shoulder.rotation.x = 0.35;
    this.add(shoulder);
    shoulder.add(cylinderMesh(0.007, LOWER, ENAMEL, { y: LOWER / 2 }, { segments: 8 }));
    shoulder.add(cylinderMesh(0.003, LOWER * 0.8, SPRING, { y: LOWER / 2, z: -0.018 }, { segments: 6 }));
    const elbow = new THREE.Group();
    elbow.position.y = LOWER;
    elbow.rotation.x = 1.55;
    shoulder.add(elbow);
    elbow.add(cylinderMesh(0.014, 0.03, JOINT, {}, { segments: 12 }).rotateZ(Math.PI / 2));
    elbow.add(cylinderMesh(0.006, UPPER, ENAMEL, { y: UPPER / 2 }, { segments: 8 }));
    elbow.add(cylinderMesh(0.003, UPPER * 0.8, SPRING, { y: UPPER / 2, z: 0.016 }, { segments: 6 }));
    // The head, hung level-ish under the arm's end.
    const head = new THREE.Group();
    head.position.y = UPPER;
    // Undoes the arm's bends (0.35 + 1.55): the ring hangs level over the work.
    head.rotation.x = -1.9;
    elbow.add(head);
    const R = 0.075;
    const shell = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 8, 28), ENAMEL);
    shell.rotation.x = Math.PI / 2;
    shell.position.y = -0.03;
    head.add(shell);
    const tube = new THREE.Mesh(new THREE.TorusGeometry(R - 0.004, 0.007, 6, 28), this.glows.add({ kind: 'led', color: 0xf4f6f4, strength: 2.4, roughness: 0.3 }));
    tube.rotation.x = Math.PI / 2;
    tube.position.y = -0.044;
    head.add(tube);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(R - 0.012, 28), LENS);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = -0.03;
    head.add(lens);
    head.add(cylinderMesh(0.008, 0.05, JOINT, { y: -0.005, z: -R - 0.01 }, { segments: 8 }));
    this.level = options.light ?? 0.45;
    this.light = this.level > 0 ? new PooledLight(LAMP_LIGHT.led, this.level, 1.6, 2) : null;
    if (this.light) {
      this.light.position.y = -0.09;
      head.add(this.light);
    }
    this.traverse((o) => (o.castShadow = false));
    this.setLit(true);
  }

  setLit(on: boolean): void {
    this.glows.set(on ? 1 : 0);
    if (this.light) this.light.intensity = on ? this.level : 0;
  }
}
