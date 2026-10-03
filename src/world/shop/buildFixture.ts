import type { Furniture } from '../Furniture';
import { Birdcage } from './Birdcage';
import { DisplayTable } from './DisplayTable';
import { TvWall } from './TvWall';
import { GoodsShelf } from './GoodsShelf';
import { FlowerStand } from './FlowerStand';
import { RugRolls } from './RugRolls';
import { DeliveryTrolley } from './DeliveryTrolley';
import type { ShopFixture } from './shopPlan';

/** A shop plan's fixture that is a piece of its own (not the clock, the radio or a named prop), built from its options. */
export function buildFixture(fixture: Exclude<ShopFixture, { kind: 'clock' | 'radio' | 'prop' }>): Furniture {
  switch (fixture.kind) {
    case 'tvWall':
      return new TvWall(fixture.options);
    case 'goodsShelf':
      return new GoodsShelf(fixture.options);
    case 'flowerStand':
      return new FlowerStand(fixture.options);
    case 'table':
      return new DisplayTable(fixture.options);
    case 'rugRolls':
      return new RugRolls(fixture.options);
    case 'trolley':
      return new DeliveryTrolley();
    case 'birdcage':
      return new Birdcage();
  }
}
