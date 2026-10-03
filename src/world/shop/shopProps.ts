import type { Furniture } from '../Furniture';
import type { RoomOptions } from '../Room';
import type { DayNight } from '../props/DayNight';
import type { ShopKind } from '../street/streetPlan';
import type { WallGap } from './common/PanelledDado';
import { COMMON_PROPS } from './common/props';
import { FURNITURE_PROPS } from './furniture/props';
import { TV_PROPS } from './tv/props';
import { PET_PROPS } from './pets/props';
import { FLORIST_PROPS } from './florist/props';

/**
 * What a prop's maker knows of the shop it is made for: its name and colours (the name board, the counter's
 * accent), its kind of shop (the OPEN sign's hours), the clock, the room's size and its window (what runs round the
 * walls skips the door and the glass), and a seed of its own (the prop's place in the plan).
 */
export interface ShopContext {
  readonly name: string;
  /** The shop's colour (`ShopPlan.accent`), its fascia board's in the street and that board's lettering (`SHOP_LOOKS[kind]`, CSS). */
  readonly accent: number;
  readonly fascia: number;
  readonly letters: string;
  /** The fascia's lettering family (`SHOP_LOOKS[kind].font`, CSS): the name board inside is lettered in it too. */
  readonly font: string;
  readonly kind: Extract<ShopKind, 'furniture' | 'electronics' | 'pets' | 'florist'>;
  readonly dayNight: DayNight;
  readonly room: RoomOptions;
  /** The front wall's openings (the exit, the window with its stall riser), for what runs round the walls. */
  readonly openings: readonly WallGap[];
  readonly seed: number;
}

/** Makes one prop from its plan options (default `{}`) for a shop. */
export type ShopPropMaker<O> = (options: O | undefined, shop: ShopContext) => Furniture;

/**
 * Every prop a shop's plan can name (`{ kind: 'prop', prop, options }`): the shared ones (`common/props`) and each
 * shop's own (`<shop>/props.ts`, owned by that shop's plan). A name is unique across them all.
 */
export const SHOP_PROPS = { ...COMMON_PROPS, ...FURNITURE_PROPS, ...TV_PROPS, ...PET_PROPS, ...FLORIST_PROPS };

// Two registries naming the same prop: the later would silently win.
{
  const names = [COMMON_PROPS, FURNITURE_PROPS, TV_PROPS, PET_PROPS, FLORIST_PROPS].flatMap((r) => Object.keys(r));
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length) throw new Error(`[shop] props named twice: ${twice.join(', ')}`);
}

export type ShopPropName = keyof typeof SHOP_PROPS;
/** The options a prop's maker takes. */
export type ShopPropOptions<K extends ShopPropName> = Parameters<(typeof SHOP_PROPS)[K]>[0];

/** Makes the prop named `name` (the plan's options are type-checked against its maker, so the cast only erases K). */
export function makeShopProp<K extends ShopPropName>(name: K, options: ShopPropOptions<K>, shop: ShopContext): Furniture {
  const make = SHOP_PROPS[name] as ShopPropMaker<ShopPropOptions<K>>;
  return make(options, shop);
}
