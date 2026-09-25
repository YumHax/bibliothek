import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import type { DrawnAware } from '../zone/lifecycle';
import { GameBox } from '../GameBox';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { fabric, wood } from '../materials/finishes';

/** A copy on show, and what it is worth. */
export interface Showpiece {
  game: Game;
  value: number;
}

const WIDTH = 0.72;
const DEPTH = 0.34;
const HEIGHT = 1.12;
/** Off the wall, like the sideboard (the skirting board). */
const OFF_WALL = 0.015;
const PLINTH_H = 0.09;
const TOP_T = 0.035;
const POST = 0.028;
const GLASS_T = 0.006;
const BACK_T = 0.018;
/** The three tiers' floors: the plinth's top and two glass shelves. */
const TIERS = [PLINTH_H + 0.012, 0.43, 0.77] as const;
const SHELF_T = 0.008;
const INNER_W = WIDTH - 2 * POST;
const BOX_GAP = 0.03;
const END_MARGIN = 0.03;
/** How far the boxes lean back against the velvet (radians). */
const LEAN = THREE.MathUtils.degToRad(9);
/** Most boxes shown: three tiers of three NES boxes. */
export const VITRINE_CAPACITY = 9;

const WALNUT = wood(0x3b2416, 0.42);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xb8892a, roughness: 0.35, metalness: 0.9 });
const STRIP = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 1.2, roughness: 0.5 });

export interface HomeVitrineOptions {
  covers: BoxArtLoader;
}

/**
 * The glass display cabinet the collector's book brings home at 50 games: a walnut cabinet on a
 * plinth, glazed front, sides and top on brass-capped posts, a velvet back, three tiers (the
 * plinth and two glass shelves) where the collection's most valuable copies stand leaning back,
 * the best on the top tier, at eye level for someone sitting. A warm strip under the top glows (no
 * light of its own). `show(pieces)` sets what is in it; the boxes are not clickable (the glass
 * stops the crosshair), the cabinet itself says what it holds. Wall-hung with `y: 0`: origin on
 * the floor at the wall, +z into the room. Collides.
 */
export class HomeVitrine extends THREE.Group implements Furniture, Interactable, DrawnAware {
  readonly hitboxes: THREE.Object3D[];
  private readonly boxes: GameBox[] = [];
  private pieces: readonly Showpiece[] = [];
  private shownIds = '';
  /** Whether the zone draws its content now (see `setZoneDrawn`); the plinth tells, until the zone says. */
  private drawn = true;
  private readonly hiddenBoxMeshes: THREE.Mesh[] = [];
  private readonly plinth: THREE.Mesh;

