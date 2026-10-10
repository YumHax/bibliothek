import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Listeners } from '@/core/Listeners';
import type { Look } from '@/graphics';
import type { PhotoLens } from '@/graphics/PostFx';
import type { ModalLike } from '@/game/SessionParts';
import { duckScene } from '@/audio/audioContext';
import { IntroScore } from '@/audio/introScore';
import { clamp, lerp, ramp, smooth, triangle } from '@/math/scalar';
import { reduceMotion } from '@/settings/motion';
import { IntroScreen } from '@/ui/intro/IntroScreen';
import { AlbumPanel } from '@/ui/memories/AlbumPanel';
import type { Furniture } from '@/world/Furniture';
import { disposeTree } from '@/world/props/Prop';
import type { Zone } from '@/world/zone/Zone';
import type { ZoneId } from '@/world/zoneIds';
import { MEMORY_LOOK } from './memoryLook';
import type { MemoryReel, MemoryScene, MemorySet, MemoryShot } from './memoryReel';
import { hideDuring, setPastLight, type WeatherHold } from './pastLight';

/** The player as the film parks and places it (`FirstPersonController` fits). */
interface FilmPlayer {
  readonly isSeated: boolean;
  sit(eyePosition: THREE.Vector3, yaw: number, instant?: boolean): void;
  stand(instant?: boolean): void;
  setPosition(x: number, z: number, feet?: number): void;
  setLook(yaw: number, pitch: number): void;
  lookAt(target: THREE.Vector3): void;
}

/** Félix's flat as the opening shows it (`intro/DreamFlat`): its covers sent up in the black, put away after. */
interface DreamLike {
  flushCovers(): void;
  putAway(): void;
}

/** What the projector is handed by the wiring (`bootstrap/world.ts`). */
interface MemoryDeps {
  camera: THREE.PerspectiveCamera;
  player: FilmPlayer;
  container: HTMLElement;
  /** The frame's grade (`graphics.setLook`), zone `id`'s own back at once, the lens (null on `low`). */
  setLook(look: Look, snap?: boolean): void;
  zoneLook(id: ZoneId): void;
  lens: { setLens(lens: PhotoLens | null): void } | null;
  /** Ticks the film. */
  engine: { addUpdatable(u: Updatable): void; removeUpdatable(u: Updatable): void };
  /**
   * The zones: one by id, the player's, one built and compiled out of sight (`World.prepareZone`) so the film can cut
   * to it, and one kept loaded however long it stays dormant (`ZoneManager.hold`) while the film needs it.
   */
  zones: {
    zone(id: ZoneId): Zone;
    here(): ZoneId;
    prepare(id: ZoneId): Promise<void>;
    hold(id: ZoneId, held: boolean): void;
  };
  /** The weather shown outside for a while (`Weather.hold`, the sky told), or null. */
  holdWeather: WeatherHold | null;
  /** Félix's flat as he had it, for a scene filmed in the flat; null when it cannot be shown. */
  dream(): DreamLike | null;
  /** Renders a frame now and hands back the canvas it is in (`engine.renderFrame`): a still for the album, read at once. */
  frame(): HTMLCanvasElement;
}

/** The black before the first shot (s), the fade in, the fade out after the last, how long it holds black, the lift. */
const OPEN_BLACK = 2.5;
const FADE_IN = 1.6;
const FADE_OUT = 1.8;
const HOLD_BLACK = 0.8;
const LIFT = 1.6;
/** A dip to black between two shots of a scene (s, each way). */
const CUT_DIP = 0.35;
/** Between two scenes: the black comes down over `fall` before the cut, holds `hold` either side of it, lifts over `rise`. */
const SCENE_CUT = { fall: 0.4, hold: 0.3, rise: 0.5 } as const;
/** How long before a scene's first shot it is staged (s): in the held black, a frame or two for the zone to switch. */
const SWAP_LEAD = 0.25;
/** The camera's drift while a shot holds (m, and its pace): a hand-held breath. */
const DRIFT = { amount: 0.01, pace: 0.45 } as const;
/** A close or Esc asks first ("Again to skip"), a second within this long (ms) skips. */
const SKIP_ARM_MS = 2500;
/** How long the zones elsewhere may take to prepare (ms) before the film gives up and goes to its end. */
const PREPARE_TIMEOUT_MS = 20000;
/** The album's still: taken this long into the first shot, once the black has lifted, this wide (4:3). */
const STILL = { into: FADE_IN + 1.2, width: 360, height: 270, quality: 0.85 } as const;
/** At least this black, the screen hides a hitch: the dream's covers are uploaded then. */
const BLACK_ENOUGH = 0.85;

