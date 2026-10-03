import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { blackoutNow, resetMainFuse } from '@/building/blackout';
import { playLatchClick } from '@/audio/furnitureSounds';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { METAL, paint } from '../../materials/palette';
import { boxMesh, invisibleHitbox } from '../../meshUtils';
import { Prop } from '../../props/Prop';
import { HoverGlint } from '../../props/hoverGlint';

/** The cupboard's size (m): a shallow steel box on the wall. */
const SIZE = { width: 0.46, height: 0.6, depth: 0.14 };

/** What the box says: looked at with the power on, a reset that trips again, the power back. */
export interface FuseLines {
  idle: string;
  trips: string;
  restored: string;
}

/**
 * The building's meters cupboard (the hall's, and the main board in the cellars): a grey steel box with a stencilled
 * label and a lever. With the power on it only hums; in a power cut its click resets the main fuse
 * (`building/blackout`), which holds once the storm has moved off. Origin at the back's middle on the wall, the
 * front facing +z.
 */
export class FuseBox extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;
  private readonly lever: THREE.Mesh;

  constructor(private readonly lines: FuseLines, label = 'METERS · MAIN FUSE') {
    super();
    this.name = 'FuseBox';
    const { width, height, depth } = SIZE;
    const steel = paint(0x8a9094, 0.55);
    this.add(boxMesh(width, height, depth, steel, { z: depth / 2 }));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, 0.09), new THREE.MeshStandardMaterial({ map: stencil(label), roughness: 0.7 }));
    plate.position.set(0, height * 0.32, depth + 0.002);
    this.add(plate);
    const brass = METAL.brass();
    this.lever = boxMesh(0.03, 0.09, 0.03, METAL.satinSteel(), { x: width * 0.3, y: -height * 0.15, z: depth + 0.02 });
    this.add(this.lever);
    this.add(boxMesh(0.02, 0.02, 0.02, brass, { x: -width * 0.38, z: depth + 0.01 }));
    const hitbox = invisibleHitbox(width + 0.04, height + 0.04, depth + 0.06, { z: depth / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.glint = HoverGlint.fittings(this);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return blackoutNow() ? 'Meters cupboard · reset the main fuse' : 'Meters cupboard · look';
  }

  activate(session: SessionActions): void {
    if (!blackoutNow()) {
      session.react(this.lines.idle);
      return;
    }
    playLatchClick(0.16);
    const outcome = resetMainFuse();
    this.lever.rotation.x = outcome === 'restored' ? 0 : 0.6;
    if (outcome === 'trips') session.refuse(this.lines.trips);
    else session.react(this.lines.restored);
  }
}

/** The cupboard's stencilled label, white on the grey steel. */
function stencil(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 48);
  ctx.fillStyle = '#8a9094';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#f1efe8';
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 26, 240);
  return toTexture(canvas, 2);
}
