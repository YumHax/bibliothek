import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { formatCoins } from '@/text/money';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { METAL, paint, standard } from '../../materials/palette';
import { snowPaint } from '../snowCover';
import { FACADE, layMesh } from '../../surface/layers';

/** The cart: its body (local x along the pavement), the counter's height, the canopy's. */
const CART = { width: 1.5, depth: 0.75, counter: 0.95, canopy: 2.15 };
/** A crêpe. */
const PRICE = 2;
const FILLINGS = ['Sugar and lemon, folded in four. Warm through the paper.', 'Chocolate spread, too much of it. Worth it.', 'Butter and sugar, the way they make them at home.'];

/**
 * The crêpe cart by RETRO GAMES on the Grand Flea Fair's day (`STREET_PLACES.fair.crepes`): a cream-painted cart on
 * two wheels, its round hotplate on the counter, a striped canopy, CRÊPES on its front; the keeper behind it (placed
 * by the builder). Clicked, a crêpe (a few coins): what is in it in a word, the keeper's thanks. Local +z faces the
 * pavement. Collides.
 */
export class CrepeCart extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private line = 0;

  constructor(private readonly keeper: Walker) {
    super();
    this.name = 'CrepeCart';
    const { width, depth, counter, canopy } = CART;
    const body = snowPaint(0xe8dcc0, 0.55);
    const trim = paint(0x2a5a7a, 0.5);
    this.add(boxMesh(width, counter - 0.25, depth, body, { y: 0.25 + (counter - 0.25) / 2 }));
    this.add(boxMesh(width + 0.06, 0.04, depth + 0.06, trim, { y: counter + 0.02 }));
    // The wheels and the shafts' stand.
    const tyre = paint(0x1a1a1a, 0.8);
    for (const x of [-width / 2 + 0.25, width / 2 - 0.25]) {
      const wheel = cylinderMesh(0.25, 0.06, tyre, { x, y: 0.25, z: depth / 2 + 0.04 }, { segments: 18 });
      wheel.rotation.x = Math.PI / 2;
      this.add(wheel);
    }
    // The hotplate, a jar of batter and the ladle.
    this.add(cylinderMesh(0.2, 0.05, METAL.steel(), { x: -0.3, y: counter + 0.065, z: 0 }, { segments: 24 }));
    this.add(cylinderMesh(0.17, 0.006, paint(0xd8a860, 0.6), { x: -0.3, y: counter + 0.1, z: 0 }, { segments: 24 }));
    this.add(cylinderMesh(0.06, 0.16, standard({ color: 0xf2e6c4, roughness: 0.3 }), { x: 0.3, y: counter + 0.12, z: -0.15 }, { segments: 12 }));
    // The canopy: four poles, a striped roof.
    const pole = METAL.satinSteel();
    for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) for (const z of [-depth / 2 + 0.04, depth / 2 - 0.04]) this.add(cylinderMesh(0.015, canopy - counter, pole, { x, y: counter + (canopy - counter) / 2, z }, { segments: 6 }));
    const stripes = new THREE.MeshStandardMaterial({ map: stripesTexture(), roughness: 0.9 });
    this.add(boxMesh(width + 0.2, 0.05, depth + 0.3, stripes, { y: canopy + 0.025 }));
    // CRÊPES on the front.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, 0.28), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
    sign.position.set(0, 0.62, depth / 2 + FACADE.card.lift);
    this.add(layMesh(sign, FACADE.card));
    const hitbox = invisibleHitbox(width, canopy, depth, { y: canopy / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    const { width, depth, counter } = CART;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, counter, depth / 2 + 0.08));
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    return `Crêpes · buy one (${formatCoins(PRICE)})`;
  }

  activate(session: SessionActions): void {
    session.pay({
      price: PRICE,
      title: 'A crêpe',
      paid: () => {
        this.keeper.speak('There you go. Mind, it’s hot.');
        return FILLINGS[this.line++ % FILLINGS.length]!;
      },
    });
  }
}

/** The canopy's stripes, red and cream. */
function stripesTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 32);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f2ead8' : '#c8322a';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  return toTexture(canvas, 'facing');
}

/** CRÊPES in a painted hand. */
function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(384, 72);
  ctx.fillStyle = '#2a5a7a';
  ctx.fillRect(0, 0, 384, 72);
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'bold 46px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CRÊPES', 192, 38, 360);
  return toTexture(canvas, 'facing');
}
