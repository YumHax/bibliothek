import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { HOME_GOODS } from '@/economy/homeGoods';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import { followUpgrades } from '../build/follow';
import { Vendor } from '../people/Vendor';
import { MarketStall } from './MarketStall';
import { homeGoodsItems, type HomeGoodsItem } from './HomeGoodsDisplay';
import { MARKET_PLAN } from './marketPlan';

/** The household stall: furniture for the flat (`HOME_GOODS`), each piece bought with a click; one-offs vanish once bought. */
export function furnishHousehold(zone: Zone, { listener, home: { upgrades } }: BuildContext): void {
  const plan = MARKET_PLAN.household;
  const stall = zone.placeAt(new MarketStall({ sign: plan.sign, cloth: plan.cloth, seed: 17 }), plan.at);
  zone.place(new Vendor({
    viewer: listener,
    seed: 41,
    lines: [
      'Furniture for the flat! Bookcases for your games, a lamp, a rug, a telly for the kitchen.',
      "The bookcases flat-pack. They'll be standing in your bedroom by the time you're home.",
      'Everything here is one of a kind. Bar the bookcases, I get those by the lorry.',
    ],
    callOuts: ['Furniture! Lamps!', 'Bookcases here!'],
  }), zone.toLocal(stall.localToWorld(new THREE.Vector3(stall.vendorAt[0], 0, stall.vendorAt[1]))), stall.rotation.y);
  if (!upgrades) return;
  const goodOf = (id: string) => HOME_GOODS.find((g) => g.id === id);
  const owned = (id: string) => !upgrades.canBuy(id as HomeUpgrade);
  const items: HomeGoodsItem[] = homeGoodsItems({
    label: (id) => {
      const good = goodOf(id);
      return good ? `${good.name} — ${good.price} coins · ${good.blurb} · click to buy` : '';
    },
    onActivate: (id, session) => {
      const good = goodOf(id);
      if (!good) return;
      if (owned(id)) {
        session.hint(`You have the ${good.name.toLowerCase()} already.`);
        return;
      }
      session.buyUpgrade({ title: good.name, price: good.price, bought: () => upgrades.add(good.id) });
    },
  }).filter((item) => goodOf(item.goodsId));
  for (const item of items) {
    const at = item.offset.clone().add(new THREE.Vector3(0, stall.topHeight + 0.012, 0.1));
    zone.place(item, zone.toLocal(stall.localToWorld(at)), stall.rotation.y);
  }
  followUpgrades(zone, upgrades, () => {
    for (const item of items) item.setAvailable(!owned(item.goodsId));
  });
}
