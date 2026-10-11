import * as THREE from 'three';
import type { RecipeId } from '@/grandma/recipes';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { paint, standard } from '../materials/palette';
import { GLASS } from '../materials/glass';
import { SEAM } from '../props/joinery';

/*
 * Mémé's recipes at home (docs/grandma.md "Sunday lunch, recipes and favours"): the tin her cards are kept in, which
 * cooks the next of them, and the dish cooked, out on the worktop while it lasts. Each stands on its base at local y = 0
 * facing +z; the builder (`memeRecipes.ts`) wires the caption and the click.
 */

const TIN = { w: 0.15, h: 0.09, d: 0.1, lid: 0.018, lidOver: 0.006, band: 0.012, bandOver: 0.002 };
const POT = { r: 0.1, h: 0.1, lid: 0.018, knob: 0.02 };
const JAR = { r: 0.032, h: 0.085, cloth: 0.01 };
const CAKE = { plate: 0.13, plateH: 0.01, r: 0.1, h: 0.055, crust: 0.006 };

/** A red tin with a cream lid, a card sticking out of it: her recipe cards. */
export class RecipeTin extends UsableProp {
  constructor(use: UseOptions) {
    super(use);
    this.name = 'RecipeTin';
    const red = standard({ color: 0xa82a2a, roughness: 0.35, metalness: 0.4 });
    part(this, TIN.w, TIN.h, TIN.d, red, { y: TIN.h / 2 });
    part(this, TIN.w + TIN.lidOver, TIN.lid, TIN.d + TIN.lidOver, paint(0xeee2c4, 0.5), { y: TIN.h + SEAM + TIN.lid / 2 });
    // The lid's band of little flowers, and a card standing proud of the lid at the back.
    part(this, TIN.w + TIN.bandOver, TIN.band, TIN.d + TIN.bandOver, paint(0xe8c04a, 0.5), { y: TIN.h * 0.55 }).castShadow = false;
    const card = part(this, 0.11, 0.05, 0.002, paint(0xfaf4e4, 0.9), { y: TIN.h + TIN.lid + 0.02, z: -TIN.d / 2 + 0.015 });
    card.rotation.x = -0.12;
    this.target(TIN.w + 0.04, TIN.h + 0.06, TIN.d + 0.04, { y: (TIN.h + 0.06) / 2 });
  }
}

/** The dish out: her blanquette in an orange cocotte, three jars of plum jam, or her yoghurt cake on a plate. */
export class MemeDish extends Prop {
  readonly contactShadow = false;
  private readonly dishes: Record<RecipeId, THREE.Group> = { blanquette: new THREE.Group(), jam: new THREE.Group(), yoghurtCake: new THREE.Group() };

  constructor() {
    super();
    this.name = 'MemeDish';
    for (const group of Object.values(this.dishes)) this.add(group);
    this.buildCocotte(this.dishes.blanquette);
    this.buildJars(this.dishes.jam);
    this.buildCake(this.dishes.yoghurtCake);
    this.show(null);
  }

  /** Which dish is out, or none. */
  show(recipe: RecipeId | null): void {
    for (const [id, group] of Object.entries(this.dishes)) group.visible = id === recipe;
  }

  private buildCocotte(group: THREE.Group): void {
    const enamel = standard({ color: 0xd8642a, roughness: 0.25, metalness: 0 });
    group.add(cylinderMesh(POT.r, POT.h, enamel, { y: POT.h / 2 }, { radiusBottom: POT.r * 0.9, segments: 24 }));
    const lid = POT.h + SEAM;
    group.add(cylinderMesh(POT.r * 1.04, POT.lid, enamel, { y: lid + POT.lid / 2 }, { radiusBottom: POT.r * 1.03, segments: 24 }));
    group.add(cylinderMesh(POT.knob, POT.knob, paint(0x2a2a2a, 0.5), { y: lid + POT.lid + SEAM + POT.knob / 2 }, { segments: 10 }));
    for (const s of [-1, 1]) part(group, 0.03, 0.016, 0.035, enamel, { x: s * (POT.r + 0.01), y: POT.h * 0.8 });
  }

  private buildJars(group: THREE.Group): void {
    const plum = paint(0x4a1a34, 0.3);
    const cloth = paint(0xc83a3a, 0.8);
    for (const [x, z] of [[-0.065, 0.02], [0.0, -0.03], [0.065, 0.02]] as const) {
      group.add(cylinderMesh(JAR.r, JAR.h, GLASS.ware, { x, y: JAR.h / 2, z }, { segments: 16 }));
      group.add(cylinderMesh(JAR.r * 0.87, JAR.h * 0.8, plum, { x, y: JAR.h * 0.43, z }, { segments: 14 }));
      group.add(cylinderMesh(JAR.r * 1.25, JAR.cloth, cloth, { x, y: JAR.h + SEAM + JAR.cloth / 2, z }, { radiusBottom: JAR.r * 1.3, segments: 12 }));
      // The label stands proud of the glass by a gap (a flat card on a curve: no face shared).
      part(group, 0.03, 0.022, 0.002, paint(0xf6f0e0, 0.9), { x, y: JAR.h / 2, z: z + JAR.r + SEAM }).castShadow = false;
    }
  }

  private buildCake(group: THREE.Group): void {
    group.add(cylinderMesh(CAKE.plate, CAKE.plateH, paint(0xf6f3ec, 0.35), { y: CAKE.plateH / 2 }, { segments: 28 }));
    const base = CAKE.plateH + SEAM;
    group.add(cylinderMesh(CAKE.r, CAKE.h, paint(0xd8a050, 0.75), { y: base + CAKE.h / 2 }, { radiusBottom: CAKE.r * 1.02, segments: 28 }));
    group.add(cylinderMesh(CAKE.r * 0.94, CAKE.crust, paint(0xb87830, 0.8), { y: base + CAKE.h + SEAM + CAKE.crust / 2 }, { segments: 28 }));
  }
}
