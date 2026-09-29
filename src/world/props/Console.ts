import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Platform, PlatformId } from '@/catalog/types';
import { mediaOf } from '@/catalog/media';
import { getPlatform } from '@/catalog/platforms';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { playPlasticClick } from '@/audio/furnitureSounds';
import type { GameBox } from '../GameBox';
import { unplayableWhy } from '../box/unplayable';
import type { VideoScreen } from '../screen';
import { nowPlaying } from '../screen/nowPlaying';
import type { MediaDeck } from '../media/MediaDeck';
import type { MediaModel } from '../media/MediaModel';
import { Timeline } from '../media/Timeline';
import { ejectSteps, insertSteps, seatPoses, type SeatPoses } from '../media/insertion';
import { invisibleHitbox } from '../meshUtils';
import { Prop, disposeTree } from './Prop';
import { buildConsole, type MediaSlot } from './consoleStyles';

export type PlatformSelectHandler = (platformId: PlatformId) => void;

/** A cartridge (or disc) in the console, or on its way in or out. */
interface Loaded {
  /** Its box (swapped for the new one when the shelf rebuilt it and the player brings that one). */
  box: GameBox;
  media: MediaModel;
  poses: SeatPoses;
  slot: MediaSlot;
  /** Going in, or coming out; null once it rests. */
  moving: Timeline | null;
  seated: boolean;
}

/**
 * One console slot on the TV stand. The slot exists from the start with a fixed hitbox (the
 * Interactor snapshots hitboxes when it registers), and `setPlatform()` fills or empties it:
 * an empty slot drops off every raycast layer so it neither shows a label nor swallows clicks.
 *
 * With a game of its platform in hand, a click takes the cartridge (or the disc) out of the box,
 * which goes back to its shelf, flies it to the slot and puts it in the way the real console takes
 * it (pushed into the NES and pressed down, dropped into a top slot, laid on the PlayStation's
 * spindle under its lid), then plays the game on the TV. It stays in until another game takes its
 * place or an empty-handed click ejects it, back to its box.
 */
export class Console extends Prop implements Interactable, Updatable, MediaDeck {
  readonly hitboxes: THREE.Object3D[];

  private platform: Platform | null = null;
  private visual: THREE.Group | null = null;
  private slot: MediaSlot | null = null;
  private hoverMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly hitbox: THREE.Mesh;
  private screen: VideoScreen | null = null;
  private current: Loaded | null = null;
  /** Cartridges on their way back to their boxes. */
  private readonly leaving: Loaded[] = [];
  private seatedAt = 0;

  constructor(
    private readonly slotWidth: number,
    private readonly onSelect?: PlatformSelectHandler,
  ) {
    super();
    this.name = 'ConsoleSlot';
    this.hitbox = invisibleHitbox(1, 1, 1); // scaled to the console in `setPlatform`
    this.hitbox.layers.disableAll();
    this.hitboxes = [this.hitbox];
    this.add(this.hitbox);
  }

  get platformId(): PlatformId | null {
    return this.platform?.id ?? null;
  }

  get deckName(): string {
    return this.platform?.shortName ?? 'console';
  }

  get loaded(): GameBox | null {
    const current = this.current;
    return current?.seated && !current.moving && !current.box.isDisposed ? current.box : null;
  }

  get loadedAt(): number {
    return this.seatedAt;
  }

  get busy(): boolean {
    return this.current?.moving != null;
  }

  /** The screen this console plays on (the TV it stands under). */
  setScreen(screen: VideoScreen): void {
    this.screen = screen;
  }

  setPlatform(platform: Platform | null): void {
    if (platform?.id === this.platform?.id) return;
    this.clearMedia();
    if (this.visual) {
      this.remove(this.visual);
      disposeTree(this.visual);
      this.visual = null;
      this.slot = null;
      this.hoverMaterials = [];
    }
    this.platform = platform;
    if (!platform) {
      this.hitbox.layers.disableAll();
      return;
    }
    const built = buildConsole(platform);
    this.visual = built.group;
    this.slot = built.slot ?? null;
    this.hoverMaterials = built.hover;
    this.add(this.visual);
    // Hitbox covers the console and the pad in front of it, the full slot width.
    const height = Math.max(built.size.h, 0.16) + 0.02;
    this.hitbox.scale.set(this.slotWidth * 0.95, height, 0.4);
    this.hitbox.position.set(0, height / 2, 0);
    this.hitbox.layers.set(0);
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    for (const m of this.hoverMaterials) m.emissive.setHex(hovered ? 0x2a2620 : 0x000000);
  }

  label(player: PlayerState): string | null {
    if (!this.platform) return null;
    const name = this.platform.shortName;
    const held = player.held;
    if (this.busy) return `${name} · …`;
    if (held) {
      if (held.game.platform !== this.platform.id) return `${name} · ${held.game.title} doesn’t fit`;
      if (!held.playable) return `${name} · can’t play it, ${unplayableWhy(held)}`;
      if (this.current?.box.game.id === held.game.id) return `${name} · play ${held.game.title}`;
      return `${name} · put ${held.game.title} in`;
    }
    if (this.current) return `${name} · eject ${this.current.box.game.title}`;
    return this.platform.name;
  }

