import * as THREE from 'three';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import type { CoatKind } from '../cat/types';
import { Seat } from '../Seat';
import { Cushion } from '../props/Cushion';
import { FloorLamp } from '../props/FloorLamp';
import { SideTable } from '../props/SideTable';
import { Rug } from '../props/Rug';
import { Sideboard } from '../props/Sideboard';
import { PictureFrame, type PictureMotif } from '../props/PictureFrame';
import { LeaningMirror } from '../props/LeaningMirror';
import { ShoeRack } from '../props/ShoeRack';
import { UmbrellaStand } from '../props/UmbrellaStand';
import { Speaker } from '../props/Speaker';
import { Plant, type PlantKind } from '../props/Plant';
import { Bed } from '../bedroom/Bed';
import { Nightstand } from '../bedroom/Nightstand';
import { BedsideLamp } from '../bedroom/BedsideLamp';
import { Dresser } from '../bedroom/Dresser';
import { BedroomChair } from '../bedroom/BedroomChair';
import { ReadingLamp } from '../bedroom/ReadingLamp';
import { KitchenTable } from '../kitchen/KitchenTable';
import { Chair } from '../kitchen/Chair';
import { Radio } from '../kitchen/Radio';
import { Kettle } from '../kitchen/Kettle';
import { Toaster } from '../kitchen/Toaster';
import { RegionConverter } from '../props/RegionConverter';
import { BistroSet } from '../balcony/BistroSet';
import { homeArcadeModel } from '../homeArcade/homeArcadeModel';
import { Scratcher } from '../cat/Scratcher';
import { CatBed } from '../cat/CatBed';
import { CatModel } from '../cat/CatModel';
import { PortableTv, ShopProjector, CatBallBasket } from './shopModels';
import { DisplayColumn } from '../showcase/DisplayColumn';
import { Pedestal } from '../showcase/Pedestal';
import { LabelMakerModel } from '../labels/LabelMakerModel';

/**
 * A piece of the flat on show in a shop: `object` is what stands there (the real class the flat builds, or a model of
 * it), static; `update` a cheap tick when it breathes (the cat asleep in its basket); `setSold` what changes once it is
 * bought (the cat's basket empties).
 */
export interface DisplayPiece {
  object: THREE.Object3D;
  update?(dt: number): void;
  setSold?(sold: boolean): void;
}

/** What a display's `variant` picks: the houseplants' kinds, the prints' motifs, the armchairs' cushions. */
const PLANT_VARIANTS: readonly { kind: PlantKind; pot: 'ceramic' | 'terracotta'; scale?: number }[] = [
  { kind: 'fig', pot: 'ceramic' },
  { kind: 'yucca', pot: 'terracotta' },
  { kind: 'monstera', pot: 'ceramic' },
  { kind: 'small', pot: 'ceramic' },
  { kind: 'hanging', pot: 'ceramic', scale: 0.8 },
  { kind: 'small', pot: 'terracotta' },
];
const MOTIFS: readonly PictureMotif[] = ['mountains', 'sunset', 'abstract'];
const CUSHIONS: readonly number[] = [0x8fa383, 0xc8785a, 0xc9a552];

/** What the pet shop's rescue cat looks like when nobody says (the settings' coat is passed in). */
const DEFAULT_COAT: CoatKind = 'tabby';

/**
 * Builds what a shop shows for `id`: the flat's own piece (the armchair is a `Seat` with its cushion, the reading corner
 * the chair, its table and lamp), without its lights (a display never adds a light to the shop: every lit shader would
 * recompile, and a lamp in the window would light nothing anyway) and never placed or clicked on its own: the shop's
 * `ForSale` holds it. Its frame is the piece's own in the flat (a wall piece has its origin at the wall, +z into the
 * room). `variant` picks among looks (plants, prints, cushions); `coat` is the rescue cat's.
 */
export function buildPiece(id: HomeUpgrade, variant = 0, coat: CoatKind = DEFAULT_COAT): DisplayPiece | null {
  const build = PIECES[id];
  if (!build) return null;
  const piece = build(variant, coat);
  stripLights(piece.object);
  return piece;
}

/**
 * A fresh static model of `id` for anything that wants to show it (the shop panels' thumbnails): base on y 0, facing
 * +z, lights stripped, nothing registered anywhere. Null for the pieces no shop shows (the flea market's own stall).
 */
export function displayPiece(id: HomeUpgrade): THREE.Object3D | null {
  return buildPiece(id)?.object ?? null;
}

/** Every id `displayPiece` has a model for. */
export function displayedGoods(): HomeUpgrade[] {
  return Object.keys(PIECES) as HomeUpgrade[];
}

type PieceBuilder = (variant: number, coat: CoatKind) => DisplayPiece;

const still = (object: THREE.Object3D): DisplayPiece => ({ object });

/** Several pieces in one group, each at (x, y, z) turned `yaw`. */
function group(...parts: [THREE.Object3D, number, number, number, number?][]): THREE.Group {
  const g = new THREE.Group();
  for (const [part, x, y, z, yaw] of parts) {
    part.position.set(x, y, z);
    part.rotation.y = yaw ?? 0;
    g.add(part);
  }
  return g;
}

