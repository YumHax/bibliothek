import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collisions } from '@/core/Collider';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playWoodKnock } from '@/audio/furnitureSounds';
import { heardAt } from '@/audio/spatial';
import { bindRouxMove, onRouxPhase, rouxPhase, type RouxPhase } from '@/building/rouxMove';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { Prop } from '../props/Prop';
import { invisibleHitbox } from '../meshUtils';
import { cloth, paint, scuffedPaint, timber } from '../materials/palette';
import { INSET } from '../props/joinery';
import { FLOOR } from '../surface/layers';
import { SKIRTING } from '../mouldings';
import { WALL_GAP } from '../worldPlan';
import { ANNEX_DOORWAY } from '../roomPlan';

/** The architrave round the knocked-through opening and the lining through it, as the flat's doors have them (`Door`). */
const ARCHITRAVE = 0.07;
const ARCHITRAVE_DEPTH = 0.022;
const LINING = 0.03;
/** The condemned door's outline under the paint: the old leaf's size, its architrave a few millimetres proud. */
const OLD_DOOR = { width: 0.83, height: 2.04, trim: 0.06, relief: 0.004 };
/** The works' hammering: game hours, the gap between two bursts (s), knocks a burst. */
const WORKS = { from: 8, to: 18, gap: [0.8, 4.5] as [number, number], knocks: [1, 5] as [number, number], every: 0.24 };

const PLASTER = paint(0xf3f0ea, 0.9);
const TRIM = scuffedPaint(0xf6f3ee, 0.7);
const OAK = timber(0x8b6a44, 0.55);
const SHEET = cloth(0xdcd7cc, 1);

/** A box from its size and centre, as geometry to merge. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** One mesh of `geometries` merged, in `material` (the parts disposed). */
function merged(geometries: THREE.BufferGeometry[], material: THREE.Material, castShadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(geometries)!, material);
  for (const g of geometries) g.dispose();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The opening in the collection room's right wall to Mrs Roux's two rooms (`ANNEX_DOORWAY`), from the living room's
 * side. Till the wall comes down it is the old condemned door: the hole the shells cut filled with plaster, the outline
 * of a door under the paint, the skirting run across, and a collider in it (a knock on it sounds hollow). The day of
 * the works a dust sheet hangs over it and the hammering is heard from the far side. Then the archway: an architrave on
 * either face and a lining through the wall's gap, an oak threshold, nothing in the way. Wall-hung: origin on the floor
 * at the opening's middle, +z into the collection room. Both rooms see it (`seenFromNextDoor`).
 */
export class AnnexOpening extends Prop implements Updatable, Interactable {
  readonly contactShadow = false;
  readonly seenFromNextDoor = true;
  readonly hitboxes: THREE.Object3D[];
  private readonly plug = new THREE.Group();
  private readonly sheet = new THREE.Group();
  private readonly archway = new THREE.Group();
  private readonly blocker = new THREE.Box3();
  private blockerLaidOut = false;
  private blocking = false;
  private phase: RouxPhase = 'settled';
  private nextBurst = 2;
  private burstLeft = 0;

