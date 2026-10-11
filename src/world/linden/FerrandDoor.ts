import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { ShutDoor } from '../props/ShutDoor';
import { HoverGlint } from '../props/hoverGlint';
import { invisibleHitbox } from '../meshUtils';
import { METAL } from '../materials/palette';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { playKnock } from '@/audio/doorbell';

/** What a knock on Mr Ferrand's door gets, in turn. */
const ANSWERS = [
  'The racing on the radio, very loud. Nobody comes.',
  'A cough, the radio turned down, then up again. Mr Ferrand is not receiving.',
  '“If it’s the meter, it’s in the cellar!” It isn’t. Nobody comes.',
  'Slippers shuffle up to the door, stop, and shuffle away.',
] as const;

/** The brass plate under the peephole: its size and height on the leaf. */
const PLATE = { width: 0.15, height: 0.04, y: 1.36 };

/**
 * Mr Ferrand's door across Mémé's landing (docs/grandma.md "Around her flat"): an entrance door in its brown with its
 * doormat and his brass plate, knocked on for a line (he never comes to the door; his radio does the talking). Its
 * handle glints on hover.
 */
export class FerrandDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;
  private knocks = 0;

  constructor({ colour, mat }: { colour: number; mat: number }) {
    super({ style: 'entrance', leafColor: colour, mat: true, matColor: mat });
    this.name = 'FerrandDoor';
    const hitbox = invisibleHitbox(0.95, 2.1, 0.1, { y: 1.05, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.leafFace.add(namePlate('FERRAND'));
    this.glint = HoverGlint.fittings(this.leafFace);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'Mr Ferrand · knock';
  }

  activate(session: SessionActions): void {
    playKnock(3, 0.35);
    session.react(ANSWERS[this.knocks++ % ANSWERS.length]!);
  }
}

/** A brass plate with `name` engraved, on the leaf's face under the peephole (door-local). */
function namePlate(name: string): THREE.Mesh {
  const [canvas, ctx] = createCanvas(300, 80);
  ctx.fillStyle = '#c9a75b';
  ctx.fillRect(0, 0, 300, 80);
  ctx.strokeStyle = 'rgba(90, 64, 24, 0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 288, 68);
  ctx.fillStyle = '#3a2812';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 150, 42, 270);
  const brass = METAL.brass();
  const material = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), metalness: brass.metalness, roughness: brass.roughness });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE.width, PLATE.height, 0.004), [brass, brass, brass, brass, material, brass]);
  // On the leaf's face (16 mm), clear of the raised panels' 2 mm.
  plate.position.set(0, PLATE.y, 0.016 + 0.004 + 0.002); // convention-ok: on the leaf's face, clear of its raised panels (the stairwell's plates)
  plate.castShadow = false;
  return plate;
}
