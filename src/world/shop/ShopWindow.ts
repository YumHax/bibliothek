import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight, SkyState } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { WALL, decal } from '../surface/layers';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { paintGildedLine } from './common/gildedLettering';
import type { ShopDoor } from '../street/streetPlan';
import { OutlookView } from '../outlook/OutlookView';
import { shopToStreet } from '../outlook/frames';

interface ShopWindowOptions {
  width: number;
  height: number;
  /** What is lettered in gold on the glass, read backwards from inside: the line the street sees on it (`SHOPFRONTS`), else the shop's name. */
  name: string;
  /** The shop's door on the street (`shopOutlook.shopDoorOf`): the view is the street's from there. Null: the glass stays a pale sky. */
  door: ShopDoor | null;
  /** Where the window is: `along` the front wall from the exit (room x), the front wall's inner face (room z). */
  along: number;
  front: number;
  /** The zone's group: its world matrix takes the room's frame to the world's. */
  zoneFrame: THREE.Object3D;
  dayNight: DayNight;
  outdoors: Outdoors;
  /** What the flat has bought: our balcony across the street is dressed as it is (none: fully dressed). */
  upgrades?: HomeUpgrades;
  /** The main camera, the view through the glass is rendered from. */
  viewer: THREE.Camera;
}

/** The glass's bottom edge over the floor (a stall riser under it). */
export const SILL = 0.55;
const FRAME = 0.06;
const FRAME_PAINT = paint(0x2e2a26, 0.5);
/** Pixels per metre of the lettering on the glass. */
const PX = 220;
/** How thick the shop's front wall is: the facade in the street stands this far outside the glass. */
const FRONT_WALL = 0.3;

/**
 * A shop's front window from inside: a painted frame on the front wall and, through the glass, Front Street (or Park
 * Street) itself, built in 3D from the street's plan as seen from the shop's own place in its facade (`outlook/`: the
 * facades across in their colours with their shops and lit windows, the road, the parked and passing cars, the lamps,
 * the trees and the park), in true perspective from wherever the player stands, lit by the hour and the weather; the
 * shop's name lettered on the glass backwards. Wall-hung like a picture with `y: 0`: origin on the floor at the wall,
 * +z into the shop. Never collides.
 */
export class ShopWindow extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly view: OutlookView;
  private readonly letters: THREE.MeshBasicMaterial;
  private readonly tint = new THREE.Color();

  constructor(options: ShopWindowOptions) {
    super();
    this.name = 'ShopWindow';
    const { width: w, height: h, door, dayNight, outdoors } = options;
    const toStreet = new THREE.Matrix4();
    const shopFrame = door ? shopToStreet(door, options.front, FRONT_WALL) : new THREE.Matrix4();
    const waiting = new THREE.Color();
    this.view = new OutlookView({
      viewer: options.viewer,
      toOutlook: () => toStreet.copy(options.zoneFrame.matrixWorld).invert().premultiply(shopFrame),
      build: (camera, between) => {
        if (!door) return Promise.reject(new Error(`[shop] ${options.name} has no door on the street to look out of`));
        const eye = new THREE.Vector3(options.along, 0, options.front).applyMatrix4(shopFrame);
        return Promise.all([import('../outlook/streetOutlook'), import('../outlook/inView')]).then(([{ buildStreetOutlook }, { facadesInView }]) =>
          buildStreetOutlook(camera, { dayNight, lightDirection: (out) => outdoors.lightDirection(dayNight.state, out), facades: facadesInView([eye.x, eye.z], [door.facade.id]), ...(options.upgrades ? { upgrades: options.upgrades } : {}), between }),
        );
      },
      waiting: () => waiting.copy(dayNight.state.horizon).multiplyScalar(0.3 + 0.7 * dayNight.state.daylight),
    });
    this.add(this.view);
    const glass = this.view.pane(w, h);
    glass.position.set(0, SILL + h / 2, WALL.paper.lift);
    this.add(glass);
    this.letters = new THREE.MeshBasicMaterial({ map: toTexture(paintLetters(Math.round(w * PX), Math.round(h * PX), options), 'facing'), transparent: true, depthWrite: false });
    const lettering = decal(w, h, this.letters, WALL.sign);
    lettering.position.y = SILL + h / 2;
    lettering.receiveShadow = false;
    lettering.castShadow = false;
    this.add(lettering);
    // The frame round the glass, a transom bar across its top, the sill board.
    part(this, FRAME, h + 2 * FRAME, 0.05, FRAME_PAINT, { x: -w / 2 - FRAME / 2, y: SILL + h / 2, z: 0.025 });
    part(this, FRAME, h + 2 * FRAME, 0.05, FRAME_PAINT, { x: w / 2 + FRAME / 2, y: SILL + h / 2, z: 0.025 });
    part(this, w, FRAME, 0.05, FRAME_PAINT, { y: SILL + h + FRAME / 2, z: 0.025 });
    part(this, w, 0.035, 0.04, FRAME_PAINT, { y: SILL + h * 0.8, z: 0.02 });
    part(this, w + 2 * FRAME + 0.04, 0.04, 0.2, paint(0xd8d0c0, 0.6), { y: SILL - 0.02, z: 0.1 });
    part(this, w + 2 * FRAME, SILL - 0.04, 0.04, FRAME_PAINT, { y: (SILL - 0.04) / 2, z: 0.02 });
  }

  /** The daylight outside, on the gilt lettering (it is unlit: the street's light behind it). */
  setSky(state: SkyState): void {
    this.tint.copy(state.horizon).lerp(WHITE, 0.6).multiplyScalar(0.1 + 0.95 * state.daylight);
    this.letters.color.copy(this.tint).lerp(WHITE, 0.3);
  }

  /** The player walked in: what is out there is built now, at the next idle moment (`OutlookView.prefetch`). */
  setOccupied(occupied: boolean): void {
    if (occupied) this.view.prefetch();
  }

  update(dt: number): void {
    this.view.update(dt);
  }

  dispose(): void {
    this.view.dispose();
    this.letters.map?.dispose();
  }
}

const WHITE = new THREE.Color(0xffffff);

/** The lettering on the glass, backwards from in here, in gilt letters over the top of the window (as the street paints it). */
function paintLetters(w: number, h: number, options: ShopWindowOptions): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  paintGildedLine(ctx, options.name, w * 0.07, h * 0.06, w * 0.86, h * 0.12, true);
  return canvas;
}