  constructor(private readonly options: { collisions: Collisions; hours: () => number }) {
    super();
    this.name = 'AnnexOpening';
    const { width: w, height: h } = ANNEX_DOORWAY;
    this.buildPlug(w, h);
    this.buildSheet(w, h);
    this.buildArchway(w, h);
    this.add(this.plug, this.sheet, this.archway);
    const hitbox = invisibleHitbox(w, h, 0.12, { y: h / 2, z: 0.04 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** The condemned door: plaster in the hole, the old door's outline under the paint, the skirting run across. */
  private buildPlug(w: number, h: number): void {
    // In the hole, from the wall's plane back to the next room's: its faces lie in the two planes, where the shells are cut away.
    this.plug.add(merged([box(w, h, WALL_GAP, 0, h / 2, -WALL_GAP / 2)], PLASTER));
    const { width: dw, height: dh, trim, relief } = OLD_DOOR;
    // The old architrave, painted over with the wall: a ridge a few millimetres proud, buried a millimetre in the plaster.
    const z = (relief - INSET) / 2;
    const d = relief + INSET;
    const ridges = [
      box(trim, dh + trim, d, -dw / 2 - trim / 2, (dh + trim) / 2, z),
      box(trim, dh + trim, d, dw / 2 + trim / 2, (dh + trim) / 2, z),
      box(dw + 2 * INSET, trim, d - 0.0005, 0, dh + trim / 2, z),
    ];
    this.plug.add(merged(ridges, PLASTER, false));
    // The skirting, across where the room's stops at the hole.
    this.plug.add(merged([box(w, SKIRTING.height, SKIRTING.depth, 0, SKIRTING.height / 2, SKIRTING.depth / 2)], TRIM, false));
  }

  /** The works' dust sheet: hung over the opening in loose folds, a second one spread on the parquet in front. */
  private buildSheet(w: number, h: number): void {
    const hung = new THREE.PlaneGeometry(w + 0.16, h + 0.12, 12, 1);
    const pos = hung.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, 0.035 + 0.018 * Math.sin(x * 23) + 0.008 * Math.sin(x * 61));
    }
    hung.computeVertexNormals();
    hung.translate(0, (h + 0.12) / 2, 0);
    const spread = box(w + 0.5, FLOOR.kilim.lift, 0.9, 0, FLOOR.kilim.lift / 2, 0.5);
    this.sheet.add(merged([hung, spread], SHEET, false));
  }

  /** The archway once the wall is down: architraves on both faces, the lining across the gap between the shells, a threshold. */
  private buildArchway(w: number, h: number): void {
    const a = ARCHITRAVE;
    const ad = ARCHITRAVE_DEPTH;
    const trims: THREE.BufferGeometry[] = [];
    for (const z of [ad / 2, -WALL_GAP - ad / 2]) {
      trims.push(box(a, h + a, ad, -w / 2 - a / 2, (h + a) / 2, z));
      trims.push(box(a, h + a, ad, w / 2 + a / 2, (h + a) / 2, z));
      // The head between the uprights, a hair shallower so its face never lies in theirs.
      trims.push(box(w + 2 * INSET, a, ad - 0.001, 0, h + a / 2, z));
    }
    const depth = WALL_GAP + ad;
    const zl = (ad - WALL_GAP) / 2;
    trims.push(box(LINING, h, depth, -w / 2 + LINING / 2, h / 2, zl));
    trims.push(box(LINING, h, depth, w / 2 - LINING / 2, h / 2, zl));
    trims.push(box(w - 2 * LINING + 2 * INSET, LINING, depth - 0.001, 0, h - LINING / 2, zl));
    this.archway.add(merged(trims, TRIM));
    this.archway.add(merged([box(w - 2 * LINING, 0.012, depth, 0, 0.006, zl)], OAK, false));
  }

  /** Shows the phase: walled up (a sheet over it the day of the works), or open once the two rooms are joined. */
  show(phase: RouxPhase): void {
    this.phase = phase;
    const open = phase === 'joined';
    this.plug.visible = !open;
    this.sheet.visible = phase === 'works';
    this.archway.visible = open;
    this.hitboxes[0]?.scale.setScalar(open ? 1e-4 : 1);
    this.setBlocking(!open);
  }

  update(dt: number): void {
    if (!this.blockerLaidOut) {
      this.blockerLaidOut = true;
      // The hole, through the wall's gap, in world space (laid out once placed).
      this.updateMatrixWorld(true);
      const { width: w, height: h } = ANNEX_DOORWAY;
      const corners = [new THREE.Vector3(-w / 2, 0, -WALL_GAP - 0.05), new THREE.Vector3(w / 2, h, 0.05)].map((v) => this.localToWorld(v));
      this.blocker.setFromPoints(corners);
      const was = this.blocking;
      this.blocking = false;
      this.setBlocking(was);
    }
    if (this.phase === 'works') this.hammer(dt);
  }

  private setBlocking(blocking: boolean): void {
    if (blocking === this.blocking) return;
    this.blocking = blocking;
    if (!this.blockerLaidOut) return;
    if (blocking) this.options.collisions.add(this.blocker);
    else this.options.collisions.remove(this.blocker);
  }

  /** The day of the works, in working hours: bursts of hammering from the far side of the wall. */
  private hammer(dt: number): void {
    const hours = this.options.hours();
    if (hours < WORKS.from || hours >= WORKS.to) return;
    this.nextBurst -= dt;
    if (this.nextBurst > 0) return;
    if (this.burstLeft <= 0) this.burstLeft = Math.round(WORKS.knocks[0] + Math.random() * (WORKS.knocks[1] - WORKS.knocks[0]));
    const { gain, spatial } = heardAt(this.localToWorld(new THREE.Vector3(0, 1.1, -0.4)));
    if (gain > 0.01) playWoodKnock(0.32 * gain, 0.55 + Math.random() * 0.15, spatial);
    this.burstLeft--;
    this.nextBurst = this.burstLeft > 0 ? WORKS.every * (0.8 + Math.random() * 0.4) : WORKS.gap[0] + Math.random() * (WORKS.gap[1] - WORKS.gap[0]);
  }

  setHovered(): void {}

  label(): string | null {
    switch (this.phase) {
      case 'joined':
        return null;
      case 'works':
        return 'The works next door · knock';
      case 'moving':
        return 'The old door, painted over: the wall comes down tomorrow';
      default:
        return 'A door, painted over · knock';
    }
  }

  activate(session: SessionActions): void {
    const { gain, spatial } = heardAt(this.localToWorld(new THREE.Vector3(0, 1.2, 0)));
    playWoodKnock(0.16 * gain, 0.75, spatial);
    switch (this.phase) {
      case 'works':
        session.react('The hammering stops. “Nearly through!” someone shouts from the other side.');
        return;
      case 'moving':
        session.react('Hollow. Behind it, the removal men are carrying out her wardrobe.');
        return;
      case 'forSale':
        session.react('Hollow. Mrs Roux’s flat is on the other side, and it is for sale: the sign is on her door.');
        return;
      default:
        session.react('Hollow. There was a door here once: this flat and the one next door were one, long ago.');
    }
  }
}

/**
 * The collection room's side of the opening to Mrs Roux's two rooms (`world/annex`): the walled-up door, the works'
 * sheet, the archway; its collider in the room's scoped set. Called by the collection room's builder (`layout.ts`).
 */
export function placeAnnexOpening(zone: Zone, ctx: Pick<BuildContext, 'today' | 'home' | 'building' | 'sky'>): AnnexOpening {
  if (ctx.home.upgrades) bindRouxMove({ today: ctx.today, upgrades: ctx.home.upgrades, ...(ctx.building ? { doorstep: ctx.building.doorstep } : {}) });
  const opening = new AnnexOpening({ collisions: zone.collisions, hours: () => ctx.sky.dayNight.state.hours });
  zone.placeAt(opening, { wall: ANNEX_DOORWAY.wall, along: ANNEX_DOORWAY.along, y: 0 });
  opening.show(rouxPhase());
  zone.onUnload(onRouxPhase((phase) => opening.show(phase)));
  return opening;
}
