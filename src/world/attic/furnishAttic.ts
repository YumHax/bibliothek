import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { SessionActions } from '@/game/SessionActions';
import { SEED_GAMES } from '@/catalog';
import { gameIdFor } from '@/catalog/nointro';
import { GRAILS, grailGame } from '@/economy/grails';
import { StockItem } from '@/economy/StockItem';
import { MusicUpstairs } from '@/audio/throughFloor';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { ArcadeCabinet } from '../arcade/ArcadeCabinet';
import { ForSaleBox } from '../market/ForSaleBox';
import { Cobweb } from '../props/Cobweb';
import { Crate } from '../props/Crate';
import { Rug } from '../props/Rug';
import { pointSound } from '../build/hearing';
import { whileHome } from '../stairwell/stairSounds';
import { ATTIC_PLAN as plan } from './atticPlan';
import { atticState, markAttic } from './atticState';
import { AtticShell } from './AtticShell';
import { AtticLights } from './AtticLights';
import { AtticLift } from './AtticLift';
import { AtticDoor } from './AtticDoor';
import { HatchLadder, ServiceWardrobe } from './AtticFixtures';
import { CollectorDesk, DustMotes, DustyShelf, MagazineCover, SheetedFurniture } from './collectorProps';
import { CombinationChest } from './CombinationChest';
import { Starfall } from './Starfall';
import { CollectorScores } from './collectorScores';

/** The student's music, behind room 6: afternoons and late into the night (the flat hears it through its ceiling on his loud nights). */
const STUDENT_HOURS = { from: 14, to: 25.5 };
/** What his prize or his chest pays instead when the player has that game already (coins). */
const ALREADY_OWNED_COINS = { prize: 600, chest: 300 };

/**
 * Builds the attic from `ATTIC_PLAN`: the shell (the corridor, the collector's room under the
 * slope), its light (bare bulbs, the collector's lamp, the sky through the roof windows), the top of
 * the old lift that brought the player up (and takes them down to our landing), the maids' rooms'
 * doors along the corridor (the student's music behind No 6), the wardrobe across the service stair,
 * the ladder to the roof hatch; and the collector's room: his prototype cabinet STARFALL (free play,
 * his scores to beat: the first best over his pays his prize once, a grail left in the coin box),
 * his sheeted furniture, shelf, framed covers and the notebook on his desk, the trunk with its
 * four-wheel padlock (`chest.code`, the treasure hunt's end: a game sealed since 1991), dust in the
 * light. A zone reached by travel only (the lift's code; the roof's hatch back down).
 */
