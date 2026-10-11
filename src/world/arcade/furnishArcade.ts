import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { ArcadeContext, BuildContext, MoneyContext, ZoneHandle } from '../buildContext';
import { furnishShell } from '../shell';
import { placeWith } from '../zone/attach';
import { FlushLamp } from '../props/FlushLamp';
import { TiledWainscot } from '../props/TiledWainscot';
import { placeDecor } from '../props/decor';
import { MirrorBall } from '../props/MirrorBall';
import { NeonTube } from '../props/NeonTube';
import { HallCelebration } from './HallCelebration';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { Walker } from '../people/Walker';
import { TICKETS_PER_COIN, TOURNAMENT, pointsPerTicket } from '@/economy/pricing';
import { PRIZES } from '@/economy/Prizes';
import { ArcadeCabinet } from './ArcadeCabinet';
import { ArcadeHall } from './ArcadeHall';
import { TournamentBoard } from './TournamentBoard';
import { TournamentTopper } from './TournamentTopper';
import { HallTourPlaque } from './HallTourPlaque';
import { PrizeCounter } from './PrizeCounter';
import { SponsorPlate } from './SponsorPlate';
import { ScoreBoard } from './ScoreBoard';
import { ChallengeBoard } from './ChallengeBoard';
import { LeagueBoard } from './LeagueBoard';
import { ChangeMachine } from './ChangeMachine';
import { Jukebox } from './Jukebox';
import { ArcadeCrowd } from './ArcadeCrowd';
import type { CrowdStation } from './crowdNav';
import type { GuestOptions } from './HallGuest';
import { GusLines, winsOf } from './gusLines';
import { coachedPlay, hugoHere, hugoSkill, marcoHere, nicoSkill } from './guestDays';
import { ArcadeAmbience } from './ArcadeAmbience';
import { LightGun } from './LightGun';
import { DancePad } from './DancePad';
import { MedalRow, MedalRowTicker } from './MedalRow';
import { InstructionCard } from './InstructionCard';
import { GlowPool } from './GlowPool';
import type { CabinetAttachment } from './CabinetAttachment';
import type { Station } from './Station';
import { ARCADE_GAMES, type ArcadeGame, StepBeat } from './games';
import { type MachineContext, type MachineKind, buildMachine } from './machineKinds';
import { ARCADE_DOOR, ARCADE_PLAN, BREAKABLE } from './arcadePlan';
import { LightPool } from '../lighting/LightPool';
import { effect } from '@/social/perks';
import { type SocialHook, talkHook } from '../people/socialHook';
import { randomLook } from '../people/looks';
import { FRIENDS } from '../visitors/friendsPlan';
import { ATTENDANT, KID, attendantTalk, hugoTalk, kidMood, kidTalk, kidWhipRound, walkerTalk } from './arcadeTalk';
import { HALL_REGULARS, regularFor } from '@/economy/hallRegulars';
import { rememberedLook } from '@/social/lookBook';
import { findPerson } from '@/social/people';
import { nudge } from '@/social/standing';
import { formatTickets } from '@/text/money';

/** What the arcade's builder reads of the `BuildContext`: the sky and the keys, the camera, the hall's stores, the money, the story and the people. */
type ArcadeBuild = Pick<BuildContext, 'sky' | 'input' | 'listener' | 'story' | 'social' | 'today' | 'notices'> & { money: Pick<MoneyContext, 'wallet' | 'purse'>; arcade: ArcadeContext };

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

/** A machine the Saturday tournament may be played on, and where its watchers stand (machine-local x, z). */
interface TournamentHost {
  station: Station;
  spectators: readonly (readonly [number, number])[];
}

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
      ...(arcade.medals ? { medals: arcade.medals } : {}),
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
    // The player's brass plate on its base, once one was bought for it at the prize counter's back room.
    if (arcade.prizes) placeWith(zone, cabinet, new SponsorPlate({ prizes: arcade.prizes, game: game.id, initials: () => scores.initials }));
    return cabinet;
  });
}

/**
 * The physical machines (`plan.machines` through `MACHINE_KINDS`: the pinball, the claw, the ball alley, the hoops, the
 * ticket wheel), each with the printed card, medal lamps and pool of light its plan entry gives it, and a TOURNAMENT
 * sign on the Saturdays it hosts the tournament (`plan.tournament.hosts`).
 */
