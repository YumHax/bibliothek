import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';

/**
 * The light budget. three.js renders forward: every light the scene draws is evaluated by every
 * lit fragment, every shadow-casting one is a texture unit in every lit shader, and a change in
 * the number of lights recompiles every lit program. So:
 * - shadow maps + a material's own maps must fit the GPU's texture units (past it, lit programs
 *   fail to link and the rooms go black): `MATERIAL_UNITS` is the margin kept for the maps;
 * - the count must not change while playing (a light hidden with `visible`, a lamp built on a
 *   purchase): hide a lamp with `setShownKeepingLights`, dim a light with `intensity = 0`;
 * - only a few of each kind reach the renderer at once (`QUALITY.lights`): the `LightCuller` picks
 *   them each frame and hides the others, keeping every count fixed; owners never set `visible`;
 * - decorative glows that do not need a light each (a cabinet's screen, a neon, a claw machine's
 *   case) are `PooledLight`s sharing a zone's `LightPool`, a fixed handful of real lights.
 *
 * `LightMonitor` checks all three while the game runs.
 */
export const MATERIAL_UNITS = 6;

/** How many lights of each kind the scene draws (visible down their whole parent chain), and how many cast shadows. */
interface LightCount {
  point: number;
  spot: number;
  directional: number;
  hemisphere: number;
  rectArea: number;
  ambient: number;
  shadows: number;
}

type AnyLight = THREE.Light & {
  isPointLight?: boolean;
  isSpotLight?: boolean;
  isDirectionalLight?: boolean;
  isHemisphereLight?: boolean;
  isRectAreaLight?: boolean;
  isAmbientLight?: boolean;
};

/** The lights `root` draws (`traverseVisible`: a hidden parent hides its lights from the renderer too). */
function drawnLights(root: THREE.Object3D): THREE.Light[] {
  const lights: THREE.Light[] = [];
  root.traverseVisible((obj) => {
    if ((obj as THREE.Light).isLight) lights.push(obj as THREE.Light);
  });
  return lights;
}

export function countLights(lights: readonly THREE.Light[]): LightCount {
  const count: LightCount = { point: 0, spot: 0, directional: 0, hemisphere: 0, rectArea: 0, ambient: 0, shadows: 0 };
  for (const l of lights as readonly AnyLight[]) {
    if (l.isPointLight) count.point++;
    else if (l.isSpotLight) count.spot++;
    else if (l.isDirectionalLight) count.directional++;
    else if (l.isHemisphereLight) count.hemisphere++;
    else if (l.isRectAreaLight) count.rectArea++;
    else if (l.isAmbientLight) count.ambient++;
    if (l.castShadow && (l.isPointLight || l.isSpotLight || l.isDirectionalLight)) count.shadows++;
  }
  return count;
}

export function describeCount(c: LightCount): string {
  return `${c.point} point, ${c.spot} spot, ${c.directional} directional, ${c.hemisphere} hemisphere, ${c.rectArea} area; ${c.shadows} shadow maps`;
}

/** A readable path to a light: its ancestors' names or classes, up to the scene. */
function pathOf(obj: THREE.Object3D): string {
  const parts: string[] = [];
  for (let o: THREE.Object3D | null = obj; o && o.parent; o = o.parent) parts.push(o.name || o.constructor.name);
  return parts.reverse().join(' > ');
}

/**
 * Watches the scene's lights every couple of seconds. Always: an error when the shadow maps leave
 * less than `MATERIAL_UNITS` of the GPU's texture units. With `verbose` (`?stats` / `?debug`): a
 * warning each time the drawn counts change within one set of zones, naming the lights that came
 * and went (each change recompiles every lit program; the `LightCuller` trading one light for
 * another of the same kind does not), and a line per change of zone with the new totals.
 */
export class LightMonitor implements Updatable {
  private timer = 0;
  private last: Map<string, THREE.Light> | null = null;
  private lastCount = '';
  private lastSet = '';
  private shadowErrorShown = false;

  /**
   * `activeSet` names what is loaded (the active zones' ids): lights that change along with it are
   * expected (a zone coming in brings its lamps, precompiled by `prepareZone`); a change within
   * one set is the bug this warns about.
   */
  /** Logs every change (`?stats` / `?debug`); only the texture-unit overflow otherwise. */
  verbose = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly maxTextures: number,
    private readonly activeSet: () => string = () => '',
    private readonly interval = 2,
  ) {}

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval;
    this.check();
  }

  /** Checks now (also called by `World.prime` once everything is built). */
  check(reason = ''): LightCount {
    const lights = drawnLights(this.scene);
    const count = countLights(lights);
    const line = `[lights] ${describeCount(count)} of ${this.maxTextures} texture units`;
    if (count.shadows + MATERIAL_UNITS > this.maxTextures) {
      if (!this.shadowErrorShown) console.error(`${line}: too many shadow-casting lights, lit shaders will not link`);
      this.shadowErrorShown = true;
    } else {
      this.shadowErrorShown = false;
    }
    const now = new Map(lights.map((l) => [l.uuid, l]));
    const set = this.activeSet();
    const sameSet = set === this.lastSet;
    this.lastSet = set;
    const described = describeCount(count);
    const sameCount = described === this.lastCount;
    this.lastCount = described;
    if (this.verbose && this.last && !sameSet) {
      console.info(`${line} (${set})`);
    } else if (this.verbose && this.last) {
      if (sameCount) {
        this.last = now;
        return count;
      }
      const came = lights.filter((l) => !this.last!.has(l.uuid));
      const went = [...this.last.values()].filter((l) => !now.has(l.uuid));
      if (came.length || went.length) {
        console.warn(
          `${line}${reason ? ` (${reason})` : ''}: the drawn lights changed, every lit shader recompiles.` +
            (came.length ? `\n  + ${came.map(pathOf).join('\n  + ')}` : '') +
            (went.length ? `\n  - ${went.map(pathOf).join('\n  - ')}` : ''),
        );
      }
    } else if (this.verbose || reason === 'prime') {
      console.info(line);
    }
    this.last = now;
    return count;
  }
}
