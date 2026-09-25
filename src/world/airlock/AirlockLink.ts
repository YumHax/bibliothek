import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { setOutdoorsMuffle } from '@/audio/audioContext';
import { TWINS, type TwinId } from './airlockPlan';
import { startBuzz } from './doorSounds';
import type { Airlock } from './Airlock';

/** Whoever walks through: moved to the twin (feet on its floor), turned by the twins' difference in yaw. */
export interface AirlockTraveller {
  setPosition(x: number, z: number, feet?: number): void;
  getLook(): { yaw: number; pitch: number };
  setLook(yaw: number, pitch: number): void;
}

/** What a crossing needs of the rest of the game (`main.ts` hands it over once, `connect`). */
export interface AirlockDeps {
  /** The eye: where the player stands in the sas. */
  camera: THREE.Object3D;
  player: AirlockTraveller;
  /** Builds and compiles a zone and its neighbours while they are still dormant (`World.prepareZone`). */
  prepare(zoneId: string): Promise<void>;
  /** Once the `ZoneManager` has switched: compiles what is left and draws a frame (`World.primeAsync`). */
  settle(): Promise<void>;
}

/** The door release buzzes at least this long (ms), however quickly the other side was ready. */
const MIN_BUZZ_MS = 700;
/** Waiting for a leaf to swing shut gives up after this (ms). */
const SHUT_WAIT_MS = 3000;

/**
 * The pair of twin sas (`Airlock`, one per zone) and the crossing between them. Each twin registers
 * when its zone is built and leaves when it is unloaded (the street is not persistent). A crossing
 * from a twin: its live door swings shut behind the player if it was open, the door release buzzes
 * while the other twin's zone (and neighbours) is built and compiled out of the scene, the other
 * twin's doors are shut, the player is moved to the same spot and look in it, the `ZoneManager`
 * switches over on its next tick, what is left compiles, and the other twin's live door opens: the
 * street door onto Front Street, or the glass door into the entrance hall. Until `connect` (the
 * wiring in `main.ts`), a crossing falls back on travel: the curtain and the arrival spot.
 */
export class AirlockLink {
  private readonly twins = new Map<TwinId, Airlock>();
  private deps: AirlockDeps | null = null;
  private crossing = false;

  connect(deps: AirlockDeps): void {
    this.deps = deps;
  }

  /** True from the buzz to the far door opening: the player is being moved (save nothing, no footstep). */
  get isCrossing(): boolean {
    return this.crossing;
  }

  register(twin: Airlock): void {
    this.twins.set(twin.twin, twin);
  }

  unregister(twin: Airlock): void {
    if (this.twins.get(twin.twin) === twin) this.twins.delete(twin.twin);
  }

  /** Crosses from `from` (the player stands in it) to its twin. */
  async cross(from: Airlock, session: SessionActions): Promise<void> {
    if (this.crossing) return;
    const other = TWINS[from.twin].other;
    const deps = this.deps;
    if (!deps) {
      session.travel(TWINS[other].zone);
      return;
    }
    this.crossing = true;
    let buzz: { stop(): void } | null = null;
    try {
      if (!(await this.shutBehind(from))) return;
      buzz = startBuzz();
      const started = performance.now();
      await deps.prepare(TWINS[other].zone);
      await until(() => performance.now() - started >= MIN_BUZZ_MS, MIN_BUZZ_MS + 100);
      const to = this.twins.get(other);
      if (!to || !from.holdsViewer()) return;
      to.snapShut();
      this.move(from, to, deps);
      setOutdoorsMuffle(to.outdoors ? 1 : 0, true);
      // Two frames for the ZoneManager to switch whatever the order of the frame callbacks, then the stragglers.
      await nextFrame();
      await nextFrame();
      await deps.settle();
      buzz.stop();
      buzz = null;
      to.openLive();
    } catch (error) {
      console.warn('[airlock] crossing failed, travelling instead', error);
      session.travel(TWINS[other].zone);
    } finally {
      buzz?.stop();
      this.crossing = false;
    }
  }

  /** Swings `from`'s live door shut if it is open; true once it is and the player is still inside. */
  private async shutBehind(from: Airlock): Promise<boolean> {
    from.closeLive();
    await until(() => from.liveIsShut, SHUT_WAIT_MS);
    return from.liveIsShut && from.holdsViewer();
  }

  /** The player to the same spot of `to` as they stand in `from`, feet on its floor, turned as it is turned. */
  private move(from: Airlock, to: Airlock, deps: AirlockDeps): void {
    // `to`'s zone may have just been built out of the scene: its matrices were last updated in the stand-in.
    to.updateWorldMatrix(true, false);
    from.updateWorldMatrix(true, false);
    const eye = deps.camera.getWorldPosition(new THREE.Vector3());
    const target = to.localToWorld(from.worldToLocal(eye));
    const floor = to.getWorldPosition(new THREE.Vector3()).y;
    const look = deps.player.getLook();
    deps.player.setPosition(target.x, target.z, floor);
    const turn = to.worldYaw() - from.worldYaw();
    if (Math.abs(turn) > 1e-6) deps.player.setLook(look.yaw + turn, look.pitch);
  }
}

/** The page's pair: the stairwell's and the street's builders place their twin against it; `main.ts` connects it. */
export const airlockLink = new AirlockLink();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Resolves once `done()` holds, checked every frame, or after `ms` whatever. */
async function until(done: () => boolean, ms: number): Promise<void> {
  const deadline = performance.now() + ms;
  while (!done() && performance.now() < deadline) await nextFrame();
}
