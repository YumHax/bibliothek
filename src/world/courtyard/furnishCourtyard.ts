import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { CrowdMurmur } from '@/audio/CrowdMurmur';
import { pointsPerTicket } from '@/economy/pricing';
import type { Zone } from '../zone/Zone';
import type { Furniture } from '../Furniture';
import { disposeTree } from '../props/Prop';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { StreetLighting } from '../street/StreetLighting';
import { SkyDome } from '../street/SkyDome';
import { Buildings } from '../street/Buildings';
import { FacadeRelief } from '../street/relief/FacadeRelief';
import { StreetTrees } from '../street/StreetTrees';
import { StreetBounds } from '../street/StreetBounds';
import { Precipitation } from '../street/Precipitation';
import { FACADES, type Vec2 } from '../street/streetPlan';
import { Courtyard } from '../outlook/Courtyard';
import { COURTYARD_YARD } from '../outlook/outlookPlan';
import { TravelDoor } from '../travel/TravelDoor';
import { Plant } from '../props/Plant';
import { pointSound } from '../build/hearing';
import { ShopRadio } from '../shop/shopSounds';
import { whileHome } from '../stairwell/stairSounds';
import { doorKey } from '../stairwell/building';
import { ArcadeCabinet } from '../arcade/ArcadeCabinet';
import { ARCADE_GAMES, type ArcadeGame, type GameContext } from '../arcade/games';
import { buildingWindowLife } from '@/building/rearWindows';
import { PARTY, isPartyDay, partyGuests, partyStage, recordTournamentPlay, residentScores, tournamentGame, tournamentOf } from '@/building/neighboursParty';
import { befriend } from '@/building/friendship';
import { COURTYARD_CENTRE, COURTYARD_PLAN as plan, inYard } from './courtyardPlan';
import { YARD_DOOR_COLOUR } from './courtyardDoor';
import { StringLights } from './StringLights';
import { PartySaleTable, PartyTable } from './PartyTable';
import { PartyScores } from './PartyScores';
import { NeighboursParty } from './NeighboursParty';
import { YardBounds, binBags } from './YardBounds';
import { courtyardDressers } from './huntHook';

const ANISOTROPY = 8;
/** The facades round the yard (`streetPlan`'s ids): our back and its light well, the rear building, the neighbour's wing. */
const AROUND = ['oursBack', 'oursBackW', 'oursWell', 'oursWellE', 'oursWellW', 'courtRear', 'courtEast'];
/** What the residents' chat raises their friendship by, once a party. */
const PARTY_CHAT = 6;

/**
 * Builds our block's courtyard into its zone, walked (`COURTYARD_PLAN`): the yard the stairwell's windows look down
 * on, built from the same plan and the same street classes (`Courtyard`'s setts, lawn, bins, shed, rack, sandpit and
 * bikes, the chestnut, the facades round it with their night windows and the lives behind them, `building/rearWindows`),
 * under the street's own outdoor rig (sun and its shadow, the sky's ambient, the dome, the rain), with the concierge's
 * pots by our back door and the bags out on bin day. On a party day (`building/neighboursParty`) the trestle tables,
 * the residents' sale table, the old cabinet of the tournament and the bulbs are set out from the afternoon, and the
 * residents come down in the evening (`NeighboursParty`). The street's classes are built in the street's frame and
 * placed at `-COURTYARD_CENTRE`; the rig, the dome and the rain follow the camera from the zone's origin.
 */