const PIECES: Partial<Record<HomeUpgrade, PieceBuilder>> = {
  // The second-hand furniture shop.
  armchair: (variant) => {
    const seat = new Seat();
    seat.mountCushion(new Cushion({ color: CUSHIONS[variant % CUSHIONS.length], tilt: 0.2 }));
    return still(seat);
  },
  floorLamp: () => still(new FloorLamp()),
  sideTable: () => still(new SideTable()),
  livingRug: (variant) => still(new Rug(variant % 2 ? { width: 1.5, depth: 1.7, field: 0x3e4a5c, border: 0xc9b98a, motif: 0x6e7b8c } : { width: 2.0, depth: 1.5 })),
  floorCushions: () =>
    still(group(
      [new Cushion({ width: 0.55, depth: 0.55, thickness: 0.13, color: 0xc9a552 }), 0, 0, 0, 0.3],
      [new Cushion({ width: 0.55, depth: 0.55, thickness: 0.13, color: 0x8fa383 }), 0.02, 0.13, 0.01, -0.2],
    )),
  sideboard: () => still(new Sideboard()),
  framedPrint: (variant) => still(new PictureFrame({ motif: MOTIFS[variant % MOTIFS.length], seed: 30 + variant, width: 0.5, height: 0.38 })),
  bed: () => still(new Bed()),
  nightstands: () => {
    const stand = new Nightstand();
    const lamp = new BedsideLamp();
    lamp.position.copy(stand.lampAnchor);
    stand.add(lamp);
    return still(stand);
  },
  dresser: () => still(new Dresser({ tray: false })),
  readingCorner: () => {
    const table = new SideTable({ radius: 0.22 });
    const lamp = new ReadingLamp();
    lamp.position.set(0, table.topHeight, 0);
    lamp.rotation.y = -Math.PI * 0.6;
    table.add(lamp);
    return still(group([new BedroomChair({ shirt: null, jeans: null }), 0, 0, 0], [table, 0.55, 0, 0.1]));
  },
  bedroomRug: () => still(new Rug({ width: 1.6, depth: 0.7, field: 0xb9a68a, border: 0x6e5a48, motif: 0x8c7358 })),
  mirror: () => still(new LeaningMirror()),
  kitchenTable: () => still(group([new KitchenTable({ breakfast: false }), 0, 0, 0], [new Chair(), 0, 0, -0.5], [new Chair(), 0, 0, 0.5, Math.PI])),
  kitchenRug: () => still(new Rug({ width: 1.5, depth: 0.6, field: 0x6e7b8c, border: 0x3e4a5c, motif: 0x9aa5b4 })),
  bathMat: () => still(new Rug({ width: 0.68, depth: 0.42, field: 0x8fa3ad, border: 0x8fa3ad, motif: 0x8fa3ad })),
  hallStand: () => still(group([new ShoeRack(), 0, 0, 0], [new UmbrellaStand(), 0.62, 0, 0.18])),
  bistroSet: () => still(new BistroSet()),
  displayCase: () => still(new DisplayColumn()),
  pedestal: () => still(new Pedestal()),
  labelMaker: () => still(new LabelMakerModel()),
  // The TV repair shop.
  crt: () => still(new PortableTv({ width: 0.34, case: 0x5a5a5e })),
  bedroomTv: () => still(new PortableTv({ width: 0.26, case: 0xd8d2c4 })),
  projector: () => still(new ShopProjector()),
  speakers: () => still(group([new Speaker(), -0.2, 0, 0], [new Speaker(), 0.2, 0, 0])),
  radio: () => still(new Radio()),
  appliances: () => still(group([new Kettle(), -0.14, 0, 0], [new Toaster(), 0.16, 0, 0])),
  homeArcade: () => still(homeArcadeModel()),
  famicomAdapter: () => still(new RegionConverter({ width: 0.12, height: 0.045, body: 0x8a8d92, label: 0xb02a24 })),
  superFamicomAdapter: () => still(new RegionConverter({ width: 0.14, height: 0.06, body: 0x9a9aa4, label: 0x5a3d8c })),
  megaDriveConverter: () => still(new RegionConverter({ width: 0.11, height: 0.05, body: 0x1d1d20, label: 0xc8342a })),
  n64Passthrough: () => still(new RegionConverter({ width: 0.13, height: 0.07, body: 0x2a2b2f, label: 0x2f8a3a })),
  ps1ModChip: () => still(new RegionConverter({ width: 0.04, height: 0.006, depth: 0.03, body: 0x1f6b3a, label: 0xd8c27a })),
  // The florist.
  houseplant: (variant) => {
    const look = PLANT_VARIANTS[variant % PLANT_VARIANTS.length]!;
    return still(new Plant({ kind: look.kind, pot: look.pot, seed: 40 + variant, scale: look.scale ?? 1, collides: false }));
  },
  plant: (variant) => still(new Plant({ kind: 'small', pot: 'terracotta', seed: 60 + variant, collides: false })),
  // The pet shop.
  cat: (_variant, coat) => sleepingCat(coat),
  scratcher: () => still(new Scratcher()),
  catToy: () => still(new CatBallBasket()),
};

/** The rescue cat asleep in its basket, breathing; adopted, the basket is empty. */
function sleepingCat(coat: CoatKind): DisplayPiece {
  const basket = new CatBed({ color: 0x7a5c8c });
  const cat = new CatModel(coat);
  cat.setPose('sleep');
  // Settle into the pose at once rather than in front of the player.
  for (let i = 0; i < 40; i++) cat.update(0.1);
  cat.position.y = 0.04;
  cat.rotation.y = 0.6;
  basket.add(cat);
  return {
    object: basket,
    update: (dt) => {
      if (cat.visible) cat.update(dt);
    },
    setSold: (sold) => {
      cat.visible = !sold;
    },
  };
}

/** Takes every light out of `root` (and a spot's target with it). */
function stripLights(root: THREE.Object3D): void {
  const lights: THREE.Light[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) lights.push(obj as THREE.Light);
  });
  for (const light of lights) {
    const target = (light as THREE.SpotLight | THREE.DirectionalLight).target;
    target?.parent?.remove(target);
    light.parent?.remove(light);
  }
}
