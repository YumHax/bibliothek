import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { RadioTune } from '@/audio/RadioTune';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture, OccupancyAware } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';

export interface TransistorRadioOptions {
  /** Whose distance sets the volume: the camera. */
  listener: THREE.Object3D;
  /** Case colour. */
  color?: number;
}

const W = 0.2;
const H = 0.12;
const D = 0.06;
/** Heard up to this far (m); full volume within `NEAR`. */
const FAR = 9;
const NEAR = 0.8;

const CHROME = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.25, metalness: 0.9 });

/**
 * A stallholder's transistor radio, playing a generated pop station (`RadioTune`) for the whole
 * hall, louder as the player comes near. On when the market is entered; clicking it switches it
 * off and on. Silent when the player is not in the hall (`setOccupied`). Origin under its centre,
 * +z the grille. Never collides (it stands on a stall's crates).
 */
export class TransistorRadio extends THREE.Group implements Furniture, Updatable, Interactable, OccupancyAware {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly tune = new RadioTune();
  private readonly listener: THREE.Object3D;
  private readonly dial: THREE.MeshStandardMaterial;
  private readonly here = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  private wanted = true;
  private occupied = false;

  constructor(options: TransistorRadioOptions) {
    super();
    this.name = 'TransistorRadio';
    this.listener = options.listener;
    const body = matte(options.color ?? 0xb8342a, 0.5);
    this.add(boxMesh(W, H, D, body, { y: H / 2 }));
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.55, H * 0.7), new THREE.MeshStandardMaterial({ map: paintGrille(), roughness: 0.6, metalness: 0.4 }));
    grille.position.set(-W * 0.17, H / 2, D / 2 + 0.001);
    this.add(grille);
    this.dial = new THREE.MeshStandardMaterial({ color: 0xf1e8d6, roughness: 0.5, emissive: 0xffb050, emissiveIntensity: 0 });
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), this.dial);
    dial.position.set(W * 0.3, H / 2 + 0.01, D / 2 + 0.001);
    this.add(dial);
    this.add(cylinderMesh(0.008, 0.012, CHROME, { x: W * 0.3, y: H * 0.18, z: D / 2 + 0.004 }, { segments: 10 }).rotateX(Math.PI / 2));
    // The handle and the telescopic aerial.
    this.add(boxMesh(W * 0.7, 0.008, 0.012, CHROME, { y: H + 0.02 }));
    for (const x of [-W * 0.35, W * 0.35]) this.add(boxMesh(0.008, 0.024, 0.012, CHROME, { x, y: H + 0.01 }));
    const aerial = cylinderMesh(0.003, 0.38, CHROME, { y: 0.19 }, { segments: 6 });
    const mast = new THREE.Group();
    mast.position.set(W / 2 - 0.02, H, -D / 4);
    mast.rotation.z = -0.5;
    mast.add(aerial);
    this.add(mast);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    const hitbox = invisibleHitbox(W + 0.04, H + 0.08, D + 0.06, { y: (H + 0.08) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.apply();
  }

  update(): void {
    if (!this.tune.isOn) return;
    this.getWorldPosition(this.here);
    this.listener.getWorldPosition(this.ear);
    const d = this.here.distanceTo(this.ear);
    const t = THREE.MathUtils.clamp(1 - (d - NEAR) / (FAR - NEAR), 0, 1);
    this.tune.setVolume(t * t);
    this.tune.update();
  }

  setHovered(hovered: boolean): void {
    this.dial.emissive.setHex(hovered ? 0xffd080 : 0xffb050);
  }

  label(): string {
    return this.wanted ? 'A radio — click to switch it off' : 'A radio — click to switch it on';
  }

  activate(): void {
    this.wanted = !this.wanted;
    this.apply();
  }

  dispose(): void {
    this.tune.dispose();
  }

  private apply(): void {
    const on = this.wanted && this.occupied;
    if (on !== this.tune.isOn) this.tune.setOn(on);
    this.dial.emissiveIntensity = this.wanted ? 0.6 : 0;
  }
}

function paintGrille(): THREE.Texture {
  const [canvas, ctx] = createCanvas(128, 96);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#2a2a2a';
  for (let y = 6; y < 96; y += 8) for (let x = 6 + ((y / 8) % 2) * 4; x < 128; x += 8) ctx.fillRect(x, y, 3, 3);
  return toTexture(canvas, 2);
}
