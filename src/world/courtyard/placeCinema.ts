import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import type { Vec2 } from '../street/streetPlan';
import type { Game } from '@/catalog/types';
import { StockItem } from '@/economy/StockItem';
import { seasonOf } from '@/time/season';
import { ForSaleBox } from '../market/ForSaleBox';
import { COURTYARD_YARD, COURTYARD_PLAN } from './courtyardPlan';
import { YardCinema } from './YardCinema';

type CinemaContext = Pick<BuildContext, 'cssLayer' | 'listener' | 'acoustics' | 'sky' | 'today' | 'home' | 'panels' | 'notices' | 'social' | 'covers' | 'collection' | 'money' | 'market'>;

/** Where a game left after the film comes from, for the receipt. */
const WHERE = 'a neighbour, after the film night';

/**
 * The film night (`YardCinema`, `building/yardCinema`): `COURTYARD_PLAN.cinema` turned zone-local, the flat's projector
 * as its prerequisite, the sheet's click opening the film's pick (`WorldPanels.screening`), and what a friend leaves on
 * their chair after it: a game out of their cupboard the player does not have, free (a `ForSaleBox`, as the bulky
 * waste's finds).
 */
export function placeCinema(zone: Zone, ctx: CinemaContext, at: (p: Vec2, y?: number) => THREE.Vector3): YardCinema {
  const plan = COURTYARD_PLAN.cinema;
  const wallX = COURTYARD_YARD.setts.x0;
  const upgrades = ctx.home.upgrades;
  const season = seasonOf(ctx.today.realDate()).name;
  const { panels, sky } = ctx;
  // The game left on a chair and not taken yet: the yard unloading with it there (or before it was set down), it is
  // brought up to the flat instead (`isLoaded` stays true once the module is fetched: the zone's own unload says it).
  let unloaded = false;
  let left: { game: Game; from: string } | null = null;
  const bringUp = ({ game, from }: { game: Game; from: string }): void => {
    left = null;
    const taken = ctx.market.lots?.tx.takeFind(new StockItem(game, 'worn', 'bin', { list: 0, final: true }), WHERE);
    if (taken?.ok) ctx.notices.slip({ title: `${game.title} came up`, detail: `${from} brought up what was left on the chair` });
  };
  zone.onUnload(() => {
    unloaded = true;
    if (left) bringUp(left);
  });
  return zone.place(
    new YardCinema({
      host: zone,
      spots: {
        sheet: at([wallX, plan.sheet.z]),
        sheetYaw: 0,
        cloth: { off: plan.sheet.off, width: plan.sheet.width, top: plan.sheet.top, bottom: plan.sheet.bottom, picture: plan.sheet.picture, pictureY: plan.sheet.pictureY },
        rollY: plan.rollY,
        stack: at([wallX, plan.stack]),
        table: at(plan.table.at),
        tableYaw: plan.table.yaw,
        chairs: plan.chairs.map((c) => at(c)),
        chairYaw: -Math.PI / 2,
        path: plan.path.map((p) => at(p)),
        lead: plan.lead.map((p) => at(p)),
      },
      viewer: ctx.listener,
      cssLayer: ctx.cssLayer,
      acoustics: ctx.acoustics,
      sky: () => sky.dayNight.state,
      today: ctx.today,
      projector: { has: () => upgrades?.has('projector') ?? false, subscribe: (cb) => upgrades?.subscribe(cb) ?? (() => {}) },
      cold: season === 'winter' || season === 'autumn',
      pickFilm: (session) => {
        if (panels.screening) session.openPanel(panels.screening);
      },
      notices: ctx.notices,
      ...(ctx.social ? { social: ctx.social } : {}),
      onGift: (seat, viewer) => {
        void ctx.market.stock
          .randomGames(`cinema-gift:${ctx.today.gameDay}:${viewer.k}:${viewer.i}`, 8)
          .catch(() => [])
          .then((games) => {
            const game = games.find((g) => !ctx.collection.owns(g.id));
            if (!game) return;
            if (unloaded) return bringUp({ game, from: viewer.name });
            left = { game, from: viewer.name };
            const find = new ForSaleBox(new StockItem(game, 'worn', 'bin', { list: 0, final: true }), ctx.covers, {
              pose: { kind: 'flat' },
              tag: false,
              wallet: ctx.money.wallet,
              where: WHERE,
              free: true,
              isWanted: () => ctx.collection.isWanted(game.id),
              thanks: () => `Left on the chair by ${viewer.name}.`,
            });
            find.onSold = () => {
              left = null;
              zone.remove(find);
            };
            zone.place(find, seat, -Math.PI / 2);
          });
      },
    }),
    new THREE.Vector3(),
  );
}
