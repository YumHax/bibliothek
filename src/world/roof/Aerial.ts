import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { standard } from '../materials/palette';
import { Prop } from '../props/Prop';
import { AERIAL_STEPS, aerialStep, signalAt, turnAerial } from './channels';
import { damp } from '@/math/damp';

const STEEL = standard({ color: 0x8a8e92, roughness: 0.45, metalness: 0.8 });
/** Seconds the aerial takes to swing a step round on its rusty bearing. */
const TURN_S = 0.6;
/** The needle's tremble, radians a second (a cycle every 0.57 s, as it always was). */
const WIND_RATE = 1000 / 90;

/**
 * The old TV aerial on its tripod by the hatch: a Yagi on a mast, its cable down into the roof. It
 * turns a step a click (squealing on its bearing); the signal meter in the grey box at its foot
 * swings with it, and where a channel's mast across the city lines up (`roof/channels`) the needle
 * slams over, the box hums, and the channel is found for the flat's TV (its tuner appears on the
 * stand). Origin on the zinc at the tripod's middle.
 */
export class Aerial extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  private readonly head = new THREE.Group();
  private readonly needle: THREE.Mesh;
  private step = aerialStep();
  private shown = aerialStep();
  private turning = 0;
  private level = signalAt(aerialStep()).strength;
  /** The needle's tremble, on the prop's own time (seconds ticked), not the wall clock's. */
  private wind = 0;

  constructor(height: number) {
    super();
    this.name = 'Aerial';
    // The tripod and the mast.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cylinderMesh(0.012, 1.0, STEEL, { x: Math.cos(a) * 0.3, y: 0.45, z: Math.sin(a) * 0.3 }, { segments: 6 });
      leg.rotation.set(Math.sin(a) * 0.33, 0, -Math.cos(a) * 0.33);
      this.add(leg);
    }
    this.add(cylinderMesh(0.02, height, STEEL, { y: height / 2 }, { segments: 8 }));
    // The Yagi: a boom and its elements, turning on the mast's top.
    this.head.position.y = height - 0.1;
    const boom = boxMesh(0.02, 0.02, 1.6, STEEL, { z: 0.2 });
    this.head.add(boom);
    for (let i = 0; i < 9; i++) {
      const length = 0.6 - i * 0.035;
      this.head.add(boxMesh(length, 0.01, 0.01, STEEL, { z: -0.5 + i * 0.17 }));
    }
    this.head.rotation.y = this.angleOf(this.step);
    this.add(this.head);
    // The signal meter's box at its foot, its dial facing the hatch.
    const box = boxMesh(0.26, 0.2, 0.12, standard({ color: 0x6a6e70, roughness: 0.6 }), { x: 0.42, y: 0.32, z: 0 });
    this.add(box);
    this.add(cylinderMesh(0.02, 0.32, STEEL, { x: 0.42, y: 0.11 }, { segments: 6 }));
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ map: meterTexture() }));
    dial.position.set(0.42, 0.33, 0.061);
    this.add(dial);
    // Pivoting on its foot: the plane moved up its own length.
    const needle = new THREE.PlaneGeometry(0.004, 0.09).translate(0, 0.045, 0);
    this.needle = new THREE.Mesh(needle, new THREE.MeshBasicMaterial({ color: 0xb02020 }));
    this.needle.position.set(0.42, 0.275, 0.063);
    this.add(this.needle);
    const hitbox = invisibleHitbox(1.0, height, 1.0, { y: height / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.35), new THREE.Vector3(0.58, 1.0, 0.35));
  }

  setHovered(): void {}

  label(): string {
    const { strength, channel } = signalAt(this.step);
    const reading = channel ? `clear, channel ${channel.number}` : strength > 0.2 ? 'something faint' : 'snow';
    return `The old aerial (signal: ${reading}) · turn`;
  }

  activate(session: SessionActions): void {
    this.step = (this.step + 1) % AERIAL_STEPS;
    this.turning = TURN_S;
    squeal();
    const found = turnAerial(this.step);
    if (found) {
      session.reward({ title: `${found.name} comes in clear`, detail: 'The old tuner on the TV stand downstairs gets it now.' });
      return;
    }
    const { strength } = signalAt(this.step);
    if (strength > 0.2) session.react('The needle twitches. Close: a little further.');
  }

  update(dt: number): void {
    if (this.turning > 0) {
      this.turning = Math.max(0, this.turning - dt);
      const t = 1 - this.turning / TURN_S;
      const from = this.angleOf(this.shown);
      const to = this.angleOf(this.step) + (this.step < this.shown ? Math.PI * 2 : 0);
      this.head.rotation.y = from + (to - from) * (1 - (1 - t) ** 2);
      if (this.turning === 0) this.shown = this.step;
    }
    // The needle settles on the signal, trembling a little in the wind.
    this.level = damp(this.level, signalAt(this.step).strength, 4, dt);
    this.wind += dt;
    this.needle.rotation.z = 1.0 - this.level * 2.0 + Math.sin(this.wind * WIND_RATE) * 0.02;
  }

  private angleOf(step: number): number {
    return (step / AERIAL_STEPS) * Math.PI * 2;
  }
}

/** The meter's face: an arc from SNOW to CLEAR. */
function meterTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(200, 130);
  ctx.fillStyle = '#efe7cf';
  ctx.fillRect(0, 0, 200, 130);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(100, 120, 90, Math.PI * 1.18, Math.PI * 1.82);
  ctx.stroke();
  ctx.strokeStyle = '#2f8a3a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(100, 120, 80, Math.PI * 1.65, Math.PI * 1.82);
  ctx.stroke();
  ctx.fillStyle = '#2a2a2a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('SNOW', 12, 60);
  ctx.fillText('CLEAR', 140, 60);
  ctx.font = '11px sans-serif';
  ctx.fillText('SIGNAL', 78, 112);
  return toTexture(canvas, 'facing');
}

/** The aerial's rusty bearing turning: a short squeal of filtered noise. */
function squeal(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 1);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(2400, t);
  band.frequency.linearRampToValueAtTime(3100, t + 0.4);
  band.Q.value = 18;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  source.connect(band).connect(gain).connect(audioBus(ctx, 'world'));
  source.start(t);
  source.stop(t + 0.55);
}
