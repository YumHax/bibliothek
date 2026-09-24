import * as THREE from 'three';
import type { RoomOptions } from '../Room';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';

export interface HallRoofOptions {
  /** Distance between two trusses along the hall's depth. Default 2. */
  trussSpacing?: number;
  /** How far the trusses hang under the ceiling. Default 0.5. */
  trussDepth?: number;
  /** The roof light down the middle of the hall: its width across, and how far it stops short of the end walls. `false` for none. */
  skylight?: { width?: number; margin?: number } | false;
}

/** Glow of the frosted glass at night (the town's glow) and in full day. */
const NIGHT_GLOW = 0.05;
const DAY_GLOW = 1.0;
const DAY_WHITE = new THREE.Color(0xfff8ee);
const CHORD = 0.08;
const WEB = 0.05;

const IRON = new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.55, metalness: 0.5 });
const GLAZING_BAR = new THREE.MeshStandardMaterial({ color: 0x4a4846, roughness: 0.5, metalness: 0.4 });

/**
 * What turns a plastered ceiling into a market hall's roof: riveted iron trusses spanning the
 * width every `trussSpacing`, purlins running the length under the ceiling, and a strip of
 * frosted roof light down the middle that brightens and tints with the sky (`setDaylight`, wired
 * by the builder to the shared `DayNight`; nothing is seen through it, so it needs no `Outdoors`).
 * Built from the `RoomOptions` like the `Room` and placed at the zone's origin. Overhead, so it
 * casts no shadows (the room's lamp hangs below it). Decoration: never collides.
 */
export class HallRoof extends Prop {
  /** Wraps the whole shell. */
  readonly contactShadow = false;
  private readonly glass: THREE.MeshStandardMaterial | null = null;

  constructor(room: RoomOptions, options: HallRoofOptions = {}) {
    super();
    this.name = 'HallRoof';
    const { width, depth, height } = room;
    const spacing = options.trussSpacing ?? 2;
    const trussDepth = options.trussDepth ?? 0.5;
    const top = height - 0.02 - CHORD / 2;
    const bottom = height - trussDepth + CHORD / 2;

    // Trusses across the width: two chords and a zigzag of webs between them.
    const count = Math.floor((depth - 0.6) / spacing);
    for (let i = 0; i < count; i++) {
      const z = -((count - 1) * spacing) / 2 + i * spacing;
      const truss = new THREE.Group();
      truss.position.z = z;
      truss.add(boxMesh(width - 0.1, CHORD, CHORD, IRON, { y: top }));
      truss.add(boxMesh(width - 0.1, CHORD, CHORD, IRON, { y: bottom }));
      const rise = top - bottom - CHORD;
      const bays = Math.round(width / 1.0);
      const bay = (width - 0.1) / bays;
      for (let b = 0; b <= bays; b++) {
        const x = -(width - 0.1) / 2 + b * bay;
        truss.add(boxMesh(WEB, rise, WEB, IRON, { x, y: (top + bottom) / 2 }));
        if (b < bays) {
          // A diagonal per bay, leaning alternately, sized to reach corner to corner.
          const diagonal = boxMesh(WEB, Math.hypot(bay, rise), WEB * 0.8, IRON, { x: x + bay / 2, y: (top + bottom) / 2 });
          diagonal.rotation.z = (b % 2 ? 1 : -1) * Math.atan2(bay, rise);
          truss.add(diagonal);
        }
      }
      this.add(truss);
    }
    // Purlins the length of the hall, resting on the top chords, either side of the roof light.
    for (const x of [-width * 0.3, width * 0.3]) this.add(boxMesh(CHORD * 0.8, CHORD * 0.8, depth - 0.1, IRON, { x, y: top - CHORD * 0.9 }));

    if (options.skylight !== false) {
      const glazedW = options.skylight?.width ?? 1.6;
      const margin = options.skylight?.margin ?? 1.2;
      const glazedL = depth - 2 * margin;
      this.glass = new THREE.MeshStandardMaterial({ color: 0xe6ecee, roughness: 0.6, emissive: DAY_WHITE, emissiveIntensity: NIGHT_GLOW });
      // The glass runs the hall's depth (z) down the middle, just under the ceiling, facing down.
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(glazedW, glazedL), this.glass);
      pane.rotation.x = Math.PI / 2;
      pane.position.y = height - 0.01;
      pane.receiveShadow = false;
      this.add(pane);
      // Frame and glazing bars.
      const frameY = height - 0.03;
      this.add(boxMesh(0.06, 0.05, glazedL + 0.06, GLAZING_BAR, { x: -glazedW / 2, y: frameY }));
      this.add(boxMesh(0.06, 0.05, glazedL + 0.06, GLAZING_BAR, { x: glazedW / 2, y: frameY }));
      this.add(boxMesh(glazedW + 0.06, 0.05, 0.06, GLAZING_BAR, { y: frameY, z: -glazedL / 2 }));
      this.add(boxMesh(glazedW + 0.06, 0.05, 0.06, GLAZING_BAR, { y: frameY, z: glazedL / 2 }));
      const bars = Math.round(glazedL / 0.8);
      for (let b = 1; b < bars; b++) this.add(boxMesh(glazedW, 0.03, 0.03, GLAZING_BAR, { y: height - 0.02, z: -glazedL / 2 + (b / bars) * glazedL }));
      this.add(boxMesh(0.03, 0.03, glazedL, GLAZING_BAR, { y: height - 0.02 }));
    }

    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
  }

  /** 0 = night, 1 = full day; `skyHue` tints the glow (warm by day, blue at night, orange at sunset). */
  setDaylight(daylight: number, skyHue?: THREE.Color): void {
    if (!this.glass) return;
    const t = THREE.MathUtils.clamp(daylight, 0, 1);
    this.glass.emissiveIntensity = THREE.MathUtils.lerp(NIGHT_GLOW, DAY_GLOW, t);
    this.glass.emissive.copy(DAY_WHITE);
    if (skyHue) this.glass.emissive.lerp(skyHue, 0.6);
  }
}
