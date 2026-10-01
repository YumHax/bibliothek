import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, standard, METAL } from '../../materials/palette';

const CASE = paint(0x2e3236, 0.5);
const HANDLE = paint(0x2a5a8a, 0.5);
const CABLE = paint(0x1a1a1a, 0.7);
const SPONGE = paint(0xe8c040, 1);
const TRAY = paint(0x1e1e20, 0.6);
const LED = standard({ color: 0xd02010, emissive: 0xff2a10, emissiveIntensity: 1.2, roughness: 0.4 });
const SOLDER = standard({ color: 0xb8bcc0, metalness: 1, roughness: 0.35 });
const REEL = paint(0x3a6ab8, 0.5);

/**
 * Where the iron's tip is, in the station's frame (the wisp of flux smoke rises from there: `SolderWisp`, placed by the
 * plan at the same spot plus this).
 */
export const IRON_TIP = new THREE.Vector3(0.175, 0.115, -0.02);

/**
 * The repairer's soldering station: the grey control box with its temperature dial and red lamp, the iron resting in
 * its coiled holder (its tip up over the bench, `IRON_TIP`), its cable, the damp yellow sponge in its tray, a reel of
 * solder on a spindle. Origin on the surface under the control box, its dial +z. Decoration: never collides; merges.
 */
export class SolderingStation extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'SolderingStation';
    part(this, 0.13, 0.08, 0.12, CASE, { y: 0.04 });
    const dial = cylinderMesh(0.018, 0.012, paint(0xd8d8d0, 0.4), { y: 0.042, z: 0.066 }, { segments: 16 });
    dial.rotation.x = Math.PI / 2;
    this.add(dial);
    const lamp = cylinderMesh(0.005, 0.006, LED, { x: -0.04, y: 0.06, z: 0.061 }, { segments: 8 });
    lamp.rotation.x = Math.PI / 2;
    this.add(lamp);
    // The holder: a weighted foot, the coil slanting up to the right, the iron lying in it.
    this.add(cylinderMesh(0.032, 0.012, TRAY, { x: 0.12, y: 0.006, z: -0.01 }, { segments: 16 }));
    const coil = cylinderMesh(0.014, 0.1, METAL.steel(), { x: 0.12, y: 0.05, z: -0.02 }, { segments: 10 });
    coil.rotation.z = -0.7;
    this.add(coil);
    const iron = new THREE.Group();
    iron.position.set(0.12, 0.05, -0.02);
    iron.rotation.z = -0.7;
    iron.add(cylinderMesh(0.011, 0.1, HANDLE, { y: -0.07 }, { segments: 10 }));
    iron.add(cylinderMesh(0.004, 0.09, METAL.chrome(), { y: 0.02 }, { segments: 8 }));
    iron.add(cylinderMesh(0.0015, 0.02, paint(0x6a5040, 0.4), { y: 0.075 }, { radiusBottom: 0.003, segments: 6 }));
    this.add(iron);
    // The cable from the box's side to the handle's end.
    const cable = cylinderMesh(0.003, 0.12, CABLE, { x: 0.08, y: 0.02, z: -0.04 }, { segments: 6 });
    cable.rotation.set(0.3, 0, 1.3);
    this.add(cable);
    // The sponge in its tray, in front of the holder.
    part(this, 0.07, 0.012, 0.05, TRAY, { x: 0.13, y: 0.006, z: 0.07 });
    part(this, 0.06, 0.014, 0.04, SPONGE, { x: 0.13, y: 0.016, z: 0.07 });
    // A reel of solder on its spindle, behind.
    part(this, 0.05, 0.006, 0.04, TRAY, { x: -0.05, y: 0.003, z: -0.1 });
    const reel = cylinderMesh(0.03, 0.028, REEL, { x: -0.05, y: 0.04, z: -0.1 }, { segments: 16 });
    reel.rotation.x = Math.PI / 2;
    this.add(reel);
    const wound = cylinderMesh(0.024, 0.03, SOLDER, { x: -0.05, y: 0.04, z: -0.1 }, { segments: 16 });
    wound.rotation.x = Math.PI / 2;
    this.add(wound);
  }
}
