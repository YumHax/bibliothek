import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { METAL } from '../materials/palette';
import { snowPaint } from './snowCover';
import { part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import { DoorSwing } from '../travel/doorSwing';
import { SHOP_LOOKS } from '../city/shopLooks';
import type { Furniture } from '../Furniture';
import type { ActivityAware } from '../zone/lifecycle';
import type { ZoneId } from '../zoneIds';
import { SHOP_ZONE_OF, type ShopKind } from './streetPlan';

export interface StreetDoorOptions {
  width: number;
  height: number;
  /** The zone it leads to (a `travel` zone of `WORLD_PLAN`). */
  to: ZoneId;
  label: string;
  /** Asked on hover and click: why the door will not open right now (the shop is shut), or null to go. */
  guard?: () => { label: string; hint: string } | null;
}

/**
 * The painted shop door's size on the facade (`facadePainter`: 1.2 x 2.7 from 5 cm up, its glass 1 m wide from 0.15 to
 * 2.55 m), which the leaf is built over; the stiles and rails round that glass, and how far the leaf stands out of
 * the wall (behind the stone surround's 8 cm, in front of the shop interior's glass at 1.5 cm).
 */
const LEAF = { width: 1.2, bottom: 0.05, top: 2.7, stile: 0.1, bottomRail: 0.1, topRail: 0.15, z0: 0.022, depth: 0.035 };
const HANDLE_Y = 1.05;
/** How far out of the wall the fittings may reach: short of a shut shop's roller shutter (`relief/Shutters`, at 9 cm). */
const FITTINGS_REACH = 0.085;

/**
 * A shop's door on a facade that leads somewhere (the arcade, the retro games shop and the flea market behind it, the
 * walk-in shops): a real leaf over the painted door, its frame in the shop's joinery colour (`SHOP_LOOKS`) round the
 * glass the facade's interior mapping shows the shop through (`relief/ShopInteriors`), a push bar and a pull handle
 * that glint on hover. A click asks the Session to travel straight there (`SessionActions.travel(to)`), no menu, the
 * leaf swinging ajar as the curtain falls (`travel/doorSwing`), unless its `guard` says it is shut (RETRO GAMES
 * keeps shop hours; the arcade never closes). Wall-hung: origin on the pavement at the middle of the door, +z facing
 * the street. Never collides (the building line does).
 */
export class StreetDoor extends THREE.Group implements Furniture, Interactable, Updatable, ActivityAware {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly swing: DoorSwing;
  private readonly glint: HoverGlint;

  constructor(private readonly options: StreetDoorOptions) {
    super();
    this.name = `StreetDoor:${options.to}`;
    // The hitbox covers the leaf as well as the plan's door size, so the leaf's top is clickable too.
    const hitWidth = Math.max(options.width, LEAF.width);
    const hitHeight = Math.max(options.height, LEAF.top);
    const hitbox = invisibleHitbox(hitWidth, hitHeight, 0.2, { y: hitHeight / 2, z: 0.05 });
    this.hitboxes = [hitbox];
    this.add(hitbox);

    // The leaf, hinged on its left edge (as seen from the street): stiles and rails round the glass, the bar, the handle.
    const leaf = new THREE.Group();
    leaf.position.set(-LEAF.width / 2, 0, LEAF.z0);
    this.add(leaf);
    const face = new THREE.Group();
    face.position.x = LEAF.width / 2;
    leaf.add(face);
    const frame = snowPaint(joineryOf(options.to), 0.5);
    const { width, bottom, top, stile, bottomRail, topRail, depth } = LEAF;
    const height = top - bottom;
    const z = depth / 2;
    part(face, stile, height, depth, frame, { x: -width / 2 + stile / 2, y: bottom + height / 2, z });
    part(face, stile, height, depth, frame, { x: width / 2 - stile / 2, y: bottom + height / 2, z });
    part(face, width - 2 * stile, bottomRail, depth, frame, { y: bottom + bottomRail / 2, z });
    part(face, width - 2 * stile, topRail, depth, frame, { y: top - topRail / 2, z });
    const steel = METAL.satinSteel();
    // The fittings stay behind a shut shop's roller shutter: its curtain hangs `FITTINGS_REACH` out of the wall
    // (`relief/Shutters`), the leaf's face is at `z0 + depth`; bar and handle stand off it no further than that.
    const reach = FITTINGS_REACH - LEAF.z0 - depth;
    const bar = cylinderMesh(0.012, width - 2 * stile - 0.1, steel, { y: HANDLE_Y, z: depth + reach - 0.012 }, { segments: 10 });
    bar.rotation.z = Math.PI / 2;
    face.add(bar);
    const brackets = [-1, 1].map((side) => part(face, 0.03, 0.03, reach - 0.012, steel, { x: side * (width / 2 - stile - 0.04), y: HANDLE_Y, z: depth + (reach - 0.012) / 2 }));
    const handle = part(face, 0.022, 0.32, 0.018, steel, { x: width / 2 - stile / 2, y: HANDLE_Y + 0.1, z: depth + reach - 0.009 });
    face.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
    this.swing = new DoorSwing(leaf);
    this.glint = HoverGlint.of(bar, handle, ...brackets);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.swing.update(dt);
  }

  /** The street left behind or come back to: the leaf is shut. */
  setZoneActive(): void {
    this.swing.shut();
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return this.options.guard?.()?.label ?? this.options.label;
  }

  activate(session: SessionActions): void {
    const blocked = this.options.guard?.();
    if (blocked) {
      session.refuse(blocked.hint);
      return;
    }
    this.swing.open();
    session.travel(this.options.to);
  }
}

/** The shop behind a door, by the zone it leads to: its joinery colour, a shade darker as the painted door has it. */
function joineryOf(to: ZoneId): number {
  const kind: ShopKind | undefined = to === 'arcade' ? 'arcade' : to === 'market' ? 'retro' : (Object.keys(SHOP_ZONE_OF) as ShopKind[]).find((k) => SHOP_ZONE_OF[k] === to);
  const look = kind && kind !== 'shut' ? SHOP_LOOKS[kind] : null;
  return new THREE.Color(look?.front ?? '#3a3634').multiplyScalar(0.7).getHex();
}
