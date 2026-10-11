import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { part } from '../props/Prop';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { snowPaint } from '../street/snowCover';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';

/** The shelter's size: its width along the kerb, depth, roof height; the pole's height and its flag. */
const SHELTER = { depth: 1.3, height: 2.35 };
const POLE = { height: 2.8, flag: 0.22 };

interface LindenStopOptions {
  /** The shelter's width along the kerb. */
  width: number;
  /** Where the pole stands, from the shelter's middle (shelter-local x, z; +z towards the road). */
  pole: readonly [number, number];
  line: string;
  /** Where the bus back goes, as the caption says it. */
  towards: string;
}

/**
 * Line 38's stop on Linden Avenue: a glass shelter with its bench (its back to the facades, open to the road) and the
 * pole by the kerb with the round flag. Clicked, the shelter or the pole takes the next bus back to Front Street (the
 * fare paid on Front Street covered the way back, `STREET_PLAN.busRide`): the ride plays over the travel curtain
 * (`bootstrap/player`'s interlude).
 * The buses come at any hour (the night bus runs the line after nine). Origin at the shelter's middle on the
 * pavement, +z towards the road; the shelter's frame and the pole collide.
 */
export class LindenStop extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly colliders: THREE.Box3[];

  constructor(private readonly options: LindenStopOptions) {
    super();
    this.name = 'LindenStop';
    const { width } = options;
    const { depth, height } = SHELTER;
    const frame = snowPaint(0x4a5258, 0.45);
    const glass = new THREE.MeshStandardMaterial({ color: 0xc8dce4, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
    // The posts, the roof and its fascia with the line's name, the glass back and ends, the bench.
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) part(this, 0.06, height, 0.06, frame, { x, y: height / 2, z });
    part(this, width + 0.2, 0.08, depth + 0.25, snowPaint(0x3a4046, 0.5), { y: height + 0.04, z: 0.05 });
    const panes: THREE.Mesh[] = [part(this, width - 0.06, height - 0.5, 0.012, glass, { y: (height - 0.5) / 2 + 0.25, z: -depth / 2 })];
    for (const x of [-width / 2, width / 2]) panes.push(part(this, 0.012, height - 0.5, depth - 0.06, glass, { x, y: (height - 0.5) / 2 + 0.25 }));
    for (const pane of panes) pane.castShadow = false;
    part(this, width * 0.7, 0.05, 0.36, paint(0x8a5a32, 0.7), { y: 0.46, z: -depth / 2 + 0.24 });
    for (const x of [-width * 0.3, width * 0.3]) part(this, 0.05, 0.44, 0.3, frame, { x, y: 0.22, z: -depth / 2 + 0.24 });
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.6, 0.16), new THREE.MeshStandardMaterial({ map: fasciaTexture(options.line), roughness: 0.5 }));
    fascia.position.set(0, height - 0.05, depth / 2 + 0.181);
    this.add(fascia);

    // The pole by the kerb, its flag turned to the road.
    const [px, pz] = options.pole;
    part(this, 0.07, POLE.height, 0.07, frame, { x: px, y: POLE.height / 2, z: pz });
    const flag = new THREE.Mesh(new THREE.CircleGeometry(POLE.flag, 28), new THREE.MeshStandardMaterial({ map: flagTexture(options.line), roughness: 0.4 }));
    flag.position.set(px + 0.05, POLE.height - 0.25, pz);
    flag.rotation.y = Math.PI / 2;
    const back = flag.clone();
    back.rotation.y = -Math.PI / 2;
    back.position.x = px - 0.05;
    this.add(flag, back);

    const shelter = invisibleHitbox(width, height, depth, { y: height / 2 });
    const pole = invisibleHitbox(0.5, POLE.height, 0.5, { x: px, y: POLE.height / 2, z: pz });
    this.hitboxes = [shelter, pole];
    this.add(shelter, pole);
    this.colliders = [
      new THREE.Box3(new THREE.Vector3(-width / 2 - 0.05, 0, -depth / 2 - 0.05), new THREE.Vector3(width / 2 + 0.05, height, -depth / 2 + 0.05)),
      ...[-width / 2, width / 2].map((x) => new THREE.Box3(new THREE.Vector3(x - 0.05, 0, -depth / 2), new THREE.Vector3(x + 0.05, height, depth / 2))),
      new THREE.Box3(new THREE.Vector3(px - 0.06, 0, pz - 0.06), new THREE.Vector3(px + 0.06, POLE.height, pz + 0.06)),
    ];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // A bus stop does not glow.
  }

  label(): string {
    return `Bus ${this.options.line} · back to ${this.options.towards}`;
  }

  activate(session: SessionActions): void {
    session.travel('street');
  }
}

/** The fascia over the shelter: the stop's name. */
function fasciaTexture(line: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(384, 64);
  ctx.fillStyle = '#1e2a44';
  ctx.fillRect(0, 0, 384, 64);
  ctx.fillStyle = '#f2efe8';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${line} · LINDEN AVENUE`, 192, 33, 360);
  return toTexture(canvas);
}

/** The pole's round flag: BUS over the line's number. */
function flagTexture(line: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 128);
  ctx.fillStyle = '#f2efe8';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1e5a3a';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2efe8';
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText('BUS', 64, 52);
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText(line, 64, 96);
  return toTexture(canvas);
}
