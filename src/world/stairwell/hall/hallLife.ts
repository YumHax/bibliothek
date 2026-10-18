import * as THREE from 'three';
import type { Zone } from '../../zone/Zone';
import type { BuildContext } from '../../buildContext';
import { CoproMeeting } from '@/building/coproMeeting';
import { pinHouseNotes } from '@/building/houseNotes';
import { annexJoined, rouxGone } from '@/building/rouxMove';
import type { Staircase } from '../Staircase';
import type { StairLights } from '../StairLights';
import type { StairWalker } from '../StairWalker';
import { HallBoard } from './HallBoard';
import { BallotBox } from './BallotBox';
import { Lodge, TipBox } from './Lodge';
import { Concierge } from './Concierge';
import { MeetingSetup } from './MeetingSetup';
import { TimerButton } from './TimerButton';
import { LodgeDoor } from './LodgeDoor';
import { outfitById } from '@/household/outfits';
import { pinSource } from '@/building/boardNotes';
import { conciergeState } from '@/building/conciergeState';
import { placeCoproLook } from './coproLook';
import { STAIRWELL_PLAN as plan } from '../stairwellPlan';
import { STOREYS, landingY } from '@/world/measures/building';

interface HallLifeParts {
  stairs: Staircase;
  lights: StairLights;
  /** The staircase's floor under (x, z) for feet at `feet`, zone-local (the walkers' ground). */
  ground: (x: number, z: number, feet: number) => number | null;
}

/**
 * The building's own life in the stairwell (docs/zones.md "The stairwell"): the notice board and the ballot box of the
 * co-owners' meeting in the hall (`building/coproMeeting`), the meeting set out on its day with its syndic, the
 * concierge in her lodge (the cellar key's errand), the timer buttons on every landing, and the stairwell dressed as
 * the meetings voted it (`coproLook`). Returns the people it adds, for the landings' sensors to see.
 */
export function placeHallLife(
  zone: Zone,
  { listener, today, sky, building, money, social, home }: Pick<BuildContext, 'listener' | 'today' | 'sky' | 'building' | 'money' | 'social'> & Partial<Pick<BuildContext, 'home'>>,
  { stairs, lights, ground }: HallLifeParts,
): StairWalker[] {
  const hours = (): number => sky.dayNight.state.hours;
  const day = (): number => today.gameDay;
  const { hall, board, ballot, lodge, timerButton, shaft } = plan;
  const meeting = new CoproMeeting({
    today,
    // Mrs Roux's flat bought and joined to ours: two flats, two votes, and hers is no longer cast.
    playerVotes: () => (annexJoined() || rouxGone() ? 2 : 1),
    stillHere: (who) => who !== plan.ourNeighbour || !rouxGone(),
    ...(money.purse ? { refund: (coins: number) => money.purse!.earnCoins(coins) } : {}),
  });
  zone.onUnload(() => meeting.dispose());
  zone.onUnload(pinHouseNotes());

  // The hall's west wall: the board, the ballot box under it.
  zone.place(new HallBoard(today, board.width, board.height), new THREE.Vector3(hall.x0 + 0.004, board.y, board.z), Math.PI / 2);
  zone.place(new BallotBox({ meeting, panel: building?.copro, purse: money.purse, day }), new THREE.Vector3(hall.x0 + 0.004, ballot.y, ballot.z), Math.PI / 2);

  // The concierge's lodge on the east wall, her Christmas box on its sill, and herself.
  const room = zone.place(new Lodge(), new THREE.Vector3());
  const concierge = zone.place(new Concierge({ viewer: listener, ground, hours, day, lodge: room, extraLines: () => meeting.gossip(), people: social }), new THREE.Vector3());
  zone.place(concierge.walker, concierge.walker.position.clone());
  zone.place(new TipBox((session) => concierge.tipped(session)), new THREE.Vector3(hall.x1 - 0.08, lodge.window.sill, lodge.tipBox.z), -Math.PI / 2);
  // Her door, clickable: with the lodge's spare key (at Friend) the player waters her geranium while she is out.
  zone.place(new LodgeDoor({ inLodge: () => concierge.inLodge, day }), new THREE.Vector3(hall.x1 - 0.02, 0, lodge.door.z), -Math.PI / 2);
  // The sticky timer button mended: her thank-you on the board for two days.
  const { note } = plan.concierge.mended;
  zone.onUnload(
    pinSource('timerMended', (d) => {
      const from = conciergeState().mended;
      return from !== null && d >= from && d - from < note.days ? [{ id: note.id, title: note.title, lines: [...note.lines], signed: note.signed, paper: note.paper, weight: note.weight }] : [];
    }),
  );

  // The meeting's chairs and its syndic, on its day.
  const setup = zone.place(new MeetingSetup({ viewer: listener, ground, meeting, hours, people: social }), new THREE.Vector3());
  zone.place(setup.syndic, setup.syndic.position.clone());

  // A timer button on every floor landing's wall (the hall's by the cellar door).
  for (let k = 0; k <= STOREYS; k++) {
    const button = new TimerButton({ k, press: () => lights.pressTimer(), glow: () => lights.landingGlow(k), pressed: (floor) => concierge.buttonPressed(floor), isNew: () => concierge.buttonIsNew(k), newLine: plan.concierge.mended.line });
    zone.place(button, new THREE.Vector3(timerButton.x, landingY(k) + timerButton.y, shaft.z1 - 0.004), Math.PI);
  }

  // The mirror the co-owners voted in shows what the player has on (`household/outfits`).
  const life = home?.household?.life;
  zone.onUnload(placeCoproLook(zone, stairs, { ...(life ? { outfit: () => outfitById(life.household.outfit).name.toLowerCase() } : {}), day, conciergeIn: () => concierge.inLodge }));
  return [concierge.walker, setup.syndic];
}
