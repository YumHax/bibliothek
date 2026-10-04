import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { paint, standard, timber, METAL } from '../materials/palette';
import { snowScreen, stillScreen, type ScreenLook } from './snowScreen';

interface PortableTvOptions {
  /** Width of the case (the screen is about two thirds of it). */
  width: number;
  /** Colour of the plastic case. */
  case: number;
  /** Showing the snow of an untuned channel (the TV wall), or dark. Default dark. */
  snow?: boolean;
  /** What the screen shows (`snowScreen`): wins over `snow`. */
  screen?: ScreenLook;
  /** The telescopic aerial on top. Default true (not on a set with another stacked on it). */
  aerial?: boolean;
}

const DARK = paint(0x151515, 0.6);
const GLASS = standard({ color: 0x1e2a26, roughness: 0.15, metalness: 0 });
const CHROME = standard({ color: 0xc8c8c8, roughness: 0.2, metalness: 1 });

/**
 * A portable CRT set as the TV repair shop shows it (the flat's `Television` needs a video layer and a speaker, so the
 * shop has its model): a plastic case deeper at the back, the screen, two knobs, a carrying handle, an aerial. Origin
 * on the surface under it, the screen facing +z. Decoration (the shop's `ForSale` or the TV wall holds it).
 */
export class PortableTv extends Prop {
  constructor({ width: W, case: color, snow = false, screen: look = snow ? 'snow' : 'dark', aerial = true }: PortableTvOptions) {
    super();
    this.name = 'PortableTv';
    const H = W * 0.84;
    const D = W * 0.9;
    const plastic = paint(color, 0.5);
    part(this, W, H, D * 0.7, plastic, { y: H / 2, z: D * 0.15 });
    part(this, W * 0.7, H * 0.75, D * 0.3, plastic, { y: H * 0.42, z: -D * 0.35 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, H * 0.62), look === 'snow' ? snowScreen() : look === 'dark' ? GLASS : stillScreen(look));
    screen.position.set(-W * 0.1, H * 0.54, D * 0.5 + 0.002);
    this.add(screen);
    for (const y of [H * 0.7, H * 0.45]) {
      const knob = cylinderMesh(W * 0.045, W * 0.05, DARK, { x: W * 0.36, y, z: D * 0.5 + W * 0.02 }, { segments: 10 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    part(this, W * 0.55, W * 0.05, W * 0.075, DARK, { y: H + W * 0.1, z: D * 0.15 });
    for (const x of [-W * 0.27, W * 0.27]) part(this, W * 0.06, W * 0.11, W * 0.075, DARK, { x, y: H + W * 0.05, z: D * 0.15 });
    if (aerial) {
      const mast = new THREE.Group();
      mast.position.set(W / 2 - W * 0.12, H, -D * 0.1);
      mast.rotation.z = -0.5;
      mast.add(cylinderMesh(0.0025, W * 1.1, CHROME, { y: W * 0.55 }, { segments: 6 }));
      this.add(mast);
    }
  }
}

const PROJECTOR_CASE = paint(0x2c2e33, 0.45);
const LENS = standard({ color: 0x0c1418, roughness: 0.05, metalness: 0 });

/**
 * The ceiling projector the TV repair shop has on its bench: a flat dark case, the lens barrel at the front, the vents
 * and the ceiling bracket folded on its top. Origin on the surface under it, the lens facing +z.
 */
export class ShopProjector extends Prop {
  constructor() {
    super();
    this.name = 'ShopProjector';
    const W = 0.32;
    const H = 0.1;
    const D = 0.26;
    part(this, W, H, D, PROJECTOR_CASE, { y: H / 2 + 0.012 });
    for (const x of [-W * 0.4, W * 0.4]) for (const z of [-D * 0.4, D * 0.4]) this.add(cylinderMesh(0.012, 0.012, DARK, { x, y: 0.006, z }, { segments: 8 }));
    const barrel = cylinderMesh(0.038, 0.05, DARK, { x: W * 0.22, y: H / 2 + 0.012, z: D / 2 + 0.02 }, { segments: 20 });
    barrel.rotation.x = Math.PI / 2;
    this.add(barrel);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), LENS);
    lens.position.set(W * 0.22, H / 2 + 0.012, D / 2 + 0.0455);
    this.add(lens);
    for (let i = 0; i < 5; i++) part(this, 0.008, H * 0.5, 0.004, DARK, { x: -W * 0.35 + i * 0.022, y: H / 2 + 0.012, z: D / 2 + 0.002 });
    part(this, 0.16, 0.012, 0.12, METAL.steel(), { y: H + 0.018 });
  }
}

const WICKER = timber(0xb08a55, 0.9);
const BALLS: readonly number[] = [0xd8403a, 0x3a7ad8, 0xe8c040, 0x5ab85a, 0xe07ab0];

/** The cat balls as the pet shop sells them: a wicker bowl heaped with jingly balls. Origin under the bowl. */
export class CatBallBasket extends Prop {
  constructor() {
    super();
    this.name = 'CatBallBasket';
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.08, 20, 1, true), WICKER);
    bowl.position.y = 0.04;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    this.add(bowl, cylinderMesh(0.09, 0.008, WICKER, { y: 0.004 }, { segments: 20 }));
    const R = 0.035;
    const spots: [number, number, number][] = [[-0.05, 0.045, 0.02], [0.05, 0.045, -0.02], [0, 0.05, 0.06], [0.01, 0.045, -0.06], [0.0, 0.1, 0.0]];
    spots.forEach(([x, y, z], i) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 10), paint(BALLS[i % BALLS.length]!, 0.45));
      ball.position.set(x, y, z);
      ball.castShadow = true;
      this.add(ball);
    });
  }
}