/**
 * Plays the memories (docs/story.md "Mémé"): made once by the wiring, handed to the builders as
 * `BuildContext.memories`. A builder asks it for a film of a reel and opens it as a panel; it keeps the album's stills
 * (one taken the first time a memory plays this session), the album's panel, and the things of the present each zone
 * puts aside while a memory is filmed there (`markModern`).
 */
export class MemoryProjector {
  private readonly stills = new Map<string, string>();
  private readonly modern = new Map<Zone, Set<THREE.Object3D>>();
  private albumPanel: AlbumPanel | null = null;
  private playing = 0;

  constructor(private readonly deps: MemoryDeps) {}

  /** A film of `reel`, opened as a panel (`SessionActions.openPanel`); `seen` is called once it has played to its end. */
  film(reel: MemoryReel, seen?: () => void): ModalLike {
    return new MemoryFilm(this.deps, reel, {
      seen,
      modernIn: (zone) => this.modern.get(zone) ?? [],
      still: (url) => this.stills.set(reel.id, url),
      hasStill: () => this.stills.has(reel.id),
      playing: (on) => (this.playing += on ? 1 : -1),
    });
  }

  /** While a memory plays (its zones' arrivals are not visits: the camera only passed through). */
  get filming(): boolean {
    return this.playing > 0;
  }

  /**
   * Things of `zone` that did not exist in the past (a smoke detector, a flat-screen): hidden while a memory is filmed
   * there. Forgotten when the zone unloads (its builder marks them again on the next build).
   */
  markModern(zone: Zone, objects: readonly THREE.Object3D[]): void {
    let set = this.modern.get(zone);
    if (!set) {
      set = new Set();
      this.modern.set(zone, set);
      zone.onUnload(() => this.modern.delete(zone));
    }
    for (const obj of objects) set.add(obj);
  }

  /** The still of memory `id` taken this session (a JPEG data URL), or null. */
  still(id: string): string | null {
    return this.stills.get(id) ?? null;
  }

  /** The album's pages, as a panel (one, made the first time). */
  get album(): AlbumPanel {
    return (this.albumPanel ??= new AlbumPanel(this.deps.container));
  }
}

/** What the projector hands a film of its own. */
interface FilmHooks {
  seen?: () => void;
  modernIn(zone: Zone): Iterable<THREE.Object3D>;
  still(url: string): void;
  hasStill(): boolean;
  playing(on: boolean): void;
}

/** A scene on: its zone, and what puts the present back. */
interface Staged {
  scene: MemoryScene;
  zone: Zone;
  placed: Furniture[];
  undo: (() => void)[];
  dream: DreamLike | null;
}

/**
 * A MEMORY'S FILM: a panel the Session opens (the mouse let go, the room's clicks off, the menu kept down) that takes
 * the camera like the opening (`intro/IntroCutscene`): the screen's black, bars and narration (`IntroScreen`), the
 * opening's waltz recoloured (`IntroScore.startMemory`), the reel's grade and shots. Under the first black the zones
 * it is filmed in are built and compiled (the music waits for them), then each scene is staged in its zone as the
 * film reaches it, the camera taking the ZoneManager there, and struck under the black after it; under the last black
 * the player is set down where the reel says and the black lifts on the room as it is, the title over it with the
 * button back. Esc or E asks to skip, twice skips; at the title they end it.
 */
class MemoryFilm implements ModalLike, Updatable {
  onOpenChange?: (open: boolean) => void;
  private readonly openListeners = new Listeners<[open: boolean]>();
  private open = false;
  private ready = false;
  private skipped = false;
  private t = 0;
  private jump = 0;
  private screen: IntroScreen | null = null;
  private score: IntroScore | null = null;
  private struck = false;
  private titled = false;
  private stillTaken = false;
  private shot: MemoryShot | null = null;
  private sceneIndex = -1;
  private staged: Staged | null = null;
  private lookedIn: ZoneId | null = null;
  private held: ZoneId[] = [];
  private skipArmedAt = -Infinity;
  private fov = 0;
  private drift: number = DRIFT.amount;
  private readonly end: number;
  private readonly look: Look;
  private readonly lookAt = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(private readonly deps: MemoryDeps, private readonly reel: MemoryReel, private readonly hooks: FilmHooks) {
    const last = reel.scenes[reel.scenes.length - 1];
    this.end = last?.shots[last.shots.length - 1]?.to ?? OPEN_BLACK;
    this.look = reel.look ?? MEMORY_LOOK;
  }

