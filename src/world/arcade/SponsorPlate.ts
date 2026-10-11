import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { OwnedPrize } from '@/economy/Prizes';
import { boxMesh } from '../meshUtils';
import { standard } from '../materials/palette';
import { Prop } from '../props/Prop';
import { WALL, decal } from '../surface/layers';
import { PROUD } from '../props/joinery';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { PIXEL_FONT, drawText } from './games/ArcadeGame';
import { DEPTH } from './cabinetModel';

interface SponsorPlateOptions {
  /** The prizes taken: a sponsor's plate bought for `game` puts this one up. */
  prizes: { readonly owned: readonly OwnedPrize[]; subscribe(cb: () => void): () => void };
  /** The cabinet's game. */
  game: string;
  /** The initials engraved on it (the hall of fame's last ones). */
  initials: () => string;
}

/** The plate's size, and where it is screwed on the cabinet's base (cabinet-local: right of the coin door, under the panel). */
const PLATE = { w: 0.17, h: 0.05, t: 0.004, x: 0.17, y: 0.74 };
/** The base's front face, cabinet-local z (`cabinetModel`: the base box sits 2 cm back). */
const BASE_FRONT = -0.02 + DEPTH / 2;
const BRASS = standard({ color: 0xc9a23a, metalness: 1, roughness: 0.32 });

/**
 * The sponsor's plate the prize counter's back room sells (docs/economy.md "Prizes"): a brass plate screwed on a hall
 * cabinet's base, right of the coin door, engraved SPONSORED BY and the player's initials, for the whole hall to read.
 * Up only once a plate was bought for this cabinet; follows the prize store live. Cabinet-local (placed with it).
 */
export class SponsorPlate extends Prop {
  private readonly body = new THREE.Group();
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly paint: () => void;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: SponsorPlateOptions) {
    super();
    this.name = 'SponsorPlate';
    this.position.set(PLATE.x, PLATE.y, BASE_FRONT + PROUD);
    this.body.add(boxMesh(PLATE.w, PLATE.h, PLATE.t, BRASS, { z: PLATE.t / 2 }));
    const [canvas, ctx] = createCanvas(340, 100);
    this.paint = () => {
      ctx.clearRect(0, 0, 340, 100);
      drawText(ctx, 'SPONSORED BY', 170, 32, 20, '#3a2808');
      drawText(ctx, options.initials(), 170, 70, 34, '#2a1a05');
    };
    this.paint();
    this.texture = toTexture(canvas, 'facing');
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, transparent: true, metalness: 0.6, roughness: 0.5 });
    const face = decal(PLATE.w * 0.94, PLATE.h * 0.9, this.material, WALL.sign);
    face.position.z += PLATE.t;
    this.body.add(face);
    this.add(this.body);
    repaintWhenFontLoads(`20px ${PIXEL_FONT}`, () => this.repaint());
    this.apply();
    this.unsubscribe = options.prizes.subscribe(() => this.apply());
  }

  dispose(): void {
    this.unsubscribe();
    this.texture.dispose();
    this.material.dispose();
  }

  private apply(): void {
    const up = this.options.prizes.owned.some((p) => p.id === 'sponsor' && p.game === this.options.game);
    this.body.visible = up;
    if (up) this.repaint();
  }

  private repaint(): void {
    this.paint();
    this.texture.needsUpdate = true;
  }
}
