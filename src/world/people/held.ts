import * as THREE from 'three';
import { bareMetal } from '../street/metals';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { HEAD_Y, NECK_PIVOT } from './body';
import { thickSphereShell } from './garmentEdges';
import type { ArmAngles } from './poses';

/*
 * What a person can carry or put on (`PersonModel.hold`, `setHood`): a phone in the right hand, an
 * open book in both, an umbrella over the head, a hood up in the snow, a takeaway cup, a folded paper,
 * a camera, a walking stick, a rolling suitcase, a game shop's carrier bag, a pram pushed in front,
 * a pumpkin pail for Halloween's sweets.
 * Built only when first asked for, each with its own materials (so a faded person fades them too).
 */

export type Held =
  | 'phone'
  | 'book'
  | 'umbrella'
  | 'shopping'
  | 'baguette'
  | 'flowers'
  | 'cigarette'
  | 'paddle'
  | 'cup'
  | 'newspaper'
  | 'camera'
  | 'cane'
  | 'suitcase'
  | 'gamebag'
  | 'pram'
  | 'pail';

/** Where a held thing hangs: the torso (the umbrella, a book held open in both hands), the body's own frame on the floor (the pram, pushed), else the right hand. */
export function heldOn(item: Held): 'torso' | 'body' | 'hand' {
  return item === 'umbrella' || item === 'book' ? 'torso' : item === 'pram' ? 'body' : 'hand';
}

/** The right arm with a walking stick: a little forward, the elbow soft, the stick's foot on the floor ahead of the foot. */
export const CANE_ARM: ArmAngles = { ux: -0.22, uz: 0.1, lx: -0.32, ly: 0, lz: 0 };
/** The right arm pulling a rolling case: back a little and out, nearly straight. */
export const SUITCASE_ARM: ArmAngles = { ux: 0.32, uz: 0.14, lx: -0.12, ly: 0, lz: 0 };
/** The pram's handle ends, in the body's frame (metres, +z ahead, from the floor): the hands go there (`PersonModel` reaches them). */
export const PRAM_GRIPS: readonly [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.2, 0.98, 0.36), new THREE.Vector3(0.2, 0.98, 0.36)];
/**
 * An open book held up to read: its middle in the torso's frame (from the waist, reference metres) before the lower chest of
 * an average trunk (`PersonModel` brings it out past a fuller one), tipped towards the eyes; `BOOK_GRIPS` are its outer
 * edges in its own frame, under the covers, where the palms go (both hands, walking or not).
 */
const BOOK_AT = { y: 0.25, z: 0.3, tilt: -0.75 } as const;
export const BOOK_GRIPS: readonly [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.1, -0.022, 0.01), new THREE.Vector3(0.1, -0.022, 0.01)];

/** The mesh of `item`, `seed` picking its colours; where it goes is `heldOn`. */
export function heldMesh(item: Held, seed: number): THREE.Object3D {
  switch (item) {
    case 'cup':
      return cupMesh(seed);
    case 'newspaper':
      return newspaperMesh();
    case 'camera':
      return cameraMesh(seed);
    case 'cane':
      return caneMesh(seed);
    case 'suitcase':
      return suitcaseMesh(seed);
    case 'gamebag':
      return gameBagMesh(seed);
    case 'pram':
      return pramMesh(seed);
    case 'pail':
      return pailMesh();
    case 'phone':
      return phoneMesh();
    case 'book':
      return bookMesh(seed);
    case 'umbrella':
      return umbrellaMesh(seed);
    case 'shopping':
      return paperBagMesh(seed, false);
    case 'baguette':
      return paperBagMesh(seed, true);
    case 'flowers':
      return bouquetMesh(seed);
    case 'cigarette':
      return cigaretteMesh();
    case 'paddle':
      return paddleMesh(seed);
  }
}

/**
 * A saleroom bidder's paddle: a white card on a short wooden handle, the bidder's number printed
 * on both faces, held up past the fingers (the wrist's frame: the hand runs down -y).
 */
function paddleMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.6 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 6), wood);
  handle.position.set(0, -0.13, 0.02);
  const [canvas, ctx] = createCanvas(128, 128);
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#6b1f2a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 70px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(10 + (seed % 89)), 64, 68);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.004), new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), roughness: 0.7 }));
  face.position.set(0, -0.28, 0.02);
  group.add(handle, face);
  return group;
}

