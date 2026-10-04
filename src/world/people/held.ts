import * as THREE from 'three';
import { bareMetal } from '../street/metals';
import { HEAD_Y, NECK_PIVOT } from './body';
import type { ArmAngles } from './poses';

/*
 * What a person can carry or put on (`PersonModel.hold`, `setHood`): a phone in the right hand, an
 * open book in it, an umbrella over the head, a hood up in the snow. Built only when first asked
 * for, each with its own materials (so a faded person fades them too).
 */

export type Held = 'phone' | 'book' | 'umbrella' | 'shopping' | 'baguette' | 'flowers' | 'cigarette';

/** The mesh of `item`, `seed` picking its colours; the umbrella goes on the torso, the rest in the right hand (`HELD_ON`). */
export function heldMesh(item: Held, seed: number): THREE.Object3D {
  switch (item) {
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
  }
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

/** An open paperback held in the right hand, pages up, tilted towards the eyes (the wrist's frame). */
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
  // In the palm: flat across the hand, spine along the forearm's end.
  group.position.set(-0.04, -0.05, 0.05);
  group.rotation.set(-1.1, 0, 0);
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
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.92, side: THREE.DoubleSide });
  // Round the back and the top, leaving the face (+z) open: phi from beside the cheek, round the back, to the other cheek.
  const open = 1.25;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 12, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, Math.PI * 0.68), cloth);
  hood.position.set(-NECK_PIVOT.x, HEAD_Y - NECK_PIVOT.y + 0.012, -NECK_PIVOT.z - 0.012);
  hood.scale.set(1.02, 1.05, 1.08);
  return hood;
}
