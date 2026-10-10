import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { ArcadeContext, BuildContext, MoneyContext, ZoneHandle } from '../buildContext';
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
import { ARCADE_DOOR, ARCADE_PLAN, BREAKABLE } from './arcadePlan';
import { LightPool } from '../lighting/LightPool';
import { effect } from '@/social/perks';
import { talkHook } from '../people/socialHook';
import { ATTENDANT, KID, attendantTalk, kidMood, kidTalk, kidWhipRound } from './arcadeTalk';
import { formatTickets } from '@/text/money';

/** What the arcade's builder reads of the `BuildContext`: the sky and the keys, the camera, the hall's stores, the money, the story and the people. */
type ArcadeBuild = Pick<BuildContext, 'sky' | 'input' | 'listener' | 'story' | 'social' | 'today'> & { money: Pick<MoneyContext, 'wallet' | 'purse'>; arcade: ArcadeContext };

/** A plan's pool of light on the carpet in front of a machine (machine-local z), at its level. */
function glowPool(pool: { color: number; width: number; depth: number; z: number; level: number }): GlowPool {
  const glow = new GlowPool(pool.color, pool.width, pool.depth);
  glow.position.z = pool.z;
  glow.setLevel(pool.level);
  return glow;
}

/** Where the crowd's regulars may play, and which game each one runs (for their scores); who is already on one at the start. */
class Stations {
  readonly list: CrowdStation[] = [];
  readonly gameOf = new Map<Station, string>();
  /** The stations someone stands at when the player walks in. */
  readonly starting: number[] = [];

  add(station: Station, gameId: string, watchAt?: [number, number]): number {
    this.gameOf.set(station, gameId);
    return this.list.push({ station, ...(watchAt ? { watchAt } : {}) }) - 1;
  }
}

/** A game of the hall by its id, for the boards and the attendant's lines. */
type Titled = { id: string; title: string };

/**
 * The dim shell (carpet, tiled dado, a fixed daylight: no windows), its switched-off house lights, and the day's rules
 * every paid machine asks (`ArcadeHall`: the next play's price, today's challenge, whether a machine works today).
 */
function placeHall(zone: Zone, { sky, money: { wallet }, arcade }: ArcadeBuild) {
  const plan = ARCADE_PLAN;
  const room = furnishShell(zone, sky, plan.room, { fixedDaylight: plan.daylight });
  room.setSkylight(plan.skylight);
  // The dado wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());
  zone.placeAt(new FlushLamp({ on: false, onSwitch: (on) => room.setLampOn(on) }), plan.light);
  const hall = zone.place(
    new ArcadeHall({
      wallet,
      scores: arcade.scores,
      ...(arcade.daily ? { daily: arcade.daily } : {}),
      ...(arcade.league ? { league: arcade.league } : {}),
      tournament: arcade.tournament,
      jackpot: arcade.jackpot,
      breakable: BREAKABLE,
      hours: () => sky.dayNight.state.hours,
      byHour: plan.crowd.regulars.byHour,
      boardLines: plan.crowd.boardLines,
    }),
    new THREE.Vector3(),
  );
  return { room, hall };
}

/**
 * The cabinets: the classics, LexiPunk in its big frame, the two-player PADDLE WARS, the light gun and the dance pad;
 * each a station of the crowd's when it can be watched, and a TOURNAMENT sign on its roof on the Saturdays it hosts it.
 */
