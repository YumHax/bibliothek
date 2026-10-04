import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { coverageKeepsAlpha } from '../../materials/palette';
import { RENDER_ORDER } from '../../surface/layers';
import { SnowTicker, snowScreen } from '../../shop/snowScreen';
import type { PaintedFront } from '../Buildings';
import { SHOPS, facadeHeight } from '../facadePainter';
import { isShopOpen } from '../shops/shopHours';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from '../relief/facadeFrame';
import { TriBuilder } from '../relief/TriBuilder';
import { FasciaLettering, type FasciaSign } from './fasciaLettering';
import { DISPLAY_FLOOR, buildJoinery, type FrontLayout } from './frontJoinery';
import { buildLandmarkFront, type LandmarkKind } from './landmarkFront';
import { buildPlainFront } from './plainFront';
import { GLASS_ASPECT, paintShopfrontAtlas, type ShopfrontAtlas } from './shopfrontCanvas';
import { FRONT, PLAIN, SHOPFRONTS, SIGN, frontVariant, type FrontKind } from './shopfrontPlan';
import { FULL_UV, TexQuads } from './TexQuads';
import { buildDisplay } from './windowDisplays';
import { GLASS } from '../../materials/glass';
import { lcg } from '@/random';

/** Seconds between two looks at the clock (the door's card, the glow, the neon). */
const CHECK_EVERY = 0.5;
/** The door's card: its size, height on the glass, how far out of the wall (in front of the door's pane). */
const DOOR_CARD = { width: 0.3, height: 0.19, y: 1.72, drop: 0.07, out: 0.035 };
/** How far behind its glass a walk-in window's lettering is (painted on the inside; far enough not to fight the glass down the street). */
const GLASS_LETTERING = 0.02;

/** One walk-in shop's front: its kind, the materials that follow its hours, its door's card. */
interface WalkIn {
  kind: FrontKind;
  glow: { value: number };
  lit: THREE.MeshBasicMaterial;
  screens: THREE.MeshBasicMaterial | null;
  glowing: THREE.MeshBasicMaterial | null;
  card: THREE.Object3D;
  open: boolean | null;
}

/**
 * Every shopfront the walker passes close by, built in 3D in front of its painted facade: the kit
 * (`shopfrontPlan`), one of three variants per shop (`frontVariant`).
 * - `plain` (`plainFront`): pilasters, consoles, the fascia board and cornice, the surround with the door and the
 *   display windows set back in it, sills, panelled risers, transoms.
 * - `walkIn` (`frontJoinery`): display windows standing out on their risers, the window displays behind their glass
 *   (`windowDisplays`) with the shop's lines lettered on it, the sign on its bracket, the OPEN / CLOSED card on the
 *   door turned with the hours (`isShopOpen`); lit by the shop while it is open, softly after closing.
 * - `landmark` (`landmarkFront`): RETRO GAMES and the arcade, flush, enamel and chrome, the arcade's neon tubes.
 * Every name on a built fascia is lettered sharp (`FasciaLettering`). The joinery of all of them is one draw call
 * (the landmarks' chrome another, their neon a third); each walk-in shop keeps a handful of its own (culled apart).
 * The walk-in displays' boxes collide (`colliders`, zone-local: placed at the zone's origin).
 */
