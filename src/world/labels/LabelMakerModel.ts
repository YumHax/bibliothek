import * as THREE from 'three';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { PROUD } from '../props/joinery';

const BODY = standard({ color: 0x2b2d31, roughness: 0.45, metalness: 0 });
const GRIP = standard({ color: 0xb3202a, roughness: 0.5, metalness: 0 });
const DIAL = paint(0xd8d4c8, 0.5);
const TAPE = standard({ color: 0x1e4c9f, roughness: 0.3, metalness: 0 });

/**
 * The embossing label maker SECOND HOME sells (a model, for its counter and the panels' thumbnails): a dark pistol-grip
 * body, the letter dial on top, the red squeeze handle under it, a blue tape poking out of its nose. Origin at its foot,
 * +z its front. The label maker itself is the K key at home (`game/Labelling`).
 */
export class LabelMakerModel extends THREE.Group {
  constructor() {
    super();
    this.name = 'LabelMaker';
    this.add(boxMesh(0.17, 0.035, 0.065, BODY, { y: 0.0175 }));
    this.add(boxMesh(0.09, 0.016, 0.05, GRIP, { x: 0.035, y: 0.035 + 0.008, z: -0.004 }));
    this.add(cylinderMesh(0.026, 0.008, DIAL, { x: -0.035, y: 0.035 + 0.004 }, { segments: 24 }));
    this.add(cylinderMesh(0.006, 0.012, BODY, { x: -0.035, y: 0.035 + 0.008 + 0.006 }, { segments: 10 }));
    // The tape out of its nose, a finished label still on it.
    this.add(boxMesh(0.03, 0.012, 0.0015, TAPE, { x: -0.1, y: 0.018, z: 0.0325 - 0.004 - PROUD }));
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }
}
