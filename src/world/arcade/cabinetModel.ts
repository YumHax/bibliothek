import * as THREE from 'three';
import { boxMesh, type MeshPosition } from '../meshUtils';
import { markShared, matte } from '../props/Prop';
import { InstructionCard, hintLines } from './InstructionCard';
import { paintCabinetMarquee, paintPanel, paintSideArt } from './cabinetArt';

/*
 * The upright cabinet's measurements (cabinet-local: origin on the floor at the centre of the
 * base, +z towards the player) and its body: base, control panel, upper body, bezel, marquee.
 */

export const WIDTH = 0.66;
export const DEPTH = 0.78;
export const BASE_H = 0.86;
export const TOTAL_H = 1.92;
export const SCREEN_WIDTH = 0.58;
export const SCREEN_HEIGHT = (SCREEN_WIDTH * 3) / 4;
export const SCREEN_Y = 1.36;
export const SCREEN_TILT = THREE.MathUtils.degToRad(10);
export const BEZEL_BORDER = 0.06;
const BEZEL_THICKNESS = 0.03;
/** The upper body's front face, cabinet-local. */
const UPPER_DEPTH = DEPTH - 0.18;
export const FRONT_Z = -0.11 + UPPER_DEPTH / 2;
/**
 * Where the glass sits: tilted back, its top edge recedes, so it (and the bezel around it) stands
 * far enough forward that nothing of it ends up inside the body; the bezel reads as a monitor hood.
 */
export const SCREEN_Z = FRONT_Z + (SCREEN_HEIGHT / 2 + BEZEL_BORDER) * Math.sin(SCREEN_TILT) + BEZEL_THICKNESS / 2 + 0.004;

const BLACK = markShared(matte(0x16161a, 0.5));
export const CABINET_CHROME = markShared(new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 }));

export interface CabinetBodySpec {
  color: number;
  glow: number;
  /** Stickers, burns and scuffs, 0..1. */
  wear: number;
  title: string;
  hint: string;
  /** Two sticks on the panel: the instruction card moves to the middle. */
  twoPlayer: boolean;
}

export interface CabinetBody {
  /** The body's paint and the two side-art prints; all glow a little when hovered. */
  readonly body: THREE.MeshStandardMaterial[];
  readonly marquee: THREE.MeshBasicMaterial;
  readonly marqueeMesh: THREE.Mesh;
}

/**
 * Builds the body onto `cabinet`: the base with the control panel (its instruction card on it), the
 * upper body set back over it, the bezel the glass sits in, the kick plate, the chrome trim and the
 * marquee on top. The glass, the controls and everything that moves are the cabinet's.
 */
export function buildCabinetBody(cabinet: THREE.Group, spec: CabinetBodySpec): CabinetBody {
  const { color, glow, wear } = spec;
  const paint = matte(color, 0.55);
  const baseArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glow, 'base', wear), roughness: 0.55 });
  const upperArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glow, 'upper', wear), roughness: 0.55 });
  // Base with the control panel, the upper body set back over it, the marquee on top. The side
  // art goes on the two side faces (BoxGeometry material order: +x, -x, +y, -y, +z, -z).
  cabinet.add(bodyBox(WIDTH, BASE_H, DEPTH, baseArt, paint, { y: BASE_H / 2, z: -0.02 }));
  const panelMaterial = new THREE.MeshStandardMaterial({ map: paintPanel(color ^ glow, wear), roughness: 0.6 });
  // A hair narrower than the body: its tilted sides dip into the base and the upper body, and flush they would z-fight with the side art.
  const panel = boxMesh(WIDTH - 0.004, 0.08, 0.3, panelMaterial, { y: BASE_H + 0.04, z: DEPTH / 2 - 0.12 });
  panel.rotation.x = -0.25;
  cabinet.add(panel);
  // The instruction card lies on the panel, where the hands do not go.
  const card = new InstructionCard({ title: spec.title, lines: hintLines(spec.hint), accent: glow, width: 0.12, height: 0.075 });
  card.rotation.x = -Math.PI / 2;
  card.position.set(spec.twoPlayer ? 0.02 : 0.235, 0.041, 0.03);
  panel.add(card);
  cabinet.add(bodyBox(WIDTH, TOTAL_H - BASE_H, UPPER_DEPTH, upperArt, paint, { y: (BASE_H + TOTAL_H) / 2, z: -0.11 }));
  // Bezel: a dark slab the screen is set into, tilted back like the glass, standing proud of the body.
  const bezel = boxMesh(WIDTH - 0.02, SCREEN_HEIGHT + BEZEL_BORDER * 2, BEZEL_THICKNESS, BLACK, { y: SCREEN_Y, z: SCREEN_Z - BEZEL_THICKNESS / 2 - 0.002 });
  bezel.rotation.x = -SCREEN_TILT;
  cabinet.add(bezel);
  // Kick plate (standing 2 mm proud of the base, whose faces it would otherwise share) and a chrome trim on the panel.
  cabinet.add(boxMesh(WIDTH + 0.004, 0.06, DEPTH + 0.004, BLACK, { y: 0.03, z: -0.02 }));
  cabinet.add(boxMesh(WIDTH, 0.015, 0.015, CABINET_CHROME, { y: BASE_H + 0.085, z: DEPTH / 2 + 0.02 }));

  // Marquee: the title on a glowing strip; brighter when hovered.
  const marquee = new THREE.MeshBasicMaterial({ map: paintCabinetMarquee(spec.title, color, glow), toneMapped: false, color: 0xcccccc });
  const marqueeMesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.16), marquee);
  marqueeMesh.position.set(0, TOTAL_H - 0.1, -0.11 + UPPER_DEPTH / 2 + 0.002);
  cabinet.add(marqueeMesh);
  return { body: [paint, baseArt, upperArt], marquee, marqueeMesh };
}

/** A shadowed box with `sides` on its two side faces and `paint` everywhere else. */
function bodyBox(width: number, height: number, depth: number, sides: THREE.Material, paint: THREE.Material, position: MeshPosition): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [sides, sides, paint, paint, paint, paint]);
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