export function furnishCourtyard(zone: Zone, ctx: BuildContext): ZoneHandle {
  const { sky, listener, today } = ctx;
  const { dayNight } = sky;
  const origin = new THREE.Vector3();
  const street = new THREE.Vector3(-COURTYARD_CENTRE[0], 0, -COURTYARD_CENTRE[1]);
  const at = (p: Vec2, y = 0): THREE.Vector3 => {
    const [x, z] = inYard(p);
    return new THREE.Vector3(x, y, z);
  };
  const hours = () => dayNight.state.hours;

  // Light, sky, the yard and the buildings round it.
  const lighting = zone.place(
    new StreetLighting(dayNight, listener, (out) => sky.outdoors.lightDirection(dayNight.state, out), { shadowMapSize: Math.min(2048, QUALITY.shadowMapSize * 2), shadowReach: 20 }),
    origin,
  );
  zone.place(new SkyDome(dayNight, listener), origin);
  zone.place(new Courtyard(dayNight, ANISOTROPY), street);
  const facades = FACADES.filter((f) => AROUND.includes(f.id));
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours });
  const buildings = zone.place(new Buildings(facades, dayNight, { detailScale: QUALITY.level === 'low' ? 0.8 : 1.3, anisotropy: ANISOTROPY, shopGoods: null, nightScale: QUALITY.level === 'high' ? 0.5 : 0.25, windowLife }), street);
  zone.place(new FacadeRelief(buildings.fronts), street);
  zone.place(new StreetTrees(dayNight, [COURTYARD_YARD.chestnut]), street);
  zone.place(new Precipitation(dayNight), origin);
  zone.place(new StreetBounds(facades), street);
  zone.place(new YardBounds(plan.trunk.radius), street);

  // Our back door, back into the entrance hall.
  const { backDoor } = plan;
  zone.place(new TravelDoor({ style: 'panelled', width: backDoor.width, height: backDoor.height, leafColor: YARD_DOOR_COLOUR, label: 'The entrance hall · go in', to: 'stairwell' }), at([backDoor.at[0], backDoor.at[1] - 0.005]), Math.PI);
  // The concierge's pots by it, and the bags by the bins on bin day.
  for (const pot of plan.pots) zone.place(new Plant({ kind: pot.kind, pot: 'terracotta', seed: pot.seed }), at(pot.at));
  if (today.gameDay % plan.binDay.every === plan.binDay.phase) zone.place(binBags(plan.binDay.bags), street);

  // What other features put in the yard (the treasure hunt's carving in the chestnut).
  const { chestnut } = plan.huntSpots;
  for (const dress of courtyardDressers()) dress(zone, { chestnut: { at: at(chestnut.at, chestnut.y), yaw: chestnut.yaw } });

  // The neighbours' party, on its day; set out or cleared away when the day turns with the player in the yard.
  let party: Furniture[] | null = null;
  const setOut = (day: number): void => {
    const due = isPartyDay(day, today.realDate());
    if (party && !due) {
      for (const item of party) {
        zone.remove(item);
        item.dispose?.();
        disposeTree(item);
      }
      party = null;
    } else if (!party && due) party = placeParty(zone, ctx, day, at);
  };
  setOut(today.gameDay);
  zone.onUnload(today.onNewGameDay(setOut));

  const lawn = COURTYARD_YARD.lawn;
  return {
    lightLevel: () => lighting.lightLevel(),
    surfaceAt: (local) => {
      const x = local.x + COURTYARD_CENTRE[0];
      const z = local.z + COURTYARD_CENTRE[1];
      return x > lawn.x0 && x < lawn.x1 && z > lawn.z0 && z < lawn.z1 ? 'grass' : 'stone';
    },
  };
}

