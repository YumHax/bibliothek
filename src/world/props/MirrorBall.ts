import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { matte, Prop } from './Prop';

export interface MirrorBallOptions {
  /** Radius of the ball, metres. Default 0.18. */
  radius?: number;
  /** How far it hangs below the ceiling (to its top). Default 0.45. */
  drop?: number;
  /** Turns per minute. Default 3. */
  rpm?: number;
  seed?: number;
}

/**
 * A mirror ball turning slowly under the ceiling: a faceted sphere of little mirrors, some of
 * which catch a glint (an emissive speckle map, so the glints wander as it turns without a light
 * of its own), hung on a rod from a motor box. Ceiling placement: origin on the ceiling. Decoration.
 */
export class MirrorBall extends Prop implements Updatable {
  private readonly ball: THREE.Mesh;
  private readonly speed: number;

  constructor(options: MirrorBallOptions = {}) {
    super();
    this.name = 'MirrorBall';
    const radius = options.radius ?? 0.18;
    const drop = options.drop ?? 0.45;
    this.speed = ((options.rpm ?? 3) / 60) * Math.PI * 2;
    this.add(cylinderMesh(0.05, 0.06, matte(0x1a1a1f, 0.5), { y: -0.03 }, { segments: 12 }));
    this.add(cylinderMesh(0.006, drop, new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.7, roughness: 0.3 }), { y: -drop / 2 }, { segments: 6 }));
    const glints = paintGlints(options.seed ?? 1);
    const mirror = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.12, flatShading: true, emissive: 0xffffff, emissiveMap: glints, emissiveIntensity: 1.6 });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 3), mirror);
    this.ball.position.y = -drop - radius;
    this.ball.castShadow = false;
    this.add(this.ball);
  }

  update(dt: number): void {
    this.ball.rotation.y += this.speed * dt;
  }
}

/** Scattered white speckles on black: the facets that happen to catch a light. */
function paintGlints(seed: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 64);
  const random = seededRandom(seed * 7717);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 64);
  const colours = ['#ffffff', '#ffd0f0', '#c0f0ff', '#fff0b0'];
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = colours[Math.floor(random() * colours.length)]!;
    ctx.globalAlpha = 0.4 + random() * 0.6;
    ctx.fillRect(random() * 128, random() * 64, 2, 2);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