function placeMachines(zone: Zone, { input, listener, arcade }: ArcadeBuild, hall: ArcadeHall, stations: Stations) {
  const plan = ARCADE_PLAN;
  const context: MachineContext = { input, listener, scores: arcade.scores, nextPlayCost: () => hall.nextPlayCost(), outOfOrder: (id) => hall.isBroken(id), jackpot: arcade.jackpot, habits: arcade.habits };
  const rows: MedalRow[] = [];
  const placed = plan.machines.map((m) => {
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
      rows.push(row);
      zone.onUnload(() => row.dispose());
    }
    if (m.pool) machine.add(glowPool(m.pool));
    const host = plan.tournament.hosts[m.kind];
    if (host) {
      const { tournament } = arcade;
      const topper = new TournamentTopper(() => tournament.isOn && tournament.gameId === machine.game.id);
      topper.position.set(...host.topper);
      placeWith(zone, machine, topper);
    }
    return { machine, table: m.table === true };
  });
  // The machines' medal lamps flash on a medal won: ticked here, the machines have no hand in it.
  zone.place(new MedalRowTicker(rows), new THREE.Vector3());
  return placed;
}

/** The boards: every machine that keeps a table, the day's challenge, the weekly league, the hall's tour of medals. */
function placeBoards(zone: Zone, { arcade }: ArcadeBuild, tabled: Titled[], titleOf: (id: string) => string): void {
  const plan = ARCADE_PLAN;
  zone.placeAt(new ScoreBoard({ games: tabled, scores: arcade.scores, heldDays: (id) => arcade.scores.heldDays(id), width: plan.scoreBoard.width, height: plan.scoreBoard.height }), plan.scoreBoard.at);
  if (arcade.medals) {
    const plaque = zone.placeAt(new HallTourPlaque({ medals: arcade.medals, games: tabled, initials: () => arcade.scores.initials, width: plan.hallTour.width, height: plan.hallTour.height }), plan.hallTour.at);
    zone.onUnload(() => plaque.dispose());
  }
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
function placeCounter(zone: Zone, { sky, listener, money: { wallet, purse }, arcade, story, social, today }: ArcadeBuild, hall: ArcadeHall, tabled: Titled[], titleOf: (id: string) => string): void {
  const plan = ARCADE_PLAN;
  const { crowd } = plan;
  // The glass case and the pegboard: what the counter sells over the glass (the back room's offers are only in its panel).
  const forSale = PRIZES.filter((p) => p.tickets !== null && !p.special);
  const counter = zone.placeAt(
    new PrizeCounter({
      ticketsPerCoin: TICKETS_PER_COIN,
      wallBehind: plan.counter.wallBehind,
      prizes: forSale,
      ...(arcade.prizes ? { taken: arcade.prizes } : {}),
      wallet,
      today: () => today.gameDay,
    }),
    plan.counter.at,
  );
  const behind = counter.localToWorld(new THREE.Vector3(crowd.attendant.at[0], 0, crowd.attendant.at[1]));
  // The regulars' days while the player was away (a record of theirs may have fallen), then Gus's word on the people.
  arcade.scores.settleDay(today.gameDay, (id) => regularFor(id).initials);
  const gus = new GusLines({ scores: arcade.scores, titleOf, wins: winsOf(arcade, tabled), day: () => today.gameDay, hour: () => sky.dayNight.state.hours, social: Boolean(social) });
  const hallLines = hall.attendantLines([], titleOf, tabled);
  const attendantLines = (): readonly string[] => {
    const told = story?.atArcadeCounter() ?? gus.fresh();
    if (told) return [told];
    const news = hallLines();
    return news.length ? news : gus.usual();
  };
  const said = new Set<string>();
  const freshNews = (): string | null => {
    const told = story?.atArcadeCounter() ?? gus.fresh();
    if (told) return told;
    const fresh = hall.newsToday(titleOf, tabled).find((line) => !said.has(line)) ?? null;
    if (fresh) said.add(fresh);
    return fresh;
  };
  const allNews = (): string[] => [...gus.news(), ...hall.newsToday(titleOf, tabled)];
  const attendantHook = talkHook(social, ATTENDANT, (session) => attendantTalk({ vendor: attendant, news: freshNews, allNews, ...(purse ? { purse } : {}), day: () => today.gameDay }, session));
  const attendant: Vendor = zone.place(new Vendor({ viewer: listener, lines: attendantLines, seed: crowd.attendant.seed, label: 'The attendant · chat', focus: crowd.attendant.focus, speaker: 'The attendant', ...(attendantHook ? { social: attendantHook } : {}) }), zone.toLocal(behind), counter.rotation.y);

  // Cross with the player, Gus leaves the change machine's note up for them even on its good days.
  const daily = arcade.daily;
  const jammed = (): string | null => (social && effect(ATTENDANT, 'noChange') ? '“OUT OF ORDER.” Gus doesn’t look up from his paper.' : null);
  zone.placeAt(new ChangeMachine({ working: () => daily?.changeMachineWorks ?? false, waiting: () => daily?.changeWaiting ?? false, jammed }), plan.changeMachine);
  zone.placeAt(new TravelDoor({ style: 'glazed', shopfront: true, ...ARCADE_DOOR, label: 'Front Street · go out', to: 'street' }), plan.exit);
  const jukebox = zone.placeAt(new Jukebox({ listener, color: plan.jukebox.color, startStation: plan.jukebox.startStation }), plan.jukebox.at);
  jukebox.add(glowPool(plan.jukebox.pool));
  const decor = placeDecor(zone, plan.decor);
  // The jackpot falling or the player topping a table: the mirror ball, the spots on the carpet and the neon go off.
  const balls = decor.filter((d): d is MirrorBall => d instanceof MirrorBall);
  const tubes = decor.filter((d): d is NeonTube => d instanceof NeonTube);
  zone.place(new HallCelebration({ balls, tubes, ...plan.celebration, jackpot: arcade.jackpot }), new THREE.Vector3());
}

/**
 * The people: regulars (out of the hall until they walk in) and the kid, directed by the crowd (`ArcadeCrowd`): a
 * regular's game on a machine that keeps a table may sign it; on Saturday the tournament cabinet is left to the player
 * and the regulars gather round it; Nico in the player's corner on tournament day means a whip-round for every round
 * won. Then the tournament board, the hall's hum, the shared glow lights, and whoever is already on the machines.
 */
function placePeople(zone: Zone, build: ArcadeBuild, hall: ArcadeHall, stations: Stations, hosts: TournamentHost[], tabled: Titled[], titleOf: (id: string) => string): void {
  const { listener, money: { wallet }, arcade, social, today, sky, notices } = build;
  const plan = ARCADE_PLAN;
  const { crowd } = plan;
  const { tournament } = arcade;
  // Today's tournament machine (it can change at midnight while the hall stands), or null on other days.
  const tournamentHost = (): TournamentHost | null => (tournament.isOn ? (hosts.find((h) => stations.gameOf.get(h.station) === tournament.gameId) ?? null) : null);
  const door = crowd.nav.find((n) => n.id === crowd.door)!.at;
  const atDoor = new THREE.Vector3(door[0], 0, door[1]);
  const regulars = HALL_REGULARS.map((who) => ({
    who,
    walker: zone.place(new Walker({ viewer: listener, seed: who.seed, lines: who.lines, label: 'A regular · chat', speaker: who.name }), atDoor.clone(), Math.PI),
  }));
  const kidSpot = crowd.hangouts[0]!;
  const kidHook = talkHook(social, KID, () => kidTalk(kid));
  const kid: Walker = zone.place(new Walker({ viewer: listener, seed: crowd.kid.seed, speed: 0.95, lines: crowd.kid.lines, label: 'The kid · chat', ...(kidHook ? { social: kidHook } : {}) }), new THREE.Vector3(kidSpot.at[0], 0, kidSpot.at[1]), kidSpot.yaw);
  const guests = social ? placeGuests(zone, build, atDoor, stations) : [];
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
      kidGame: { ...crowd.kid.game, skill: () => nicoSkill(today.gameDay) },
      hangouts: crowd.hangouts,
      guests,
      maxInside: () => hall.maxInside(),
      hour: () => sky.dayNight.state.hours,
      gameOf: (station) => stations.gameOf.get(station),
      onRegularScore: (station, score, name) => {
        const id = stations.gameOf.get(station);
        return id && tabledIds.has(id) ? hall.regularScore(id, score, name) : null;
      },
      onPlayerResult: (station, result) => {
        // Sofia's lesson pays on the next COMET DASH game (a better first strip).
        if (stations.gameOf.get(station) !== 'comets' || result.refund) return;
        const tickets = social ? coachedPlay() : 0;
        if (!tickets) return;
        wallet.addTickets(tickets);
        notices.slip({ title: 'Sofia’s tip paid off', detail: 'A better first strip at COMET DASH.', tickets });
      },
      reserved: () => tournamentHost()?.station ?? null,
      gathering: () => {
        const host = tournamentHost();
        if (!host) return null;
        const machine = host.station;
        const spots = host.spectators.map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, machine.rotation.y).add(machine.position).setY(0));
        return { spots, focus: machine.localToWorld(machine.focus.clone()) };
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
  zone.place(new ArcadeAmbience(() => director.inside / HALL_REGULARS.length), new THREE.Vector3(0, 1.5, 0));
  // The cabinets' screen glows and the claw machine's case light share a few real lights, lent to the nearest.
  zone.place(new LightPool(plan.glowLights, listener), new THREE.Vector3());
  // Someone is already on the machines the plan says when the player walks in.
  for (const station of stations.starting) director.seat(station);
}

