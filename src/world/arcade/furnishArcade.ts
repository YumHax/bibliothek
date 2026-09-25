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
import { PLAY_COST, TICKETS_PER_COIN, playIsFree, pointsPerTicket } from '@/economy/pricing';
import { PRIZES } from '@/economy/Prizes';
import { Jackpot } from '@/economy/Jackpot';
import { rivalScore } from '@/economy/rivals';
import { ArcadeTournament } from '@/economy/ArcadeTournament';
import { TOURNAMENT } from '@/economy/pricing';
import { ArcadeCabinet } from './ArcadeCabinet';
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
import { ReplayStore } from './replay/ReplayStore';
import type { CabinetAttachment } from './CabinetAttachment';
import type { Station } from './Station';
import { ARCADE_GAMES, type ArcadeGame, StepBeat } from './games';
import { type MachineContext, buildMachine } from './machineKinds';
import { ARCADE_PLAN, BREAKABLE } from './arcadePlan';

/** A regular's score may go on the table up to this much above the best starting rival (they play better than people). */
const RIVAL_CAP = 1.1;

/**
 * Builds the arcade into its zone from `ARCADE_PLAN`: the dim shell (carpet, tiled dado, a fixed
 * daylight: no windows), its switched-off house lights, the cabinets (the classics, LexiPunk in
 * its big frame, the two-player PADDLE WARS, the light gun and the dance pad), the physical
 * machines (`plan.machines` through `MACHINE_KINDS`: the pinball, the claw, the ball alley, the
 * hoops, the ticket wheel; all paid plays through the Session), the prize counter with its
 * attendant (who has a word about the day), the hall of fame, the challenge board and the weekly
 * league, the change machine (working or not, by the day), one machine out of order some days, the jukebox, the exit door, the neon, ceiling and notices, the
 * hall's hum, and the people: regulars who come and go between the free machines (more in the
 * evening) and sign the board when they play well, and a kid who watches and takes player two.
 */