const BAG_PAPERS = [0xc9a878, 0xe8e2d4, 0x9a6a3a, 0x2f4a3a];

/** A paper carrier bag hanging from the hand by its handles (the wrist's frame); a baguette sticking out of it. */
function paperBagMesh(seed: number, baguette: boolean): THREE.Object3D {
  const group = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: BAG_PAPERS[seed % BAG_PAPERS.length]!, roughness: 0.9 });
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.24), paper);
  bag.position.set(0, -0.25, 0.01);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 10, Math.PI), paper);
  handle.position.set(0, -0.11, 0.01);
  handle.rotation.y = Math.PI / 2;
  group.add(bag, handle);
  if (baguette) {
    const crust = new THREE.MeshStandardMaterial({ color: 0xc8883a, roughness: 0.8 });
    const loaf = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.5, 8), crust);
    loaf.position.set(0, -0.12, 0.07);
    loaf.rotation.x = 0.25;
    group.add(loaf);
  }
  return group;
}

/** A bunch of flowers wrapped in paper, carried along the forearm, blooms forward (the wrist's frame). */
function bouquetMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const wrap = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.85, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 10, 1, true), wrap);
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(0, -0.05, 0.1);
  const blooms = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.075, 0),
    new THREE.MeshStandardMaterial({ color: [0xd8344a, 0xf2c23a, 0xe86aa0, 0xf0ece0][seed % 4]!, roughness: 0.8, flatShading: true }),
  );
  blooms.position.set(0, -0.05, 0.27);
  group.add(cone, blooms);
  return group;
}

/** A cigarette between the fingers, its tip glowing (the wrist's frame). */
function cigaretteMesh(): THREE.Object3D {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 5), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.7 }));
  stick.rotation.x = Math.PI / 2;
  stick.position.set(0.02, -0.075, 0.05);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 5, 4), new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff5a1a, emissiveIntensity: 2.5 }));
  ember.position.set(0.02, -0.075, 0.087);
  group.add(stick, ember);
  return group;
}

/** Umbrella colours, picked by the person's seed. */
const CANOPIES = [0x1c1e24, 0x2a3f6a, 0x7a1d24, 0x2f5a3a, 0xd8b23a, 0x5a2a5e];

/**
 * The right arm holding an umbrella's shaft in front of the chest, even while walking (it does not
 * swing): the upper arm a little forward, the forearm bent up and in.
 */
export const UMBRELLA_ARM: ArmAngles = { ux: -0.3, uz: 0.05, lx: -1.25, ly: -0.45, lz: 0 };
/** Where the shaft stands, in the torso's frame (the chest's, from the waist; the hand's grip at its foot), and how tall it is. */
const SHAFT = { x: 0.07, z: 0.3, bottom: 0.12, top: 1.24 };
const CANOPY = { radius: 0.55, rise: 0.2, ribs: 8 };

/** A phone in the hand (the wrist's frame, the hand hanging down from it). */
function phoneMesh(): THREE.Object3D {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.145, 0.009), new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.25 }));
  body.position.set(0, -0.05, 0.03);
  body.rotation.x = 0.2;
  return body;
}

/** An open paperback held in both hands before the chest, pages up, tilted towards the eyes (the torso's frame, `BOOK_AT`). */
function bookMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const cover = new THREE.MeshStandardMaterial({ color: [0x8a2a2a, 0x2a4a7a, 0x3a5a2a, 0xc8a040][seed % 4]!, roughness: 0.8 });
  const pages = new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.95 });
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.z = side * 0.18;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.17), cover);
    board.position.set(side * 0.055, 0, 0);
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.012, 0.162), pages);
    leaves.position.set(side * 0.055, 0.008, 0);
    half.add(board, leaves);
    group.add(half);
  }
  // The spine running away from the reader, the pages turned up to the eyes.
  group.position.set(0, BOOK_AT.y, BOOK_AT.z);
  group.rotation.set(BOOK_AT.tilt, 0, 0);
  return group;
}

