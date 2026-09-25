import * as THREE from 'three';
import type { Collisions } from '@/core/Collider';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { setOutdoorsMuffle } from '@/audio/audioContext';
import type { Furniture } from '../Furniture';
import type { Zone } from '../zone/Zone';
import type { ActivityAware } from '../zone/lifecycle';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { SAS, TWINS, type TwinId } from './airlockPlan';
import { airlockLink, type AirlockLink } from './AirlockLink';
import { SasDoor } from './SasDoor';
import { SasShell } from './SasShell';
import { bake, sasFinish } from './sasFinish';

export interface AirlockOptions {
  twin: TwinId;
  /** The zone's colliders, for the doors' leaves. */
  collisions: Collisions;
  /** The camera: whether the player stands inside, how far they walked off. */
  viewer: THREE.Object3D;
  /** The pair it belongs to (default: the page's, `airlockLink`). */
  link?: AirlockLink;
}

/** The live door swings shut on its own once the player is further than this from the sas (m), for this long (s). */
const AWAY = 3;
const CLOSE_AFTER = 4;
/** How far inside the walls the player must stand to cross (m). */
const INSIDE_MARGIN = 0.12;

/** The captions, by twin: the live door, the far door, the door release. */
const LABELS: Record<TwinId, { live: [open: string, shut: string]; far: string; button: string }> = {
  hall: { live: ['Click to close the glass door', 'Click to open the glass door'], far: 'Click to go out onto Front Street', button: 'Door release · click to go out' },
  street: { live: ['Click to close the door', 'Click to open the door (home is five floors up)'], far: 'Click to go in (home is five floors up)', button: 'Door release' },
};

/**
 * One twin of the building's sas (see `airlockPlan.ts`): its room (`SasShell`), its two doors
 * (`SasDoor`), the door release by the street door, and the rules. The live door opens and shuts
 * onto its zone like any door, and swings shut once the player has walked off. The far door (and,
 * in the hall, the door release) crosses to the twin (`AirlockLink.cross`) when the player stands
 * inside; in the street's twin the release just opens the street door. The street's twin also
 * muffles the street's sounds round the player inside, less as the street door opens.
 * Place it with `placeAirlock`: the parts are furniture of their own, at the same spot.
 */
export class Airlock extends Prop implements Updatable, ActivityAware {
  readonly contactShadow = false;
  readonly twin: TwinId;
  /** Whether its zone is out of doors: its street sounds are the ones to muffle. */
  readonly outdoors: boolean;
  readonly shell = new SasShell();
  readonly outer: SasDoor;
  readonly inner: SasDoor;
  readonly button: DoorRelease;
  private readonly link: AirlockLink;
  private readonly viewer: THREE.Object3D;
  private readonly interior: THREE.Box3;
  private readonly eye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private awayFor = 0;

  constructor(options: AirlockOptions) {
    super();
    this.name = `Airlock:${options.twin}`;
    this.twin = options.twin;
    this.outdoors = TWINS[options.twin].zone === 'street';
    this.link = options.link ?? airlockLink;
    this.viewer = options.viewer;
    const { width, depth, height, wall, partition } = SAS;
    this.interior = new THREE.Box3(
      new THREE.Vector3(-width / 2 + INSIDE_MARGIN, 0, -(depth - partition) + INSIDE_MARGIN),
      new THREE.Vector3(width / 2 - INSIDE_MARGIN, height, -wall - INSIDE_MARGIN),
    );
    const labels = LABELS[options.twin];
    const liveIs = TWINS[options.twin].live;
    const door = (kind: 'street' | 'inner'): SasDoor => {
      const live = (kind === 'inner') === (liveIs === 'inner');
      return new SasDoor({
        kind,
        collisions: options.collisions,
        label: () => (this.link.isCrossing ? null : live ? labels.live[this.liveDoor.isOpen ? 0 : 1] : labels.far),
        activate: (session) => (live ? this.toggleLive() : this.go(session)),
      });
    };
    this.outer = door('street');
    this.inner = door('inner');
    this.button = new DoorRelease(
      () => (this.link.isCrossing ? null : labels.button),
      (session) => (liveIs === 'outer' ? this.liveDoor.open() : this.go(session)),
    );
    this.link.register(this);
  }