function placeCabinets(zone: Zone, { input, listener, arcade }: ArcadeBuild, hall: ArcadeHall, stations: Stations): ArcadeCabinet[] {
  const plan = ARCADE_PLAN;
  const { tournament, replays, scores, medals } = arcade;
  const nextPlayCost = (): number => hall.nextPlayCost();
  return plan.cabinets.map((c) => {
    const game: ArcadeGame = ARCADE_GAMES[c.game]({ remoteScreen: arcade.screen ?? null });
    let attachment: CabinetAttachment | undefined;
    if (c.attachment === 'gun') attachment = new LightGun({ listener });
    if (c.attachment === 'pad') attachment = new DancePad({ centreZ: plan.padCentreZ, ...(game instanceof StepBeat ? { glow: (lane) => game.panelGlow(lane) } : {}) });
    const cabinet = zone.placeAt(
      new ArcadeCabinet(game, input, {
        color: c.color,
        glow: c.glow,
        scores,
        nextPlayCost: c.freePlay ? () => 0 : nextPlayCost,
        ...(c.freePlay ? { freePlay: true } : {}),
        pointsPerTicket: pointsPerTicket(game.id),
        challenge: hall.challengeFor(game.id),
        listener,
        replays,
        ...(medals ? { medals } : {}),
        outOfOrder: hall.isBroken(game.id),
        ...(attachment ? { attachment } : {}),
        ...(c.glowLight === false ? { glowLight: false } : {}),
        ...(c.wear !== undefined ? { wear: c.wear } : {}),
      }),
      c.at,
    );
    if (game.demoable !== false) stations.add(cabinet, game.id, c.watchAt);
    if (plan.tournament.games.includes(c.game)) {
      const topper = new TournamentTopper(() => tournament.isOn && tournament.gameId === game.id);
      topper.position.set(0, plan.tournament.topperY, 0);
      placeWith(zone, cabinet, topper);
    }
    return cabinet;
  });
}

/**
 * The physical machines (`plan.machines` through `MACHINE_KINDS`: the pinball, the claw, the ball alley, the hoops, the
 * ticket wheel), each with the printed card, medal lamps and pool of light its plan entry gives it.
 */
function placeMachines(zone: Zone, { input, listener, arcade }: ArcadeBuild, hall: ArcadeHall, stations: Stations) {
  const plan = ARCADE_PLAN;
  const context: MachineContext = { input, listener, scores: arcade.scores, nextPlayCost: () => hall.nextPlayCost(), outOfOrder: (id) => hall.isBroken(id), jackpot: arcade.jackpot, habits: arcade.habits };
  return plan.machines.map((m) => {
    const machine = zone.placeAt(buildMachine(m.kind, context, m.options), m.at);
    const station = stations.add(machine, machine.game.id, m.watchAt);
    if (m.regularAtStart) stations.starting.push(station);
    if (m.card) {
      const card = new InstructionCard({ title: m.card.title ?? machine.game.title, lines: m.card.lines, accent: 0xff2fa0 });
      card.position.set(...m.card.at);
      machine.add(card);
    }
    if (m.medalsAt && arcade.medals) {
      const row = new MedalRow(arcade.medals, machine.game.id);
      row.position.set(...m.medalsAt);
      machine.add(row);
      zone.onUnload(() => row.dispose());
    }
    if (m.pool) machine.add(glowPool(m.pool));
    return { machine, table: m.table === true };
  });
}

/** The boards: every machine that keeps a table, the day's challenge, the weekly league. */
function placeBoards(zone: Zone, { arcade }: ArcadeBuild, tabled: Titled[], titleOf: (id: string) => string): void {
  const plan = ARCADE_PLAN;
  zone.placeAt(new ScoreBoard({ games: tabled, scores: arcade.scores, width: plan.scoreBoard.width, height: plan.scoreBoard.height }), plan.scoreBoard.at);
  if (arcade.daily) {
    const daily = arcade.daily;
    zone.placeAt(new ChallengeBoard({ challenge: () => daily.challenge(), titleOf }), plan.challengeBoard);
  }
  if (arcade.league) zone.placeAt(new LeagueBoard({ league: arcade.league, width: plan.leagueBoard.width, height: plan.leagueBoard.height }), plan.leagueBoard.at);
}

/**
 * The counter, its prizes in the case and, behind it in its frame (so they face the hall with it), the attendant with
 * the day's news (a story the player follows is asked first: the attendant knows who signs HAB; Gus is someone to talk
 * to: the news one line at a time, a free credit, all of it for a friend); the change machine, the exit, the jukebox.
 */
