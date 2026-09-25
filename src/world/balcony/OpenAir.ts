import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from '../Furniture';
import type { SkyState } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import { Prop } from '../props/Prop';

export interface OpenAirOptions {
  /** Radius of the surround the view is shown on: clear of everything built nearby. */
  radius: number;
  /** The sun's spot stands this far out, lighting a disc of `sunRadius` round the origin. */
  sunDistance: number;
  sunRadius: number;
}

const GROUND = new THREE.Color(0x4a443c);
/** The open sky's ambient: brighter than a room's, most of the sky is in view. */
const AMBIENT: [night: number, day: number] = [0.12, 1.25];

/**
 * The open air round an outdoor spot (the balcony): the painted view on a sphere all round it,
 * rendered from the inside with the panes' own shader (same uniforms, so the same sky, weather and
 * life, in true parallax from wherever the camera stands), the sun (or the moon) as a narrow
 * shadow-casting spot aimed at the spot, and the sky's ambient while the player is out here.
 * Lights are never added or removed (that would recompile every shader): the ambient drops to 0
 * while the player is indoors and the sun's shadow map is only refreshed now and then.
 */
export class OpenAir extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;

  private readonly sun: THREE.SpotLight;
  private readonly sky: THREE.HemisphereLight;
  private readonly direction = new THREE.Vector3();
  private readonly worldQuaternion = new THREE.Quaternion();
  private readonly unsubscribe: () => void;
  private state: SkyState | null = null;
  private occupied = false;
  private shadowTimer = 0;

  constructor(
    private readonly outdoors: Outdoors,
    private readonly options: OpenAirOptions,
  ) {
    super();
    this.name = 'OpenAir';
    // The view: the panes' shader, seen from inside a sphere (its own material object sharing the uniforms).
    const view = new THREE.ShaderMaterial({
      uniforms: outdoors.material.uniforms,
      vertexShader: outdoors.material.vertexShader,
      fragmentShader: outdoors.material.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const surround = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 48, 24), view);
    surround.frustumCulled = false;
    // Drawn after everything opaque: the depth test then skips every pixel something nearer covers,
    // so the costly view shader only runs where the open air is actually seen.
    surround.renderOrder = 10;
    surround.castShadow = false;
    surround.receiveShadow = false;
    this.add(surround);

    this.sun = new THREE.SpotLight(0xffffff, 0, 0, Math.atan2(options.sunRadius, options.sunDistance) * 1.3, 0.4, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(QUALITY.shadowMapSize);
    this.sun.shadow.camera.near = options.sunDistance - 4;
    this.sun.shadow.camera.far = options.sunDistance + 6;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.add(this.sun, this.sun.target);

    this.sky = new THREE.HemisphereLight(0xffffff, GROUND, 0);
    this.add(this.sky);
    this.unsubscribe = outdoors.dayNight.onChange((state) => this.apply(state));
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.state) this.apply(this.state);
  }

  update(dt: number): void {
    if (this.occupied || this.sun.intensity <= 0) return;
    this.shadowTimer += dt;
    if (this.shadowTimer < IDLE_SHADOW_INTERVAL) return;
    this.shadowTimer = 0;
    this.sun.shadow.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe();
  }

  private apply(state: SkyState): void {
    this.state = state;
    // The panorama's light direction, in this object's frame (the first call runs before `place()`).
    this.getWorldQuaternion(this.worldQuaternion).invert();
    this.outdoors.lightDirection(state, this.direction).applyQuaternion(this.worldQuaternion);
    this.sun.position.copy(this.direction).multiplyScalar(this.options.sunDistance);
    this.sun.color.copy(state.lightColor);
    // Behind the building (local -z) the balcony is in the building's shade.
    this.sun.intensity = this.direction.y > 0 && this.direction.z > 0 ? state.lightIntensity : 0;
    this.sun.shadow.autoUpdate = this.occupied && this.sun.intensity > 0;
    this.sky.color.copy(state.ambient);
    this.sky.intensity = this.occupied ? THREE.MathUtils.lerp(AMBIENT[0], AMBIENT[1], state.daylight) : 0;
  }

  /** How bright it is out here, 0..1, for the eye's exposure and the haze (see `graphics/`). */
  get lightLevel(): number {
    return THREE.MathUtils.clamp(0.15 + (this.state?.daylight ?? 1), 0, 1);
  }
}