  /** Everything to place with it, at the same spot. */
  get parts(): Furniture[] {
    return [this.shell, this.outer, this.inner, this.button];
  }

  private get liveDoor(): SasDoor {
    return TWINS[this.twin].live === 'inner' ? this.inner : this.outer;
  }

  get liveIsShut(): boolean {
    return this.liveDoor.isShut;
  }

  closeLive(): void {
    this.liveDoor.close();
  }

  openLive(): void {
    this.liveDoor.open();
  }

  /** Both doors shut at once (the twin made ready, out of sight). */
  snapShut(): void {
    this.outer.snapShut();
    this.inner.snapShut();
  }

  /** Whether the player's eye is inside the sas (not in a doorway). */
  holdsViewer(): boolean {
    this.viewer.getWorldPosition(this.eye);
    return this.interior.containsPoint(this.worldToLocal(this.eye));
  }

  /** The way the sas faces in the world (radians about +y). */
  worldYaw(): number {
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(this.matrixWorld);
    return Math.atan2(forward.x, forward.z);
  }

  update(dt: number): void {
    const inside = this.holdsViewer();
    if (this.outdoors) setOutdoorsMuffle(inside ? 1 - 0.85 * this.outer.openness : 0);
    if (!this.liveDoor.isOpen || this.link.isCrossing) {
      this.awayFor = 0;
      return;
    }
    const here = this.getWorldPosition(this.here);
    this.viewer.getWorldPosition(this.eye);
    const far = Math.hypot(this.eye.x - here.x, this.eye.z - here.z) > AWAY || Math.abs(this.eye.y - here.y) > 2.6;
    this.awayFor = far ? this.awayFor + dt : 0;
    if (this.awayFor > CLOSE_AFTER) this.liveDoor.close();
  }

  setZoneActive(active: boolean): void {
    if (!active && this.outdoors) setOutdoorsMuffle(0, true);
  }

  dispose(): void {
    this.link.unregister(this);
  }

  private toggleLive(): void {
    if (this.liveDoor.isOpen) this.liveDoor.close();
    else this.liveDoor.open();
  }

  /** The far door, or the hall's door release: through to the twin, from inside only. */
  private go(session: SessionActions): void {
    if (this.link.isCrossing) return;
    if (!this.holdsViewer()) {
      session.hint(this.outdoors ? 'Step inside first' : 'Step into the entrance first');
      return;
    }
    session.putBack();
    void this.link.cross(this, session);
  }
}

/** The door release by the street door, on the right wall: a brass plate, PORTE, a glowing button. */
class DoorRelease extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(
    private readonly caption: () => string | null,
    private readonly press: (session: SessionActions) => void,
  ) {
    super();
    this.name = 'DoorRelease';
    const x = SAS.width / 2 - 0.004;
    const { z, y } = SAS.button;
    const plate = new THREE.PlaneGeometry(0.1, 0.15);
    const at = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    plate.applyMatrix4(at);
    bake(plate);
    this.add(new THREE.Mesh(plate, sasFinish().plate));
    const hitbox = invisibleHitbox(0.16, 0.22, 0.08);
    hitbox.position.set(x - 0.03, y, z);
    hitbox.rotation.y = -Math.PI / 2;
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(): void {
    // The button glows already; the caption says what it does.
  }

  label(): string | null {
    return this.caption();
  }

  activate(session: SessionActions): void {
    this.press(session);
  }
}

/** Places a twin of the sas in `zone` at `at` (zone-local: the street door's outer face on the floor), +z out to the street turned by `yaw`. */
export function placeAirlock(zone: Zone, at: THREE.Vector3, yaw: number, options: AirlockOptions): Airlock {
  const airlock = new Airlock(options);
  for (const part of airlock.parts) zone.place(part, at.clone(), yaw);
  zone.place(airlock, at.clone(), yaw);
  return airlock;
}

/** The sas's box in its zone (zone-local, the walls and the street door's reveal included): where rain and snow must not fall. */
export function sasBounds(at: THREE.Vector3, yaw: number): THREE.Box3 {
  const { width, depth, height } = SAS;
  const box = new THREE.Box3(new THREE.Vector3(-width / 2 - 0.1, 0, -depth - 0.1), new THREE.Vector3(width / 2 + 0.1, height + 0.2, 0.01));
  return box.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(at));
}
