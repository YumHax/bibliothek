import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';

/** `panelled`: a painted interior door. `glazed`: stiles and rails round frosted panes. `entrance`: the flat's dark front door, peephole, lock and mat. */
export type ShutDoorStyle = 'panelled' | 'glazed' | 'entrance';

export interface ShutDoorOptions {
  style?: ShutDoorStyle;
  /** Size of the leaf; the architrave is added round it. Default the flat's standard 0.83 x 2.04 leaf. */
  width?: number;
  height?: number;
}

const THICKNESS = 0.016;
const TRIM = 0.07;
const TRIM_DEPTH = 0.022;
const HANDLE_Y = 1.03;

const TRIM_PAINT = matte(0xf6f3ee, 0.7);
const LEAF_PAINT = matte(0xf1ede6, 0.6);
const STEEL = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const FROSTED = new THREE.MeshStandardMaterial({ color: 0xeef2ec, roughness: 0.6, transparent: true, opacity: 0.6, emissive: 0xfff1d6, emissiveIntensity: 0.35 });

/**
 * A door that never opens, lying on a wall face: architrave and a leaf filling it, a lever handle
 * on the right. For openings that lead nowhere the player can go (the flat's front door, a
 * cupboard). The leaf sits within the architrave's depth so the wall behind needs no hole.
 * Wall-hung: origin on the floor at the middle of the leaf, +z facing into the room.
 */
export class ShutDoor extends Prop {
  /** Flat against its wall like the working doors: no blob on the floor. */
  readonly contactShadow = false;
  constructor(options: ShutDoorOptions = {}) {
    super();
    this.name = 'ShutDoor';
    const style = options.style ?? 'panelled';
    const width = options.width ?? 0.83;
    const height = options.height ?? 2.04;

    part(this, TRIM, height + TRIM, TRIM_DEPTH, TRIM_PAINT, { x: -width / 2 - TRIM / 2, y: (height + TRIM) / 2, z: TRIM_DEPTH / 2 });
    part(this, TRIM, height + TRIM, TRIM_DEPTH, TRIM_PAINT, { x: width / 2 + TRIM / 2, y: (height + TRIM) / 2, z: TRIM_DEPTH / 2 });
    part(this, width + 2 * TRIM, TRIM, TRIM_DEPTH, TRIM_PAINT, { y: height + TRIM / 2, z: TRIM_DEPTH / 2 });

    const face = THICKNESS;
    const handleMetal = style === 'entrance' ? BRASS : STEEL;
    if (style === 'glazed') {
      // Stiles and rails framing three frosted panes.
      const stile = 0.1;
      const rail = 0.12;
      part(this, stile, height, THICKNESS, LEAF_PAINT, { x: -width / 2 + stile / 2, y: height / 2, z: face / 2 });
      part(this, stile, height, THICKNESS, LEAF_PAINT, { x: width / 2 - stile / 2, y: height / 2, z: face / 2 });
      const paneW = width - 2 * stile;
      const bottomRail = 0.3;
      part(this, paneW, bottomRail, THICKNESS, LEAF_PAINT, { y: bottomRail / 2, z: face / 2 });
      part(this, paneW, rail, THICKNESS, LEAF_PAINT, { y: height - rail / 2, z: face / 2 });
      const panes = 3;
      const paneH = (height - bottomRail - rail - (panes - 1) * rail) / panes;
      for (let i = 0; i < panes; i++) {
        const y0 = bottomRail + i * (paneH + rail);
        part(this, paneW, paneH, 0.006, FROSTED, { y: y0 + paneH / 2, z: face / 2 });
        if (i < panes - 1) part(this, paneW, rail, THICKNESS, LEAF_PAINT, { y: y0 + paneH + rail / 2, z: face / 2 });
      }
    } else {
      const paint = style === 'entrance' ? matte(0x3a2e28, 0.5) : LEAF_PAINT;
      part(this, width, height, THICKNESS, paint, { y: height / 2, z: face / 2 });
      // Two raised panels, a lock rail between them.
      const raised = matte(new THREE.Color(paint.color).multiplyScalar(0.92).getHex(), 0.5);
      const panelW = width - 0.22;
      const panels = [
        { y: 0.16, h: height * 0.36 },
        { y: 0.16 + height * 0.36 + 0.14, h: height - 0.16 - height * 0.36 - 0.14 - 0.16 },
      ];
      for (const { y, h } of panels) part(this, panelW, h, 0.004, raised, { y: y + h / 2, z: face + 0.002 });
      if (style === 'entrance') {
        // Peephole, a security lock under the handle, and the mat everyone wipes their feet on.
        const peephole = cylinderMesh(0.012, 0.01, BRASS, { y: 1.5, z: face + 0.005 }, { segments: 12 });
        peephole.rotation.x = Math.PI / 2;
        this.add(peephole);
        part(this, 0.04, 0.1, 0.006, BRASS, { x: width / 2 - 0.09, y: HANDLE_Y - 0.13, z: face + 0.003 });
        const mat = part(this, 0.65, 0.012, 0.4, matte(0x5a4a3a, 1), { y: 0.006, z: 0.26 });
        mat.castShadow = false;
      }
    }

    // Lever handle near the free edge (the hinge is on the left, out of habit).
    const handleX = width / 2 - 0.07;
    const rose = cylinderMesh(0.024, 0.008, handleMetal, { x: handleX, y: HANDLE_Y, z: face + 0.004 }, { segments: 16 });
    rose.rotation.x = Math.PI / 2;
    const stem = cylinderMesh(0.008, 0.03, handleMetal, { x: handleX, y: HANDLE_Y, z: face + 0.02 }, { segments: 10 });
    stem.rotation.x = Math.PI / 2;
    this.add(rose, stem);
    part(this, 0.12, 0.014, 0.014, handleMetal, { x: handleX - 0.05, y: HANDLE_Y, z: face + 0.035 });

    // Flat on a wall: nothing here throws a shadow worth its draw calls.
    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
  }
}