  constructor(private readonly options: HomeVitrineOptions) {
    super();
    this.name = 'HomeVitrine';
    const velvet = fabric({ color: 0x3b1422, roughness: 0.95 });
    const z0 = OFF_WALL;
    const zc = z0 + DEPTH / 2;
    // Plinth (set back a little), the back panel lined with velvet, the top board.
    this.plinth = boxMesh(WIDTH - 0.03, PLINTH_H, DEPTH - 0.03, WALNUT, { y: PLINTH_H / 2, z: zc - 0.01 });
    this.add(this.plinth);
    this.add(boxMesh(WIDTH, BACK_T, DEPTH, WALNUT, { y: PLINTH_H + BACK_T / 2 - 0.006, z: zc }));
    this.add(boxMesh(WIDTH, HEIGHT - PLINTH_H - TOP_T, BACK_T, WALNUT, { y: (PLINTH_H + HEIGHT - TOP_T) / 2, z: z0 + BACK_T / 2 }));
    this.add(boxMesh(INNER_W, HEIGHT - PLINTH_H - TOP_T - 0.02, 0.004, velvet, { y: (PLINTH_H + HEIGHT - TOP_T) / 2, z: z0 + BACK_T + 0.002 }));
    this.add(boxMesh(WIDTH + 0.02, TOP_T, DEPTH + 0.02, WALNUT, { y: HEIGHT - TOP_T / 2, z: zc + 0.005 }));
    this.add(boxMesh(WIDTH + 0.024, 0.008, 0.008, BRASS, { y: HEIGHT - TOP_T - 0.004, z: z0 + DEPTH + 0.012 }));
    // The front posts, brass-capped, and a warm strip under the top board.
    for (const sx of [-1, 1]) {
      this.add(boxMesh(POST, HEIGHT - PLINTH_H - TOP_T, POST, WALNUT, { x: sx * (WIDTH / 2 - POST / 2), y: (PLINTH_H + HEIGHT - TOP_T) / 2, z: z0 + DEPTH - POST / 2 }));
      this.add(boxMesh(POST + 0.004, 0.014, POST + 0.004, BRASS, { x: sx * (WIDTH / 2 - POST / 2), y: PLINTH_H + 0.007, z: z0 + DEPTH - POST / 2 }));
    }
    const strip = boxMesh(INNER_W - 0.04, 0.01, 0.02, STRIP, { y: HEIGHT - TOP_T - 0.006, z: z0 + DEPTH - 0.05 });
    strip.castShadow = false;
    this.add(strip);
    // Glass shelves, and the glass: front, sides, top light enough to read the covers through.
    const glass = new THREE.MeshStandardMaterial({ color: 0xe8f4f4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    const shelfGlass = new THREE.MeshStandardMaterial({ color: 0xcfe6e2, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false });
    const glassH = HEIGHT - PLINTH_H - TOP_T;
    const panes = [
      boxMesh(INNER_W, glassH, GLASS_T, glass, { y: PLINTH_H + glassH / 2, z: z0 + DEPTH - POST / 2 }),
      boxMesh(GLASS_T, glassH, DEPTH - BACK_T - POST, glass, { x: -WIDTH / 2 + GLASS_T / 2, y: PLINTH_H + glassH / 2, z: z0 + BACK_T + (DEPTH - BACK_T - POST) / 2 }),
      boxMesh(GLASS_T, glassH, DEPTH - BACK_T - POST, glass, { x: WIDTH / 2 - GLASS_T / 2, y: PLINTH_H + glassH / 2, z: z0 + BACK_T + (DEPTH - BACK_T - POST) / 2 }),
      ...TIERS.slice(1).map((y) => boxMesh(INNER_W, SHELF_T, DEPTH - BACK_T - POST, shelfGlass, { y: y - SHELF_T / 2, z: z0 + BACK_T + (DEPTH - BACK_T - POST) / 2 })),
    ];
    for (const pane of panes) {
      pane.castShadow = false;
      pane.receiveShadow = false;
      this.add(pane);
    }
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== glass && mesh.material !== shelfGlass) mesh.receiveShadow = true;
    });
    const hitbox = invisibleHitbox(WIDTH + 0.02, HEIGHT, DEPTH + 0.02, { y: HEIGHT / 2, z: zc });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.02, 0, 0), new THREE.Vector3(WIDTH / 2 + 0.02, HEIGHT, OFF_WALL + DEPTH + 0.02));
  }

  /** Puts `pieces` on show, best first on the top tier; nothing is rebuilt when the same games are shown. */
  show(pieces: readonly Showpiece[]): void {
    this.pieces = pieces;
    const ids = pieces.map((p) => p.game.id).join('|');
    if (ids === this.shownIds) return;
    this.shownIds = ids;
    // Placed while its zone was not drawn, the cabinet's own meshes were hidden by the zone, which has not told it yet.
    if (!this.plinth.visible) this.drawn = false;
    this.hiddenBoxMeshes.length = 0;
    for (const box of this.boxes.splice(0)) {
      box.parent?.remove(box);
      box.dispose();
    }
    const tiers = [...TIERS].reverse();
    let tier = 0;
    let row: GameBox[] = [];
    let used = END_MARGIN * 2;
    const flush = () => {
      const width = row.reduce((sum, b) => sum + b.dimensions.width, 0) + BOX_GAP * (row.length - 1);
      let x = -width / 2;
      for (const box of row) {
        this.stand(box, x + box.dimensions.width / 2, tiers[tier]!);
        x += box.dimensions.width + BOX_GAP;
      }
      row = [];
      used = END_MARGIN * 2;
      tier++;
    };
    for (const { game } of pieces) {
      if (tier >= tiers.length) break;
      const box = new GameBox(game, this.options.covers);
      const needs = box.dimensions.width + (row.length ? BOX_GAP : 0);
      if (used + needs > INNER_W && row.length) {
        flush();
        if (tier >= tiers.length) {
          box.dispose();
          break;
        }
      }
      row.push(box);
      used += box.dimensions.width + (row.length > 1 ? BOX_GAP : 0);
    }
    if (row.length && tier < tiers.length) flush();
  }

  /** Stands `box` on the tier whose floor is at `floorY`, its bottom-back edge on the velvet, tipped back onto it. */
  private stand(box: GameBox, x: number, floorY: number): void {
    const { height, depth } = box.dimensions;
    const holder = new THREE.Group();
    holder.position.set(x, floorY, OFF_WALL + BACK_T + 0.004 + height * Math.sin(LEAN));
    holder.rotation.x = -LEAN;
    box.position.set(0, height / 2, depth / 2);
    box.saveRestPose();
    holder.add(box);
    this.add(holder);
    this.boxes.push(box);
    // What `Zone.place` did to the cabinet, done to a box added later: the zone's shadow layer, and hidden while the zone is not drawn.
    holder.traverse((obj) => {
      obj.layers.mask |= this.layers.mask;
      const mesh = obj as THREE.Mesh;
      if (!this.drawn && mesh.isMesh && mesh.visible) {
        mesh.visible = false;
        this.hiddenBoxMeshes.push(mesh);
      }
    });
  }

  /** The zone stopped or started drawing its content: a box added while it was not drawn is shown again with it. */
  setZoneDrawn(drawn: boolean): void {
    this.drawn = drawn;
    if (drawn) for (const mesh of this.hiddenBoxMeshes.splice(0)) mesh.visible = true;
  }

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    if (!this.pieces.length) return 'The display cabinet, waiting for its first showpiece';
    const total = this.pieces.reduce((sum, p) => sum + p.value, 0);
    return `Display cabinet: your ${this.pieces.length} most valuable games, about ${total.toLocaleString('en-US')} coins`;
  }

  activate(session: SessionActions): void {
    const best = this.pieces.slice(0, 3).map((p) => `${p.game.title} (${p.value})`).join(', ');
    session.hint(best ? `On show: ${best}${this.pieces.length > 3 ? '…' : ''}. The collector’s book on the sideboard has the full list.` : 'Nothing precious enough yet.');
  }

  dispose(): void {
    for (const box of this.boxes.splice(0)) box.dispose();
  }
}
