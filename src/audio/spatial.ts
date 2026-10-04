import * as THREE from 'three';

/**
 * Where a sound of the flat is heard from: which side (a stereo pan by the listener's yaw) and
 * through how many walls (a low-pass, like the street's `outdoorsInput` muffle: a wall takes the
 * highs away before it takes the loudness). The loudness itself stays `proximityVolume`'s.
 */
export interface Spatial {
  /** -1 left .. 1 right. */
  pan: number;
  /** Walls between (`world/acoustics/SoundOcclusion`); a fraction while a door between is half open or the count eases. */
  walls: number;
  /** 0 in front of the listener .. 1 right behind (`rearOf`): a little duller and quieter behind the head. */
  rear?: number;
}

/** Open air: the filter wide open. */
const OPEN_HZ = 18000;
/** Each wall keeps this fraction of the cutoff; never below `FLOOR_HZ` (a thud through the flat). */
const PER_WALL = 0.22;
const FLOOR_HZ = 360;
/** How far to the side a source sounds at most (a full pan is a headphone trick, not a room). */
const WIDTH = 0.75;
/** Closer than this (m), a source narrows to the middle: it is all around the head. */
const NEAR = 0.6;
/** Time constant (s) of the pan and the cutoff following. */
const FOLLOW = 0.06;
/**
 * Right behind the head, a sound loses its air (the ear's own shadow): the cutoff comes down to
 * `hz` and the level to `gain` (about -2 dB). The only cue a stereo pair has for front and back.
 */
const REAR = { hz: 6000, gain: 0.8 };

/** The low-pass cutoff (Hz) of a sound heard through `walls` walls. */
function wallCutoff(walls: number): number {
  return walls <= 0 ? OPEN_HZ : Math.max(FLOOR_HZ, OPEN_HZ * Math.pow(PER_WALL, walls));
}

const ear = new THREE.Vector3();
const right = new THREE.Vector3();
const toward = new THREE.Vector3();

/** The pan (-1 left .. 1 right) of a source at `source` (world) for `listener` (the camera), by its yaw. */
export function stereoPan(listener: THREE.Object3D, source: THREE.Vector3): number {
  listener.getWorldPosition(ear);
  right.setFromMatrixColumn(listener.matrixWorld, 0).setY(0);
  toward.subVectors(source, ear).setY(0);
  const distance = toward.length();
  const rl = right.length();
  if (distance < 1e-3 || rl < 1e-6) return 0;
  const side = toward.dot(right) / (distance * rl);
  return THREE.MathUtils.clamp(side * WIDTH * Math.min(1, distance / NEAR), -1, 1);
}

/** 0 (the source is ahead or to the side of `listener`) .. 1 (right behind it), by its yaw; near the head, 0. */
export function rearOf(listener: THREE.Object3D, source: THREE.Vector3): number {
  listener.getWorldPosition(ear);
  right.setFromMatrixColumn(listener.matrixWorld, 2).setY(0); // +z of the camera: behind it
  toward.subVectors(source, ear).setY(0);
  const distance = toward.length();
  const bl = right.length();
  if (distance < 1e-3 || bl < 1e-6) return 0;
  const behind = toward.dot(right) / (distance * bl);
  return THREE.MathUtils.clamp(behind, 0, 1) * Math.min(1, distance / NEAR);
}

/** Pan, rear and walls of a source at `source` for `listener`, the walls counted by the caller. */
export function spatialOf(listener: THREE.Object3D, source: THREE.Vector3, walls: number): Spatial {
  return { pan: stereoPan(listener, source), walls, rear: rearOf(listener, source) };
}

/**
 * The last leg of a voice before its bus: a low-pass (the walls, and the head's shadow behind it),
 * a stereo panner (the side), a gain (a touch quieter behind). Connect the voice to `input`; `set`
 * follows smoothly and skips a change nobody would hear.
 */
export class SpatialOut {
  readonly input: BiquadFilterNode;
  private readonly panner: StereoPannerNode;
  private readonly rearGain: GainNode;
  private pan = NaN;
  private hz = NaN;
  private gain = NaN;

  constructor(private readonly ctx: BaseAudioContext, out: AudioNode, spatial?: Spatial) {
    this.input = ctx.createBiquadFilter();
    this.input.type = 'lowpass';
    this.input.Q.value = 0.5;
    this.panner = ctx.createStereoPanner();
    this.rearGain = ctx.createGain();
    this.input.connect(this.panner).connect(this.rearGain).connect(out);
    this.set(spatial?.pan ?? 0, spatial?.walls ?? 0, true, spatial?.rear ?? 0);
  }

  set(pan: number, walls: number, instant = false, rear = 0): void {
    const hz = Math.min(wallCutoff(walls), THREE.MathUtils.lerp(OPEN_HZ, REAR.hz, rear));
    const gain = THREE.MathUtils.lerp(1, REAR.gain, rear);
    const t = this.ctx.currentTime;
    if (instant || Number.isNaN(this.pan)) {
      this.panner.pan.setValueAtTime(pan, t);
      this.input.frequency.setValueAtTime(hz, t);
      this.rearGain.gain.setValueAtTime(gain, t);
    } else {
      if (Math.abs(pan - this.pan) > 0.01) this.panner.pan.setTargetAtTime(pan, t, FOLLOW);
      if (Math.abs(hz - this.hz) > 1) this.input.frequency.setTargetAtTime(hz, t, FOLLOW * 2);
      if (Math.abs(gain - this.gain) > 0.005) this.rearGain.gain.setTargetAtTime(gain, t, FOLLOW * 2);
    }
    this.pan = pan;
    this.hz = hz;
    this.gain = gain;
  }

  disconnect(): void {
    this.input.disconnect();
    this.panner.disconnect();
    this.rearGain.disconnect();
  }
}

/**
 * Where a one-shot sound (a bell, a step, a door) connects: `out` itself when heard in the open and
 * straight ahead, else a `SpatialOut` in front of it, let go after `seconds`. The level itself, by
 * distance and walls, is `hearing.ts`'s (`hear`, `loudness`).
 */
export function spatialInput(ctx: BaseAudioContext, out: AudioNode, spatial: Spatial | undefined, seconds: number): AudioNode {
  if (!spatial || (spatial.walls <= 0 && Math.abs(spatial.pan) < 0.01 && !(spatial.rear && spatial.rear > 0.02))) return out;
  const leg = new SpatialOut(ctx, out, spatial);
  window.setTimeout(() => leg.disconnect(), seconds * 1000);
  return leg.input;
}