export function furnishAttic(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, acoustics, input, covers, money, arcade, collection, home } = ctx;
  const notices = home.household?.notices;
  const origin = new THREE.Vector3();
  const shell = zone.place(new AtticShell(), origin);
  const lights = zone.place(new AtticLights(sky.dayNight, shell.skyGlass), origin);

  // The lift that came up: it opens on arrival; its one button goes back down.
  const lift = zone.place(
    new AtticLift(zone.collisions, listener, () => {
      if (atticState().found) return;
      markAttic('found');
      notices?.react('The gate folds open on a corridor nobody has swept in years. Somewhere a radio, or a bass line.');
    }),
    origin,
  );
  zone.place(lift.button, lift.button.position.clone(), lift.button.rotation.y);

  // The corridor: the maids' rooms, the service stair behind its wardrobe, the ladder to the roof.
  const { corridor } = plan;
  const hours = (): number => sky.dayNight.state.hours;
  const studentIn = (): boolean => {
    const h = hours();
    return (h >= STUDENT_HOURS.from && h < STUDENT_HOURS.to) || h + 24 < STUDENT_HOURS.to;
  };
  for (const door of plan.doors) {
    const back = door.side === 'back';
    const z = back ? corridor.z0 : corridor.z1;
    zone.place(new AtticDoor(door), new THREE.Vector3(door.x, 0, z), back ? 0 : Math.PI);
    if (door.music) {
      const music = whileHome(new MusicUpstairs(), studentIn);
      zone.place(pointSound({ listener, acoustics }, music, { referenceDistance: 0.7, rolloff: 1.3, maxDistance: 7 }), new THREE.Vector3(door.x, 1.2, z + (back ? -1.2 : 1.2)));
    }
  }
  zone.place(new ServiceWardrobe(plan.serviceStair.label, plan.serviceStair.line), new THREE.Vector3(plan.serviceStair.x, 0, corridor.z0 + 0.27));
  const { hatch } = plan;
  zone.place(
    new HatchLadder(plan.corridorHeight, hatch, (session) => {
      session.react('You draw the bolt and push. Cold air, the sound of the city, pigeons scattering.');
      session.travel('roof');
    }),
    new THREE.Vector3(hatch.x, 0, corridor.z1),
    Math.PI,
  );
  zone.place(new Crate({ style: 'cardboard', stack: 2, seed: 61, label: 'BONNE 4' }), new THREE.Vector3(-0.9, 0, corridor.z1 - 0.25));

  // The collector's room.
  const room = plan.collectorRoom;
  zone.place(new Rug({ width: 2, depth: 1.4, field: 0x5a2a2a, border: 0x9a8a6a, motif: 0x6a3a32 }), new THREE.Vector3(-3.2, 0, 0.6));
  for (const s of plan.sheeted) zone.place(new SheetedFurniture(s.kind), new THREE.Vector3(s.at[0], 0, s.at[1]), s.yaw);
  zone.place(new DustyShelf(plan.shelf.width, plan.shelf.rows), new THREE.Vector3(plan.shelf.at[0], 0, plan.shelf.at[1]), plan.shelf.yaw);
  plan.covers.forEach((z, i) => zone.place(new MagazineCover(i), new THREE.Vector3(room.x1 - 0.05 - 0.002, 1.55, z), -Math.PI / 2));
  zone.place(new CollectorDesk(plan.notebook), new THREE.Vector3(plan.desk.at[0], 0, plan.desk.at[1]), Math.PI);
  zone.place(new Cobweb({ size: 0.5, spread: 'right', seed: 3 }), new THREE.Vector3(room.x0 + 0.01, plan.roomHeight, room.z0 + 0.01), 0);
  zone.place(new Cobweb({ size: 0.4, spread: 'left', seed: 9 }), new THREE.Vector3(room.x1 - 0.06, plan.roomHeight, room.z0 + 0.01), 0);
  zone.place(new DustMotes(2.4, 1.2, 2.2), new THREE.Vector3(-3.2, 0.1, 2.9));

  // His cabinet, his table; beating his best leaves his prize in the coin box (once).
  const table = new CollectorScores(arcade.scores, plan.collector);
  const game = new Starfall();
  const cabinet = zone.place(
    new ArcadeCabinet(game, input, {
      color: plan.cabinet.color,
      glow: plan.cabinet.glow,
      scores: table,
      nextPlayCost: () => 0,
      atHome: true,
      // At home it pays no tickets, so it shows none either.
      pointsPerTicket: 0,
      listener,
      glowLight: false,
      wear: 0.85,
    }),
    new THREE.Vector3(plan.cabinet.at[0], 0, plan.cabinet.at[1]),
    Math.PI / 2,
  );
  const purse = money.purse;
  const giveGame = (game: Game, where: string, at: THREE.Vector3, yaw: number, coinsInstead: number, done: () => void, said: string): void => {
    if (collection.owns(game.id)) {
      // He had one: the club pays for his copy instead.
      purse?.earnCoins(coinsInstead);
      done();
      notices?.reward({ title: `${game.title}, ${where}`, detail: `You have one already: the collectors' club pays for this one.`, coins: coinsInstead });
      return;
    }
    const gift = new StockItem(game, 'complete', 'grail', { list: 0, final: true });
    const box = new ForSaleBox(gift, covers, { pose: { kind: 'flat' }, tag: false, wallet: money.wallet, where, isWanted: () => collection.isWanted(gift.game.id), thanks: () => said });
    box.onSold = () => {
      zone.remove(box);
      done();
    };
    zone.place(box, at, yaw);
  };
  let prizeOut = false;
  const offerPrize = (): void => {
    if (prizeOut || atticState().prize || table.bestOf(game.id) <= table.hisBest) return;
    prizeOut = true;
    const grail = GRAILS.find((g) => g.libretroName === plan.prize.libretroName);
    const prize = grail ? grailGame(grail) : { id: gameIdFor(plan.prize.platform, plan.prize.libretroName), title: plan.prize.title, platform: plan.prize.platform, status: 'owned' as const, externalIds: { libretroName: plan.prize.libretroName } };
    // On the floor in front of the cabinet, slid out of its coin door.
    const at = zone.toLocal(cabinet.localToWorld(new THREE.Vector3(0.12, 0.002, 0.42)));
    notices?.react(`The coin door clicks open by itself. Inside: ${prize.title}. “For whoever beats me. A.V.”`);
    giveGame(prize, plan.prize.where, at, cabinet.rotation.y + 0.3, ALREADY_OWNED_COINS.prize, () => markAttic('prize'), 'He would have liked that.');
  };
  offerPrize();
  zone.onUnload(arcade.scores.subscribe(offerPrize));

  // His trunk: the padlock's four wheels (placed on their own, to be clicked one by one), the sealed game inside.
  const chestAt = new THREE.Vector3(plan.chest.at[0], 0, plan.chest.at[1]);
  const chestYaw = 0;
  const sealed = sealedGame();
  const chest = zone.place(
    new CombinationChest(
      plan.chest.code,
      (session: SessionActions) => {
        session.react('The padlock springs. Inside, under a moth-eaten blanket, still in its shrink-wrap…');
        const at = chestAt.clone().add(new THREE.Vector3(0, 0.36, 0.02));
        giveGame(sealed, plan.chest.game.where, at, chestYaw, ALREADY_OWNED_COINS.chest, () => markAttic('chest'), 'Sealed since 1991. Now it is yours.');
      },
      atticState().chest,
    ),
    chestAt,
    chestYaw,
  );
  for (const wheel of chest.wheels) zone.place(wheel, chestAt.clone().add(wheel.position.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, chestYaw)), chestYaw);

  return { lightLevel: () => lights.lightLevel, surfaceAt: (local) => (local.x < room.x1 ? 'wood' : 'tiles') };
}

/** The game sealed in the collector's chest (`ATTIC_PLAN.chest.game`), with his note under the wrap. */
function sealedGame(): Game {
  const { platform, libretroName, title } = plan.chest.game;
  const id = gameIdFor(platform, libretroName);
  const known = SEED_GAMES.find((g) => g.id === id);
  return {
    ...(known ?? { id, title, platform, externalIds: { libretroName } }),
    status: 'owned',
    variant: 'sealed',
    past: { kind: 'note', text: 'Under the shrink-wrap, a slip of paper: “For whoever found the buttons. A.V., 24.12.1991.”' },
  };
}

