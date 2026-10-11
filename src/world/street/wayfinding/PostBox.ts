import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { paint } from '../../materials/palette';
import { snowPaint } from '../snowCover';
import { FACADE, layMesh } from '../../surface/layers';

/** The pillar: its radius, the shaft's height, the cap's overhang and height. */
const PILLAR = { radius: 0.24, shaft: 1.28, cap: 0.05, capHeight: 0.16 };
/** The slot's height over the pavement, its width. */
const SLOT = { y: 1.08, width: 0.26 };

/**
 * The pillar box on Front Street's kerb (`STREET_PLACES.postBox`): a red cast-iron pillar on a black plinth, a domed
 * cap, the slot under its lip and the collection plate below. Clicked, `post` runs (the builder's: a card to someone
 * the player knows, `post/cards`). Its front (local +z) is the slot's side. Collides.
 */
export class PostBox extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly post: (session: SessionActions) => void) {
    super();
    this.name = 'PostBox';
    const red = snowPaint(0xb3121a, 0.42);
    const black = paint(0x141414, 0.5);
    const { radius, shaft, cap, capHeight } = PILLAR;
    this.add(cylinderMesh(radius + 0.03, 0.08, black, { y: 0.04 }, { segments: 24 }));
    this.add(cylinderMesh(radius, shaft, red, { y: 0.08 + shaft / 2 }, { segments: 24 }));
    // The cap: a lip over the shaft, then the dome.
    this.add(cylinderMesh(radius + cap, 0.05, red, { y: 0.08 + shaft + 0.025 }, { segments: 24 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius + cap * 0.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), red);
    dome.scale.y = capHeight / (radius + cap * 0.6);
    dome.position.y = 0.08 + shaft + 0.05;
    dome.castShadow = true;
    this.add(dome);
    // The slot: a dark mouth under a little hood, on the front.
    const front = radius + 0.01;
    this.add(boxMesh(SLOT.width + 0.04, 0.03, 0.05, red, { y: SLOT.y + 0.045, z: front }));
    this.add(boxMesh(SLOT.width, 0.022, 0.02, black, { y: SLOT.y, z: front - 0.015 }));
    // The collection plate: times of collection, enamel white on the red.
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.4 }));
    plate.position.set(0, 0.8, radius + FACADE.card.lift);
    this.add(layMesh(plate, FACADE.card));
    const hitbox = invisibleHitbox(radius * 2 + 0.1, shaft + 0.3, radius * 2 + 0.1, { y: (shaft + 0.3) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    const r = PILLAR.radius + 0.03;
    return new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, PILLAR.shaft + 0.3, r));
  }

  setHovered(): void {
    // Cast iron does not glow; the caption says it.
  }

  label(): string {
    return 'Post box · send a card';
  }

  activate(session: SessionActions): void {
    this.post(session);
  }
}

/** The plate under the slot: LAST COLLECTION and the hours, the crown left out. */
function plateTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(160, 112);
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, 0, 160, 112);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 152, 104);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('LAST COLLECTION', 80, 30, 144);
  ctx.font = '14px sans-serif';
  ctx.fillText('Mon – Fri  5.30 pm', 80, 58, 144);
  ctx.fillText('Saturday  12 noon', 80, 80, 144);
  ctx.font = '11px sans-serif';
  ctx.fillText('FRONT STREET', 80, 100, 144);
  return toTexture(canvas, 'facing');
}
