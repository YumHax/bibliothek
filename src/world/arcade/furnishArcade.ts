import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { furnishShell } from '../shell';
import { FlushLamp } from '../props/FlushLamp';
import { TiledWainscot } from '../props/TiledWainscot';
import { placeDecor } from '../props/decor';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { Walker } from '../people/Walker';
import { PLAY_COST, TICKETS_PER_COIN, WHEEL_SLICES, playIsFree, pointsPerTicket } from '@/economy/pricing';
import { PRIZES, clawPrizeFor } from '@/economy/Prizes';
import { Jackpot } from '@/economy/Jackpot';
import { rivalScore } from '@/economy/rivals';
import { ArcadeCabinet } from './ArcadeCabinet';
import { PrizeCounter } from './PrizeCounter';
import { ScoreBoard } from './ScoreBoard';
import { ChallengeBoard } from './ChallengeBoard';
import { LeagueBoard } from './LeagueBoard';
import { Pinball } from './Pinball';
import { ClawMachine } from './ClawMachine';
import { AlleyRoller } from './AlleyRoller';
import { HoopShot } from './HoopShot';
import { TicketWheel } from './TicketWheel';
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
import { ARCADE_PLAN, type CardPlan, DEMO_CABINETS } from './arcadePlan';

/** A regular's score may go on the table up to this much above the best starting rival (they play better than people). */
const RIVAL_CAP = 1.1;

/**
 * Builds the arcade into its zone from `ARCADE_PLAN`: the dim shell (carpet, tiled dado, a fixed
 * daylight: no windows), its switched-off house lights, the cabinets (the classics, LexiPunk in
 * its big frame, the two-player PADDLE WARS, the light gun and the dance pad), the pinball, the
 * ball alley, the hoops, the ticket wheel and the claw (all paid plays through the Session), the
 * prize counter with its attendant (who has a word about the day), the hall of fame, the
 * challenge board and the weekly league, the change machine (working or not, by the day), one
 * cabinet out of order some days, the jukebox, the exit door, the neon, ceiling and notices, the
 * hall's hum, and the people: regulars who come and go between the free machines (more in the
 * evening) and sign the board when they play well, and a kid who watches and takes player two.
 */
export function furnishArcade(zone: Zone, { sky, input, scores, listener, wallet, arcadeDaily, arcadeMedals, arcadeLeague, arcadeScreen }: BuildContext): ZoneHandle {
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
  const broken = arcadeDaily?.outOfOrder(DEMO_CABINETS) ?? null;
  const replays = new ReplayStore();

  const stations: CrowdStation[] = [];
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
        outOfOrder: () => broken === game.id,
        ...(attachment ? { attachment } : {}),
        ...(c.glowLight === false ? { glowLight: false } : {}),
        ...(c.wear !== undefined ? { wear: c.wear } : {}),
      }),
      c.at,
    );
    if (game.demoable !== false) stations.push({ station: cabinet, ...(c.watchAt ? { watchAt: c.watchAt } : {}) });
    return cabinet;
  });
  const pinball = zone.placeAt(new Pinball(plan.pinball.options, { input, scores, nextPlayCost, pointsPerTicket: pointsPerTicket('pinball'), listener }), plan.pinball.at);
  const claw = zone.placeAt(new ClawMachine(plan.claw.options, { input, listener, prizeFor: (color) => clawPrizeFor(color)?.id }), plan.claw.at);
  const alley = zone.placeAt(new AlleyRoller(plan.alley.options, { input, scores, nextPlayCost, pointsPerTicket: pointsPerTicket('alley'), listener }), plan.alley.at);
  const hoops = zone.placeAt(new HoopShot(plan.hoops.options, { input, scores, nextPlayCost, pointsPerTicket: pointsPerTicket('hoops'), listener }), plan.hoops.at);
  const jackpot = new Jackpot();
  const wheel = zone.placeAt(new TicketWheel({ slices: WHEEL_SLICES, jackpot, title: plan.wheel.title, color: plan.wheel.color }, { input, nextPlayCost, pointsPerTicket: pointsPerTicket('wheel'), listener }), plan.wheel.at);
  const pinballStation = stations.push({ station: pinball }) - 1;
  stations.push({ station: claw }, { station: alley, watchAt: plan.alley.watchAt }, { station: hoops, watchAt: plan.hoops.watchAt }, { station: wheel, watchAt: plan.wheel.watchAt });

  // The printed cards and the medal lamps on the machines that are not cabinets (the cabinets carry their own).
  const card = (machine: THREE.Object3D, title: string, spec: CardPlan): void => {
    const c = new InstructionCard({ title, lines: spec.lines, accent: 0xff2fa0 });
    c.position.set(...spec.at);
    machine.add(c);
  };
  card(pinball, pinball.game.title, plan.pinball.card);
  card(claw, 'CLAW', plan.claw.card);
  card(alley, alley.game.title, plan.alley.card);
  card(hoops, hoops.game.title, plan.hoops.card);
  card(wheel, wheel.game.title, plan.wheel.card);
  if (arcadeMedals) {
    for (const [machine, at] of [[pinball, plan.pinball.medalsAt], [alley, plan.alley.medalsAt], [hoops, plan.hoops.medalsAt]] as const) {
      const row = new MedalRow(arcadeMedals, machine.game.id);
      row.position.set(...at);
      machine.add(row);
      zone.onUnload(() => row.dispose());
    }
  }
  // The wheel's bulbs throw a warm pool on the carpet in front of it.
  const wheelPool = new GlowPool(0xffd08a, 1.6, 1.4);
  wheelPool.position.z = 1.1;
  wheelPool.setLevel(0.6);
  wheel.add(wheelPool);

  // The boards: every machine that keeps a table, the day's challenge, the weekly league.
  const tabled = [...cabinets.map((c) => c.game), pinball.game, alley.game, hoops.game].map((g) => ({ id: g.id, title: g.title }));
  const titleOf = (id: string): string => tabled.find((g) => g.id === id)?.title ?? id.toUpperCase();
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
  // Which game each station runs, for the regulars' scores.
  const gameOf = new Map<Station, string>();
  for (const cs of stations) gameOf.set(cs.station, (cs.station as unknown as { game: { id: string } }).game.id);
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
      viewer: listener,
      toWorld: (p) => zone.toWorld(p),
    }),
    new THREE.Vector3(),
  );
  zone.place(new ArcadeAmbience(() => director.inside / crowd.regulars.count), new THREE.Vector3(0, 1.5, 0));
  // Someone is already on the pinball when the player walks in.
  director.seat(0, pinballStation);
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