  get isOpen(): boolean {
    return this.open;
  }

  addOpenListener(listener: (open: boolean) => void): () => void {
    return this.openListeners.add(listener);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.play();
  }

  /** Esc, E or the Skip button: before the title, asks once then skips to it; at the title, back to the room. */
  close(): void {
    if (!this.open) return;
    if (this.titled) {
      this.finish();
      return;
    }
    const now = performance.now();
    if (now - this.skipArmedAt <= SKIP_ARM_MS) this.skip();
    else {
      this.skipArmedAt = now;
      this.screen?.armSkip(true);
    }
  }

  private play(): void {
    const { deps, reel } = this;
    this.open = true;
    this.ready = this.skipped = false;
    this.t = 0;
    this.jump = 0;
    this.struck = this.titled = this.stillTaken = false;
    this.sceneIndex = -1;
    this.lookedIn = null;
    this.fov = deps.camera.fov;
    this.drift = reduceMotion() ? 0 : DRIFT.amount;
    const screen = new IntroScreen(deps.container, { onSkip: () => this.skip(), onGetUp: () => this.finish() }, { name: reel.title, line: reel.tagline, getUp: reel.back });
    this.screen = screen;
    screen.show(true);
    screen.setBlack(1);
    screen.setBars(0);
    screen.setSkippable(true);
    // Parked like photo mode: the walk stops, the camera is the film's.
    if (!deps.player.isSeated) deps.player.sit(deps.camera.position.clone(), 0, true);
    duckScene(0, 1.2);
    deps.setLook(this.look, true);
    // Every zone the film passes through stays loaded until it ends, the one it started in among them.
    const here = deps.zones.here();
    this.held = [...new Set<ZoneId>([here, reel.after.zone, ...reel.scenes.map((scene) => scene.zone)])];
    for (const id of this.held) deps.zones.hold(id, true);
    this.hooks.playing(true);
    deps.engine.addUpdatable(this);
    this.emitOpen(true);
    this.update(0);
    // The zones elsewhere built and compiled in the black; the music (and the film's clock) starts once they are.
    const elsewhere = [...new Set(reel.scenes.map((scene) => scene.zone))].filter((id) => id !== here);
    // A zone that would not prepare (or never answers) skips the film to its end rather than cut to a zone not built.
    const giveUp = (error: unknown) => {
      if (!this.open || this.ready) return;
      console.error('[memories] a zone of the film would not prepare', error);
      this.skipped = true;
      this.begin();
    };
    const timeout = window.setTimeout(() => giveUp('timed out'), PREPARE_TIMEOUT_MS);
    Promise.all(elsewhere.map((id) => deps.zones.prepare(id))).then(
      () => {
        window.clearTimeout(timeout);
        this.begin();
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        giveUp(error);
      },
    );
  }

  /** The zones are ready: the music from now, the film's clock with it (straight to the end if skipped meanwhile). */
  private begin(): void {
    if (!this.open || this.ready) return;
    this.ready = true;
    if (this.skipped) {
      this.t = this.end;
      return;
    }
    this.score = new IntroScore();
    this.score.startMemory({ score: this.reel.score ?? 'waltz', from: this.reel.scenes[0]?.shots[0]?.from ?? OPEN_BLACK, until: this.end });
  }

  update(dt: number): void {
    if (!this.open) return;
    const screen = this.screen!;
    if (!this.ready) {
      screen.setBlack(1);
      return;
    }
    const music = this.score?.elapsed() ?? null;
    this.t = Math.max(this.t, music === null ? this.t + dt : music + this.jump);
    const t = this.t;
    const { reel } = this;

    screen.setBars(t < this.end + HOLD_BLACK ? ramp(t, 0.3, 2.1) : 1 - ramp(t, this.end + HOLD_BLACK, this.end + HOLD_BLACK + LIFT));
    const black = this.blackAt(t);
    screen.setBlack(black);
    screen.say(t < this.end ? (reel.lines.find((line) => t >= line.at && t < line.at + line.seconds)?.text ?? null) : null);
    if (this.skipArmedAt > -Infinity && performance.now() - this.skipArmedAt > SKIP_ARM_MS) {
      this.skipArmedAt = -Infinity;
      screen.armSkip(false);
    }

    if (t < this.end) {
      const index = this.sceneAt(t);
      if (index !== this.sceneIndex) this.cutTo(index);
      const scene = this.staged?.scene;
      if (scene) {
        this.film(scene, t);
        scene.beat?.(t);
      }
      if (black >= BLACK_ENOUGH) this.staged?.dream?.flushCovers();
      // The camera took the ZoneManager to another zone, whose grade it set: the film's again, at once.
      const here = this.deps.zones.here();
      if (here !== this.lookedIn) {
        this.lookedIn = here;
        this.deps.setLook(this.look, true);
      }
      this.takeStill(t, black);
    } else if (!this.struck && black >= 0.99) this.backToNow();
    if (this.struck && !this.titled && t >= this.end + HOLD_BLACK + LIFT * 0.5) {
      this.titled = true;
      screen.setSkippable(false);
      screen.showTitle(true, true);
      this.score?.title();
      this.hooks.seen?.();
    }
  }

