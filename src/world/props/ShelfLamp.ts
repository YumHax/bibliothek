import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from '../Furniture';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import type { DrawnAware } from '../zone/Zone';
import { SwitchableLamp } from './SwitchableLamp';

export interface ShelfLampOptions {
  /** Horizontal distance from the fixture to the bookcase face (m); the bookcase lies along local -z. */
  throwDistance: number;
  /** World height of the aiming point on the bookcase face (m); the fixture hangs from the ceiling at local y = 0. */
  aimHeight: number;
  /** Ceiling height (m), to express `aimHeight` in the fixture's frame. */
  ceilingHeight: number;
  /** Light intensity when on. */
  intensity?: number;
  /** Starts lit? */
  on?: boolean;
}

const METAL = 0x2e2b28;
const CANOPY_RADIUS = 0.05;
const STEM_LENGTH = 0.1;
const CAN_RADIUS = 0.045;
const CAN_LENGTH = 0.14;
const LENS_GLOW = 2.5;
const HOVER_GLOW = 0.35;

/**
 * A ceiling spot for one bookcase: a dark canopy and stem hanging from the ceiling, and a can
 * swivelled towards the covers with a warm spot inside — the whole face gets lit, top row to
 * bottom row. Local origin is the ceiling attachment point; the bookcase is `throwDistance`
 * away along local -z. Overhead, so it never collides (empty footprint, see `Prop`). Clicking
 * the can switches it. Owned by `Shelving`, one per bookcase, kept across rebuilds so a
 * switched-off spot stays off. Its shadow map is re-rendered every frame only while the player is
 * in the room (`setOccupied`), a couple of times a second otherwise, never while its zone is culled
 * from view (`setZoneDrawn`). A spot for a slot with no bookcase yet is `parked`: dark, unseen,
 * unclickable, but still a shadow-casting light in the scene, so buying a bookcase does not change
 * the light count (which would recompile every shader).
 */
export class ShelfLamp extends SwitchableLamp implements Updatable, OccupancyAware, DrawnAware {
  readonly options: Required<ShelfLampOptions>;
  readonly light: THREE.SpotLight;
  readonly hitboxes: THREE.Object3D[];
  private readonly metal: THREE.MeshStandardMaterial;
  private readonly lens: THREE.MeshStandardMaterial;
  /** Canopy, stem and can: hidden as one while parked (a Group, so the zone's culling, which toggles meshes, never shows it again). */
  private readonly fixture = new THREE.Group();
  private occupied = false;
  private zoneDrawn = true;
  private parked = false;
  private shadowTimer = Math.random() * IDLE_SHADOW_INTERVAL;

  constructor(options: ShelfLampOptions) {
    super('shelf spot');
    this.name = 'ShelfLamp';
    this.options = { intensity: 25, on: true, ...options };
    const { throwDistance, aimHeight, ceilingHeight, intensity } = this.options;

    this.metal = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.7, emissive: 0x6a6258, emissiveIntensity: 0 });

    const canopy = cylinderMesh(CANOPY_RADIUS, 0.015, this.metal, { y: -0.0075 }, { segments: 24 });
    const stem = cylinderMesh(0.008, STEM_LENGTH, this.metal, { y: -0.015 - STEM_LENGTH / 2 }, { segments: 10 });

    // The can pivots at the bottom of the stem and points at the aiming spot on the bookcase.
    const pivot = new THREE.Vector3(0, -0.015 - STEM_LENGTH, 0);
    const aim = new THREE.Vector3(0, aimHeight - ceilingHeight, -throwDistance);
    const direction = aim.clone().sub(pivot).normalize();
    const can = new THREE.Group();
    can.position.copy(pivot);
    can.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction); // can's local +z looks at the target
    const body = cylinderMesh(CAN_RADIUS, CAN_LENGTH, this.metal, { z: CAN_LENGTH / 2 - 0.02 }, { radiusBottom: CAN_RADIUS * 0.85, segments: 24 });
    body.rotation.x = Math.PI / 2;
    this.lens = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffe2b0, emissiveIntensity: LENS_GLOW, roughness: 0.3 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(CAN_RADIUS * 0.8, 24), this.lens);
    lens.position.z = CAN_LENGTH - 0.02 + 0.002;
    lens.castShadow = false;
    can.add(body, lens);

    // Same beam as the room's former automatic shelf spots: it covers the whole bookcase face.
    this.light = new THREE.SpotLight(0xfff1dc, intensity, 6, Math.PI / 5, 0.5, 1.5);
    this.light.position.copy(pivot).addScaledVector(direction, CAN_LENGTH);
    this.light.target.position.copy(aim);
    // Shadowless: every slot of every room's shelving has a spot (parked ones included, so the light count never
    // follows the collection), and each shadow map is one more texture unit in every lit shader of the flat. With
    // them casting, the flat passed the GPU's 16 units, every lit program failed to link and the rooms went black.
    // The room's ceiling lamp still draws the shelves' shadows (their per-shelf proxies).
    this.light.castShadow = false;

    const hitbox = invisibleHitbox(0.22, 0.28, 0.22);
    hitbox.position.copy(pivot).addScaledVector(direction, CAN_LENGTH / 2).add(new THREE.Vector3(0, 0.04, 0));
    this.hitboxes = [hitbox];

    this.fixture.add(canopy, stem, can);
    this.add(this.fixture, this.light, this.light.target, hitbox);
    this.setOn(this.options.on);
  }

  /** Parked: no bookcase under it (yet). Dark and out of sight, its hitbox off the crosshair ray (layer 0); the switch state is kept for when it is back. */
  setParked(parked: boolean): void {
    if (parked === this.parked) return;
    this.parked = parked;
    this.fixture.visible = !parked;
    for (const hitbox of this.hitboxes) hitbox.layers[parked ? 'disable' : 'enable'](0);
    this.setOn(this.isOn);
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.syncShadow();
  }

  /** Culled from view: the idle refresh waits (the bookcase is hidden, the map would come out empty), and runs at once when drawn again. */
  setZoneDrawn(drawn: boolean): void {
    this.zoneDrawn = drawn;
    this.syncShadow();
  }

  /** Unoccupied and lit: refresh the shadow map now and then instead of every frame. */
  update(dt: number): void {
    if (this.occupied || !this.zoneDrawn || this.light.intensity <= 0) return;
    this.shadowTimer += dt;
    if (this.shadowTimer < IDLE_SHADOW_INTERVAL) return;
    this.shadowTimer = 0;
    this.light.shadow.needsUpdate = true;
  }

  protected render(on: boolean, hovered: boolean): void {
    const lit = on && !this.parked;
    this.light.intensity = lit ? this.options.intensity : 0;
    this.lens.emissiveIntensity = lit ? LENS_GLOW : 0;
    this.metal.emissiveIntensity = hovered ? HOVER_GLOW : 0;
    this.syncShadow();
  }

  /** Per-frame shadow updates only while lit and in the player's room; a switched-off (or parked, or culled) spot renders no map at all. */
  private syncShadow(): void {
    const live = this.light.intensity > 0 && this.zoneDrawn;
    this.light.shadow.autoUpdate = live && this.occupied;
    if (live) this.light.shadow.needsUpdate = true;
  }
}
