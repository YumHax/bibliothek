import * as THREE from 'three';
import { METAL, paint } from '../materials/palette';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { Prop } from '../props/Prop';

/** The boiler: a squat cream tank on its plinth, a flue up into the vault, a pressure dial, two pipes. */
export class Boiler extends Prop {
  readonly contactShadow = true;

  constructor() {
    super();
    this.name = 'Boiler';
    const enamel = paint(0xd8d0bc, 0.5);
    const iron = paint(0x2a2826, 0.6);
    this.add(boxMesh(0.62, 0.1, 0.62, iron, { y: 0.05 }));
    this.add(cylinderMesh(0.28, 1.2, enamel, { y: 0.7 }, { segments: 20 }));
    this.add(cylinderMesh(0.07, 0.75, iron, { y: 1.68 }, { segments: 10 }));
    const dial = cylinderMesh(0.06, 0.012, METAL.brass(), { x: -0.28, y: 1.05 }, { segments: 16 });
    dial.rotation.z = Math.PI / 2;
    this.add(dial);
    for (const z of [-0.18, 0.18]) this.add(cylinderMesh(0.025, 1.4, METAL.satinSteel(), { x: 0.2, y: 0.9, z }, { segments: 8 }));
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.32, 0, -0.32), new THREE.Vector3(0.32, 1.3, 0.32));
  }
}
