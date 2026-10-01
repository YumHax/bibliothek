import * as THREE from 'three';
import { Prop } from '../../props/Prop';
import { cloth, paint, standard } from '../../materials/palette';

export interface CatTunnelOptions {
  /** Length. Default 0.8. */
  length?: number;
  /** The nylon's colour. Default a teal. */
  color?: number;
}

const RADIUS = 0.13;

/**
 * A crinkle tunnel for cats lying on the floor, a little bent: nylon over wire hoops (each hoop a ring, the cloth
 * between them sagging in), a peephole in its side and a pompom tied at one mouth. The shop's, on the floor for its
 * visiting cats. Static: its parts merge. Origin on the floor under its middle, its length along x. Decoration: the
 * player steps over it, never collides.
 */
export class CatTunnel extends Prop {
  constructor(options: CatTunnelOptions = {}) {
    super();
    this.name = 'CatTunnel';
    const length = options.length ?? 0.8;
    const color = options.color ?? 0x2f8a8a;
    const nylon = standard({ color, roughness: 0.55, side: THREE.DoubleSide });
    const hoop = paint(new THREE.Color(color).multiplyScalar(0.55).getHex(), 0.5);
    const hoops = Math.round(length / 0.1);
    const segment = length / hoops;
    for (let i = 0; i < hoops; i++) {
      const x = -length / 2 + segment * (i + 0.5);
      // A slight bend along its length, and each span sagging a touch narrower than its hoops.
      const bend = Math.sin((i / (hoops - 1)) * Math.PI) * 0.05;
      const span = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS * 0.96, RADIUS * 0.96, segment * 1.02, 16, 1, true), nylon);
      span.rotation.z = Math.PI / 2;
      span.position.set(x, RADIUS, bend);
      span.castShadow = true;
      this.add(span);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 0.005, 4, 20), hoop);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x - segment / 2, RADIUS, bend);
      this.add(ring);
    }
    const peep = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), paint(0x1a1a1c, 1));
    peep.position.set(length * 0.1, RADIUS + 0.02, RADIUS * 0.96 + 0.054);
    this.add(peep);
    const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), cloth(0xf0c040));
    pom.position.set(length / 2, RADIUS * 1.9, 0);
    this.add(pom);
  }
}
