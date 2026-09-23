import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { furnishShell } from '../shell';
import { FlushLamp } from '../props/FlushLamp';
import { TiledWainscot } from '../props/TiledWainscot';
import { placeDecor } from '../props/decor';
import { TravelDoor } from '../travel/TravelDoor';
import { Vendor } from '../people/Vendor';
import { Shopper } from '../people/Shopper';
import { PLAY_COST, POINTS_PER_TICKET, TICKETS_PER_COIN, ticketsFor } from '@/economy/pricing';
import { ArcadeCabinet } from './ArcadeCabinet';
import { PrizeCounter } from './PrizeCounter';
import { ScoreBoard } from './ScoreBoard';
import { Pinball } from './Pinball';
import { ClawMachine } from './ClawMachine';
import { ChangeMachine } from './ChangeMachine';
import { ARCADE_GAMES } from './games';
import { ARCADE_PLAN, type PlayerPlan } from './arcadePlan';

/** A machine someone can stand at: where they stand and what they look at, machine-local. */
interface Playable extends THREE.Object3D {
  readonly standAt: THREE.Vector3;
  readonly focus: THREE.Vector3;
}

/**
 * Builds the arcade into its zone from `ARCADE_PLAN`: the dim shell (carpet, tiled dado), its
 * switched-off house lights, the cabinets along the back wall running their games, the prize
 * counter with its attendant, the hall of fame following the scores, the pinball, the claw and
 * the change machine with someone at each of the first two, the exit door that teleports back,
 * then the neon, the notices and the plants, and a kid wandering between it all.
 */
export function furnishArcade(zone: Zone, { sky, input, scores, listener }: BuildContext): ZoneHandle {
  const plan = ARCADE_PLAN;
  const room = furnishShell(zone, sky, plan.room);
  room.setSkylight(plan.skylight);
  // The dado wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());
  zone.placeAt(new FlushLamp({ on: false, onSwitch: (on) => room.setLampOn(on) }), plan.light);

  const games = plan.cabinets.map((cabinet) => ARCADE_GAMES[cabinet.game]());
  plan.cabinets.forEach((cabinet, i) => {
    zone.placeAt(new ArcadeCabinet(games[i]!, input, { color: cabinet.color, glow: cabinet.glow, scores, playCost: PLAY_COST, pointsPerTicket: POINTS_PER_TICKET, ticketsFor }), cabinet.at);
  });
  zone.placeAt(new ScoreBoard({ games: games.map((g) => ({ id: g.id, title: g.title })), scores, ticketsFor, pointsPerTicket: POINTS_PER_TICKET }), plan.scoreBoard);

  // The counter and, behind it in its frame (so they face the hall with it), the attendant.
  const counter = zone.placeAt(new PrizeCounter({ ticketsPerCoin: TICKETS_PER_COIN, wallBehind: plan.counter.wallBehind }), plan.counter.at);
  const { crowd } = plan;
  const behind = counter.localToWorld(new THREE.Vector3(crowd.attendant.at[0], 0, crowd.attendant.at[1]));
  zone.place(new Vendor({ viewer: listener, lines: crowd.attendant.lines, seed: crowd.attendant.seed, label: 'Click to chat with the attendant', focus: crowd.attendant.focus }), zone.toLocal(behind), counter.rotation.y);

  // The machines nobody plays for tickets, and the people playing them anyway.
  const pinball = zone.placeAt(new Pinball(plan.pinball.options), plan.pinball.at);
  standAt(zone, listener, pinball, plan.pinball.player, 'Click to chat with the pinball player');
  const claw = zone.placeAt(new ClawMachine(plan.claw.options), plan.claw.at);
  standAt(zone, listener, claw, plan.claw.player, 'Click to chat with the kid at the claw');
  zone.placeAt(new ChangeMachine(plan.changeMachine.options), plan.changeMachine.at);

  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'Click to leave the arcade' }), plan.exit);
  placeDecor(zone, plan.decor);

  for (let i = 0; i < crowd.wanderers; i++) {
    const x = THREE.MathUtils.lerp(crowd.aisle.x[0], crowd.aisle.x[1], (i + 0.5) / crowd.wanderers);
    zone.place(new Shopper({ viewer: listener, spots: crowd.browseSpots, aisle: crowd.aisle, seed: i + 3, speed: 0.6 + i * 0.1 }), new THREE.Vector3(x, 0, crowd.aisle.z), i % 2 ? Math.PI / 2 : -Math.PI / 2);
  }
  return { room };
}

/** Puts a `Vendor` at a machine's `standAt`, facing it, their idle gaze on its `focus`. */
function standAt(zone: Zone, viewer: THREE.Object3D, machine: Playable, player: PlayerPlan, label: string): void {
  const spot = machine.localToWorld(machine.standAt.clone());
  // The focus, in the player's own frame: they stand at `standAt` turned half round, so x and z flip.
  const d = machine.focus.clone().sub(machine.standAt);
  zone.place(new Vendor({ viewer, lines: player.lines, seed: player.seed, label, focus: [-d.x, d.y, -d.z] }), zone.toLocal(spot), machine.rotation.y + Math.PI);
}
