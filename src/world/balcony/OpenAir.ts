import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from '../Furniture';
import type { SkyState } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import { Prop } from '../props/Prop';
import { RENDER_ORDER } from '../surface/layers';
import { ShadowRefresh } from '../lighting/shadowRefresh';
import { normalBiasAt, snapDirection, texelAngle } from '../props/shadowTexels';
import { homeOutlook, type OutlookLease } from '../outlook/sharedOutlook';

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
 * The open air round an outdoor spot (the balcony): on a sphere all round it, the street itself as the flat's windows
 * show it (medium, high: the view from our building, `sharedOutlook`, unclipped), else the painted view rendered
 * from the inside with the panes' own shader (same uniforms, so the same sky, weather and life, in true parallax
 * from wherever the camera stands); the sun (or the moon) as a narrow
 * shadow-casting spot aimed at the spot, and the sky's ambient while the player is out here.
 * Lights are never added or removed (that would recompile every shader): the ambient drops to 0
 * while the player is indoors and the sun's shadow map is only refreshed now and then.
 */
export class OpenAir extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;

  private readonly sun: THREE.SpotLight;
  /** The sun's regular shadow refresh while the player is out here in the sun. */
  private readonly sunShadow: ShadowRefresh;
  private readonly sky: THREE.HemisphereLight;
  private readonly direction = new THREE.Vector3();
  /** `direction` snapped to whole shadow texels: where the sun's spot actually stands. */
  private readonly aim = new THREE.Vector3();
  private readonly halfAngle: number;
  private readonly worldQuaternion = new THREE.Quaternion();
  private readonly unsubscribe: () => void;
  /** The street's 3D view, and its surround; null on low (the painted view). */
  private readonly outlook: OutlookLease | null;
  private readonly surround: THREE.Mesh;
  private state: SkyState | null = null;
  private occupied = false;
  private shadowTimer = 0;

  constructor(
    private readonly outdoors: Outdoors,
    private readonly options: OpenAirOptions,
  ) {
    super();
    this.name = 'OpenAir';
    const sphere = new THREE.SphereGeometry(options.radius, 48, 24);
    this.outlook = homeOutlook(outdoors);
    let surround: THREE.Mesh;
    if (this.outlook) {
      surround = this.outlook.view.surround(sphere, this.outlook.toOutlook);
    } else {
      // The view: the panes' shader, seen from inside a sphere (its own material object sharing the uniforms),
      // without the drops on the glass: there is none out here.
      const view = new THREE.ShaderMaterial({
        defines: { OPEN_AIR: '' },
        uniforms: outdoors.material.uniforms,
        vertexShader: outdoors.material.vertexShader,
        fragmentShader: outdoors.material.fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
      });
      view.onBeforeRender = outdoors.markDrawn;
      surround = new THREE.Mesh(sphere, view);
    }
    this.surround = surround;
    surround.frustumCulled = false;
    // Drawn after everything opaque: the depth test then skips every pixel something nearer covers,
    // so the costly view shader only runs where the open air is actually seen.
    surround.renderOrder = RENDER_ORDER.overlay;
    surround.castShadow = false;
    surround.receiveShadow = false;
    this.add(surround);

    this.halfAngle = Math.atan2(options.sunRadius, options.sunDistance) * 1.3;
    this.sun = new THREE.SpotLight(0xffffff, 0, 0, this.halfAngle, 0.4, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(QUALITY.sunShadowMapSize);
    this.sun.shadow.camera.near = options.sunDistance - 4;
    this.sun.shadow.camera.far = options.sunDistance + 6;
    this.sun.shadow.bias = -0.0004;
    // In texels of the map, at the far side of the lit disc.
    this.sun.shadow.normalBias = normalBiasAt(options.sunDistance + options.sunRadius, this.halfAngle, QUALITY.sunShadowMapSize);
    this.add(this.sun, this.sun.target);
    this.sunShadow = new ShadowRefresh(this.sun);

    this.sky = new THREE.HemisphereLight(0xffffff, GROUND, 0);
    this.add(this.sky);
    this.unsubscribe = outdoors.dayNight.onChange((state) => this.apply(state));
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.state) this.apply(this.state);
    if (occupied) this.outlook?.view.prefetch();
  }

  update(dt: number): void {
    this.outlook?.view.update(dt);
    this.sunShadow.update(dt);
    if (this.occupied || this.sun.intensity <= 0) return;
    this.shadowTimer += dt;
    if (this.shadowTimer < IDLE_SHADOW_INTERVAL) return;
    this.shadowTimer = 0;
    this.sun.shadow.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe();
    if (this.outlook) {
      this.outlook.view.release(this.surround);
      this.outlook.release();
    }
  }

  private apply(state: SkyState): void {
    this.state = state;
    // The panorama's light direction, in this object's frame (the first call runs before `place()`).
    this.getWorldQuaternion(this.worldQuaternion).invert();
    this.outdoors.lightDirection(state, this.direction).applyQuaternion(this.worldQuaternion);
    // Whole texels at a time as the sun crosses the sky, so the shadows' edges hop instead of crawling.
    snapDirection(this.direction, texelAngle(this.halfAngle, this.sun.shadow.mapSize.x), this.aim);
    this.sun.position.copy(this.aim).multiplyScalar(this.options.sunDistance);
    this.sun.color.copy(state.lightColor);
    // Behind the building (local -z) the balcony is in the building's shade.
    this.sun.intensity = this.direction.y > 0 && this.direction.z > 0 ? state.lightIntensity : 0;
    this.sunShadow.setLive(this.occupied && this.sun.intensity > 0);
    this.sky.color.copy(state.ambient);
    this.sky.intensity = this.occupied ? THREE.MathUtils.lerp(AMBIENT[0], AMBIENT[1], state.daylight) : 0;
  }

  /** How bright it is out here, 0..1, for the eye's exposure and the haze (see `graphics/`). */
  get lightLevel(): number {
    return THREE.MathUtils.clamp(0.15 + (this.state?.daylight ?? 1), 0, 1);
  }
}
