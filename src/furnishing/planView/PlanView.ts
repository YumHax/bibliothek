import './PlanView.css';
import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import type { Zone } from '@/world/zone/Zone';
import { inFlat } from '@/world/worldPlan';
import type { ZoneId } from '@/world/zoneIds';
import { localBounds } from '../fit';
import { ridersOf, type Piece } from '../Furnishings';
import type { FurnitureCarrier, Moved } from '../FurnitureCarrier';
import { BoxOutline } from '../preview/BoxOutline';
import { whyBlocked as why } from '../blockerText';

/** The camera hangs this far under the ceiling (m), looking straight down. */
const UNDER_CEILING = 0.05;
/** How far the mouse's aim reaches from the camera (m): the whole room below. */
const REACH = 30;
/** The widest the view opens (degrees, vertical) to take in a big room. */
const MAX_FOV = 110;
/** A little room round the room's walls in the frame. */
const MARGIN = 1.06;
/** A mesh hanging within this of the ceiling (its bottom above ceiling minus this, m) is hidden while planning: a pendant lamp, a hung plant, a curtain rod. */
const HUNG_BAND = 0.9;
/** The piece under the cursor is looked for this often (s). */
const HOVER_EVERY = 0.06;
const HOVER_COLOR = 0xfff2d0;

/** The player as the planning view parks and frees it (`FirstPersonController` fits). */
interface PlanPlayer {
  readonly isLocked: boolean;
  readonly isSeated: boolean;
  sit(eyePosition: THREE.Vector3, yaw: number, instant?: boolean): void;
  stand(instant?: boolean): void;
  getLook(): { yaw: number; pitch: number };
  /** The mouse look (the pointer-lock controls): off while planning, the mouse moves the cursor instead. */
  readonly controls: { enabled: boolean };
}

/** What the planning view uses of the carrier. */
type PlanCarrier = Pick<FurnitureCarrier, 'piece' | 'fits' | 'blocker' | 'aiming' | 'snapping' | 'setAim' | 'aimed' | 'take' | 'turn' | 'setDown' | 'cancel' | 'store' | 'lastMove'>;

interface PlanViewDeps {
  camera: THREE.PerspectiveCamera;
  /** The WebGL canvas: the cursor's frame. */
  canvas: HTMLCanvasElement;
  /** Where the strip and the cursor go (the app container). */
  container: HTMLElement;
  /** Where the hover outline is drawn (the scene). */
  scene: THREE.Object3D;
  player: PlanPlayer;
  carrier: PlanCarrier;
  /** The zone the player is in (`ZoneManager.current`). */
  zone: () => Zone;
  /** The crosshair's picking, turned off while planning. */
  interactor?: { enabled: boolean };
  /** Why the planning view cannot open now (a box in hand, a panel, photo mode, travelling, asleep…), or null. */
  blocked?: () => string | null;
  /** A refusal said (a piece that may not go there, the view not opening). */
  say?: (text: string) => void;
  /** A piece was set down (the undo keeps it). */
  moved?: (moved: Moved) => void;
}

/**
 * PLANNING VIEW (docs/furnishing.md): the room seen from just under its ceiling, straight down, and a cursor the
 * mouse moves over it (the pointer stays locked, so leaving is never the pause menu). A click takes the piece under
 * the cursor and a click sets it down; the carrier does the rest as it does on foot (the grid, the footprint, what
 * is in the way), aimed by the cursor (`FurnitureCarrier.setAim`). Only floor pieces are taken from above: a picture
 * or a hanging plant is moved from the room. Pendant lamps and whatever hangs near the ceiling are hidden meanwhile.
 * The player stays where they stood (parked like in an armchair) and the camera goes back there on leaving.
 */
