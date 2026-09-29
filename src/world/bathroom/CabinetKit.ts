import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { paint, standard } from '../materials/palette';
import { CLEAR_GLASS } from '../props/bathroomMaterials';

/**
 * The cleaning kit waiting on the mirror cabinet's bottom shelf: a bottle of isopropyl and a jar of cotton
 * buds. Gone once taken to the kitchen (`presentWhile`); the cabinet's `ClickSpot` takes it.
 */
export class CabinetKit extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'CabinetKit';
    // The isopropyl: a pale blue bottle, a white cap, its label.
    this.add(cylinderMesh(0.022, 0.12, standard({ color: 0x9fc6e0, roughness: 0.2, transparent: true, opacity: 0.8 }), { x: -0.035, y: 0.06, z: 0 }, { segments: 14 }));
    this.add(cylinderMesh(0.01, 0.022, paint(0xf2f2f2, 0.5), { x: -0.035, y: 0.131, z: 0 }, { segments: 10 }));
    part(this, 0.036, 0.045, 0.002, paint(0xffffff, 0.8), { x: -0.035, y: 0.062, z: 0.023 }).castShadow = false;
    // The cotton buds in their jar.
    this.add(cylinderMesh(0.026, 0.075, CLEAR_GLASS, { x: 0.025, y: 0.0375, z: 0 }, { segments: 14 }));
    this.add(cylinderMesh(0.022, 0.06, paint(0xfafafa, 0.95), { x: 0.025, y: 0.031, z: 0 }, { segments: 12 }));
  }
}