/** An open umbrella, in the torso's frame: the shaft from the hand up, the ribbed canopy over the head. */
function umbrellaMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const metal = bareMetal({ color: 0x6a6c70, roughness: 0.35 }, 0.1);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, SHAFT.top - SHAFT.bottom, 6), metal);
  shaft.position.set(SHAFT.x, (SHAFT.top + SHAFT.bottom) / 2, SHAFT.z);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 10, Math.PI), metal);
  handle.position.set(SHAFT.x + 0.035, SHAFT.bottom, SHAFT.z);
  handle.rotation.z = Math.PI;
  const cloth = new THREE.MeshStandardMaterial({ color: CANOPIES[seed % CANOPIES.length]!, roughness: 0.55, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(CANOPY.radius, CANOPY.rise, CANOPY.ribs, 1, true), cloth);
  // Centred over the head rather than the hand: the shaft leans in a little.
  canopy.position.set(0.02, SHAFT.top + 0.02 + CANOPY.rise / 2, 0.1);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 5), metal);
  tip.position.set(0.02, SHAFT.top + 0.02 + CANOPY.rise + 0.03, 0.1);
  group.add(shaft, handle, canopy, tip);
  return group;
}

/** A hood pulled up over the head in the top's colour, open at the face, in the head's frame (the neck pivot's: it turns with the head). */
export function hoodMesh(color: number): THREE.Object3D {
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  // Round the back and the top, leaving the face (+z) open: phi from beside the cheek, round the back, to the other cheek. The cloth has a thickness: its rim frames the face.
  const open = 1.25;
  const hood = new THREE.Mesh(thickSphereShell(0.125, 0.008, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, Math.PI * 0.68, 18, 12), cloth);
  hood.position.set(-NECK_PIVOT.x, HEAD_Y - NECK_PIVOT.y + 0.012, -NECK_PIVOT.z - 0.012);
  hood.scale.set(1.02, 1.05, 1.08);
  return hood;
}

const SLEEVES = [0xc8a070, 0xf2efe8, 0x3a2a22, 0x8a2a2a];

/** A takeaway cup in the hand, its lid on, a card sleeve round it (the wrist's frame: the hand hangs down -y, the fingers round the cup). */
function cupMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.031, 0.12, 12), paper);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0395, 0.034, 0.05, 12), new THREE.MeshStandardMaterial({ color: SLEEVES[seed % SLEEVES.length]!, roughness: 0.9 }));
  sleeve.scale.setScalar(1.06);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.5 }));
  lid.position.y = 0.066;
  const cupGroup = new THREE.Group();
  cupGroup.add(cup, sleeve, lid);
  cupGroup.position.set(0, -0.09, 0.045);
  group.add(cupGroup);
  return group;
}

let paperTexture: THREE.Texture | null = null;

/** A newspaper's front: a masthead, a photo and columns (painted once, shared). */
function newsprint(): THREE.Texture {
  if (paperTexture) return paperTexture;
  const [canvas, ctx] = createCanvas(64, 96);
  ctx.fillStyle = '#e6e2d8';
  ctx.fillRect(0, 0, 64, 96);
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(4, 4, 56, 10);
  ctx.fillStyle = '#6a6a66';
  ctx.fillRect(4, 18, 34, 26);
  ctx.fillStyle = '#8a8a86';
  for (let y = 18; y < 92; y += 4) {
    if (y < 46) ctx.fillRect(41, y, 19, 2);
    else {
      ctx.fillRect(4, y, 26, 2);
      ctx.fillRect(34, y, 26, 2);
    }
  }
  paperTexture = toTexture(canvas, 'facing');
  return paperTexture;
}

/** A paper folded in two, carried in the hand by its fold (the wrist's frame). */
function newspaperMesh(): THREE.Object3D {
  const front = new THREE.MeshStandardMaterial({ map: newsprint(), roughness: 0.95 });
  const plain = new THREE.MeshStandardMaterial({ color: 0xdcd8ce, roughness: 0.95 });
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.3, 0.21), [plain, front, plain, plain, plain, plain]);
  paper.position.set(0, -0.13, 0.04);
  return paper;
}

/** A compact camera, its lens forward (the wrist's frame). */
function cameraMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.11), new THREE.MeshStandardMaterial({ color: seed % 3 ? 0x1c1c1e : 0xb8b8bc, roughness: 0.4, metalness: 0.3 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.2 }));
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0.03, 0, 0.01);
  group.add(body, lens);
  group.position.set(0.01, -0.07, 0.04);
  return group;
}

/** A walking stick: the crook in the hand, the shaft down to a rubber foot on the floor (the wrist's frame, reference metres). */
function caneMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: [0x4a2e1a, 0x2a1a12, 0x6a4a2a][seed % 3]!, roughness: 0.5 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.01, 0.8, 7), wood);
  shaft.position.set(0, -0.48, 0.03);
  const crook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 10, Math.PI), wood);
  crook.position.set(0, -0.08, -0.01);
  crook.rotation.y = Math.PI / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 7), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }));
  foot.position.set(0, -0.89, 0.03);
  group.add(shaft, crook, foot);
  return group;
}