export class PlanView implements Updatable {
  private open_ = false;
  private readonly hud: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly cursor: HTMLDivElement;
  private readonly cursorAt = new THREE.Vector2();
  private readonly ndc = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedQuaternion = new THREE.Quaternion();
  private savedFov = 70;
  private lookWas = true;
  private readonly pinned = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 70 };
  private hidden: THREE.Object3D[] = [];
  private hovered: Piece | null = null;
  private hoverClock = 0;
  private readonly outlineRoot = new THREE.Group();
  private readonly outline = new BoxOutline(HOVER_COLOR, { opacity: 0.8 });
  private movedListener: ((moved: Moved) => void) | null = null;
  /** The strip's keys, named when it opens (after the player's bindings and the keyboard's layout). */
  private readonly keys: HTMLElement;

  constructor(private readonly deps: PlanViewDeps) {
    this.hud = document.createElement('div');
    this.hud.className = 'plan-view-hud';
    this.hud.hidden = true;
    this.keys = document.createElement('span');
    this.hud.append(this.keys);
    this.status = document.createElement('span');
    this.status.className = 'plan-view-status';
    this.hud.append(this.status);
    this.cursor = document.createElement('div');
    this.cursor.className = 'plan-view-cursor';
    this.cursor.hidden = true;
    deps.container.append(this.hud, this.cursor);

    this.outlineRoot.name = 'PlanViewHover';
    this.outlineRoot.matrixAutoUpdate = false;
    this.outlineRoot.add(this.outline.object);
    deps.scene.add(this.outlineRoot);

    // The mouse is the view's while it is open: nothing else hears its buttons (the Session's click, the box's turn).
    const swallow = (e: MouseEvent): void => {
      if (!this.open_) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    window.addEventListener('mousedown', (e) => {
      if (!this.open_) return;
      swallow(e);
      if (e.button === 0) this.primary();
      else if (e.button === 2) this.secondary();
    }, true);
    for (const type of ['mouseup', 'click', 'dblclick', 'contextmenu'] as const) window.addEventListener(type, swallow, true);
    document.addEventListener('mousemove', (e) => {
      if (!this.open_) return;
      const rect = deps.canvas.getBoundingClientRect();
      this.cursorAt.x = THREE.MathUtils.clamp(this.cursorAt.x + e.movementX, 0, rect.width);
      this.cursorAt.y = THREE.MathUtils.clamp(this.cursorAt.y + e.movementY, 0, rect.height);
      this.placeCursor();
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  open(): void {
    if (this.open_) return;
    const { camera, player, carrier, interactor } = this.deps;
    if (!player.isLocked) return;
    const reason = this.deps.blocked?.() ?? (player.isSeated ? 'Stand up first' : carrier.piece ? 'Set it down first' : null);
    if (reason) return this.deps.say?.(reason);
    const zone = this.deps.zone();
    if (!inFlat(zone.id as ZoneId) || zone.id === 'stairwell') return this.deps.say?.('Only at home');
    this.open_ = true;
    this.savedPosition.copy(camera.position);
    this.savedQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;
    // Parked like in an armchair: the walk stops where the player stands (the camera comes back there).
    player.sit(camera.position.clone(), player.getLook().yaw, true);
    this.lookWas = player.controls.enabled;
    player.controls.enabled = false;
    if (interactor) interactor.enabled = false;
    this.frame(zone);
    this.hideHung(zone);
    // The player's feet stay where they stood: nothing is set down there.
    carrier.setAim({ ray: () => this.aimRay(), reach: REACH, feet: () => this.savedPosition });
    const k = actionKeyLabel;
    this.keys.innerHTML = `<strong>Planning</strong> · click a piece to take it · click to set down · wheel or ${k('turnPiece')} / ${k('turnPieceBack')} turns · ${k('gridSnap')} grid · ${k('storePiece')} puts away · right-click or ${k('putBackPiece')} puts back · ${k('planView')} leaves`;
    const rect = this.deps.canvas.getBoundingClientRect();
    this.cursorAt.set(rect.width / 2, rect.height / 2);
    this.placeCursor();
    document.body.classList.add('plan-view');
    this.hud.hidden = false;
    this.cursor.hidden = false;
    this.refresh();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    const { camera, player, carrier, interactor } = this.deps;
    if (carrier.piece) carrier.cancel();
    carrier.setAim(null);
    this.setHovered(null);
    for (const object of this.hidden) object.visible = true;
    this.hidden = [];
    camera.position.copy(this.savedPosition);
    camera.quaternion.copy(this.savedQuaternion);
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    if (player.isSeated) player.stand(true);
    player.controls.enabled = this.lookWas;
    if (interactor) interactor.enabled = true;
    document.body.classList.remove('plan-view');
    this.hud.hidden = true;
    this.cursor.hidden = true;
  }

  /** `listener` hears of each piece set down from above (the Session's undo remembers it). */
  onMoved(listener: (moved: Moved) => void): void {
    this.movedListener = listener;
  }

  /** A key press: the plan key opens and closes it; while open every key is the view's. */
  onKey(code: string): boolean {
    if (!this.open_) {
      if (!isAction(code, 'planView')) return false;
      this.open();
      return true;
    }
    const { carrier } = this.deps;
    if (isAction(code, 'planView')) this.close();
    else if (isAction(code, 'turnPiece')) carrier.turn(1);
    else if (isAction(code, 'turnPieceBack')) carrier.turn(-1);
    else if (isAction(code, 'gridSnap')) carrier.snapping = !carrier.snapping;
    else if (isAction(code, 'storePiece') && carrier.piece && !carrier.store()) this.deps.say?.('That one cannot be put away.');
    else if (isAction(code, 'setDown')) this.primary();
    else if (isAction(code, 'putBackPiece') || code === 'Escape') {
      if (carrier.piece) carrier.cancel();
      else this.close();
    }
    this.refresh();
    return true;
  }

  update(dt: number): void {
    if (!this.open_) return;
    const { player, camera } = this.deps;
    // Out of the room (Esc, a panel), or stood up by something else: leave, the camera back in place.
    if (!player.isLocked || !player.isSeated) {
      this.close();
      return;
    }
    // Held where it looks down from, whatever else moved it.
    camera.position.copy(this.pinned.position);
    camera.quaternion.copy(this.pinned.quaternion);
    if (camera.fov !== this.pinned.fov) {
      camera.fov = this.pinned.fov;
      camera.updateProjectionMatrix();
    }
    this.hoverClock -= dt;
    if (this.hoverClock <= 0) {
      this.hoverClock = HOVER_EVERY;
      this.setHovered(this.deps.carrier.piece ? null : this.pick());
    }
    this.refresh();
  }

  /** A click: sets the carried piece down, or takes the one under the cursor. */
  private primary(): void {
    const { carrier } = this.deps;
    if (carrier.piece) {
      if (carrier.setDown()) {
        if (carrier.lastMove) {
          this.deps.moved?.(carrier.lastMove);
          this.movedListener?.(carrier.lastMove);
        }
      } else this.deps.say?.(carrier.aiming ? `No room there: ${why(carrier.blocker)}.` : 'Aim at the floor.');
      this.refresh();
      return;
    }
    const piece = this.hovered ?? this.pick();
    if (!piece) return;
    this.setHovered(null);
    carrier.take(piece);
    this.refresh();
  }

  /**
   * The floor piece of this room under the cursor (pictures and hung plants are moved from the room; the ray over a
   * wall's top must not reach the next room's pieces, nor the hung plants hidden meanwhile).
   */
  private pick(): Piece | null {
    const zone = this.deps.zone();
    return this.deps.carrier.aimed((piece) => piece.surface === 'floor' && piece.zone === zone) as Piece | null;
  }

  /** A right-click: the carried piece back where it was. */
  private secondary(): void {
    if (this.deps.carrier.piece) this.deps.carrier.cancel();
    this.refresh();
  }

  /** The camera just under the ceiling over the room's middle, straight down, the back wall at the top, opened to take the room in. */
  private frame(zone: Zone): void {
    const { camera } = this.deps;
    const { width, depth, height } = zone.spec.extent;
    zone.group.updateMatrixWorld();
    const eye = new THREE.Vector3(0, height - UNDER_CEILING, 0).applyMatrix4(zone.group.matrixWorld);
    const drop = height - UNDER_CEILING;
    const half = Math.max(depth / 2, width / 2 / Math.max(camera.aspect, 0.1)) * MARGIN;
    const fov = Math.min(MAX_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(half / drop)));
    const yaw = zone.spec.rotationY ?? 0;
    this.pinned.position.copy(eye);
    this.pinned.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ'));
    this.pinned.fov = fov;
    camera.position.copy(eye);
    camera.quaternion.copy(this.pinned.quaternion);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  /** What hangs near the ceiling (a pendant's shade, a hung plant) would fill the view from up there: hidden till the view closes. */
  private hideHung(zone: Zone): void {
    const ceiling = new THREE.Vector3(0, zone.spec.extent.height, 0).applyMatrix4(zone.group.matrixWorld).y;
    const box = new THREE.Box3();
    zone.group.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      box.setFromObject(mesh);
      if (box.isEmpty() || box.min.y < ceiling - HUNG_BAND) return;
      mesh.visible = false;
      this.hidden.push(mesh);
    });
  }

  /** The ray from the camera through the cursor (world). */
  private aimRay(): THREE.Ray {
    const rect = this.deps.canvas.getBoundingClientRect();
    this.ndc.set((this.cursorAt.x / Math.max(rect.width, 1)) * 2 - 1, -(this.cursorAt.y / Math.max(rect.height, 1)) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    return this.raycaster.ray;
  }

  private placeCursor(): void {
    const rect = this.deps.canvas.getBoundingClientRect();
    const host = this.deps.container.getBoundingClientRect();
    this.cursor.style.transform = `translate(${rect.left - host.left + this.cursorAt.x}px, ${rect.top - host.top + this.cursorAt.y}px)`;
  }

  /** The piece under the cursor, outlined. */
  private setHovered(piece: Piece | null): void {
    this.hovered = piece;
    this.cursor.dataset.over = String(piece !== null);
    if (!piece) {
      this.outline.object.visible = false;
      return;
    }
    const { zone, item } = piece;
    this.outlineRoot.matrix.copy(zone.group.matrixWorld);
    this.outlineRoot.matrixWorldNeedsUpdate = true;
    this.outline.set(localBounds(item, ridersOf(zone, item)), { position: item.position, yaw: item.rotation.y });
    this.outline.object.visible = true;
  }

  /** The strip's second line: what is carried and whether it fits, or what is under the cursor. */
  private refresh(): void {
    const { carrier } = this.deps;
    const piece = carrier.piece;
    if (piece) {
      const grid = carrier.snapping ? '' : ' · free';
      this.status.textContent = carrier.fits ? `${piece.name} · click to set down${grid}` : `${piece.name}: ${carrier.aiming ? why(carrier.blocker) : 'aim at the floor'}${grid}`;
      this.status.dataset.fits = String(carrier.fits);
    } else {
      this.status.textContent = this.hovered ? `${this.hovered.name} · click to take it` : '';
      this.status.dataset.fits = 'true';
    }
    this.status.hidden = this.status.textContent === '';
  }
}