export function furnishArcade(zone: Zone, { sky, input, listener, money: { wallet }, arcade: { scores, daily: arcadeDaily, medals: arcadeMedals, league: arcadeLeague, screen: arcadeScreen, tournament: ctxTournament } }: BuildContext): ZoneHandle {
  const plan = ARCADE_PLAN;
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: plan.daylight });
  room.setSkylight(plan.skylight);
  // The dado wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());
  zone.placeAt(new FlushLamp({ on: false, onSwitch: (on) => room.setLampOn(on) }), plan.light);

  // What every paid machine needs to know: the next play's price (broke: on the house), today's challenge, whether it works today.
  const nextPlayCost = (): number => (playIsFree(wallet) ? 0 : PLAY_COST);
  const challengeFor = (gameId: string) => () => {
    const challenge = arcadeDaily?.challenge();
    return challenge && challenge.gameId === gameId ? challenge : null;
  };
  // The Saturday tournament: one cabinet, the regulars on the sheet; that cabinet is never the one out of order.
  const tournament = ctxTournament ?? new ArcadeTournament({ games: plan.tournament.games, names: plan.crowd.regulars.names });
  const brokenToday = arcadeDaily?.outOfOrder(BREAKABLE) ?? null;
  const broken = tournament.isOn && brokenToday === tournament.gameId ? null : brokenToday;
  const isBroken = (id: string) => () => broken === id;
  const replays = new ReplayStore();

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
        challenge: challengeFor(game.id),
        listener,
        replays,
        ...(arcadeMedals ? { medals: arcadeMedals } : {}),
        outOfOrder: isBroken(game.id),
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
  const jackpot = new Jackpot();
  const context: MachineContext = { input, listener, scores, nextPlayCost, outOfOrder: isBroken, jackpot };
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
    if (m.pool) {
      const pool = new GlowPool(m.pool.color, m.pool.width, m.pool.depth);
      pool.position.z = m.pool.z;
      pool.setLevel(m.pool.level);
      machine.add(pool);
    }
    return { machine, table: m.table === true };
  });

  // The boards: every machine that keeps a table, the day's challenge, the weekly league.
  const tabled = [...cabinets.map((c) => c.game), ...machines.filter((m) => m.table).map((m) => m.machine.game)].map((g) => ({ id: g.id, title: g.title }));
  const everyGame = [...cabinets.map((c) => c.game), ...machines.map((m) => m.machine.game)];
  const titleOf = (id: string): string => everyGame.find((g) => g.id === id)?.title ?? id.toUpperCase();
  zone.placeAt(new ScoreBoard({ games: tabled, scores, width: plan.scoreBoard.width, height: plan.scoreBoard.height }), plan.scoreBoard.at);
  if (arcadeDaily) zone.placeAt(new ChallengeBoard({ challenge: () => arcadeDaily.challenge(), titleOf }), plan.challengeBoard);
  if (arcadeLeague) zone.placeAt(new LeagueBoard({ league: arcadeLeague, width: plan.leagueBoard.width, height: plan.leagueBoard.height }), plan.leagueBoard.at);

  // The counter, its prizes in the case and, behind it in its frame (so they face the hall with it), the attendant.
  const forSale = PRIZES.filter((p) => p.tickets !== null).map((p) => ({ kind: p.kind, color: p.color }));
  const counter = zone.placeAt(new PrizeCounter({ ticketsPerCoin: TICKETS_PER_COIN, wallBehind: plan.counter.wallBehind, prizes: forSale }), plan.counter.at);
  const { crowd } = plan;
  const behind = counter.localToWorld(new THREE.Vector3(crowd.attendant.at[0], 0, crowd.attendant.at[1]));
  const attendantLines = topicalLines(crowd.attendant.lines, () => {
    const lines: string[] = [];
    const challenge = arcadeDaily?.challenge();
    if (challenge && !challenge.done) lines.push(`Today's challenge is ${titleOf(challenge.gameId)}: score ${challenge.target.toLocaleString('en-US')} and I add ${challenge.reward} tickets.`);
    if (challenge?.done) lines.push('You beat the challenge today. Come back tomorrow, there is a new one.');
    if (arcadeDaily?.changeMachineWorks) lines.push('The change machine is working today. Do not tell anyone.');
    if (broken) lines.push(`${titleOf(broken)} is out of order today. The repair man comes tomorrow. Probably.`);
    const cup = tournament.view();
    if (cup.on && !cup.entered) lines.push(`Tournament day! ${titleOf(cup.gameId)}, three rounds against the regulars. The sheet is on the back wall, ${TOURNAMENT.entry} coins to sign.`);
    if (cup.on && cup.entered && cup.next) lines.push(`Your ${cup.next.round === 2 ? 'final' : cup.next.round === 1 ? 'semi-final' : 'quarter-final'} is against ${cup.next.name}. They practised all week.`);
    if (cup.on && cup.wins >= 3) lines.push('Champion of the Saturday cup. I will engrave it. With a biro.');
    if (arcadeLeague && arcadeLeague.streakDays >= 2) lines.push(`${arcadeLeague.streakDays} days in a row. You should get a hobby. Oh wait.`);
    const leader = arcadeLeague?.standings()[0];
    if (leader?.you && (arcadeLeague?.tickets ?? 0) > 0) lines.push('Top of the league this week. The regulars are furious.');
    if (jackpot.value >= 400) lines.push(`The wheel's jackpot is at ${jackpot.value}. Somebody is going to be very happy.`);
    const top = tabled.find((g) => scores.topOf(g.id).you);
    if (top) lines.push(`First on ${top.title}? I saw. I am pretending I did not.`);
    const affordable = PRIZES.filter((p) => p.tickets !== null && p.tickets <= wallet.tickets).sort((a, b) => (b.tickets ?? 0) - (a.tickets ?? 0))[0];
    if (affordable && wallet.tickets >= 100) lines.push(`${wallet.tickets} tickets. The ${affordable.name.toLowerCase()} is yours for ${affordable.tickets}, you know.`);
    return lines;
  });
  zone.place(new Vendor({ viewer: listener, lines: attendantLines, seed: crowd.attendant.seed, label: 'Click to chat with the attendant', focus: crowd.attendant.focus }), zone.toLocal(behind), counter.rotation.y);

  zone.placeAt(new ChangeMachine({ working: arcadeDaily?.changeMachineWorks ?? false }), plan.changeMachine);
  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'Click to go out to the street', to: 'street' }), plan.exit);
  const jukebox = zone.placeAt(new Jukebox({ listener, color: plan.jukebox.color, startStation: plan.jukebox.startStation }), plan.jukebox.at);
  const jukeboxPool = new GlowPool(0xff7ad9, 1.3, 1.1);
  jukeboxPool.position.z = 0.75;
  jukeboxPool.setLevel(0.5);
  jukebox.add(jukeboxPool);
  placeDecor(zone, plan.decor);

  // The people: regulars (out of the hall until they walk in) and the kid, directed by the crowd.
  const door = crowd.nav.find((n) => n.id === crowd.door)!.at;
  const regulars = crowd.regulars.seeds.slice(0, crowd.regulars.count).map((seed) =>
    zone.place(new Walker({ viewer: listener, seed, lines: crowd.regularLines, label: 'Click to chat with the regular' }), new THREE.Vector3(door[0], 0, door[1]), Math.PI),
  );
  const kidSpot = crowd.hangouts[0]!;
  const kid = zone.place(new Walker({ viewer: listener, seed: crowd.kid.seed, speed: 0.95, lines: crowd.kid.lines, label: 'Click to chat with the kid' }), new THREE.Vector3(kidSpot.at[0], 0, kidSpot.at[1]), kidSpot.yaw);
  const tabledIds = new Set(tabled.map((g) => g.id));
  const maxInside = (): number => {
    const hour = sky.dayNight.state.hours;
    let max = 1;
    for (const [from, count] of crowd.regulars.byHour) if (hour >= from) max = count;
    return max;
  };
  const director = zone.place(
    new ArcadeCrowd({
      nav: crowd.nav,
      door: crowd.door,
      stations,
      regulars,
      kid,
      hangouts: crowd.hangouts,
      maxInside,
      names: crowd.regulars.names,
      onRegularScore: (station, score, name) => {
        const id = gameOf.get(station);
        if (!id || !tabledIds.has(id)) return null;
        const rank = scores.submitRival(id, score, name, rivalScore(id, 0) * RIVAL_CAP);
        return rank === null ? null : crowd.boardLines[Math.floor(Math.random() * crowd.boardLines.length)]!;
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
  zone.onUnload(tournament.onRound((outcome) => director.spectatorsReact(outcome.won ? ['YES!', 'Through to the next round!', 'Did you see that?', 'Clean!'] : ['Ohhh...', 'So close.', 'Unlucky.', 'Next Saturday, then.'], outcome.won)));
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
  // Someone is already on the machines the plan says when the player walks in.
  startingStations.forEach((station, regular) => director.seat(regular, station));
  return { room };
}

/**
 * A speaker's lines with news first: each topical line (the day's challenge, the player's record)
 * is said once, the next time they are clicked; then the usual lines go round.
 */
function topicalLines(usual: readonly string[], topical: () => string[]): () => readonly string[] {
  const said = new Set<string>();
  return () => {
    const fresh = topical().find((line) => !said.has(line));
    if (!fresh) return usual;
    said.add(fresh);
    return [fresh];
  };
}