const CASES = [0x1e2a44, 0x2a2a2c, 0x7a1d24, 0x3a5a4a, 0xb0a890];

/** A rolling case pulled behind by its handle: the handle in the hand, the case trailing back to its wheels (the wrist's frame). */
function suitcaseMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const metal = bareMetal({ color: 0x8a8c90, roughness: 0.4 }, 0.1);
  const shell = new THREE.MeshStandardMaterial({ color: CASES[seed % CASES.length]!, roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.03), black);
  grip.position.y = -0.085;
  group.add(grip);
  for (const side of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.44, 6), metal);
    rod.position.set(side * 0.07, -0.085 - 0.22, 0);
    group.add(rod);
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.22), shell);
  box.position.set(0, -0.085 - 0.44 - 0.275, 0.11);
  group.add(box);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), black);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.15, -0.085 - 0.44 - 0.55 - 0.01, 0.2);
    group.add(wheel);
  }
  // Trailing behind: the case leans back from the hand (the arm is already back a little).
  group.rotation.x = 0.42;
  return group;
}

const PLASTIC = [0xc8202a, 0x1f3f8a, 0xf2c23a, 0x1e1e20];

/** A game shop's plastic carrier, a box's corners showing through, by its loops (the wrist's frame). */
function gameBagMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const colour = PLASTIC[seed % PLASTIC.length]!;
  const plastic = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35 });
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.28), plastic);
  bag.position.set(0, -0.2, 0.01);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.05, 0.2), new THREE.MeshStandardMaterial({ color: colour === 0xf2c23a ? 0x1e1e20 : 0xf4f1ea, roughness: 0.4 }));
  band.position.set(0, -0.2, 0.01);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 4, 10, Math.PI), plastic);
  loop.position.set(0, -0.07, 0.01);
  loop.rotation.y = Math.PI / 2;
  group.add(bag, band, loop);
  return group;
}

const PRAMS = [0x1e2a44, 0x2a2a2c, 0x5a2a3a, 0x3a4a3a, 0xb8b0a0];

/** A pram pushed in front, in the body's own frame (metres, on the floor, +z ahead): the handle at `PRAM_GRIPS`, the carrycot ahead of it, its hood up. */
function pramMesh(seed: number): THREE.Object3D {
  const group = new THREE.Group();
  const metal = bareMetal({ color: 0x9a9ca0, roughness: 0.35 }, 0.1);
  const cloth = new THREE.MeshStandardMaterial({ color: PRAMS[seed % PRAMS.length]!, roughness: 0.85, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  const [l, r] = PRAM_GRIPS;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, r.x - l.x + 0.04, 8), black);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, l.y, l.z);
  group.add(bar);
  // Two struts from the handle down and forward to the chassis.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.62, 6), metal);
    strut.position.set(side * 0.19, 0.7, 0.5);
    strut.rotation.x = -0.62;
    group.add(strut);
  }
  const cot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.7), cloth);
  cot.position.set(0, 0.6, 0.92);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12, 1, true, -Math.PI / 2, Math.PI), cloth);
  hood.rotation.z = Math.PI / 2;
  hood.position.set(0, 0.71, 0.66);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.4), new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.95 }));
  blanket.position.set(0, 0.715, 1.02);
  group.add(cot, hood, blanket);
  // The chassis and four wheels.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.7), metal);
  frame.position.set(0, 0.36, 0.9);
  group.add(frame);
  for (const z of [0.62, 1.2]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 5), metal);
      leg.position.set(side * 0.17, 0.25, z);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14), black);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.2, 0.12, z);
      group.add(leg, wheel);
    }
  }
  return group;
}

/** A trick-or-treater's pumpkin pail by its handle (the wrist's frame). */
function pailMesh(): THREE.Object3D {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8701a, roughness: 0.5 });
  const pail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.82), orange);
  pail.scale.set(1, 0.85, 1);
  pail.position.set(0, -0.22, 0.02);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.005, 4, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  handle.position.set(0, -0.17, 0.02);
  handle.rotation.y = Math.PI / 2;
  group.add(pail, handle);
  return group;
}