export class Shopfronts extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly walkIns: WalkIn[] = [];
  private readonly snow: SnowTicker | null;
  private readonly atlas: ShopfrontAtlas;
  private readonly tubes: THREE.MeshBasicMaterial | null = null;
  private readonly lettering: FasciaLettering;
  private clock = CHECK_EVERY;

  constructor(painted: readonly PaintedFront[], private readonly dayNight: DayNight) {
    super();
    this.name = 'Shopfronts';
    this.atlas = paintShopfrontAtlas();
    const joinery = new TriBuilder();
    const landmarks = new TriBuilder();
    const neon = new TriBuilder();
    const signs: FasciaSign[] = [];
    let tv = false;
    // What stands on the pavement or against a wall loses the faces pressed on them (never seen).
    for (const builder of [joinery, landmarks]) builder.hideGround();
    for (const front of painted) {
      const frame = new FacadeFrame(front.spec);
      const m = frame.matrix(0, 0);
      const { features } = front;
      const wall = frame.wall(facadeHeight(front.spec.storeys));
      for (const builder of [joinery, landmarks]) builder.hideAgainst(...wall);
      for (const shop of features.shopfronts) {
        const variant = frontVariant(front.spec.detail, shop.kind);
        if (!variant) continue;
        const within = (s: number): boolean => s > shop.s0 && s < shop.s1;
        const door = features.doors.find((d) => d.shop && within(d.s));
        const windows = features.windows.filter((w) => w.kind === shop.kind && w.y0 > 0.3 && w.s0 >= shop.s0 && w.s1 <= shop.s1);
        for (const sign of features.signs ?? []) {
          if (!within(sign.s)) continue;
          // On a plain front's board, else on the board painted on the wall between a walk-in shop's mouldings.
          const plain = variant === 'plain';
          const board = plain ? PLAIN.boardOut : 0;
          const maxWidth = shop.s1 - shop.s0 - (plain ? 2 * PLAIN.pilaster + 0.12 : 0.5);
          signs.push({ frame, s: sign.s, y: sign.y, board, size: sign.size, maxWidth, text: sign.text, color: sign.color, font: sign.font, ...(sign.neon ? { neon: sign.neon } : {}) });
        }
        if (variant === 'plain') {
          const look = SHOPS[shop.kind as keyof typeof SHOPS];
          // The painted door (`facadePainter`): its leaf 1 m wide, its glass up to 2.55 m.
          const leaf = door ? { s: door.s, half: 0.5, top: 2.55 } : null;
          buildPlainFront(joinery, m, { s0: shop.s0, s1: shop.s1, door: leaf, units: windows.map((w) => ({ g0: w.s0, g1: w.s1, y0: w.y0, y1: w.y1 })) }, look);
        } else if (variant === 'landmark') {
          buildLandmarkFront(landmarks, neon, m, shop.kind as LandmarkKind, shop.s0, shop.s1, windows);
        } else if (door) {
          const kind = shop.kind as FrontKind;
          const layout: FrontLayout = { s0: shop.s0, s1: shop.s1, door: door.s, units: windows.map((w) => ({ g0: w.s0, g1: w.s1 })) };
          this.buildWalkIn(joinery, frame, kind, layout, front.spec.seed * 31 + Math.round(shop.s0 * 10));
          if (kind === 'electronics') tv = true;
        }
      }
    }
    const solid = (builder: TriBuilder, material: THREE.MeshStandardMaterial, name: string): void => {
      if (builder.isEmpty) return;
      const mesh = new THREE.Mesh(builder.build(), snowCovered(material));
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    };
    solid(joinery, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), 'ShopfrontJoinery');
    solid(landmarks, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }), 'LandmarkFronts');
    if (!neon.isEmpty) {
      this.tubes = new THREE.MeshBasicMaterial({ vertexColors: true });
      const tubes = new THREE.Mesh(neon.build(), this.tubes);
      tubes.name = 'NeonTubes';
      this.add(tubes);
    }
    this.lettering = new FasciaLettering(signs);
    this.add(this.lettering);
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
    // A tube is a pale glow by day, brighter as the light goes.
    this.tubes?.color.setScalar(0.55 + 0.9 * night);
    this.lettering.setNight(night);
    for (const front of this.walkIns) {
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

  /** A walk-in shop's front: its joinery into the street's `joinery`, the rest (what its hours light) in a group of its own. */
  private buildWalkIn(joinery: TriBuilder, frame: FacadeFrame, kind: FrontKind, layout: FrontLayout, seed: number): void {
    const look = SHOPFRONTS[kind];
    const shopLook = SHOPS[kind];
    const random = lcg(seed);
    const m = frame.matrix(0, 0);
    const sign = buildJoinery(joinery, m, layout, look, { front: shopLook.front, fascia: shopLook.fascia });
    // The door card's hook on the glass and its string down to the card's corners.
    const { y: hook, drop, out, width: cw } = DOOR_CARD;
    joinery.box(m, layout.door, hook + 0.01, out - 0.008, 0.028, 0.028, 0.012, '#d8d8d0'); // convention-ok: a solid hook standing on the glass, not a layer
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
    // What stands on the display floor loses its bottom (pressed on the floor, never seen).
    solid.hideAgainst(new THREE.Vector3(0, 1, 0), frame.point(0, DISPLAY_FLOOR), new THREE.Box3().setFromPoints([frame.point(layout.s0, DISPLAY_FLOOR, 0), frame.point(layout.s1, DISPLAY_FLOOR, D)]));
    layout.units.forEach((unit, i) => {
      const w = unit.g1 - unit.g0;
      const mid = (unit.g0 + unit.g1) / 2;
      buildDisplay(look.displays[i % 2]!, { solid, lit, screens, glowing, cards: paint, atlas: this.atlas }, frame.matrix(mid, DISPLAY_FLOOR, 0), w, random);
      // The glass, and the shop's line lettered on it (from inside, read from the street).
      glass.quad(m, mid, (sill + glassTop) / 2, D, w, glassTop - sill, FULL_UV);
      const lw = w * 0.92;
      paint.quad(m, mid, glassTop - 0.2, D - GLASS_LETTERING, lw, lw / GLASS_ASPECT, this.atlas.glass(kind, (i % 2) as 0 | 1));
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
    const glow = { value: 0 };
    if (!solid.isEmpty) mesh(solid.build(), displayMaterial(glow));
    const litMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    if (!lit.isEmpty) mesh(lit.build(), litMaterial);
    const screenMaterial = screens.isEmpty ? null : new THREE.MeshBasicMaterial({ map: snowScreen().map, color: 0xc8d4e0 });
    if (screenMaterial) mesh(screens.build(), screenMaterial);
    const glowingMaterial = glowing.isEmpty ? null : new THREE.MeshBasicMaterial({ map: this.atlas.texture });
    if (glowingMaterial) mesh(glowing.build(), glowingMaterial);
    // Cut out, its edges smoothed by the multisampling where there is any (signs, cards, lettering on the glass).
    const paintMaterial = coverageKeepsAlpha(new THREE.MeshStandardMaterial({ map: this.atlas.texture, alphaTest: 0.5, alphaToCoverage: QUALITY.msaa > 0, roughness: 0.7, side: THREE.FrontSide }));
    mesh(paint.build(), paintMaterial);
    const glassMesh = mesh(glass.build(), GLASS.pane);
    glassMesh.receiveShadow = false;
    glassMesh.renderOrder = RENDER_ORDER.glass;

    // The door's card on its string, hung inside the door's glass: OPEN on one face, CLOSED on the other.
    const card = new TexQuads().twoSided(new THREE.Matrix4(), 0, -DOOR_CARD.drop - DOOR_CARD.height / 2, 0, DOOR_CARD.width, DOOR_CARD.height, this.atlas.tile(`open:${kind}`), this.atlas.tile(`closed:${kind}`), 0, 0.004);
    const pivot = new THREE.Group();
    pivot.name = 'DoorCard';
    pivot.add(new THREE.Mesh(card.build(), paintMaterial));
    const hung = new THREE.Group();
    hung.rotation.y = frame.yaw;
    frame.point(layout.door, DOOR_CARD.y, DOOR_CARD.out, hung.position);
    hung.add(pivot);
    group.add(hung);
    this.walkIns.push({ kind, glow, lit: litMaterial, screens: screenMaterial, glowing: glowingMaterial, card: pivot, open: null });
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