/**
 * The friends who come to the hall on their days (`guestDays`): Marco on the day fixed with him, player two at PADDLE
 * WARS (a game together warms him); Hugo on Wednesday mornings at NEON SNAKE (a tip, or watching the player's game).
 * Each a body that talks (`arcadeTalk`), out of the hall until their time.
 */
function placeGuests(zone: Zone, { listener, social, today, sky }: ArcadeBuild, atDoor: THREE.Vector3, stations: Stations): GuestOptions[] {
  const { marco, hugo } = ARCADE_PLAN.crowd.guests;
  const hour = (): number => sky.dayNight.state.hours;
  const stationOf = (gameId: string) => (): CrowdStation | null => stations.list.find((cs) => stations.gameOf.get(cs.station) === gameId) ?? null;
  // The bodies they have elsewhere: Marco's at the flat's door (`visitors/friendsPlan`), Hugo's in the courtyard.
  const marcoPlan = FRIENDS.find((f) => f.id === 'marco');
  const marcoBody: Walker = zone.place(
    new Walker({ viewer: listener, ...(marcoPlan ? { seed: marcoPlan.seed, look: { ...randomLook(marcoPlan.seed, 'shopper'), ...marcoPlan.look } } : {}), lines: marco.lines.clicked, label: 'Marco · chat', speaker: 'Marco', ...withHook(talkHook(social, 'marco', () => walkerTalk('marco', marcoBody, 'Marco'))) }),
    atDoor.clone(),
    Math.PI,
  );
  const hugoLook = { ...(rememberedLook('hugo') ?? randomLook(findPerson('hugo')?.look?.seed ?? 0, 'shopper', { age: 'child' })) };
  hugoLook.height = hugo.height;
  hugoLook.headScale = 1.22 - (hugo.height - 1.05) * 0.3;
  hugoLook.bag = undefined;
  const hugoBody: Walker = zone.place(
    new Walker({ viewer: listener, look: hugoLook, speed: 0.95, lines: hugo.lines.clicked, label: 'Hugo · chat', speaker: 'Hugo', ...withHook(talkHook(social, 'hugo', () => hugoTalk(hugoBody, () => today.gameDay))) }),
    atDoor.clone(),
    Math.PI,
  );
  return [
    {
      walker: marcoBody,
      initials: marco.initials,
      here: () => marcoHere(today.gameDay, hour()),
      station: stationOf(marco.game),
      skill: () => marco.skill,
      partner: true,
      spot: marco.spot,
      seconds: marco.seconds,
      rest: marco.rest,
      lines: marco.lines,
      onPartnerResult: () => nudge('marco', { warmth: 2, why: 'played PADDLE WARS together', reason: 'arcade-duel', day: today.gameDay, memory: 'We played PADDLE WARS at the arcade' }),
    },
    {
      walker: hugoBody,
      initials: hugo.initials,
      here: () => hugoHere(today.gameDay, hour()),
      station: stationOf(hugo.game),
      skill: () => hugoSkill(today.gameDay),
      partner: false,
      spot: hugo.spot,
      seconds: hugo.seconds,
      rest: hugo.rest,
      lines: hugo.lines,
      onWatched: () => nudge('hugo', { warmth: 1, why: 'let him watch you play Snake', reason: 'arcade-watch', day: today.gameDay }),
    },
  ];
}

/** A talk hook as a Walker option, when there is one. */
function withHook(hook: SocialHook | undefined): { social?: SocialHook } {
  return hook ? { social: hook } : {};
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
  // The machines the Saturday tournament may be played on: the classic cabinets, and the physical machines that host it.
  const hosts: TournamentHost[] = [
    ...cabinets.filter((c) => (ARCADE_PLAN.tournament.games as readonly string[]).includes(c.game.id)).map((c) => ({ station: c, spectators: ARCADE_PLAN.tournament.spectators })),
    ...machines.flatMap(({ machine }) => {
      const host = ARCADE_PLAN.tournament.hosts[machine.game.id as MachineKind];
      return host ? [{ station: machine, spectators: host.spectators }] : [];
    }),
  ];
  placePeople(zone, build, hall, stations, hosts, tabled, titleOf);
  return { room };
}
