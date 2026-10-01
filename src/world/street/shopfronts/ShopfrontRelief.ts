import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/graphics/canvas';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { RENDER_ORDER } from '../../surface/layers';
import { SnowTicker, snowScreen } from '../../shop/snowScreen';
import type { PaintedFront } from '../Buildings';
import { SHOPS } from '../facadePainter';
import { isShopOpen } from '../shops/shopHours';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from '../relief/facadeFrame';
import { TriBuilder } from '../relief/TriBuilder';
import { DISPLAY_FLOOR, buildJoinery, type FrontLayout } from './frontJoinery';
import { GLASS_ASPECT, paintShopfrontAtlas, type ShopfrontAtlas } from './shopfrontCanvas';
import { FRONT, SHOPFRONTS, SIGN, hasShopfront, type FrontKind } from './shopfrontPlan';
import { FULL_UV, TexQuads } from './TexQuads';
import { buildDisplay } from './windowDisplays';

/** Seconds between two looks at the clock (the door's card, the glow). */
const CHECK_EVERY = 0.5;
/** The door's card: its size, height on the glass, how far out of the wall (in front of the door's pane). */
const DOOR_CARD = { width: 0.3, height: 0.19, y: 1.72, drop: 0.07, out: 0.035 };

/** One shop's front: its kind, the materials that follow its hours, its door's card. */
interface Front {
  kind: FrontKind;
  glow: { value: number };
  lit: THREE.MeshBasicMaterial;
  screens: THREE.MeshBasicMaterial | null;
  glowing: THREE.MeshBasicMaterial | null;
  card: THREE.Object3D;
  open: boolean | null;
}

/**
 * The walk-in shops' fronts in 3D (`shopfrontPlan`), in front of their painted facades: per shop the joinery
 * (risers, returns, pilasters, head, fascia mouldings, the mosaic step, the sign's bracket: `frontJoinery`), the glass
 * of its display windows with the shop's lines lettered on it, the window displays behind it (`windowDisplays`), the
 * sign on its bracket and the OPEN / CLOSED card on the door, turned with the hours (`isShopOpen`). Lit by the street,
 * and by the shop: while it is open the displays glow warm at dusk and the lamps and sets in them are on; after
 * closing they stay softly lit. A handful of draw calls per shop, each shop its own meshes (culled apart). The
 * displays' boxes collide (`colliders`, zone-local: placed at the zone's origin).
 */
