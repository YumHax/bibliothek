import * as THREE from 'three';
import { Prop, part } from '../props/Prop';
import { PictureFrame } from '../props/PictureFrame';
import { timber } from '../materials/palette';
import { FAMILY_PHOTOS, type FamilyPhoto } from './familyPhotos';

/** How far it leans back on its strut (radians). */
const LEAN = 0.18;

/**
 * A family photo standing on a sideboard (`furnishGrandmaDecor`): a small frame leaning back on its strut, the print
 * one of `familyPhotos`. Origin on the surface under the frame's foot, the picture facing +z. Never collides.
 */
export class StandingPhoto extends Prop {
  readonly contactShadow = false;

  constructor(photo: FamilyPhoto, width = 0.16, height = 0.21, frameColor = 0xb89a5a) {
    super();
    this.name = `StandingPhoto:${photo}`;
    const tilt = new THREE.Group();
    tilt.rotation.x = -LEAN;
    this.add(tilt);
    const frame = new PictureFrame({ width, height, frameColor, frameWidth: 0.014, matWidth: 0.012, seed: photo.length * 7 }, { painter: FAMILY_PHOTOS[photo], canvasWidth: 256 });
    // The frame's back on the strut's line, its foot on the surface.
    frame.position.set(0, height / 2, 0);
    tilt.add(frame);
    const strut = part(this, 0.02, height * 0.8, 0.006, timber(frameColor, 0.6), { y: height * 0.38, z: -Math.sin(LEAN) * height * 0.55 });
    strut.rotation.x = LEAN * 1.6;
  }
}