function placeCounter(zone: Zone, { listener, money: { purse }, arcade, story, social, today }: ArcadeBuild, hall: ArcadeHall, tabled: Titled[], titleOf: (id: string) => string): void {
  const plan = ARCADE_PLAN;
  const { crowd } = plan;
  const forSale = PRIZES.filter((p) => p.tickets !== null).map((p) => ({ kind: p.kind, color: p.color, tickets: p.tickets ?? 0 }));
  const counter = zone.placeAt(new PrizeCounter({ ticketsPerCoin: TICKETS_PER_COIN, wallBehind: plan.counter.wallBehind, prizes: forSale }), plan.counter.at);
  const behind = counter.localToWorld(new THREE.Vector3(crowd.attendant.at[0], 0, crowd.attendant.at[1]));
  const hallLines = hall.attendantLines(crowd.attendant.lines, titleOf, tabled);
  const attendantLines = (): readonly string[] => {
    const told = story?.atArcadeCounter();
    return told ? [told] : hallLines();
  };
  const said = new Set<string>();
  const freshNews = (): string | null => {
    const told = story?.atArcadeCounter();
    if (told) return told;
    const fresh = hall.newsToday(titleOf, tabled).find((line) => !said.has(line)) ?? null;
    if (fresh) said.add(fresh);
    return fresh;
  };
  const attendantHook = talkHook(social, ATTENDANT, (session) => attendantTalk({ vendor: attendant, news: freshNews, allNews: () => hall.newsToday(titleOf, tabled), ...(purse ? { purse } : {}), day: () => today.gameDay }, session));
  const attendant: Vendor = zone.place(new Vendor({ viewer: listener, lines: attendantLines, seed: crowd.attendant.seed, label: 'The attendant · chat', focus: crowd.attendant.focus, speaker: 'The attendant', ...(attendantHook ? { social: attendantHook } : {}) }), zone.toLocal(behind), counter.rotation.y);

  // Cross with the player, Gus leaves the change machine's note up for them even on its good days.
  const daily = arcade.daily;
  const jammed = (): string | null => (social && effect(ATTENDANT, 'noChange') ? '“OUT OF ORDER.” Gus doesn’t look up from his paper.' : null);
  zone.placeAt(new ChangeMachine({ working: daily?.changeMachineWorks ?? false, waiting: () => daily?.changeWaiting ?? false, jammed }), plan.changeMachine);
  zone.placeAt(new TravelDoor({ style: 'glazed', shopfront: true, ...ARCADE_DOOR, label: 'Front Street · go out', to: 'street' }), plan.exit);
  const jukebox = zone.placeAt(new Jukebox({ listener, color: plan.jukebox.color, startStation: plan.jukebox.startStation }), plan.jukebox.at);
  jukebox.add(glowPool(plan.jukebox.pool));
  placeDecor(zone, plan.decor);
}

/**
 * The people: regulars (out of the hall until they walk in) and the kid, directed by the crowd (`ArcadeCrowd`): a
 * regular's game on a machine that keeps a table may sign it; on Saturday the tournament cabinet is left to the player
 * and the regulars gather round it; Nico in the player's corner on tournament day means a whip-round for every round
 * won. Then the tournament board, the hall's hum, the shared glow lights, and whoever is already on the machines.
 */
