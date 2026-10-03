import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from '../props/Prop';
import { Poster } from '../props/Poster';
import { CatBed } from '../cat/CatBed';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { METAL, paint, standard, timber } from '../materials/palette';

/*
 * The neighbours' flats' own things (`Dressing`): an upright piano, the Vectrex on its table, a dog's basket and
 * bowl, a painted poster. Each origin on the floor (a wall piece at the wall), +z into the room.
 */

/** An upright piano against the wall, the lid up on the keys, a stool in front. Clicked: a few notes, badly. */
export class Piano extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor(color = 0x2a1a12) {
    super();
    this.name = 'Piano';
    const body = timber(color, 0.35);
    this.add(boxMesh(1.45, 1.22, 0.55, body, { y: 0.61, z: 0.275 }));
    // The keyboard's shelf standing out of the case, the keys on it, the fallboard up behind them.
    this.add(boxMesh(1.32, 0.08, 0.22, body, { y: 0.7, z: 0.66 }));
    this.add(boxMesh(1.24, 0.02, 0.15, paint(0xf2eee2, 0.3), { y: 0.75, z: 0.68 }));
    for (let i = 0; i < 25; i++) {
      if (i % 7 === 2 || i % 7 === 6) continue;
      this.add(boxMesh(0.012, 0.012, 0.09, paint(0x141210, 0.4), { x: -0.6 + i * 0.05, y: 0.766, z: 0.65 }));
    }
    this.add(boxMesh(1.3, 0.3, 0.02, body, { y: 0.92, z: 0.56 }));
    // Brass candle arms and the music on its stand.
    for (const x of [-0.55, 0.55]) this.add(cylinderMesh(0.015, 0.12, METAL.brass(), { x, y: 1.0, z: 0.6 }));
    this.add(boxMesh(0.42, 0.3, 0.005, paint(0xefe8d6, 0.9), { y: 1.0, z: 0.575 }));
    // The stool.
    this.add(cylinderMesh(0.18, 0.05, paint(0x3a1a14, 0.8), { y: 0.48, z: 1.05 }, { segments: 16 }));
    this.add(cylinderMesh(0.03, 0.46, body, { y: 0.23, z: 1.05 }));
    const hit = invisibleHitbox(1.4, 0.4, 0.4, { y: 0.8, z: 0.6 });
    this.add(hit);
    this.hitboxes = [hit];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.73, 0, 0), new THREE.Vector3(0.73, 1.22, 0.78));
  }

  setHovered(): void {}

  label(): string {
    return 'The piano · play a few notes';
  }

  activate(session: SessionActions): void {
    session.react('Plink, plonk. Now you know how it sounds from the stairs.');
  }
}

/** An old vector console on a little table: its tall screen drawing a spaceship in bright lines. Not for sale. */
export class Vectrex extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor() {
    super();
    this.name = 'Vectrex';
    const table = timber(0x5a3e28, 0.6);
    this.add(boxMesh(0.7, 0.03, 0.45, table, { y: 0.7 }));
    for (const x of [-0.31, 0.31]) for (const z of [-0.18, 0.18]) this.add(boxMesh(0.035, 0.69, 0.035, table, { x, y: 0.345, z }));
    const shell = paint(0x161616, 0.45);
    this.add(boxMesh(0.24, 0.36, 0.26, shell, { y: 0.715 + 0.18, z: -0.04 }));
    const [canvas, ctx] = createCanvas(128, 160);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, 128, 160);
    ctx.strokeStyle = '#e8f4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 40);
    ctx.lineTo(84, 96);
    ctx.lineTo(64, 84);
    ctx.lineTo(44, 96);
    ctx.closePath();
    ctx.moveTo(20, 130);
    ctx.lineTo(108, 130);
    ctx.stroke();
    for (const [x, y] of [[22, 24], [100, 52], [30, 70], [96, 110], [58, 18]]) ctx.fillRect(x!, y!, 2, 2);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.19, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: toTexture(canvas, 'facing'), emissiveIntensity: 1.4, roughness: 0.2 }),
    );
    screen.position.set(0, 0.715 + 0.19, 0.091);
    this.add(screen);
    // The controller, wired to it.
    this.add(boxMesh(0.16, 0.03, 0.07, shell, { x: 0.18, y: 0.73, z: 0.14 }));
    const hit = invisibleHitbox(0.3, 0.4, 0.3, { y: 0.9 });
    this.add(hit);
    this.hitboxes = [hit];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.23), new THREE.Vector3(0.35, 0.75, 0.23));
  }

  setHovered(): void {}

  label(): string {
    return 'The Vectrex · have a look';
  }

  activate(session: SessionActions): void {
    session.react('A Vectrex, its own screen drawing a little ship in hard white lines. It hums. It is not for sale.');
  }
}

/** A dog's basket with its blanket, the water bowl by it. */
export class DogBasket extends Prop {
  constructor(color: number) {
    super();
    this.name = 'DogBasket';
    const bed = new CatBed({ color });
    bed.scale.setScalar(1.3);
    this.add(bed);
    this.add(cylinderMesh(0.09, 0.05, standard({ color: 0xb8bcc2, metalness: 0.6, roughness: 0.35 }), { x: 0.45, y: 0.025, z: 0.15 }, { radiusBottom: 0.07, segments: 16 }));
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.35), new THREE.Vector3(0.35, 0.15, 0.35));
  }
}

/** A painted poster: a band of colour, the title in big letters, a line under it. */
export function paintedPoster(title: string, sub: string | undefined, [bg, ink]: [number, number], width = 0.6, height = 0.85): Poster {
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  return new Poster(width, height, (ctx, w, h) => {
    ctx.fillStyle = hex(bg);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(ink);
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 6; i++) ctx.fillRect(0, h * (0.55 + i * 0.06), w, h * 0.02);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(w * 0.2);
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    while (ctx.measureText(title).width > w * 0.88 && size > 12) ctx.font = `bold ${--size}px Impact, "Arial Black", sans-serif`;
    ctx.fillText(title, w / 2, h * 0.3);
    if (sub) {
      ctx.font = `bold ${Math.round(w * 0.07)}px system-ui, sans-serif`;
      ctx.fillText(sub, w / 2, h * 0.88);
    }
  });
}