export class ShopfrontRelief extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly fronts: Front[] = [];
  private readonly snow: SnowTicker | null;
  private readonly atlas: ShopfrontAtlas;
  private clock = CHECK_EVERY;

  constructor(painted: readonly PaintedFront[], private readonly dayNight: DayNight) {
    super();
    this.name = 'ShopfrontRelief';
    this.atlas = paintShopfrontAtlas();
    let tv = false;
    for (const front of painted) {
      const frame = new FacadeFrame(front.spec);
      for (const shop of front.features.shopfronts) {
        if (!hasShopfront(shop.kind)) continue;
        const door = front.features.doors.find((d) => d.shop && d.s > shop.s0 && d.s < shop.s1);
        if (!door) continue;
        const units = front.features.windows.filter((w) => w.kind === shop.kind && w.y0 > 0.3 && w.s0 >= shop.s0 && w.s1 <= shop.s1).map((w) => ({ g0: w.s0, g1: w.s1 }));
        const layout: FrontLayout = { s0: shop.s0, s1: shop.s1, door: door.s, units };
        this.build(frame, shop.kind, layout, front.spec.seed * 31 + Math.round(shop.s0 * 10));
        if (shop.kind === 'electronics') tv = true;
      }
    }
    // The sets' snow is repainted here too (the TV shop's own ticker only runs while it is loaded).
    this.snow = tv ? new SnowTicker() : null;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.snow?.update(dt);
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    const s = this.dayNight.state;
    const night = 1 - s.daylight;
    for (const front of this.fronts) {
      const open = isShopOpen(front.kind, s.hours);
      front.glow.value = open ? 0.05 + 0.32 * night : 0.02 + 0.13 * night;
      front.lit.color.setScalar(open ? 1 : 0.22 + 0.4 * night);
      const screen = open ? 1 : 0.06 + 0.5 * night;
      front.screens?.color.setRGB(0.78 * screen, 0.83 * screen, 0.88 * screen);
      front.glowing?.color.setScalar(screen);
      if (open !== front.open) {
        front.open = open;
        // Turned on its string: the side that faces the street says it.
        front.card.rotation.y = open ? 0 : Math.PI;
      }
    }
  }

  /** One shop's front, its meshes in a group of their own. */
  private build(frame: FacadeFrame, kind: FrontKind, layout: FrontLayout, seed: number): void {
    const look = SHOPFRONTS[kind];
    const shopLook = SHOPS[kind];
    const random = seededRandom(seed);
    const m = frame.matrix(0, 0);
    const joinery = new TriBuilder();
    const sign = buildJoinery(joinery, m, layout, look, { front: shopLook.front, fascia: shopLook.fascia });
    // The door card's hook on the glass and its string down to the card's corners.
    const { y: hook, drop, out, width: cw } = DOOR_CARD;
    joinery.box(m, layout.door, hook + 0.01, out - 0.008, 0.028, 0.028, 0.012, '#d8d8d0');
    const reach = cw * 0.4;
    const length = Math.hypot(reach, drop);
    for (const side of [-1, 1]) {
      const tilt = m.clone().multiply(new THREE.Matrix4().makeTranslation(layout.door + (side * reach) / 2, hook - drop / 2, out)).multiply(new THREE.Matrix4().makeRotationZ(side * Math.asin(reach / length)));
      joinery.box(tilt, 0, 0, 0, 0.004, length, 0.004, '#3a3430');
    }
    const solid = new TriBuilder();
    const lit = new TriBuilder();
    const screens = new TexQuads();
    const glowing = new TexQuads();
    const paint = new TexQuads();
    const glass = new TexQuads();
    const { depth: D, sill, glassTop } = FRONT;
    layout.units.forEach((unit, i) => {
      const w = unit.g1 - unit.g0;
      const mid = (unit.g0 + unit.g1) / 2;
      buildDisplay(look.displays[i % 2]!, { solid, lit, screens, glowing, cards: paint, atlas: this.atlas }, frame.matrix(mid, DISPLAY_FLOOR, 0), w, random);
      // The glass, and the shop's line lettered on it (from inside, read from the street).
      glass.quad(m, mid, (sill + glassTop) / 2, D, w, glassTop - sill, FULL_UV);
      const lw = w * 0.92;
      paint.quad(m, mid, glassTop - 0.2, D - 0.004, lw, lw / GLASS_ASPECT, this.atlas.glass(kind, (i % 2) as 0 | 1));
      this.colliders.push(box(frame, unit.g0 - 0.06, unit.g1 + 0.06, D + 0.04));
    });
    for (const s of [layout.s0, layout.s1 - 0.24]) this.colliders.push(box(frame, s, s + 0.24, D + 0.1));
    // The hanging sign, both faces, square to the facade.
    const { out0, out1, bottom, top } = SIGN;
    paint.twoSided(m, sign, (bottom + top) / 2, (out0 + out1) / 2, out1 - out0, top - bottom, this.atlas.sign(kind), this.atlas.sign(kind), Math.PI / 2, 0.02);

    const group = new THREE.Group();
    group.name = `Shopfront:${kind}`;
    this.add(group);
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, shadows = false): THREE.Mesh => {
      const out = new THREE.Mesh(geometry, material);
      out.castShadow = shadows;
      out.receiveShadow = true;
      group.add(out);
      return out;
    };
    mesh(joinery.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 })), true);
    const glow = { value: 0 };
    if (!solid.isEmpty) mesh(solid.build(), displayMaterial(glow));
    const litMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    if (!lit.isEmpty) mesh(lit.build(), litMaterial);
    const screenMaterial = screens.isEmpty ? null : new THREE.MeshBasicMaterial({ map: snowScreen().map, color: 0xc8d4e0 });
    if (screenMaterial) mesh(screens.build(), screenMaterial);
    const glowingMaterial = glowing.isEmpty ? null : new THREE.MeshBasicMaterial({ map: this.atlas.texture });
    if (glowingMaterial) mesh(glowing.build(), glowingMaterial);
    const paintMaterial = new THREE.MeshStandardMaterial({ map: this.atlas.texture, alphaTest: 0.5, roughness: 0.7, side: THREE.FrontSide });
    mesh(paint.build(), paintMaterial);
    const glassMesh = mesh(glass.build(), new THREE.MeshStandardMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0, depthWrite: false }));
    glassMesh.receiveShadow = false;
    glassMesh.renderOrder = RENDER_ORDER.glass;

    // The door's card on its string, hung inside the door's glass: OPEN on one face, CLOSED on the other.
    const card = new TexQuads().twoSided(new THREE.Matrix4(), 0, -DOOR_CARD.drop - DOOR_CARD.height / 2, 0, DOOR_CARD.width, DOOR_CARD.height, this.atlas.tile('open'), this.atlas.tile('closed'), 0, 0.004);
    const pivot = new THREE.Group();
    pivot.name = 'DoorCard';
    pivot.add(new THREE.Mesh(card.build(), paintMaterial));
    const hung = new THREE.Group();
    hung.rotation.y = frame.yaw;
    frame.point(layout.door, DOOR_CARD.y, DOOR_CARD.out, hung.position);
    hung.add(pivot);
    group.add(hung);
    this.fronts.push({ kind, glow, lit: litMaterial, screens: screenMaterial, glowing: glowingMaterial, card: pivot, open: null });
  }
}

/** The zone-local box from s0 to s1 along `frame`'s face, from the wall out `out`, pavement to head height. */
function box(frame: FacadeFrame, s0: number, s1: number, out: number): THREE.Box3 {
  return new THREE.Box3().setFromPoints([frame.point(s0, 0, 0), frame.point(s1, FRONT.headTop, out)]);
}

/** The displays' material: vertex colours, and `glow` of their own colour added as light (the shop's lamps on them). */
function displayMaterial(glow: { value: number }): THREE.MeshStandardMaterial {
  return patchShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), 'shopfrontGlow', (shader) => {
    shader.uniforms.displayGlow = glow;
    shader.fragmentShader = 'uniform float displayGlow;\n' + afterChunk(shader.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance += vColor.rgb * displayGlow;');
  });
}
