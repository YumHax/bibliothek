import type { ShopContext, ShopPropMaker } from '../shopProps';
import { AquariumWall, type AquariumWallOptions } from './AquariumWall';
import { Terrarium, type TerrariumOptions } from './Terrarium';
import { HamsterCage, type HamsterCageOptions } from './HamsterCage';
import { LeadPegboard, type LeadPegboardOptions } from './LeadPegboard';
import { KibblePallet, type KibblePalletOptions } from './KibblePallet';
import { TreatBin, type TreatBinOptions } from './TreatBin';
import { CatTree, type CatTreeOptions } from './CatTree';
import { CatTunnel, type CatTunnelOptions } from './CatTunnel';
import { CatWallShelf, type CatWallShelfOptions } from './CatWallShelf';
import { DogBowl } from './DogBowl';
import { CeilingMobile, type CeilingMobileOptions } from './CeilingMobile';
import { ShopCat, type ShopCatOptions } from './ShopCat';
import { ToyMice, type ToyMiceOptions } from './ToyMice';
import { KidsDrawings, type KidsDrawingsOptions } from './KidsDrawings';
import { TreatJar, type TreatJarOptions } from './TreatJar';
import { DonationTin, type DonationTinOptions } from './DonationTin';

/**
 * PAWS & CLAWS, the pet shop's own props, by name, for its plan (`plans/`): `{ kind: 'prop', prop: '<name>', options, at | on }`. Each
 * maker takes its options (or undefined) and the `ShopContext`; its class lives in this folder. A name must not be
 * one of another shop's or of `common/props` (`shopProps` checks).
 */
export const PET_PROPS = {
  /** The wall of lit tanks and their fish (its pump heard, its glow pooled). Wall-hung, `y: 0`. */
  aquariumWall: (o: AquariumWallOptions = {}, shop: ShopContext) => new AquariumWall({ seed: shop.seed, ...o }),
  /** The tortoise's glass tank on its cabinet, under a glowing heat lamp. Wall-hung, `y: 0`. */
  terrarium: (o: TerrariumOptions = {}, shop: ShopContext) => new Terrarium({ seed: shop.seed, ...o }),
  /** The hamster's cage on its stand, the wheel turning (and heard) now and then. Wall-hung, `y: 0`. */
  hamsterCage: (o: HamsterCageOptions = {}, shop: ShopContext) => new HamsterCage({ seed: shop.seed, ...o }),
  /** A pegboard of leads and collars. Wall-hung at its centre. */
  leadPegboard: (o: LeadPegboardOptions = {}, shop: ShopContext) => new LeadPegboard({ seed: shop.seed, ...o }),
  /** Sacks of kibble on a pallet (collides). Floor. */
  kibblePallet: (o: KibblePalletOptions = {}, shop: ShopContext) => new KibblePallet({ seed: shop.seed, ...o }),
  /** The pick & mix of treats on its stand (collides). Floor. */
  treatBin: (o: TreatBinOptions = {}, shop: ShopContext) => new TreatBin({ seed: shop.seed, ...o }),
  /** A sisal cat tree with its den, hammock and top bed (collides). Floor. */
  catTree: (o: CatTreeOptions = {}) => new CatTree(o),
  /** A crinkle tunnel lying on the floor. Floor. */
  catTunnel: (o: CatTunnelOptions = {}) => new CatTunnel(o),
  /** A cat's nap shelf with its bed. Wall-hung at the board's top. */
  catWallShelf: (o: CatWallShelfOptions = {}) => new CatWallShelf(o),
  /** A water bowl for dogs on its mat. Floor. */
  dogBowl: () => new DogBowl(),
  /** A felt mobile of fish and birds, turning. Ceiling. */
  ceilingMobile: (o: CeilingMobileOptions = {}, shop: ShopContext) => new CeilingMobile({ seed: shop.seed, ...o }),
  /** The shop's own cat asleep in her bed, with her card. On a surface (the window's display). */
  shopCat: (o: ShopCatOptions = {}) => new ShopCat(o),
  /** Felt toy mice and a ball of wool. On a surface. */
  toyMice: (o: ToyMiceOptions = {}, shop: ShopContext) => new ToyMice({ seed: shop.seed, ...o }),
  /** Children's drawings taped up in a row. Wall-hung at the row's middle. */
  kidsDrawings: (o: KidsDrawingsOptions = {}, shop: ShopContext) => new KidsDrawings({ seed: shop.seed, ...o }),
  /** The jar of free dog biscuits. On the counter. */
  treatJar: (o: TreatJarOptions = {}, shop: ShopContext) => new TreatJar({ seed: shop.seed, ...o }),
  /** The rescue's collecting tin. On the counter. */
  donationTin: (o: DonationTinOptions = {}) => new DonationTin(o),
} satisfies Record<string, ShopPropMaker<never>>;
