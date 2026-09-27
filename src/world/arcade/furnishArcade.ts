import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { furnishShell } from '../shell';
import { placeWith } from '../zone/attach';
import { FlushLamp } from '../props/FlushLamp';
import { TiledWainscot } from '../props/TiledWainscot';
import { placeDecor } from '../props/decor';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { Walker } from '../people/Walker';
import { TICKETS_PER_COIN, TOURNAMENT, pointsPerTicket } from '@/economy/pricing';
import { PRIZES } from '@/economy/Prizes';
import { ArcadeCabinet } from './ArcadeCabinet';
import { ArcadeHall } from './ArcadeHall';
import { hallStores } from './hallStores';
import { TournamentBoard } from './TournamentBoard';
import { TournamentTopper } from './TournamentTopper';
import { PrizeCounter } from './PrizeCounter';
import { ScoreBoard } from './ScoreBoard';
import { ChallengeBoard } from './ChallengeBoard';
import { LeagueBoard } from './LeagueBoard';
import { ChangeMachine } from './ChangeMachine';
import { Jukebox } from './Jukebox';
import { ArcadeCrowd, type CrowdStation } from './ArcadeCrowd';
import { ArcadeAmbience } from './ArcadeAmbience';
import { LightGun } from './LightGun';
import { DancePad } from './DancePad';
import { MedalRow } from './MedalRow';
import { InstructionCard } from './InstructionCard';
import { GlowPool } from './GlowPool';
import type { CabinetAttachment } from './CabinetAttachment';
import type { Station } from './Station';
import { ARCADE_GAMES, type ArcadeGame, StepBeat } from './games';
import { type MachineContext, buildMachine } from './machineKinds';
import { ARCADE_PLAN, BREAKABLE } from './arcadePlan';
import { LightPool } from '../lighting/LightPool';

/**
 * Builds the arcade into its zone from `ARCADE_PLAN`: the dim shell (carpet, tiled dado, a fixed
 * daylight: no windows), its switched-off house lights, the cabinets (the classics, LexiPunk in
 * its big frame, the two-player PADDLE WARS, the light gun and the dance pad), the physical
 * machines (`plan.machines` through `MACHINE_KINDS`: the pinball, the claw, the ball alley, the
 * hoops, the ticket wheel; all paid plays through the Session), the prize counter with its
 * attendant, the hall of fame, the challenge board and the weekly league, the change machine,
 * the jukebox, the exit door, the neon, ceiling and notices, the hall's hum, and the people:
 * regulars who come and go between the free machines and a kid who watches and takes player two.
 * The day's rules (prices, the challenge, the machine out of order, the evening crowd, the
 * attendant's news) are the `ArcadeHall`'s; the long-lived stores come from the context
 * (`hallStores`). Wiring only.
 */