  /** The scene on at `t`: the last one whose first shot is at most `SWAP_LEAD` ahead (it is staged in the black before it). */
  private sceneAt(t: number): number {
    let index = 0;
    this.reel.scenes.forEach((scene, i) => {
      if (t >= (scene.shots[0]?.from ?? Infinity) - SWAP_LEAD) index = i;
    });
    return index;
  }

  /** The black: until the first shot, a dip at every cut, a longer one between scenes, down after the last, up again on the room. */
  private blackAt(t: number): number {
    const scenes = this.reel.scenes;
    const first = scenes[0]?.shots[0]?.from ?? OPEN_BLACK;
    if (t < this.end) {
      const fadeIn = 1 - ramp(t, first, first + FADE_IN);
      let cuts = 0;
      scenes.forEach((scene, i) =>
        scene.shots.forEach((shot, j) => {
          if (i === 0 && j === 0) return;
          const dip = j === 0 ? sceneDip(t, shot.from) : triangle(t, shot.from, CUT_DIP);
          cuts = Math.max(cuts, dip);
        }),
      );
      const fadeOut = ramp(t, this.end - FADE_OUT, this.end);
      return Math.max(fadeIn, cuts, fadeOut);
    }
    return 1 - ramp(t, this.end + HOLD_BLACK, this.end + HOLD_BLACK + LIFT);
  }

  /** In the black: the scene before struck, scene `index` staged in its zone (the camera goes there this frame). */
  private cutTo(index: number): void {
    this.strikeScene();
    this.sceneIndex = index;
    const scene = this.reel.scenes[index];
    if (!scene) return;
    const { deps, hooks } = this;
    const zone = deps.zones.zone(scene.zone);
    const staged: Staged = { scene, zone, placed: [], undo: [], dream: null };
    this.staged = staged;
    const set: MemorySet = {
      zone,
      viewer: deps.camera,
      world: (x, y, z) => zone.toWorld(new THREE.Vector3(x, y, z)),
      // What the past places is its own (`userData.memoryCast`: the people of today are kept out, not these).
      place: (item, at, yaw) => {
        item.userData.memoryCast = true;
        zone.place(item, at, yaw);
        staged.placed.push(item);
        return item;
      },
      placeAt: (item, at) => {
        item.userData.memoryCast = true;
        zone.placeAt(item, at);
        staged.placed.push(item);
        return item;
      },
      hide: (...objects) => {
        staged.undo.push(hideDuring(objects));
      },
      dream: () => {
        if (staged.dream) return true;
        staged.dream = deps.dream();
        return staged.dream !== null;
      },
    };
    staged.undo.push(hideDuring(hooks.modernIn(zone)));
    if (scene.light) staged.undo.push(setPastLight(zone.group, scene.light, deps.holdWeather));
    scene.stage(set);
    this.shot = null;
  }

  /** The scene on taken away: its own strike, then what the set's helpers did undone, the newest first. */
  private strikeScene(): void {
    const staged = this.staged;
    if (!staged) return;
    this.staged = null;
    staged.scene.strike?.();
    for (const item of staged.placed) {
      staged.zone.remove(item);
      disposeTree(item);
    }
    staged.dream?.putAway();
    for (const undo of staged.undo.reverse()) undo();
  }