function placePeople(zone: Zone, { listener, money: { wallet }, arcade, social }: ArcadeBuild, hall: ArcadeHall, stations: Stations, cabinets: ArcadeCabinet[], tabled: Titled[], titleOf: (id: string) => string): void {
  const plan = ARCADE_PLAN;
  const { crowd } = plan;
  const { tournament } = arcade;
  // Today's tournament cabinet (it can change at midnight while the hall stands), or null on other days.
  const tournamentCabinet = (): ArcadeCabinet | null => (tournament.isOn ? (cabinets.find((c) => c.game.id === tournament.gameId) ?? null) : null);
  const door = crowd.nav.find((n) => n.id === crowd.door)!.at;
  const regulars = crowd.regulars.seeds.slice(0, crowd.regulars.count).map((seed) =>
    zone.place(new Walker({ viewer: listener, seed, lines: crowd.regularLines, label: 'A regular · chat' }), new THREE.Vector3(door[0], 0, door[1]), Math.PI),
  );
  const kidSpot = crowd.hangouts[0]!;
  const kidHook = talkHook(social, KID, () => kidTalk(kid));
  const kid: Walker = zone.place(new Walker({ viewer: listener, seed: crowd.kid.seed, speed: 0.95, lines: crowd.kid.lines, label: 'The kid · chat', ...(kidHook ? { social: kidHook } : {}) }), new THREE.Vector3(kidSpot.at[0], 0, kidSpot.at[1]), kidSpot.yaw);
  if (social) {
    zone.onUnload(
      tournament.onRound((outcome) => {
        const tickets = kidWhipRound();
        if (!tickets || outcome.finished === 'out' || !outcome.won) return;
        wallet.addTickets(tickets);
        kid.speak(`The regulars had a whip-round! ${formatTickets(tickets)}, from your corner.`, 'Nico');
      }),
    );
  }
  const tabledIds = new Set(tabled.map((g) => g.id));
  const director = zone.place(
    new ArcadeCrowd({
      nav: crowd.nav,
      door: crowd.door,
      stations: stations.list,
      regulars,
      kid,
      hangouts: crowd.hangouts,
      maxInside: () => hall.maxInside(),
      names: crowd.regulars.names,
      onRegularScore: (station, score, name) => {
        const id = stations.gameOf.get(station);
        return id && tabledIds.has(id) ? hall.regularScore(id, score, name) : null;
      },
      reserved: tournamentCabinet,
      gathering: () => {
        const cabinet = tournamentCabinet();
        if (!cabinet) return null;
        const spots = plan.tournament.spectators.map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, cabinet.rotation.y).add(cabinet.position).setY(0));
        return { spots, focus: cabinet.localToWorld(cabinet.focus.clone()) };
      },
      viewer: listener,
      toWorld: (p) => zone.toWorld(p),
      ...(social ? { kidMood } : {}),
    }),
    new THREE.Vector3(),
  );
  // The tournament's rounds are settled with the play (the Session's `ArcadePlay`); the watchers round the cabinet react.
  zone.onUnload(tournament.onRound((outcome) => director.spectatorsReact(outcome.won ? plan.tournament.cheers : plan.tournament.groans, outcome.won)));
  zone.placeAt(new TournamentBoard({ tournament, entry: TOURNAMENT.entry, titleOf, width: plan.tournament.width, height: plan.tournament.height }), plan.tournament.board);
  zone.place(new ArcadeAmbience(() => director.inside / crowd.regulars.count), new THREE.Vector3(0, 1.5, 0));
  // The cabinets' screen glows and the claw machine's case light share a few real lights, lent to the nearest.
  zone.place(new LightPool(plan.glowLights, listener), new THREE.Vector3());
  // Someone is already on the machines the plan says when the player walks in.
  stations.starting.forEach((station, regular) => director.seat(regular, station));
}

/**
 * Builds the arcade into its zone from `ARCADE_PLAN`: the hall and its rules, the cabinets, the physical machines (all
 * paid plays through the Session), the boards, the counter with its attendant, the change machine, the jukebox, the exit
 * door, the neon, ceiling and notices, the hall's hum, and the people. The long-lived stores come from the context,
 * made once in `bootstrap/services`. Wiring only, in the order the parts need each other.
 */
export function furnishArcade(zone: Zone, build: ArcadeBuild): ZoneHandle {
  const { room, hall } = placeHall(zone, build);
  const stations = new Stations();
  const cabinets = placeCabinets(zone, build, hall, stations);
  const machines = placeMachines(zone, build, hall, stations);
  const tabled: Titled[] = [...cabinets.map((c) => c.game), ...machines.filter((m) => m.table).map((m) => m.machine.game)].map((g) => ({ id: g.id, title: g.title }));
  const everyGame = [...cabinets.map((c) => c.game), ...machines.map((m) => m.machine.game)];
  const titleOf = (id: string): string => everyGame.find((g) => g.id === id)?.title ?? id.toUpperCase();
  placeBoards(zone, build, tabled, titleOf);
  placeCounter(zone, build, hall, tabled, titleOf);
  placePeople(zone, build, hall, stations, cabinets, tabled, titleOf);
  return { room };
}
