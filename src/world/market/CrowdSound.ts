import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { startedAudioContext } from '@/audio/audioContext';
import { CrowdMurmur } from '@/audio/CrowdMurmur';
import { playCoins } from '@/audio/coins';
import { playCrateScrape, playRummage } from '@/audio/marketBustle';
import { rearOf, stereoPan } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../Furniture';
import { random } from '@/random';

interface CrowdSoundOptions {
  /** Whose distance and side place the bustle: the camera. */
  listener: THREE.Object3D;
  /** Where the bustle comes from: the stalls (their world positions are read when a sound plays). */
  sources: readonly THREE.Object3D[];
}

/** Seconds between two sounds of the bustle on a busy day (drawn between the two); a quiet hall stretches them. */
const BUSTLE_GAP = { min: 1.4, max: 4.5 };
/** Loudness of each sound at its stall (linear), before the distance. */
const BUSTLE_LEVEL = { rummage: 0.07, coins: 0.05, scrape: 0.035 };
/** Full loudness within this (m); farther, it falls off as `REF / distance`. */
const REF = 2;

/**
 * The hall's sound as something placed in the zone: the murmur of the crowd (`CrowdMurmur`) and, over
 * it, what a flea market sounds like up close: someone going through a crate of games, coins
 * counted out, a crate dragged, each from one of the stalls (`sources`), panned and quieter the
 * farther it is. Heard only while the player is in the hall, as loud and as often as the crowd is
 * big (`setCrowd`, the builder follows the day and night). Nothing to see, never collides; stops
 * for good when the zone unloads.
 */
export class CrowdSound extends THREE.Object3D implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly murmur = new CrowdMurmur();
  private readonly listener: THREE.Object3D;
  private readonly sources: readonly THREE.Object3D[];
  private readonly at = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  private crowd = 1;
  private occupied = false;
  private untilBustle = BUSTLE_GAP.min;

  constructor(options: CrowdSoundOptions) {
    super();
    this.listener = options.listener;
    this.sources = options.sources;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** 0 an empty hall .. 1 a busy day. */
  setCrowd(level: number): void {
    this.crowd = level;
    this.apply();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.apply();
  }

  update(dt: number): void {
    this.murmur.update(dt);
    if (!this.occupied || this.crowd < 0.05 || this.sources.length === 0) return;
    this.untilBustle -= dt;
    if (this.untilBustle > 0) return;
    const quiet = 1 / Math.max(0.25, this.crowd);
    this.untilBustle = (BUSTLE_GAP.min + random() * (BUSTLE_GAP.max - BUSTLE_GAP.min)) * quiet;
    this.bustle();
  }

  dispose(): void {
    this.murmur.dispose();
  }

  private apply(): void {
    this.murmur.setLevel(this.occupied ? this.crowd : 0);
  }

  /** One sound of the bustle, from a stall drawn at random. */
  private bustle(): void {
    if (!startedAudioContext()) return;
    const source = this.sources[Math.floor(random() * this.sources.length)]!;
    source.getWorldPosition(this.at);
    this.listener.getWorldPosition(this.ear);
    const fall = Math.min(1, REF / Math.max(0.1, this.at.distanceTo(this.ear)));
    const spatial = { pan: stereoPan(this.listener, this.at), walls: 0, rear: rearOf(this.listener, this.at) };
    const scale = fall * (0.6 + 0.4 * this.crowd);
    const roll = random();
    if (roll < 0.5) playRummage(BUSTLE_LEVEL.rummage * scale, spatial);
    else if (roll < 0.75) playCoins(1 + Math.floor(random() * 4), BUSTLE_LEVEL.coins * scale, spatial);
    else playCrateScrape(BUSTLE_LEVEL.scrape * scale, spatial);
  }
}