  /** The shot at `t`, the camera eased along it (the scene's zone's metres made the world's), a breath of drift, the focus pulled. */
  private film(scene: MemoryScene, t: number): void {
    const { camera, player, lens } = this.deps;
    const shots = scene.shots;
    const shot = shots.find((s) => t < s.to) ?? shots[shots.length - 1];
    if (!shot) return;
    if (shot !== this.shot) {
      this.shot = shot;
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    const zone = this.staged!.zone;
    const u = clamp((t - shot.from) / (shot.to - shot.from), 0, 1);
    const k = lerp(u, smooth(u), 0.6);
    const c = shot.camera;
    zone.toWorld(this.at.set(lerp(c.from[0], c.to[0], k), lerp(c.from[1], c.to[1], k), lerp(c.from[2], c.to[2], k)));
    this.at.x += Math.sin(t * DRIFT.pace) * this.drift;
    this.at.y += Math.sin(t * DRIFT.pace * 1.3 + 1) * this.drift * 0.6;
    zone.toWorld(this.lookAt.set(lerp(c.lookFrom[0], c.lookTo[0], k), lerp(c.lookFrom[1], c.lookTo[1], k), lerp(c.lookFrom[2], c.lookTo[2], k)));
    camera.position.copy(this.at);
    player.lookAt(this.lookAt);
    const focus = shot.lens.focusTo === undefined ? shot.lens.focus : lerp(shot.lens.focus, shot.lens.focusTo, smooth(u));
    lens?.setLens({ focus, blur: shot.lens.blur, exposure: 0 });
  }

  /** Once, the first time this memory plays this session: the frame a moment into the first shot, for the album. */
  private takeStill(t: number, black: number): void {
    if (this.stillTaken || black > 0.01) return;
    const first = this.reel.scenes[0]?.shots[0];
    if (!first || t < first.from + Math.min(STILL.into, (first.to - first.from) / 2)) return;
    this.stillTaken = true;
    if (this.hooks.hasStill()) return;
    try {
      const frame = this.deps.frame();
      const out = document.createElement('canvas');
      out.width = STILL.width;
      out.height = STILL.height;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      // The middle of the frame at 4:3, the video cut-outs (see-through) black.
      const scale = Math.min(frame.width / STILL.width, frame.height / STILL.height);
      const w = STILL.width * scale;
      const h = STILL.height * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, STILL.width, STILL.height);
      ctx.drawImage(frame, (frame.width - w) / 2, (frame.height - h) / 2, w, h, 0, 0, STILL.width, STILL.height);
      this.hooks.still(out.toDataURL('image/jpeg', STILL.quality));
    } catch (error) {
      console.warn('[memories] no still for the album', error);
    }
  }

  /** In the black: the past struck, the reel's zone's grade and lens, the player standing where the reel says. */
  private backToNow(): void {
    this.struck = true;
    const { deps, reel } = this;
    this.strikeScene();
    this.sceneIndex = -1;
    deps.zoneLook(reel.after.zone);
    deps.lens?.setLens(null);
    deps.camera.fov = this.fov;
    deps.camera.updateProjectionMatrix();
    deps.player.stand(true);
    const [x, z] = reel.after.at;
    const at = deps.zones.zone(reel.after.zone).toWorld(new THREE.Vector3(x, 0, z));
    deps.player.setPosition(at.x, at.z, at.y);
    deps.player.setLook(reel.after.yaw, 0);
    this.shot = null;
    reel.returned?.();
    duckScene(1, 2.5);
  }

  /** Straight to the last black (the room comes back and the title with it). */
  private skip(): void {
    if (this.t >= this.end) return;
    this.skipArmedAt = -Infinity;
    this.screen?.armSkip(false);
    this.screen?.say(null);
    if (!this.ready) {
      // Still preparing: straight to the end, without waiting for the zones elsewhere.
      this.skipped = true;
      this.begin();
      return;
    }
    this.score?.stop();
    this.jump += this.end - this.t;
    this.t = this.end;
  }

  /** The button back: the screen gone, the zones let go, the panel closed (the Session takes the player back into the room). */
  private finish(): void {
    if (!this.open) return;
    if (!this.struck) this.backToNow();
    this.open = false;
    this.deps.engine.removeUpdatable(this);
    this.screen?.dispose();
    this.screen = null;
    this.score = null;
    for (const id of this.held) this.deps.zones.hold(id, false);
    this.held = [];
    this.hooks.playing(false);
    this.emitOpen(false);
  }

  private emitOpen(open: boolean): void {
    this.onOpenChange?.(open);
    this.openListeners.emit(open);
  }
}

/** Between two scenes, at cut `b`: the black down before it, held across it, lifting after. */
function sceneDip(t: number, b: number): number {
  return Math.min(ramp(t, b - SCENE_CUT.hold - SCENE_CUT.fall, b - SCENE_CUT.hold), 1 - ramp(t, b + SCENE_CUT.hold, b + SCENE_CUT.hold + SCENE_CUT.rise));
}
