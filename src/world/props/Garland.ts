import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { Prop } from './Prop';

/** `bulbs`: a string of warm fairground bulbs; `bunting`: triangular cloth flags on a string. */
export type GarlandStyle = 'bulbs' | 'bunting';

export interface GarlandOptions {
  style?: GarlandStyle;
  /** Distance between the two ends, along local +x from the origin. Default 3. */
  length?: number;
  /** Height of the two ends above the origin (a floor placement puts the origin on the floor). Default 2.4. */
  height?: number;
  /** How far the middle hangs below the ends. Default 0.25. */
  sag?: number;
  /** Distance along the string between two bulbs or flags. Default 0.3 for bulbs, 0.24 for bunting. */
  spacing?: number;
  /** Flag colours, cycled along the string (bunting), or the bulbs' glow colours (default one warm white). */
  colors?: number[];
  /** Varies the slight twist of each flag. */
  seed?: number;
}

const WIRE_RADIUS = 0.004;
const BULB_RADIUS = 0.028;
/** How far a bulb's centre hangs under the wire (its socket). */
const BULB_DROP = 0.04;
const FLAG_W = 0.17;
const FLAG_H = 0.22;
const BULB_GLOW = 1.8;
const BUNTING_COLORS = [0xc8443a, 0xf1e1b4, 0x2f6b8f, 0xe6a83a, 0x4f8a5a];

const WIRE = new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.7 });

/** The sag of a slack string between two points: a parabola, close enough to a catenary at this scale. */
class Slack extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly length: number,
    private readonly height: number,
    private readonly sag: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(t * this.length, this.height - this.sag * 4 * t * (1 - t), 0);
  }
}

/**
 * A string slung between two points, from the origin along local +x, sagging in the middle, with
 * fairground bulbs or bunting flags hung along it: what makes a market hall or a terrace look
 * dressed. One tube for the wire, one `InstancedMesh` for everything hanging from it, no light of
 * its own (the bulbs only glow). Decoration: never collides, casts nothing.
 */
export class Garland extends Prop {
  constructor(options: GarlandOptions = {}) {
    super();
    const style = options.style ?? 'bulbs';
    this.name = `Garland:${style}`;
    const length = options.length ?? 3;
    const height = options.height ?? 2.4;
    const sag = options.sag ?? 0.25;
    const spacing = options.spacing ?? (style === 'bulbs' ? 0.3 : 0.24);
    const random = seededRandom(options.seed ?? 7);
    const curve = new Slack(length, height, sag);

    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, WIRE_RADIUS, 5, false), WIRE);
    wire.castShadow = false;
    this.add(wire);

    const count = Math.max(1, Math.floor(length / spacing) - 1);
    const geometry = style === 'bulbs' ? new THREE.SphereGeometry(BULB_RADIUS, 10, 8) : flagGeometry();
    const material =
      style === 'bulbs'
        ? new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffc46e, emissiveIntensity: BULB_GLOW, roughness: 0.3 })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
    const hung = new THREE.InstancedMesh(geometry, material, count);
    hung.castShadow = false;
    hung.receiveShadow = style === 'bunting';
    const colors = options.colors ?? (style === 'bunting' ? BUNTING_COLORS : null);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      curve.getPoint(t, position);
      if (style === 'bulbs') {
        position.y -= BULB_DROP;
        quaternion.identity();
      } else {
        // Flags hang from the string and twist a little each, as cloth does.
        euler.set(0, (random() - 0.5) * 0.5, (random() - 0.5) * 0.12);
        quaternion.setFromEuler(euler);
      }
      matrix.compose(position, quaternion, scale);
      hung.setMatrixAt(i, matrix);
      if (colors) hung.setColorAt(i, color.setHex(colors[i % colors.length]!));
    }
    hung.instanceMatrix.needsUpdate = true;
    if (hung.instanceColor) hung.instanceColor.needsUpdate = true;
    this.add(hung);

    if (style === 'bulbs') {
      // A socket under each bulb's wire: one instanced short cylinder, dark like the wire.
      const sockets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.01, BULB_DROP - BULB_RADIUS + 0.01, 6), WIRE, count);
      sockets.castShadow = false;
      for (let i = 0; i < count; i++) {
        curve.getPoint((i + 1) / (count + 1), position);
        position.y -= (BULB_DROP - BULB_RADIUS) / 2;
        matrix.compose(position, quaternion.identity(), scale);
        sockets.setMatrixAt(i, matrix);
      }
      sockets.instanceMatrix.needsUpdate = true;
      this.add(sockets);
    }
  }
}

/** A pennant hanging point-down from its top edge, in the string's plane (xy), hem on the string. */
function flagGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-FLAG_W / 2, 0);
  shape.lineTo(FLAG_W / 2, 0);
  shape.lineTo(0, -FLAG_H);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
