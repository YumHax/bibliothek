import * as THREE from 'three';
import { poweredAt } from '@/building/mains';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Updatable } from '@/core/Engine';
import type { CssLayer } from '@/core/CssLayer';
import { unplayableWhy } from './box/unplayable';
import type { RegionLock } from '@/economy/regionLock';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { ProjectorFan } from '@/audio/ProjectorFan';
import { playRockerClick } from '@/audio/furnitureSounds';
import type { ActivityAware, Furniture } from './Furniture';
import { boxMesh } from './meshUtils';
import type { SoundOcclusion } from './acoustics/SoundOcclusion';
import { PointSound } from './acoustics/PointSound';
import { VideoSurface } from './screen';
import { SurfaceScreen } from './screen/SurfaceScreen';
import { HueDrift } from './screen/HueDrift';
import { paint, standard } from './materials/palette';
import { RENDER_ORDER } from './surface/layers';
import { POINT_SCALE, scalesPoints } from './particles/pointScale';
import { additive } from '@/world/materials/blend';
import VEIL_VERTEX from './ProjectorVeil.vert.glsl?raw';
import VEIL_FRAGMENT from './ProjectorVeil.frag.glsl?raw';
import CONE_VERTEX from './ProjectorCone.vert.glsl?raw';
import CONE_FRAGMENT from './ProjectorCone.frag.glsl?raw';
import MOTE_VERTEX from './ProjectorMote.vert.glsl?raw';
import MOTE_FRAGMENT from './ProjectorMote.frag.glsl?raw';
import { damp, dampFactor } from '@/math/damp';
import { random } from '@/random';

interface ProjectorOptions {
  /** Width of the picture on the wall (metres). */
  pictureWidth?: number;
  /** Object whose distance to the picture drives the volume (the camera). */
  listener?: THREE.Object3D;
  /** Walls between the listener and the picture damp the volume (see `SoundOcclusion`). */
  occlusion?: SoundOcclusion;
}

/** Light thrown by the lens: cool white, brightest while a video plays. */
const BEAM_COLOR = 0xdfe8ff;
const BEAM_PLAYING = 22;
const BEAM_MESSAGE = 8;
/** Bounce light in front of the wall so the picture lights the room like the TV does. */
const SPILL_PLAYING = 5;
/** Brightness of the visible light cone while playing (dust in the beam). */
const CONE_STRENGTH = 0.05;
/** The lamp stays mostly white: the picture's drifting hue only tints it by this much. */
const HUE_TINT = 0.45;
/** Dust motes drifting in the beam. */
const MOTES = 60;
/** Standby LED colours: red standby, amber while looking for a source (blinking) or without one, green on. */
const LED_STANDBY = new THREE.Color(0xff2a1a).multiplyScalar(0.8);
const LED_AMBER = new THREE.Color(0xffa01a).multiplyScalar(1.2);
const LED_ON = new THREE.Color(0x2aff5a).multiplyScalar(1.2);
const LED_BLINK_HZ = 1.6;
/**
 * A projector's black is never black: the lamp leaks a faint cool grey over the whole picture, a touch brighter
 * at its centre (the hot spot), so the letterbox bars read as projected light on the wall, not paint (linear).
 */
const BLACK_LEVEL = new THREE.Color(0x10131a).convertSRGBToLinear();
const HOT_SPOT = 0.012;
/** In front of the picture's plane, towards the lens (m): the veil draws over the video cut-out. */
const VEIL_LIFT = 0.003;

/**
 * Additive with the canvas's alpha left alone (docs/graphics.md): the beam is light over the
 * scene and over the video cut-out, never a veil.
 */
function glowing<M extends THREE.Material>(material: M): M {
  material.depthWrite = false;
  return additive(material);
}

/**
 * A projector hung from the ceiling on a short pole, throwing a big picture on a bare wall.
 * Local +z is the throw direction, y = 0 the ceiling. The picture (a `VideoSurface`) is a child
 * placed by `aimAt()` at the wall, so the beam (a spot light, a frustum of light fading along its
 * length and at its edges, dust drifting in it) follows wherever the projector is placed. Its fan
 * hums while the lamp is on and winds down after. Clicking the unit or the lit wall behaves like the TV.
 */
export class Projector extends SurfaceScreen implements Furniture, Updatable, Interactable, ActivityAware {
  readonly hitboxes: THREE.Object3D[];
  readonly screenName = 'projector';

