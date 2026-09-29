import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ActivityAware } from '../zone/lifecycle';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { METAL } from '../materials/palette';
import { part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import { ShutDoor, type ShutDoorOptions } from '../props/ShutDoor';
import { DoorSwing, doorway } from './doorSwing';
import type { ZoneId } from '../zoneIds';

export interface TravelDoorOptions extends ShutDoorOptions {
  /** Caption under the crosshair, e.g. "Front Street · go out". */
  label: string;
  /**
   * A shop's door (the arcade's, a shop's, the market's) rather than a flat's: a push bar across the leaf, a kick
   * plate, the bell on its spring over the frame. Give it the size of the matching door on the street.
   */
  shopfront?: boolean;
  /** Asked on hover and click: a reason the door will not open yet (the flat's keys are still in the bowl), or null to go. */
  guard?: () => { label: string; hint: string } | null;
  /** The door let the player through (the destinations are being offered): the hallway waits for them to come home. */
  onGo?: (session: SessionActions) => void;
  /** The zone it leads straight to (the street); without it the door offers every destination (the travel menu). */
  to?: ZoneId;
}

/**
 * A door that leads somewhere the player cannot walk to: the exit of the arcade, the market or a
 * shop. Clicking it asks the Session to take the player to `to` (the street), or to offer the
 * destinations when it has none (`SessionActions.travel`), and the player is teleported behind a
 * fade (`Travel`: its latch, a shop's bell, the door shut on the other side). With `to`, the leaf
 * swings ajar onto a dark gap as the curtain falls, the shop's bell bobbing on its spring, and
 * comes back shut behind the player (`DoorSwing`). Looks like a `ShutDoor`, a shop's with its push
 * bar, kick plate and bell (`shopfront`); its handle or push bar glints on hover (`HoverGlint`).
 */
export class TravelDoor extends ShutDoor implements Interactable, Updatable, ActivityAware {
  readonly hitboxes: THREE.Object3D[];
  private readonly caption: string;
  private readonly guard?: TravelDoorOptions['guard'];
  private readonly onGo?: TravelDoorOptions['onGo'];
  private readonly to?: ZoneId;
  private readonly swing: DoorSwing;
  private readonly glint: HoverGlint;
  private bell: THREE.Object3D | null = null;

  constructor(options: TravelDoorOptions) {
    super(options);
    this.name = 'TravelDoor';
    this.caption = options.label;
    this.guard = options.guard;
    this.onGo = options.onGo;
    this.to = options.to;
    const width = options.width ?? 0.83;
    const height = options.height ?? 2.04;
    const hitbox = invisibleHitbox(width + 0.14, height + 0.07, 0.1, { y: (height + 0.07) / 2, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    if (options.shopfront) this.addShopfront(width, height);
    // The dark of the way through, behind the leaf: seen only while it stands ajar.
    const gap = doorway(width, height);
    this.add(gap);
    this.swing = new DoorSwing(this.leaf, gap);
    this.glint = HoverGlint.fittings(this.leafFace);
  }

  /** A shop door's fittings: the push bar, the kick plate, the bell on its curled spring over the frame. */
  private addShopfront(width: number, height: number): void {
    const steel = METAL.satinSteel();
    const brass = METAL.brass();
    const fittings: THREE.Object3D[] = [];
    // On the leaf (x from the door's middle, as `leafFace` is laid out): they swing with it.
    const bar = cylinderMesh(0.016, width - 0.3, steel, { y: 1.05, z: 0.07 }, { segments: 10 });
    bar.rotation.z = Math.PI / 2;
    this.leafFace.add(bar);
    fittings.push(bar);
    for (const x of [-(width - 0.4) / 2, (width - 0.4) / 2]) fittings.push(part(this.leafFace, 0.03, 0.03, 0.05, steel, { x, y: 1.05, z: 0.045 }));
    fittings.push(part(this.leafFace, width - 0.04, 0.22, 0.004, steel, { y: 0.12, z: 0.019 }));
    // The bell, hung from a bracket over the hinge side of the frame, knocked by the leaf's top as it opens.
    const x = -width / 2 + 0.18;
    fittings.push(part(this, 0.012, 0.012, 0.12, brass, { x, y: height + 0.02, z: 0.08 }));
    const bell = new THREE.Group();
    bell.position.set(x, height + 0.02, 0.13);
    const cup = cylinderMesh(0.012, 0.05, brass, { y: -0.05 }, { radiusBottom: 0.032, segments: 14 });
    bell.add(cup);
    this.add(bell);
    this.bell = bell;
    fittings.push(cup);
    // Small fittings on a wall-hung door: no shadow worth their draw calls.
    for (const fitting of fittings) fitting.traverse((obj) => void ((obj as THREE.Mesh).isMesh && (obj.castShadow = false)));
  }

  update(dt: number): void {
    this.swing.update(dt);
    if (this.bell) this.bell.rotation.x = this.swing.bellSwing;
  }

  /** Left behind (the zone goes dormant) or found again: the leaf is shut. */
  setZoneActive(): void {
    this.swing.shut();
    if (this.bell) this.bell.rotation.x = 0;
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return this.guard?.()?.label ?? this.caption;
  }

  activate(session: SessionActions): void {
    const blocked = this.guard?.();
    if (blocked) {
      session.refuse(blocked.hint);
      return;
    }
    this.onGo?.(session);
    // Straight through: the leaf opens under the curtain. The menu (no `to`) waits for a pick, the door with it.
    if (this.to) this.swing.open();
    session.travel(this.to);
  }
}
