import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { HOME_GOODS, boughtLine, refusalFor } from '@/economy/homeGoods';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import { followUpgrades } from '../build/follow';
import { Vendor } from '../people/Vendor';
import { MarketStall } from './MarketStall';
import { homeGoodsItems, type HomeGoodsItem } from './HomeGoodsDisplay';
import { MARKET_PLAN } from './marketPlan';
import { RecordCrate } from '../vinyl/RecordCrate';
import { RECORDS } from '@/vinyl/records';

/**
 * The household stall: furniture for the flat (`HOME_GOODS`), bought like anywhere else (`SessionActions.buyUpgrade`:
 * a dear piece takes a second click); one-offs vanish once there is no room at home for another, a piece whose
 * companion is not bought yet says so.
 */
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
    label: 'The stallholder · chat',
  }), zone.toLocal(stall.localToWorld(new THREE.Vector3(stall.vendorAt[0], 0, stall.vendorAt[1]))), stall.rotation.y);
  if (!upgrades) return;
  const goodOf = (id: string) => HOME_GOODS.find((g) => g.id === id);
  const status = (id: string) => upgrades.status(id as HomeUpgrade);
  const items: HomeGoodsItem[] = homeGoodsItems({
    label: (id) => {
      const good = goodOf(id);
      if (!good) return '';
      const head = `${good.name} · ${good.price} coins`;
      return status(id) === 'needs' ? `${head} · needs the ${HOME_GOODS.find((g) => g.id === good.requires)?.name.toLowerCase() ?? 'rest'} first` : `${head} · ${good.blurb} · buy`;
    },
    onActivate: (id, session) => {
      const good = goodOf(id);
      if (!good) return;
      const refusal = refusalFor(good, status(id));
      if (refusal) {
        session.refuse(refusal);
        return;
      }
      session.buyUpgrade({ title: good.name, price: good.price, detail: boughtLine(good), bought: () => upgrades.add(good.id) });
    },
  }).filter((item) => goodOf(item.goodsId));
  for (const item of items) {
    const at = item.offset.clone().add(new THREE.Vector3(0, stall.topHeight + 0.012, 0.1));
    zone.place(item, zone.toLocal(stall.localToWorld(at)), stall.rotation.y);
  }
  followUpgrades(zone, upgrades, () => {
    for (const item of items) item.setAvailable(status(item.goodsId) !== 'full');
  });
  furnishRecordCrate(zone, stall, upgrades);
}

/** The crate of soundtrack LPs by the stall: the next record for the flat's turntable, one click each (`world/vinyl`). */
function furnishRecordCrate(zone: Zone, stall: MarketStall, upgrades: NonNullable<BuildContext['home']['upgrades']>): void {
  const good = HOME_GOODS.find((g) => g.id === 'record');
  if (!good) return;
  const nextRecord = () => RECORDS[upgrades.count('record')] ?? null;
  const crate = new RecordCrate({
    label: () => {
      const status = upgrades.status('record');
      if (status === 'full') return 'Soundtrack LPs · you have every one they had';
      const next = nextRecord();
      const head = `${next?.title ?? good.name} (${next?.artist ?? 'LP'}) · ${good.price} coins`;
      return status === 'needs' ? `${head} · needs a sideboard and its turntable first` : `${head} · buy`;
    },
    onActivate: (session) => {
      const refusal = refusalFor(good, upgrades.status('record'));
      if (refusal) return session.refuse(refusal);
      const next = nextRecord();
      session.buyUpgrade({ title: next ? `${next.title} (LP)` : good.name, price: good.price, detail: 'It is at home by the turntable. Click the turntable to put it on.', bought: () => upgrades.add('record') });
    },
  });
  const [x, z] = MARKET_PLAN.household.recordCrate;
  zone.place(crate, zone.toLocal(stall.localToWorld(new THREE.Vector3(x, 0, z))), stall.rotation.y);
  followUpgrades(zone, upgrades, () => crate.show(nextRecord()));
}
