import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { OccupancyAware } from '../Furniture';
import type { DayNight, SkyState } from '../props/DayNight';
import { LAMP_LIGHT } from '../lighting/lampColours';
import { Prop } from '../props/Prop';
import { cylinderMesh } from '../meshUtils';
import { ATTIC_PLAN as plan } from './atticPlan';
import { skyGlassColour } from '../materials/glass';

const BULB_GLOW = new THREE.Color(0xffd9a0);

/**
 * The attic's light, all of it shadowless (it is reached by travel: the flat is out of the scene up
 * here, but nothing needs a shadow map in a corridor this narrow): the bare bulbs over the corridor
 * (glowing glass, one real light between them), the collector's lamp in his room, the sky through
 * the two roof windows (the glass tinted by the sky and the weather, a hemisphere that follows the
 * daylight, on only while the player is up here). `lightLevel` is how lit it is where the player stands.
 */
export class AtticLights extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly corridor: THREE.PointLight;
  private readonly room: THREE.PointLight;
  private readonly ambient = new THREE.HemisphereLight(0xdfe6f0, 0x3a2a20, 0);
  private readonly bulb = new THREE.MeshBasicMaterial({ color: BULB_GLOW });
  private readonly colour = new THREE.Color();
  private readonly unsubscribe: () => void;
  private occupied = false;
  private state: SkyState;
  private clock = 0;

  constructor(dayNight: DayNight, private readonly skyGlass: THREE.MeshBasicMaterial) {
    super();
    this.name = 'AtticLights';
    const { corridor, corridorHeight, corridorLight, roomLight, roomHeight } = plan;
    const midZ = (corridor.z0 + corridor.z1) / 2;
    for (const x of plan.bulbs) {
      // A bare bulb on its flex.
      const flex = cylinderMesh(0.004, 0.25, new THREE.MeshBasicMaterial({ color: 0x1a1612 }), { x, y: corridorHeight - 0.125, z: midZ }, { segments: 5 });
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.bulb);
      glass.position.set(x, corridorHeight - 0.28, midZ);
      flex.castShadow = false;
      glass.castShadow = false;
      this.add(flex, glass);
    }
    this.corridor = new THREE.PointLight(LAMP_LIGHT.incandescent, 0, corridorLight.distance, 2);
    this.corridor.position.set(corridorLight.x, corridorHeight - 0.35, midZ);
    this.corridor.castShadow = false;
    this.room = new THREE.PointLight(LAMP_LIGHT.incandescent, 0, roomLight.distance, 2);
    this.room.position.set(roomLight.at[0], roomHeight - 0.5, roomLight.at[1]);
    this.room.castShadow = false;
    this.ambient.position.set(0, roomHeight, 0);
    this.add(this.corridor, this.room, this.ambient);
    this.state = dayNight.state;
    this.unsubscribe = dayNight.onChange((state) => (this.state = state));
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  update(dt: number): void {
    this.clock += dt;
    const s = this.state;
    // The bulbs hum along, the odd stutter in the old wiring.
    const stutter = Math.sin(this.clock * 23.7) > 0.985 ? 0.4 : 1;
    this.corridor.intensity = this.occupied ? plan.corridorLight.intensity * stutter : 0;
    this.room.intensity = this.occupied ? plan.roomLight.intensity : 0;
    this.bulb.color.copy(BULB_GLOW).multiplyScalar(0.6 + 0.9 * stutter);
    this.ambient.color.copy(s.ambient);
    this.ambient.intensity = this.occupied ? 0.08 + 0.42 * s.daylight * (1 - 0.4 * s.cloudCover) : 0;
    // The roof windows: the sky as it is.
    this.skyGlass.color.copy(skyGlassColour(this.colour, s));
  }

  /** How lit it is up here, 0 dark .. 1 bright: the bulbs and the lamp, a little daylight through the roof windows. */
  get lightLevel(): number {
    return THREE.MathUtils.clamp(0.42 + 0.3 * this.state.daylight, 0, 1);
  }

  dispose(): void {
    this.unsubscribe();
  }
}
