export interface ProximityVolumeOptions {
  /** Distance (m) up to which the sound is at full volume. */
  referenceDistance?: number;
  /** How fast the volume drops beyond the reference distance (Web Audio "inverse" model). */
  rolloff?: number;
  /** Distance (m) beyond which the sound is silent. */
  maxDistance?: number;
  /**
   * Cosine of the angle between the listener's forward direction and the direction to the
   * source: 1 when facing it, -1 when it is right behind. Omit for an omnidirectional listener.
   */
  facing?: number;
  /** Fraction of the volume kept when the source is directly behind the listener. */
  rearGain?: number;
  /** Walls between the listener and the source (see `world/acoustics/SoundOcclusion`); each lets `wallGain` of the volume through. */
  walls?: number;
  /** Fraction of the volume that gets through one wall. Default 0.3. */
  wallGain?: number;
}

/**
 * Maps a listener-to-source distance to a 0–100 volume, using the inverse-distance model
 * (full volume within `referenceDistance`, then `ref / (ref + rolloff * (d - ref))`) and a
 * linear fade to silence over the last metre before `maxDistance`.
 * When `facing` is given, the source is attenuated as it moves behind the listener. This is the
 * only spatial cue available: the YouTube embed's audio is cross-origin and cannot be panned.
 * Each of the `walls` in between lets `wallGain` of the volume through.
 */
export function proximityVolume(distance: number, options: ProximityVolumeOptions = {}): number {
  const ref = options.referenceDistance ?? 1;
  const rolloff = options.rolloff ?? 1.5;
  const max = options.maxDistance ?? 12;
  if (distance >= max) return 0;

  const d = Math.max(distance, ref);
  let gain = ref / (ref + rolloff * (d - ref));
  if (distance > max - 1) gain *= max - distance; // fade out instead of a hard cut
  gain *= Math.pow(options.wallGain ?? 0.3, options.walls ?? 0);
  if (options.facing !== undefined) {
    const rear = options.rearGain ?? 0.5;
    const front = (Math.min(1, Math.max(-1, options.facing)) + 1) / 2; // 0 behind … 1 in front
    gain *= rear + (1 - rear) * front;
  }
  return Math.round(Math.min(1, Math.max(0, gain)) * 100);
}
