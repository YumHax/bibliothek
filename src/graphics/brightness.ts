/** Settings > Display > Brightness, as stops over every exposure the frame is given (`PostFx`, `low`'s tone mapping). */
let stops = 0;

/** The player's brightness: a multiplier of the exposure, 1 as the looks were tuned (`settings/apply`). */
export function setBrightness(multiplier: number): void {
  stops = Math.log2(Math.max(0.01, multiplier));
}

/** The stops the brightness setting adds (0 at the default). */
export function brightnessStops(): number {
  return stops;
}