/** The party's tables, the residents' sale, the tournament's cabinet, the bulbs, the guests, its radio and chatter: what it placed. */
function placeParty(zone: Zone, ctx: BuildContext, day: number, at: (p: Vec2, y?: number) => THREE.Vector3): Furniture[] {
  const { sky, listener, acoustics, today, input, panels, money, home } = ctx;
  const placed: Furniture[] = [];
  const put = <F extends Furniture>(item: F, position: THREE.Vector3, yaw?: number): F => {
    placed.push(item);
    return zone.place(item, position, yaw);
  };
  const { party } = plan;
  const hours = () => sky.dayNight.state.hours;
  const stage = () => partyStage(today.gameDay, hours(), today.realDate());
  const dishes = [0xd8c8a0, 0x8a3a2a, 0x3a6a3a, 0xe8e2d4, 0x6a4a8a, 0xc87a2a];
  party.tables.forEach((t, i) => put(new PartyTable({ cloth: i % 2 ? 0xf2efe6 : 0xe9d9a8, dishes: dishes.slice(i * 3, i * 3 + 3) }), at(t.at), t.yaw));
  put(new PartySaleTable({ ...(panels.partySale ? { panel: panels.partySale } : {}) }), at(party.sale.at), party.sale.yaw);
  const strings = put(new StringLights(party.strings), new THREE.Vector3(-COURTYARD_CENTRE[0], 0, -COURTYARD_CENTRE[1]));

  // The tournament: the evening's game on the old cabinet, a few plays each, the residents' scores on its table.
  const gameId = tournamentGame(day);
  const make: (context: GameContext) => ArcadeGame = ARCADE_GAMES[gameId];
  const game = make({});
  const ppt = pointsPerTicket(game.id);
  const scores = new PartyScores(game.id, residentScores(day, ppt));
  const { plays, prize } = PARTY.tournament;
  const cabinet = put(
    new ArcadeCabinet(game, input, { color: 0x5a2a1a, glow: 0xffd27a, scores, nextPlayCost: () => 0, freePlay: true, pointsPerTicket: ppt, listener, glowLight: false, wear: 0.9, outOfOrder: () => tournamentOf(today.gameDay, today.realDate()).plays >= plays || stage() === 'none' }),
    at(party.cabinet.at),
    party.cabinet.yaw,
  );
  cabinet.stationEvents.onPlayerResult = (result) => {
    const before = tournamentOf(day, today.realDate());
    const won = result.score > scores.residentsBest;
    recordTournamentPlay(day, today.realDate(), won);
    if (won && !before.won) {
      money.wallet.addTickets(prize);
      home.household?.notices.reward({ title: 'Party tournament won!', detail: `You beat the residents’ best on ${game.title}: the kitty is yours.`, tickets: prize, big: true });
      for (const guest of partyGuests()) befriend(doorKey(guest.k, guest.i), 2, 'partyTournament', day);
    } else if (before.plays + 1 >= plays) {
      home.household?.notices.react(won || before.won ? 'That’s your three goes. Champion of the courtyard!' : `That’s your three goes. ${scores.topOf(game.id).name} keeps the crown tonight.`);
    }
  };

  // The guests come down in the evening; the bulbs and the lamp come up with them.
  const guests = partyGuests();
  const party_ = put(
    new NeighboursParty({
      host: zone,
      viewer: listener,
      stage,
      spots: party.guests.map((g) => ({ at: at(g.at), yaw: g.yaw })),
      strings,
      lamp: { at: at([party.lamp.at[0], party.lamp.at[2]], party.lamp.at[1]), intensity: party.lamp.intensity, distance: party.lamp.distance, color: party.lamp.color },
      onChat: (i) => {
        const guest = guests[i];
        if (guest) befriend(doorKey(guest.k, guest.i), PARTY_CHAT, 'partyChat', today.gameDay);
      },
    }),
    new THREE.Vector3(),
  );
  // A radio on the first table, and the chatter round it, while the residents are down.
  const hearing = { listener, acoustics };
  const [rx, ry, rz] = party.radio;
  const radioAt = at([rx, rz], ry);
  put(pointSound(hearing, whileHome(new ShopRadio(), () => party_.isOn), { referenceDistance: 2, rolloff: 1, maxDistance: 18 }), radioAt);
  put(pointSound(hearing, whileHome(new CrowdMurmur(), () => party_.isOn), { referenceDistance: 3, rolloff: 0.8, maxDistance: 20 }), radioAt.clone().setY(1.5));
  return placed;
}
