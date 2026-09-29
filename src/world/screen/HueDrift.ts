import * as THREE from 'three';

/**
 * The picture's light is not one colour: without access to the video's pixels (a cross-origin
 * iframe), a screen's glow drifts between the hues a longplay is made of, a new one every few seconds.
 */
export const GLOW_HUES = [0xa9c7ff, 0xd8e4ff, 0x9fd1b8, 0xffd9b0, 0xb8a9ff, 0xcfe8ff];
const HUE_SECONDS = 3.2;

/** The drifting hue of a playing screen's light (the TV's glow, the projector's beam). */
export class HueDrift {
  readonly color = new THREE.Color(GLOW_HUES[0]);
  private readonly from = new THREE.Color(GLOW_HUES[0]);
  private readonly to = new THREE.Color(GLOW_HUES[1]);
  private timer = 0;
  private index = 1;

  /**
   * Advances the drift by `dt` and returns the colour, `rest` blended in by `restMix` (0..1):
   * a projector's white lamp is only tinted by the picture.
   */
  update(dt: number, rest?: THREE.Color, restMix = 0): THREE.Color {
    this.timer += dt;
    if (this.timer >= HUE_SECONDS) {
      this.timer = 0;
      this.from.copy(this.to);
      this.index = (this.index + 1 + Math.floor(Math.random() * (GLOW_HUES.length - 1))) % GLOW_HUES.length;
      this.to.set(GLOW_HUES[this.index]!);
    }
    this.color.lerpColors(this.from, this.to, THREE.MathUtils.smoothstep(this.timer / HUE_SECONDS, 0, 0.6));
    if (rest && restMix > 0) this.color.lerp(rest, restMix);
    return this.color;
  }
}
