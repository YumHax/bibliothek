import type * as THREE from 'three';
import type { Engine } from '@/core/Engine';
import { startPerfLog } from '@/core/PerfLog';
import type { Graphics } from '@/graphics';
import type { Zone } from '@/world/zone';
import type { FirstPersonController } from '@/player/FirstPersonController';
import type { PayoutStats } from '@/economy';
import { PayoutOverlay } from '@/ui/PayoutOverlay';

/** Every shadow-casting light in the active zones but `current` (for the F9 bisection's "shadows elsewhere off"). */
function shadowLightsOutside(zones: readonly { readonly group: THREE.Object3D }[], current: object): THREE.Light[] {
  const lights: THREE.Light[] = [];
  for (const zone of zones) {
    if (zone === current) continue;
    zone.group.traverse((obj) => {
      const light = obj as THREE.Light;
      if (light.isLight && light.castShadow) lights.push(light);
    });
  }
  return lights;
}

/**
 * `?stats`: fps, draw calls and lights logged every 2 s, and a console handle for profiling:
 * `bibliothek.bisect()` runs the F9 bisection, `bibliothek.player.setPosition(x, z)` teleports.
 */
export function installStats(parts: { engine: Engine; world: { readonly zones: readonly Zone[] }; zones: { readonly current: Zone }; player: FirstPersonController; graphics: Graphics }): void {
  const { engine, world, zones, player, graphics } = parts;
  const perf = startPerfLog(engine, {
    drawCurrentZoneOnly: () => world.zones.forEach((zone) => zone !== zones.current && zone.setDrawn(false)),
    drawAllZones: () => world.zones.forEach((zone) => zone.isActive && zone.setDrawn(true)),
    shadowLightsOutsideCurrentZone: () => shadowLightsOutside(world.zones, zones.current),
  });
  Object.assign(globalThis, { bibliothek: { engine, world, player, zones, graphics, bisect: perf.bisect } });
}

/** `?payout`: the arcade's balance table, and `simulatePayouts()` in the console (the cabinet games on autopilot, fetched on demand). */
export function installPayoutTable(container: HTMLElement, stats: PayoutStats): void {
  new PayoutOverlay(container, stats);
  void import('@/world/arcade/payoutSim').then(({ simulatePayouts }) => Object.assign(globalThis, { simulatePayouts }));
}
