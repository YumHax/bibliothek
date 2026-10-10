import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { METAL, paint, standard } from '../materials/palette';
import { SEAM } from '../props/joinery';

/** The bibelots there are: a porcelain lady in a crinoline, a sitting dog, a little vase of dried flowers. */
type FigurineKind = 'lady' | 'dog' | 'vase';

const BASE = 0.008;

/**
 * One of Mémé's bibelots (`furnishGrandmaDecor`): glazed porcelain on a gilt-edged base. Origin on the surface under
 * its middle. Decoration: never collides.
 */
export class Figurine extends Prop {
  readonly contactShadow = false;

  constructor(kind: FigurineKind) {
    super();
    this.name = `Figurine:${kind}`;
    const glaze = standard({ color: 0xf6f2ea, roughness: 0.15, metalness: 0 });
    const gilt = METAL.brass();
    this.add(cylinderMesh(0.035, BASE, gilt, { y: BASE / 2 }, { segments: 20 }));
    const y = BASE + SEAM;
    if (kind === 'lady') {
      // A crinoline, the bodice, the head, a parasol held up.
      this.add(cylinderMesh(0.012, 0.07, standard({ color: 0xb8d0e8, roughness: 0.15, metalness: 0 }), { y: y + 0.035 }, { radiusBottom: 0.032, segments: 18 }));
      this.add(cylinderMesh(0.01, 0.035, glaze, { y: y + 0.07 + SEAM + 0.0175 }, { radiusBottom: 0.012, segments: 12 }));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), glaze);
      head.position.y = y + 0.117;
      this.add(head);
      const parasol = cylinderMesh(0.022, 0.012, paint(0xe8b0c0, 0.3), { x: 0.018, y: y + 0.14 }, { radiusBottom: 0.004, segments: 12 });
      this.add(parasol);
    } else if (kind === 'dog') {
      // A spaniel sitting: haunches, chest, head, two dark ears.
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), glaze);
      body.scale.set(1, 1.1, 1.2);
      body.position.set(0, y + 0.026, -0.01);
      this.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), glaze);
      head.position.set(0, y + 0.068, 0.012);
      this.add(head);
      const brown = paint(0x6a3a22, 0.3);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), brown);
        ear.scale.set(0.6, 1.6, 0.8);
        ear.position.set(s * 0.017, y + 0.062, 0.01);
        this.add(ear);
      }
    } else {
      // A bulb vase, painted with a blue band, three dried stems in it.
      this.add(cylinderMesh(0.012, 0.09, glaze, { y: y + 0.045 }, { radiusBottom: 0.03, segments: 18 }));
      this.add(cylinderMesh(0.0225, 0.012, paint(0x2e4a7a, 0.3), { y: y + 0.03 }, { radiusBottom: 0.027, segments: 18 }));
      const stem = paint(0x9a7a4a, 0.9);
      for (let i = 0; i < 3; i++) {
        const s = cylinderMesh(0.0015, 0.12, stem, { x: (i - 1) * 0.008, y: y + 0.09 + 0.05 }, { segments: 4 });
        s.rotation.z = (i - 1) * 0.25;
        s.castShadow = false;
        this.add(s);
      }
    }
  }
}
