import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { startedAudioContext } from '@/audio/audioContext';
import { JukeboxTune, STYLES } from '@/audio/JukeboxTune';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture, OccupancyAware } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

export interface JukeboxOptions {
  /** Whose distance sets the volume: the camera. */
  listener: THREE.Object3D;
  /** Cabinet wood. Default a deep red-brown. */
  color?: number;
  /** The station it plays when the hall is entered (index into the stations), or null to start silent. Default 0. */
  startStation?: number | null;
}

const W = 0.86;
const D = 0.58;
const BODY_H = 1.12;
const ARCH_R = W / 2;
/** Heard across the hall; full volume within `NEAR`. */
const FAR = 12;
const NEAR = 1.2;

const CHROME = new THREE.MeshStandardMaterial({ color: 0xd8dadd, metalness: 0.9, roughness: 0.2 });

/**
 * The hall's jukebox: a fifties bubbler with an arched top, glowing tubes that cycle through the
 * colours, a chrome grille and a lit card behind the glass naming the station and the song. It
 * plays generated music (`JukeboxTune`: synthwave, chiptune, funk, italo disco), louder as the
 * player comes near; a click moves to the next station, and after the last one it goes quiet.
 * Starts playing when the hall is entered (once a gesture has started the page's audio), silent
 * when the player is elsewhere (`setOccupied`). Origin on the floor, +z its front. Collides.
 */