export function furnishArcade(zone: Zone, { sky, input, listener, money: { wallet }, arcade }: BuildContext): ZoneHandle {
  const { scores, daily: arcadeDaily, medals: arcadeMedals, league: arcadeLeague, screen: arcadeScreen } = arcade;
  const { tournament, jackpot, replays } = hallStores(arcade);
  const plan = ARCADE_PLAN;
  const { crowd } = plan;
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: plan.daylight });
  room.setSkylight(plan.skylight);
  // The dado wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());
  zone.placeAt(new FlushLamp({ on: false, onSwitch: (on) => room.setLampOn(on) }), plan.light);

  // The day's rules every paid machine asks: the next play's price, today's challenge, whether it works today.
  const hall = zone.place(
    new ArcadeHall({
      wallet,
      scores,
      ...(arcadeDaily ? { daily: arcadeDaily } : {}),
      ...(arcadeLeague ? { league: arcadeLeague } : {}),
      tournament,
      jackpot,
      breakable: BREAKABLE,
      hours: () => sky.dayNight.state.hours,
      byHour: crowd.regulars.byHour,
      boardLines: crowd.boardLines,
    }),
    new THREE.Vector3(),
  );
  const nextPlayCost = (): number => hall.nextPlayCost();

  // Where the crowd's regulars may play, and which game each one runs (for their scores).
  const stations: CrowdStation[] = [];
  const gameOf = new Map<Station, string>();
  const addStation = (station: Station, gameId: string, watchAt?: [number, number]): number => {
    gameOf.set(station, gameId);
    return stations.push({ station, ...(watchAt ? { watchAt } : {}) }) - 1;
  };
  const cabinets = plan.cabinets.map((c) => {
    const game: ArcadeGame = ARCADE_GAMES[c.game]({ remoteScreen: arcadeScreen ?? null });
    let attachment: CabinetAttachment | undefined;
    if (c.attachment === 'gun') attachment = new LightGun({ listener });
    if (c.attachment === 'pad') attachment = new DancePad({ centreZ: plan.padCentreZ, ...(game instanceof StepBeat ? { glow: (lane) => game.panelGlow(lane) } : {}) });
    const cabinet = zone.placeAt(
      new ArcadeCabinet(game, input, {
        color: c.color,
        glow: c.glow,
        scores,
        nextPlayCost,
        pointsPerTicket: pointsPerTicket(game.id),
        challenge: hall.challengeFor(game.id),
        listener,
        replays,
        ...(arcadeMedals ? { medals: arcadeMedals } : {}),
        outOfOrder: hall.isBroken(game.id),
        ...(attachment ? { attachment } : {}),
        ...(c.glowLight === false ? { glowLight: false } : {}),
        ...(c.wear !== undefined ? { wear: c.wear } : {}),
      }),
      c.at,
    );
    if (game.demoable !== false) addStation(cabinet, game.id, c.watchAt);
    // A TOURNAMENT sign on its roof on the Saturdays it hosts the tournament.
    if (plan.tournament.games.includes(c.game)) {
      const topper = new TournamentTopper(() => tournament.isOn && tournament.gameId === game.id);
      topper.position.set(0, plan.tournament.topperY, 0);
      placeWith(zone, cabinet, topper);
    }
    return cabinet;
  });
  // Today's tournament cabinet (it can change at midnight while the hall stands), or null on other days.
  const tournamentCabinet = (): ArcadeCabinet | null => (tournament.isOn ? (cabinets.find((c) => c.game.id === tournament.gameId) ?? null) : null);

  // The physical machines, each with the printed card, medal lamps and pool of light its plan entry gives it (the cabinets carry their own).
  const context: MachineContext = { input, listener, scores, nextPlayCost, outOfOrder: (id) => hall.isBroken(id), jackpot };
  const startingStations: number[] = [];
  const machines = plan.machines.map((m) => {
    const machine = zone.placeAt(buildMachine(m.kind, context, m.options), m.at);
    const station = addStation(machine, machine.game.id, m.watchAt);
    if (m.regularAtStart) startingStations.push(station);
    if (m.card) {
      const card = new InstructionCard({ title: m.card.title ?? machine.game.title, lines: m.card.lines, accent: 0xff2fa0 });
      card.position.set(...m.card.at);
      machine.add(card);
    }
    if (m.medalsAt && arcadeMedals) {
      const row = new MedalRow(arcadeMedals, machine.game.id);
      row.position.set(...m.medalsAt);
      machine.add(row);
      zone.onUnload(() => row.dispose());
    }
    if (m.pool) machine.add(glowPool(m.pool));
    return { machine, table: m.table === true };
  });

  // The boards: every machine that keeps a table, the day's challenge, the weekly league.
  const tabled = [...cabinets.map((c) => c.game), ...machines.filter((m) => m.table).map((m) => m.machine.game)].map((g) => ({ id: g.id, title: g.title }));
  const everyGame = [...cabinets.map((c) => c.game), ...machines.map((m) => m.machine.game)];
  const titleOf = (id: string): string => everyGame.find((g) => g.id === id)?.title ?? id.toUpperCase();
  zone.placeAt(new ScoreBoard({ games: tabled, scores, width: plan.scoreBoard.width, height: plan.scoreBoard.height }), plan.scoreBoard.at);
  if (arcadeDaily) zone.placeAt(new ChallengeBoard({ challenge: () => arcadeDaily.challenge(), titleOf }), plan.challengeBoard);
  if (arcadeLeague) zone.placeAt(new LeagueBoard({ league: arcadeLeague, width: plan.leagueBoard.width, height: plan.leagueBoard.height }), plan.leagueBoard.at);

  // The counter, its prizes in the case and, behind it in its frame (so they face the hall with it), the attendant with the day's news.
  const forSale = PRIZES.filter((p) => p.tickets !== null).map((p) => ({ kind: p.kind, color: p.color }));
  const counter = zone.placeAt(new PrizeCounter({ ticketsPerCoin: TICKETS_PER_COIN, wallBehind: plan.counter.wallBehind, prizes: forSale }), plan.counter.at);
  const behind = counter.localToWorld(new THREE.Vector3(crowd.attendant.at[0], 0, crowd.attendant.at[1]));
  const attendantLines = hall.attendantLines(crowd.attendant.lines, titleOf, tabled);
  zone.place(new Vendor({ viewer: listener, lines: attendantLines, seed: crowd.attendant.seed, label: 'Click to chat with the attendant', focus: crowd.attendant.focus }), zone.toLocal(behind), counter.rotation.y);

  zone.placeAt(new ChangeMachine({ working: arcadeDaily?.changeMachineWorks ?? false }), plan.changeMachine);
  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'Click to go out to the street', to: 'street' }), plan.exit);
  const jukebox = zone.placeAt(new Jukebox({ listener, color: plan.jukebox.color, startStation: plan.jukebox.startStation }), plan.jukebox.at);
  jukebox.add(glowPool(plan.jukebox.pool));
  placeDecor(zone, plan.decor);

  // The people: regulars (out of the hall until they walk in) and the kid, directed by the crowd.
  const door = crowd.nav.find((n) => n.id === crowd.door)!.at;
  const regulars = crowd.regulars.seeds.slice(0, crowd.regulars.count).map((seed) =>
    zone.place(new Walker({ viewer: listener, seed, lines: crowd.regularLines, label: 'Click to chat with the regular' }), new THREE.Vector3(door[0], 0, door[1]), Math.PI),
  );
  const kidSpot = crowd.hangouts[0]!;
  const kid = zone.place(new Walker({ viewer: listener, seed: crowd.kid.seed, speed: 0.95, lines: crowd.kid.lines, label: 'Click to chat with the kid' }), new THREE.Vector3(kidSpot.at[0], 0, kidSpot.at[1]), kidSpot.yaw);
  const tabledIds = new Set(tabled.map((g) => g.id));
  const director = zone.place(
    new ArcadeCrowd({
      nav: crowd.nav,
      door: crowd.door,
      stations,
      regulars,
      kid,
      hangouts: crowd.hangouts,
      maxInside: () => hall.maxInside(),
      names: crowd.regulars.names,
      // A regular's game on a machine that keeps a table may sign it.
      onRegularScore: (station, score, name) => {
        const id = gameOf.get(station);
        return id && tabledIds.has(id) ? hall.regularScore(id, score, name) : null;
      },
      // Saturday: the tournament cabinet is left to the player, and regulars gather round it to watch.
      reserved: tournamentCabinet,
      gathering: () => {
        const cabinet = tournamentCabinet();
        if (!cabinet) return null;
        const spots = plan.tournament.spectators.map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, cabinet.rotation.y).add(cabinet.position).setY(0));
        return { spots, focus: cabinet.localToWorld(cabinet.focus.clone()) };
      },
      viewer: listener,
      toWorld: (p) => zone.toWorld(p),
    }),
    new THREE.Vector3(),
  );

  // The tournament's rounds are settled with the play (the Session's `ArcadePlay`); the watchers round the cabinet react.
  zone.onUnload(tournament.onRound((outcome) => director.spectatorsReact(outcome.won ? plan.tournament.cheers : plan.tournament.groans, outcome.won)));
  zone.placeAt(
    new TournamentBoard({
      tournament,
      entry: TOURNAMENT.entry,
      titleOf,
      width: plan.tournament.width,
      height: plan.tournament.height,
    }),
    plan.tournament.board,
  );
  zone.place(new ArcadeAmbience(() => director.inside / crowd.regulars.count), new THREE.Vector3(0, 1.5, 0));
  // The cabinets' screen glows and the claw machine's case light share a few real lights, lent to the nearest.
  zone.place(new LightPool(plan.glowLights, listener), new THREE.Vector3());
  // Someone is already on the machines the plan says when the player walks in.
  startingStations.forEach((station, regular) => director.seat(regular, station));
  return { room };
}

/** A plan's pool of light on the carpet in front of a machine (machine-local z), at its level. */
function glowPool(pool: { color: number; width: number; depth: number; z: number; level: number }): GlowPool {
  const glow = new GlowPool(pool.color, pool.width, pool.depth);
  glow.position.z = pool.z;
  glow.setLevel(pool.level);
  return glow;
}