  /** Whether a copy plays here at all (a Japanese one needs its converter, `economy/regionLock`); set by the room's builder. */
  regionLock: RegionLock | null = null;
  protected readonly surface: VideoSurface;
  private readonly unitMaterial: THREE.MeshStandardMaterial;
  private readonly lens: THREE.Object3D;
  private readonly beam: THREE.SpotLight;
  private readonly spill: THREE.PointLight;
  private readonly cone: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** The lamp's own light over the running picture: its black level and hot spot (additive). */
  private readonly veil: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly veilLevel = { value: 0 };
  /** The cone's and the motes' shared uniforms. */
  private readonly uniforms = {
    color: { value: new THREE.Color(BEAM_COLOR) },
    strength: { value: 0 },
    time: { value: 0 },
    apex: { value: new THREE.Vector3() },
    centre: { value: new THREE.Vector3() },
    size: { value: new THREE.Vector2(1, 1) },
    pointScale: POINT_SCALE,
  };
  private readonly standby: THREE.MeshStandardMaterial;
  private readonly hue = new HueDrift();
  private readonly lampColor = new THREE.Color(BEAM_COLOR);
  private readonly fan = new ProjectorFan();
  private readonly fanSound: PointSound | null = null;
  private ledTime = 0;

  constructor(cssLayer: CssLayer, options: ProjectorOptions = {}) {
    super();
    this.name = 'Projector';

    // Ceiling plate and pole, then the unit hanging under it: a rounded shell, vents, the lens in its focus ring.
    const dark = paint(0x2b2b30, 0.6);
    this.unitMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.45 });
    const poleLength = 0.3;
    const unitW = 0.32;
    const unitH = 0.1;
    const unitD = 0.26;
    const plate = boxMesh(0.12, 0.01, 0.12, dark, { y: -0.005 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, poleLength, 12), dark);
    pole.position.y = -poleLength / 2;
    const unitY = -poleLength - unitH / 2;
    const unit = new THREE.Mesh(new RoundedBoxGeometry(unitW, unitH, unitD, 3, 0.022), this.unitMaterial);
    unit.position.y = unitY;
    const lensX = unitW * 0.2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.03, 24), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(lensX, unitY, unitD / 2 + 0.015);
    const rubber = paint(0x17171a, 0.85);
    const focusRing = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.012, 24), rubber);
    focusRing.rotation.x = Math.PI / 2;
    focusRing.position.set(lensX, unitY, unitD / 2 + 0.012);
    const glassMat = standard({ color: 0x0a0f1a, roughness: 0.1, metalness: 0 });
    const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), glassMat);
    lensGlass.position.set(lensX, unitY, unitD / 2 + 0.031);
    this.standby = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: LED_STANDBY.clone(), emissiveIntensity: 1 });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.004), this.standby);
    led.position.set(-unitW * 0.35, unitY - unitH * 0.2, unitD / 2 + 0.002);
    // Vent slots: on the front beside the lens, and down both sides where the fan breathes.
    const vent = paint(0x1a1a1e, 0.8);
    const vents: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      vents.push(boxMesh(0.07, 0.004, 0.002, vent, { x: -unitW * 0.12, y: unitY + unitH * (0.22 - i * 0.11), z: unitD / 2 + 0.001 }));
      for (const side of [-1, 1]) vents.push(boxMesh(0.002, 0.004, 0.12, vent, { x: side * (unitW / 2 + 0.001), y: unitY + unitH * (0.22 - i * 0.11), z: -unitD * 0.08 }));
    }
    // Overhead, right next to the ceiling lamp: a shadow from here would smear across a wall.
    const parts = [plate, pole, unit, barrel, focusRing, lensGlass, led, ...vents];
    for (const mesh of parts) mesh.castShadow = false;
    this.add(...parts);

    this.lens = new THREE.Object3D();
    this.lens.position.copy(lensGlass.position);
    this.add(this.lens);

    this.surface = new VideoSurface(cssLayer, {
      width: options.pictureWidth ?? 2.2,
      listener: options.listener,
      occlusion: options.occlusion,
      idle: 'nothing',
      signal: 'slate',
      volume: { referenceDistance: 2.5, rolloff: 1.2, maxDistance: 14, rearGain: 0.6 },
    });
    // Until `aimAt()` runs, throw straight ahead onto an imaginary wall 3 m away.
    this.surface.position.set(0, -1, 3);
    this.surface.rotation.y = Math.PI; // the picture faces the projector
    this.add(this.surface);
    this.surface.onStateChange((state) => this.fan.setRunning(state !== 'off'));

    if (options.listener) {
      this.fanSound = new PointSound(this.fan, { listener: options.listener, ...(options.occlusion ? { occlusion: options.occlusion } : {}), volume: { referenceDistance: 0.8, rolloff: 1.4, maxDistance: 6 } });
      this.fanSound.position.set(0, unitY, 0);
      this.add(this.fanSound);
    }

    this.beam = new THREE.SpotLight(BEAM_COLOR, 0, 0, Math.PI / 8, 0.4, 1.2);
    this.beam.position.copy(this.lens.position);
    this.add(this.beam, this.beam.target);

    this.spill = new THREE.PointLight(BEAM_COLOR, 0, 6, 2);
    this.add(this.spill);

    this.cone = new THREE.Mesh(
      new THREE.BufferGeometry(),
      glowing(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: CONE_VERTEX, fragmentShader: CONE_FRAGMENT, side: THREE.DoubleSide })),
    );
    this.cone.renderOrder = RENDER_ORDER.overlay;
    this.cone.frustumCulled = false;
    this.add(this.cone);

    // Dust: fixed seeds (across the picture, along the throw), placed in the frustum by the shader.
    const seeds = new Float32Array(MOTES * 3);
    const phases = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      seeds[i * 3] = random() - 0.5;
      seeds[i * 3 + 1] = random() - 0.5;
      seeds[i * 3 + 2] = 0.08 + 0.9 * random();
      phases[i] = random() * 100;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    moteGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.motes = new THREE.Points(moteGeometry, glowing(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: MOTE_VERTEX, fragmentShader: MOTE_FRAGMENT })));
    this.motes.renderOrder = RENDER_ORDER.overlay;
    this.motes.frustumCulled = false;
    scalesPoints(this.motes);
    this.add(this.motes);
    for (const object of [this.cone, this.motes]) {
      object.castShadow = false;
      object.receiveShadow = false;
      object.visible = false;
    }

    const { width, height } = this.surface;
    this.veil = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      glowing(new THREE.ShaderMaterial({
        uniforms: { level: this.veilLevel, black: { value: BLACK_LEVEL }, hot: { value: HOT_SPOT }, aspect: { value: height / width } },
        vertexShader: VEIL_VERTEX,
        fragmentShader: VEIL_FRAGMENT,
      })),
    );
    this.veil.position.z = VEIL_LIFT;
    this.veil.renderOrder = RENDER_ORDER.overlay;
    this.veil.castShadow = false;
    this.veil.receiveShadow = false;
    this.veil.visible = false;
    this.surface.add(this.veil);

    this.hitboxes = [unit, this.surface.glass];
    this.aimAt(this.surface.position.clone());
  }

  /** Overhead: never blocks the player. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /**
   * Puts the picture's centre at `centre` (projector-local coordinates), facing back towards the
   * lens along local -z, and rebuilds the light frustum from the lens to the picture's corners.
   * Call after `zone.place()`: `projector.aimAt(projector.worldToLocal(wallPoint))`.
   */
  aimAt(centre: THREE.Vector3): void {
    this.surface.position.copy(centre);
    this.beam.target.position.copy(centre);
    this.spill.position.copy(centre).add(new THREE.Vector3(0, 0, -0.6));

    const { width, height } = this.surface;
    const throwDistance = Math.max(0.1, centre.z - this.lens.position.z);
    this.beam.distance = throwDistance + 1;
    // The cone spans the picture's width, soft at its edge: it does not spill round the corners onto the shelving beside it.
    this.beam.angle = Math.atan(width / 2 / throwDistance);
    this.beam.penumbra = 0.3;
    this.uniforms.apex.value.copy(this.lens.position);
    this.uniforms.centre.value.copy(centre);
    this.uniforms.size.value.set(width, height);

    // Frustum: apex at the lens, base = the picture rectangle. Each side carries how far along the
    // throw (0 lens .. 1 wall) and how far across the side (0 .. 1) a point is, for the fades.
    const a = this.lens.position;
    const corners = (
      [
        [-width / 2, height / 2],
        [width / 2, height / 2],
        [width / 2, -height / 2],
        [-width / 2, -height / 2],
      ] as const
    ).map(([x, y]) => new THREE.Vector3(centre.x + x, centre.y + y, centre.z));
    const positions: number[] = [];
    const along: number[] = [];
    const across: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c0 = corners[i]!;
      const c1 = corners[(i + 1) % 4]!;
      positions.push(a.x, a.y, a.z, c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
      along.push(0, 1, 1);
      across.push(0.5, 0, 1);
    }
    this.cone.geometry.dispose();
    this.cone.geometry = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      .setAttribute('along', new THREE.Float32BufferAttribute(along, 1))
      .setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.unitMaterial.emissive.setHex(hovered ? 0x222222 : 0x000000);
  }

  label(player: PlayerState): string | null {
    if (player.held) return player.held.playable ? `Projector · play ${player.held.game.title}` : `Projector · can’t play it, ${unplayableWhy(player.held)}`;
    if (this.state === 'searching') return `Projector · looking for a longplay of ${this.surface.searchingFor ?? 'the game'}…`;
    if (this.surface.tuning) return 'Projector · tuning in…';
    if (this.state === 'error') return 'Projector, no longplay found · switch off';
    return this.state !== 'off' ? 'Projector · switch off' : 'Projector · bring a game box';
  }

  /** With a box in hand, plays its longplay; otherwise switches the lamp off, even while it is still looking for a source. */
  activate(session: SessionActions): void {
    if (!poweredAt(this)) return session.refuse('No power: the whole building is dark.');
    const box = session.held;
    if (box && !box.playable) {
      session.refuse(`${box.game.title} is ${unplayableWhy(box)}: no cartridge to put in.`);
    } else if (box) {
      const locked = this.regionLock?.(box.game);
      if (locked) return session.refuse(locked);
      if (this.state === 'off') playRockerClick(); // the lamp's switch
      session.putBack();
      void session.playOn(this, box);
    } else if (this.state !== 'off') {
      playRockerClick();
      session.stopScreen(this);
    }
  }

  /** Dormant zone: the picture lets its video go and the fan falls silent; both come back with the zone (see `VideoSurface.setZoneActive`). */
  setZoneActive(active: boolean): void {
    this.surface.setZoneActive(active);
    this.fanSound?.setZoneActive(active);
  }

  /** Zone unload: the iframe leaves the page, the fan's sound stops. */
  dispose(): void {
    this.surface.dispose();
    this.fanSound?.dispose();
  }

  update(dt: number): void {
    // A power cut in the building (`building/mains`): the picture goes at once.
    if (this.state !== 'off' && !poweredAt(this)) this.stop();
    this.updateBeam(dt);
    this.surface.update(dt);
    this.fanSound?.update(dt);
  }

  /** Lamp: full beam tinted by the picture's drifting hue while playing, dimmer while a slate is on the wall, off otherwise. */
  private updateBeam(dt: number): void {
    let beam = 0;
    let spill = 0;
    if (this.state === 'playing') {
      beam = BEAM_PLAYING;
      spill = SPILL_PLAYING;
      this.lampColor.set(BEAM_COLOR);
      const color = this.hue.update(dt, this.lampColor, 1 - HUE_TINT);
      this.beam.color.copy(color);
      this.spill.color.copy(color);
    } else {
      if (this.state !== 'off') {
        beam = BEAM_MESSAGE;
        spill = SPILL_PLAYING * 0.25;
      }
      this.beam.color.lerp(this.lampColor.set(BEAM_COLOR), dampFactor(2, dt));
      this.spill.color.copy(this.beam.color);
    }
    const ease = dampFactor(5, dt);
    this.beam.intensity += (beam - this.beam.intensity) * ease;
    this.spill.intensity += (spill - this.spill.intensity) * ease;
    const coneTarget = beam > 0 ? CONE_STRENGTH * (beam / BEAM_PLAYING) : 0;
    const uniforms = this.uniforms;
    uniforms.strength.value += (coneTarget - uniforms.strength.value) * ease;
    uniforms.color.value.copy(this.beam.color);
    uniforms.time.value += dt;
    const shown = uniforms.strength.value > 0.002;
    this.cone.visible = shown;
    this.motes.visible = shown;
    // Over the running picture only (the slate and the static bring their own light).
    const running = this.state === 'playing' && !this.surface.tuning;
    this.veilLevel.value += ((running ? 1 : 0) - this.veilLevel.value) * ease;
    this.veil.visible = this.veilLevel.value > 0.01;
    this.updateLed(dt);
  }

  /** Standby LED: red when off, amber blinking while searching (steady without a source), green while playing; eased. */
  private updateLed(dt: number): void {
    this.ledTime += dt;
    let target = LED_STANDBY;
    let level = 1;
    if (this.state === 'playing') target = LED_ON;
    else if (this.state !== 'off') {
      target = LED_AMBER;
      if (this.state === 'searching') level = 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(this.ledTime * LED_BLINK_HZ * Math.PI * 2));
    }
    this.standby.emissive.lerp(target, dampFactor(11, dt));
    this.standby.emissiveIntensity = damp(this.standby.emissiveIntensity, level, 13, dt);
  }
}