export class Jukebox extends THREE.Group implements Furniture, Updatable, Interactable, OccupancyAware {
  readonly hitboxes: THREE.Object3D[];
  private readonly tune = new JukeboxTune();
  private readonly listener: THREE.Object3D;
  private readonly tubes: THREE.MeshStandardMaterial;
  private readonly card: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial };
  private readonly here = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  /** The station chosen (index), or null for off. */
  private station: number | null;
  private occupied = false;
  private playing = false;
  private clock = 0;
  private shownTitle = '';

  constructor(options: JukeboxOptions) {
    super();
    this.name = 'Jukebox';
    this.listener = options.listener;
    this.station = options.startStation === undefined ? 0 : options.startStation;
    const wood = matte(options.color ?? 0x5a1a14, 0.45);
    // The body and the arch over it.
    this.add(boxMesh(W, BODY_H, D, wood, { y: BODY_H / 2 }));
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(ARCH_R, ARCH_R, D, 32, 1, false, -Math.PI / 2, Math.PI), wood);
    // A half cylinder bulging +z, turned so its axis runs front to back and the bulge points up.
    arch.rotation.x = -Math.PI / 2;
    arch.position.y = BODY_H;
    this.add(arch);
    // The bubble tubes: up each side and round the arch, lit from inside.
    this.tubes = new THREE.MeshStandardMaterial({ color: 0xff2fa0, emissive: 0xff2fa0, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.9 });
    for (const sx of [-1, 1]) this.add(cylinderMesh(0.035, BODY_H - 0.1, this.tubes, { x: sx * (W / 2 - 0.02), y: (BODY_H - 0.1) / 2 + 0.05, z: D / 2 - 0.02 }, { segments: 12 }));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(ARCH_R - 0.02, 0.035, 10, 32, Math.PI), this.tubes);
    halo.position.set(0, BODY_H, D / 2 - 0.02);
    this.add(halo);
    // The glass dome with the song card behind it.
    const [canvas, ctx] = createCanvas(512, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    this.card = { ctx, texture, material };
    const card = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.3), material);
    card.position.set(0, BODY_H + 0.05, D / 2 + 0.001);
    this.add(card);
    // The chrome grille and the coin panel.
    this.add(boxMesh(W - 0.2, 0.012, 0.012, CHROME, { y: BODY_H - 0.14, z: D / 2 + 0.006 }));
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.22, 0.52), new THREE.MeshStandardMaterial({ map: grilleTexture(), metalness: 0.6, roughness: 0.35 }));
    grille.position.set(0, 0.5, D / 2 + 0.002);
    this.add(grille);
    this.add(boxMesh(W - 0.16, 0.06, 0.1, CHROME, { y: 0.86, z: D / 2 + 0.04 }));
    this.add(boxMesh(W, 0.06, D + 0.02, matte(0x151518, 0.5), { y: 0.03 }));
    this.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh !== card) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const hitbox = invisibleHitbox(W + 0.04, BODY_H + ARCH_R, D + 0.04, { y: (BODY_H + ARCH_R) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.paintCard();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, BODY_H + ARCH_R, D / 2));
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.apply();
  }

  update(dt: number): void {
    this.clock += dt;
    // The tubes cycle slowly through the colours while it plays; dim and still when it is off.
    if (this.playing) this.tubes.emissive.setHSL((this.clock * 0.05) % 1, 0.9, 0.55);
    this.tubes.emissiveIntensity = this.playing ? 1.1 + Math.sin(this.clock * 3) * 0.15 : 0.25;
    if (!this.playing && this.occupied && this.station !== null && startedAudioContext()) this.apply();
    if (this.playing) {
      this.getWorldPosition(this.here);
      this.listener.getWorldPosition(this.ear);
      const t = THREE.MathUtils.clamp(1 - (this.here.distanceTo(this.ear) - NEAR) / (FAR - NEAR), 0, 1);
      this.tune.setVolume(0.25 + t * t * 0.75);
      this.tune.update();
      if (this.tune.title !== this.shownTitle) this.paintCard();
    }
  }

  setHovered(hovered: boolean): void {
    this.card.material.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    const next = this.station === null ? STYLES[0]!.name : this.station + 1 < STYLES.length ? STYLES[this.station + 1]!.name : 'off';
    const now = this.station === null ? 'Jukebox (off)' : `Jukebox: ${STYLES[this.station]!.name}${this.tune.title ? ` — “${this.tune.title}”` : ''}`;
    return `${now} · click for ${next === 'off' ? 'silence' : next}`;
  }

  activate(): void {
    this.station = this.station === null ? 0 : this.station + 1 < STYLES.length ? this.station + 1 : null;
    // Already playing: straight to the next station (or silence).
    if (this.playing) this.tune.setStation(this.station);
    this.playing = this.playing && this.station !== null;
    this.apply(true);
  }

  dispose(): void {
    this.tune.dispose();
  }

  /** Plays the chosen station while the player is in the hall (only once the page's audio is running, unless `clicked`). */
  private apply(clicked = false): void {
    const on = this.occupied && this.station !== null && (clicked || !!startedAudioContext());
    if (on && !this.playing) this.tune.setStation(this.station);
    if (!on && this.playing) this.tune.setStation(null);
    this.playing = on;
    this.paintCard();
  }

  /** The card behind the glass: the station, the song, the other stations. */
  private paintCard(): void {
    const { ctx, texture } = this.card;
    this.shownTitle = this.tune.title;
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#8a1a14';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 240);
    if (this.station === null || !this.playing) {
      drawText(ctx, 'SELECT A STATION', 256, 90, 26, '#8a1a14');
      drawText(ctx, STYLES.map((s) => s.name).join(' · '), 256, 150, 14, '#3a2a20');
    } else {
      drawText(ctx, STYLES[this.station]!.name, 256, 64, 34, '#8a1a14');
      drawText(ctx, 'NOW PLAYING', 256, 118, 14, '#3a2a20');
      drawText(ctx, this.tune.title, 256, 160, 24, '#1a1410');
      drawText(ctx, `${this.station + 1} / ${STYLES.length}`, 256, 214, 12, '#6a5a50');
    }
    texture.needsUpdate = true;
  }
}

function grilleTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 160);
  ctx.fillStyle = '#2a1a14';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 3;
  for (let x = 12; x < 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, 152);
    ctx.stroke();
  }
  ctx.strokeStyle = '#e0c060';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 80, 50, 0, Math.PI * 2);
  ctx.stroke();
  return toTexture(canvas, 4);
}
