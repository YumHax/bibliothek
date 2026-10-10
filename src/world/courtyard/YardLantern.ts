import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { additive } from '../materials/blend';
import { radialGlow } from '../materials/glowTextures';
import { GROUND, onSurface } from '../surface/layers';
import { inHours } from '@/time/clock';

const IRON = paint(0x1d1c1a, 0.55);
const WARM = new THREE.Color(0xffc68a);
/** How far out from the wall the lantern hangs, its body's size, and how high over the setts (m). */
const REACH = 0.26;
const BODY = 0.18;
/** The bracket's back plate on the wall (its thickness). */
const PLATE = 0.012;
/** The real light: candela when lit, and how far it reaches (shadowless). */
const INTENSITY = 3.2;
const DISTANCE = 8;
/** The timer: lit from dusk until half past midnight, and again from half past five until it is light. */
const OFF_AT = 0.5;
const ON_AT = 5.5;
/** Seconds the bulb takes to come up or go out (an old filament, not a switch). */
const WARM_S = 0.6;

/**
 * The lantern over our back door in the courtyard: an iron box lantern on a bracket, its glass lit warm on the
 * building's timer at dusk, a shadowless light over the door and the setts and a soft pool of it on the ground
 * (`ground`: the setts' height under it, local y). Local frame: the wall's face at z = 0, the yard towards -z, the
 * lantern's foot of glass at y 0. Never collides.
 */
export class YardLantern extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly glass: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly pool: THREE.MeshBasicMaterial;
  private level = 0;

  constructor(private readonly dayNight: DayNight, ground: number) {
    super();
    this.name = 'YardLantern';
    // The bracket: a back plate on the wall, an arm out over the door, a curl of iron under it.
    part(this, 0.08, 0.22, PLATE, IRON, { x: 0, y: BODY + 0.08, z: -PLATE / 2 });
    part(this, 0.02, 0.02, REACH, IRON, { x: 0, y: BODY + 0.14, z: -REACH / 2 });
    part(this, 0.012, 0.1, 0.012, IRON, { x: 0, y: BODY + 0.08, z: -REACH * 0.45 });
    // The box: four corner posts, a hipped cap, a base; the glass between them.
    const z = -REACH;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      part(this, 0.014, BODY, 0.014, IRON, { x: (dx * BODY) / 2, y: BODY / 2, z: z + (dz * BODY) / 2 });
    }
    part(this, BODY + 0.03, 0.02, BODY + 0.03, IRON, { x: 0, y: -0.01, z });
    const cap = new THREE.Mesh(new THREE.ConeGeometry((BODY + 0.05) * 0.72, 0.08, 4, 1).rotateY(Math.PI / 4), IRON);
    cap.position.set(0, BODY + 0.04, z);
    this.add(cap);
    this.glass = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.25, emissive: WARM, emissiveIntensity: 0, transparent: true, opacity: 0.85 });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(BODY - 0.012, BODY - 0.01, BODY - 0.012), this.glass);
    glass.position.set(0, BODY / 2, z);
    this.add(glass);
    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = obj !== glass;
    });

    this.light = new THREE.PointLight(WARM, 0, DISTANCE, 2);
    this.light.castShadow = false;
    this.light.position.set(0, BODY * 0.4, z - 0.05);
    this.add(this.light);

    // Its pool on the setts, under it and a little out into the yard.
    this.pool = onSurface(
      additive(new THREE.MeshBasicMaterial({ map: radialGlow({ width: 128, height: 128, stops: [[0, 0.55], [0.45, 0.22], [1, 0]] }), color: WARM, depthWrite: false, fog: false, opacity: 0 })),
      GROUND.lampPool,
    );
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), this.pool);
    pool.name = 'YardLanternPool';
    pool.position.set(0, ground + GROUND.lampPool.lift, z - 1.2);
    this.add(pool);
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const timer = inHours(s.hours, { from: ON_AT, to: 24 + OFF_AT });
    const wanted = s.daylight < 0.3 && timer ? 1 : 0;
    this.level = THREE.MathUtils.clamp(this.level + Math.sign(wanted - this.level) * (dt / WARM_S), 0, 1);
    const dusk = THREE.MathUtils.smoothstep(0.3 - s.daylight, 0, 0.25);
    const lit = this.level * (0.4 + 0.6 * dusk);
    this.glass.emissiveIntensity = 1.8 * lit;
    this.light.intensity = INTENSITY * lit;
    this.pool.opacity = 0.55 * lit;
  }

  dispose(): void {
    this.glass.dispose();
    this.pool.dispose();
  }
}
