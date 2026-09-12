import type * as THREE from 'three';
import type { Engine } from './Engine';

/** Seconds between two lines. */
const PERIOD = 2;
/** Frames timed per configuration of the bisection (after a few warm-up frames). */
const BISECT_FRAMES = 20;

export interface PerfLogHooks {
  /** Hides every zone but the player's for the "current zone only" configuration. */
  drawCurrentZoneOnly?: () => void;
  /** Undoes `drawCurrentZoneOnly` (the portal culler takes over again on the next real frame). */
  drawAllZones?: () => void;
  /** The shadow-casting lights that are not in the player's zone, for the "shadows from this zone only" configuration. */
  shadowLightsOutsideCurrentZone?: () => THREE.Light[];
}

/**
 * Development readout, switched on with `?stats` in the URL: every couple of seconds, one console
 * line with what a frame costs (fps, draw calls, triangles, compiled programs) and what lights the
 * scene holds, how many of them cast shadows and how many re-render their shadow map every frame.
 * Read it standing in each room to see what a zone change adds.
 *
 * F9 runs a bisection: the GPU time of a frame (measured with `gl.finish()`) under a few
 * configurations (no shadow passes, the player's zone only, pixel ratio 1, all three), so a slow
 * browser tells which part of the frame it chokes on. A low fps with a cheap frame here points
 * outside WebGL (the CSS3D layer, the compositor, JavaScript).
 */
export function startPerfLog(engine: Engine, hooks: PerfLogHooks = {}): { bisect: () => void } {
  const { renderer, scene, camera } = engine;
  const gl = renderer.getContext();
  // A 16-bit depth buffer (some browsers) z-fights on every 2 mm offset; 24 is the norm.
  const depthBits = gl.getParameter(gl.DEPTH_BITS) as number;
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debugInfo ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string) : 'unknown GPU';
  console.log(`[stats] ${gpu} | depth ${depthBits} bits | pixel ratio ${renderer.getPixelRatio()} | ${innerWidth}x${innerHeight} | F9 = bisection`);

  let frames = 0;
  let last = performance.now();
  engine.addUpdatable({ update: () => void frames++ });
  setInterval(() => {
    const now = performance.now();
    const fps = (frames * 1000) / (now - last);
    frames = 0;
    last = now;

    let lights = 0;
    let shadowed = 0;
    let perFrame = 0;
    scene.traverse((obj) => {
      const light = obj as THREE.Light & { isHemisphereLight?: boolean; shadow?: THREE.LightShadow };
      if (!light.isLight || light.isHemisphereLight) return;
      lights++;
      if (!light.castShadow || !light.shadow) return;
      shadowed++;
      if (light.shadow.autoUpdate) perFrame++;
    });
    const { render, programs } = renderer.info;
    console.log(
      `[stats] ${fps.toFixed(0)} loop ticks/s (not displayed frames: a browser may skip presenting) | ${render.calls} draw calls | ${render.triangles} tris | ${programs?.length ?? 0} programs | ${lights} lights, ${shadowed} with shadows, ${perFrame} re-rendering their shadow map every frame`,
    );
  }, PERIOD * 1000);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'F9') bisect();
  });

  /** Median GPU-inclusive time of one render under the current configuration. */
  const timeFrames = (): { ms: number; calls: number } => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) renderer.render(scene, camera);
    for (let i = 0; i < BISECT_FRAMES; i++) {
      const t0 = performance.now();
      renderer.render(scene, camera);
      gl.finish();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { ms: times[BISECT_FRAMES >> 1]!, calls: renderer.info.render.calls };
  };

  function bisect(): void {
    const results: Record<string, string> = {};
    const run = (label: string, on: () => void, off: () => void): void => {
      on();
      const { ms, calls } = timeFrames();
      off();
      results[label] = `${ms.toFixed(1)} ms, ${calls} draw calls`;
    };
    const shadowsOff = (): void => void (renderer.shadowMap.autoUpdate = false);
    const shadowsOn = (): void => void (renderer.shadowMap.autoUpdate = true);
    const ratio = renderer.getPixelRatio();
    const ratioOne = (): void => renderer.setPixelRatio(1);
    const ratioBack = (): void => renderer.setPixelRatio(ratio);
    const currentOnly = (): void => hooks.drawCurrentZoneOnly?.();
    const allZones = (): void => hooks.drawAllZones?.();
    // Switching shadow sampling off entirely recompiles every material (a pause), and back.
    const shadowSampling = (enabled: boolean): void => {
      renderer.shadowMap.enabled = enabled;
      scene.traverse((obj) => {
        const material = (obj as Partial<THREE.Mesh>).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true;
      });
    };
    run('full frame', () => {}, () => {});
    run('no shadow passes', shadowsOff, shadowsOn);
    run('current zone only', currentOnly, allZones);
    run('pixel ratio 1', ratioOne, ratioBack);
    run('all three', () => { shadowsOff(); currentOnly(); ratioOne(); }, () => { shadowsOn(); allZones(); ratioBack(); });
    run('no shadows at all (no passes, no sampling)', () => shadowSampling(false), () => shadowSampling(true));
    // Fewer shadow maps in the shader (the other zones' lights stop casting), recompiles too.
    const others = hooks.shadowLightsOutsideCurrentZone?.() ?? [];
    const recompile = (): void => shadowSampling(renderer.shadowMap.enabled);
    run(`shadows from this zone's ${14 - others.length} lights only (${others.length} others off)`, () => { others.forEach((l) => (l.castShadow = false)); recompile(); }, () => { others.forEach((l) => (l.castShadow = true)); recompile(); });
    console.log('[bisect] ' + JSON.stringify(results, null, 1));
  }

  return { bisect };
}