  activate(session: SessionActions): void {
    if (!this.platform || this.busy) return;
    const held = session.held;
    if (held) return this.insert(session, held);
    if (this.current) return this.eject(session);
    if (this.onSelect) this.onSelect(this.platform.id);
    else session.react(this.platform.name);
  }

  // --- MediaDeck ------------------------------------------------------------------------------

  /** Takes the box in hand's media, puts it in (ejecting what was in) and plays it on the TV once it is. */
  insert(session: SessionActions, box: GameBox): void {
    const platform = this.platform;
    if (!platform) return;
    if (this.busy) {
      session.refuse(`Just a moment: the ${platform.shortName} is still taking its game.`);
      return;
    }
    if (box.game.platform !== platform.id) {
      session.refuse(`${box.game.title} is a ${shortNameOf(box)} game: it doesn’t fit the ${platform.shortName}.`);
      return;
    }
    if (!box.playable) {
      session.refuse(`${box.game.title} is ${unplayableWhy(box)}: no ${mediaWord(box)} to put in.`);
      return;
    }
    // Already in: just play it (the box in hand may be a new one of the same copy, its shelf rebuilt).
    if (this.current?.box.game.id === box.game.id) {
      this.current.box = box;
      box.setMediaOut(true);
      session.putBack();
      this.play(session, box);
      return;
    }
    // Its cartridge is still on its way home from an eject: it turns back, a new one does not appear.
    const homing = this.leaving.findIndex((l) => l.box.game.id === box.game.id);
    if (homing >= 0) {
      const [back] = this.leaving.splice(homing, 1);
      back!.media.removeFromParent();
      back!.media.dispose();
    }
    const slot = this.slot;
    if (!slot || !this.screen) {
      session.putBack();
      if (this.screen) void session.playOn(this.screen, box);
      return;
    }
    if (this.current) this.startEject(this.current, false);

    const media = box.takeMedia(); // posed where it is in the hand, before the box goes back
    session.putBack();
    box.setMediaOut(true);
    slot.parent.attach(media);
    media.traverse((obj) => (obj.layers.mask = this.layers.mask));
    const poses = seatPoses(slot, mediaOf(box.game));
    const loaded: Loaded = { box, media, poses, slot, moving: null, seated: false };
    loaded.moving = new Timeline(
      insertSteps(media, slot, poses, (step) => playPlasticClick(step !== 'door', step === 'in' ? 0.09 : 0.05)),
      () => {
        loaded.moving = null;
        loaded.seated = true;
        this.seatedAt = performance.now();
        if (this.current === loaded) this.play(session, box);
      },
    );
    this.current = loaded;
  }

  update(dt: number): void {
    if (this.current?.moving) this.current.moving.tick(dt);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const out = this.leaving[i]!;
      if (out.moving?.tick(dt)) continue;
      this.leaving.splice(i, 1);
    }
  }

  /** Zone unload: nothing half in or half out stays behind. */
  dispose(): void {
    this.clearMedia();
  }

  // --- Moves ----------------------------------------------------------------------------------

  private play(session: SessionActions, box: GameBox): void {
    if (this.screen) void session.playOn(this.screen, box);
  }

  private eject(session: SessionActions): void {
    const current = this.current;
    if (!current) return;
    if (this.screen && nowPlaying.gameId === current.box.game.id && this.screen.state !== 'off') session.stopScreen(this.screen);
    this.startEject(current, true);
    session.react(`${current.box.game.title} is back in its box.`);
  }

  /** Out of the slot and back to its box on the shelf (up out of view when the box is gone). */
  private startEject(loaded: Loaded, clicked: boolean): void {
    if (this.current === loaded) this.current = null;
    loaded.moving?.finish(); // a cartridge still going in is in first
    const { media, slot, poses, box } = loaded;
    const home = (): THREE.Vector3 => {
      const target = box.isDisposed ? media.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0)) : box.getWorldPosition(new THREE.Vector3());
      return slot.parent.worldToLocal(target);
    };
    loaded.moving = new Timeline(
      ejectSteps(
        media,
        slot,
        poses,
        home,
        (step) => (clicked || step === 'out' ? playPlasticClick(step === 'door', 0.05) : undefined),
        () => this.current !== null,
      ),
      () => {
        media.removeFromParent();
        media.dispose();
        if (this.current?.box.game.id !== box.game.id) box.setMediaOut(false);
        loaded.moving = null;
      },
    );
    this.leaving.push(loaded);
  }

  /** Every cartridge in or moving is dropped at once, its box given it back (another platform, or the zone unloads). */
  private clearMedia(): void {
    // What plays from the cartridge in it stops with it.
    if (this.current && this.screen && this.screen.state !== 'off' && nowPlaying.gameId === this.current.box.game.id) this.screen.stop();
    for (const loaded of [this.current, ...this.leaving]) {
      if (!loaded) continue;
      loaded.media.removeFromParent();
      loaded.media.dispose();
      loaded.box.setMediaOut(false);
    }
    this.current = null;
    this.leaving.length = 0;
    if (this.slot?.door) this.slot.door.pivot.rotation.x = 0;
  }
}

function shortNameOf(box: GameBox): string {
  return getPlatform(box.game.platform).shortName;
}

function mediaWord(box: GameBox): string {
  return box.game.platform === 'ps1' ? 'disc' : 'cartridge';
}
