import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part } from '../props/Prop';
import { paint, timber } from '../materials/palette';

const TABLE = { width: 2.0, depth: 0.8, height: 0.74 };
const BOARD = timber(0x9a7a56, 0.7);
const TRESTLE = timber(0x6a4e34, 0.75);

interface PartyTableOptions {
  /** The tablecloth's colour; none: bare boards. */
  cloth?: number;
  /** Dishes on it (a dish each: its colour), along the table. */
  dishes?: readonly number[];
}

/**
 * A trestle table of the neighbours' party: boards on two trestles, a paper cloth, the dishes the residents brought
 * (a bowl, a plate, a bottle each). Collides. Origin on the ground at its middle, its length along local x.
 */
export class PartyTable extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-TABLE.width / 2, 0, -TABLE.depth / 2), new THREE.Vector3(TABLE.width / 2, TABLE.height, TABLE.depth / 2));

  constructor(options: PartyTableOptions = {}) {
    super();
    this.name = 'PartyTable';
    const { width, depth, height } = TABLE;
    part(this, width, 0.03, depth, BOARD, { y: height - 0.015 });
    for (const x of [-width / 2 + 0.25, width / 2 - 0.25]) {
      for (const z of [-depth / 2 + 0.06, depth / 2 - 0.06]) {
        const leg = part(this, 0.04, height + 0.04, 0.05, TRESTLE, { x, y: height / 2, z });
        leg.rotation.x = z > 0 ? -0.14 : 0.14;
      }
      part(this, 0.04, 0.04, depth - 0.1, TRESTLE, { x, y: height - 0.06 });
    }
    if (options.cloth !== undefined) {
      // A paper cloth over the boards (its underside on their top: opposite faces, never seen together).
      part(this, width + 0.06, 0.004, depth + 0.06, paint(options.cloth, 0.95), { y: height + 0.002 });
    }
    const dishes = options.dishes ?? [];
    dishes.forEach((colour, i) => {
      const x = -width / 2 + ((i + 0.5) / dishes.length) * width;
      const z = (i % 2 ? 0.12 : -0.1);
      const material = paint(colour, 0.5);
      if (i % 3 === 0) this.add(cylinderMesh(0.13, 0.06, material, { x, y: height + 0.035, z }, { segments: 16 }));
      else if (i % 3 === 1) this.add(cylinderMesh(0.16, 0.015, material, { x, y: height + 0.012, z }, { segments: 16 }));
      else this.add(cylinderMesh(0.035, 0.3, material, { x, y: height + 0.15, z }, { segments: 10 }));
    });
  }
}

interface PartySaleTableOptions {
  /** The panel the table opens (`WorldPanels.partySale`); none: nobody is buying. */
  panel?: ModalLike;
}

/**
 * The residents' table at the party: a trestle table with a cardboard sign (WE BUY · THE RESIDENTS) and the party's
 * cash tin. Clicked, it opens the residents' sale (`SellPanel` with the party's buyer: they take the games home).
 * The buyer stands behind it (a guest). Local +z faces the player.
 */
export class PartySaleTable extends PartyTable implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly tin: THREE.MeshStandardMaterial;

  constructor(private readonly options: PartySaleTableOptions) {
    super({ cloth: 0xd84a3a });
    this.name = 'PartySaleTable';
    this.tin = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.4 });
    part(this, 0.24, 0.09, 0.17, this.tin, { x: 0.55, y: TABLE.height + 0.05, z: -0.1 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.9 }));
    sign.position.set(-0.3, TABLE.height + 0.2, 0.05);
    sign.rotation.x = -0.35;
    this.add(sign);
    const hitbox = invisibleHitbox(TABLE.width, TABLE.height + 0.4, TABLE.depth, { y: (TABLE.height + 0.4) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(hovered: boolean): void {
    this.tin.emissive.setHex(hovered ? 0x1a2a3a : 0x000000);
  }

  label(): string {
    return this.options.panel ? 'The residents’ table · sell them some games' : 'The residents’ table';
  }

  activate(session: SessionActions): void {
    if (this.options.panel) session.openPanel(this.options.panel);
    else session.react('“Nothing for us tonight, thanks!”');
  }
}

/** The table's cardboard sign, in felt pen. */
function signTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(620, 360);
  ctx.fillStyle = '#c9a77a';
  ctx.fillRect(0, 0, 620, 360);
  ctx.fillStyle = '#1e1a16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 92px "Comic Sans MS", "Marker Felt", sans-serif';
  ctx.fillText('WE BUY', 310, 120);
  ctx.font = '44px "Comic Sans MS", "Marker Felt", sans-serif';
  ctx.fillText('your old games!', 310, 210);
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText('— the residents', 330, 290);
  return toTexture(canvas, 'facing');
}
