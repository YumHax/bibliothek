import * as THREE from 'three';
import type { Platform, PlatformId } from '@/catalog/types';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, disposeTree } from './Prop';
import { buildConsole } from './consoleStyles';

export type PlatformSelectHandler = (platformId: PlatformId) => void;

/**
 * One console slot on the TV stand. The slot exists from the start with a fixed hitbox (the
 * Interactor snapshots hitboxes when it registers), and `setPlatform()` fills or empties it:
 * an empty slot drops off every raycast layer so it neither shows a label nor swallows clicks.
 */
export class Console extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];

  private platform: Platform | null = null;
  private visual: THREE.Group | null = null;
  private hoverMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly hitbox: THREE.Mesh;

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

  setPlatform(platform: Platform | null): void {
    if (platform?.id === this.platform?.id) return;
    if (this.visual) {
      this.remove(this.visual);
      disposeTree(this.visual);
      this.visual = null;
      this.hoverMaterials = [];
    }
    this.platform = platform;
    if (!platform) {
      this.hitbox.layers.disableAll();
      return;
    }
    const built = buildConsole(platform);
    this.visual = built.group;
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

  label(): string | null {
    return this.platform?.name ?? null;
  }

  activate(session: SessionActions): void {
    if (!this.platform) return;
    if (this.onSelect) this.onSelect(this.platform.id);
    else session.hint(this.platform.name);
  }
}
