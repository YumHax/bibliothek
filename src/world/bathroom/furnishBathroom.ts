import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, HouseholdContext, ZoneHandle } from '../buildContext';
import type { Outcome } from '@/household/HomeLife';
import { tellOutcome } from '@/household/tellOutcome';
import { ClickSpot } from '../props/ClickSpot';
import { HairDryer } from './HairDryer';
import { boxJob } from '../build/boxJob';
import { HOUSEHOLD } from '@/household/rules';
import { playBathSplash, playHairDryer, playKitTake, playRunningWater } from '@/audio/householdSounds';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { pointSound } from '../build/hearing';
import { followDaylight } from '../build/follow';
import { TiledWainscot } from '../props/TiledWainscot';
import { Bathtub } from './Bathtub';
import { FrostedWindow } from '../props/FrostedWindow';
import { Washbasin } from './Washbasin';
import { Toilet } from './Toilet';
import { TowelRail } from './TowelRail';
import { LaundryBasket } from './LaundryBasket';
import { MirrorCabinet } from './MirrorCabinet';
import { CabinetKit } from './CabinetKit';
import { presentWhile } from '../build/presence';
import { placeWith, placeLeaves, floorPointsToWorld } from '../zone/attach';
import { RunningWater, ToiletFlush, FLUSH_SECONDS } from '@/audio/water';
import type { CatPerch } from '../cat/spots';
import { BATHROOM_PLAN } from './bathroomPlan';
import { rugsUnderfoot } from '../build/rugsUnderfoot';

/**
 * Builds the bathroom into its zone from `BATHROOM_PLAN`: shell with its door (opening out into
 * the corridor), ceiling light, the tiled wainscot, the tub under its frosted window (glowing with
 * the shared sky), the basin and the WC facing each other, the mirror cabinet over the basin, the
 * towels by the door, the laundry basket, then the bath mat, the plant and the towel on the tub.
 * The water works: each fitting's click drives its own `PointSound` (the basin's tap, which also
 * drips when shut; the tub's tap and drain; the flush).
 */
export function furnishBathroom(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'listener' | 'acoustics' | 'home'>): ZoneHandle {
  const { sky } = ctx;
  const plan = BATHROOM_PLAN;
  const household = ctx.home.household;
  const room = furnishShell(zone, sky, plan.room, { leafColor: plan.leafColor });
  placeRoomLight(zone, room, 'flush', plan.light, plan.lightSwitch);
  // The wainscot wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());

  const tubWater = new RunningWater({ peak: 0.6 });
  const tub = zone.placeAt(
    new Bathtub({
      tapEnd: 'left',
      ...plan.bathtubSize,
      // A full bath is for soaking in (docs/household.md); the water goes out after.
      onSoak: household ? () => soak(household) : undefined,
      onWater: ({ running, draining, depth }) => {
        tubWater.setRunning(running);
        tubWater.setDraining(draining);
        tubWater.setDepth(depth);
      },
    }),
    plan.bathtub,
  );
  placeWith(zone, tub, tub.plugSpot);
  placeWith(zone, tub, pointSound(ctx, tubWater, { maxDistance: 6 }), tub.tapPoint);
  followDaylight(zone, sky, zone.placeAt(new FrostedWindow(), plan.window));

  // The basin's tap runs on a click, and never quite shuts: a drop every few seconds.
  const tap = new RunningWater({ drips: true, peak: 0.4 });
  const basin = zone.placeAt(new Washbasin({ shelfSide: 'right', mirror: false, onTap: (running) => tap.setRunning(running) }), plan.washbasin);
  placeWith(zone, basin, pointSound(ctx, tap, { maxDistance: 5 }), new THREE.Vector3(0, 0.82, 0.2));
  const cabinet = zone.placeAt(new MirrorCabinet(plan.mirrorCabinetOptions), plan.mirrorCabinet);
  placeLeaves(zone, cabinet);
  if (household) furnishBathroomLife(zone, household, cabinet);

  const flush = new ToiletFlush();
  const toilet = zone.placeAt(new Toilet({ flushSeconds: FLUSH_SECONDS, onFlush: () => flush.flush() }), plan.toilet);
  placeWith(zone, toilet, toilet.lidSpot);
  placeWith(zone, toilet, pointSound(ctx, flush, { maxDistance: 6 }), new THREE.Vector3(0, 0.6, 0.2));
  zone.placeAt(new TowelRail(), plan.towelRail);
  zone.placeAt(new LaundryBasket(), plan.laundryBasket);
  furnishDecor(zone, ctx, plan.decor);

  // Where the cat naps in here: the dry tub (over its rim), or curled in the basin; never while water runs.
  const inTub: CatPerch = {
    restingSpot: (out) => tub.restingSpot(out),
    approachPoint: (out) => tub.approachPoint(out),
    hopApex: tub.rimHeight,
    available: () => tub.isEmpty,
    catWeight: (night) => (night ? 0.4 : 0.9),
  };
  const inBasin: CatPerch = {
    restingSpot: (out) => basin.restingSpot(out),
    approachPoint: (out) => basin.approachPoint(out),
    available: () => !basin.isRunning,
    catWeight: (night) => (night ? 0.2 : 0.6),
  };
  return { room, catVisits: floorPointsToWorld(zone, plan.catVisits), catPerches: [inTub, inBasin], surfaceAt: rugsUnderfoot(zone) };
}

/**
 * A soak in the full bath: said at once when it does nothing, else a slow fade to black over the
 * splash and the lapping water, the clock wound on, and what it did. True lets the water out.
 */
function soak(household: HouseholdContext): boolean {
  const { life, pastimes } = household;
  const outcome = life.soak();
  if (!outcome.done || !pastimes) return showOutcome(household, outcome);
  const plan = HOUSEHOLD.pastime.soak;
  void pastimes.run({ ...plan, start: () => playBathSplash(), dark: () => playRunningWater(plan.darkMs / 1000 + 0.6) }, () => outcome).then((told) => {
    if (told) showOutcome(household, told);
  });
  return true;
}

/** Says what came of a household action; true when something happened. */
function showOutcome({ notices }: HouseholdContext, outcome: Outcome): boolean {
  return tellOutcome(notices, outcome);
}

/**
 * The bathroom's uses, wired to `HomeLife`: the cleaning kit on the mirror cabinet's shelves (taken to the
 * kitchen table), and the hair dryer that lifts an old price sticker off a box in hand. The bath's soak is
 * the tub's own click.
 */
function furnishBathroomLife(zone: Zone, household: HouseholdContext, cabinet: MirrorCabinet): void {
  const { life } = household;
  const { kitSpot, hairDryer } = BATHROOM_PLAN.household;
  // Behind the cabinet's door: only reached with it open.
  const spot = new ClickSpot({
    size: kitSpot.size,
    label: () => (life.household.hasKit ? null : 'Cleaning kit · take it (cotton buds, isopropyl)'),
    onClick: () => {
      if (life.household.hasKit) return;
      const outcome = life.takeKit();
      if (outcome.done) playKitTake();
      showOutcome(household, outcome);
    },
  });
  placeWith(zone, cabinet, spot, new THREE.Vector3(...kitSpot.at));
  // The kit itself on the bottom shelf, there until it is taken.
  const kit = placeWith(zone, cabinet, new CabinetKit(), cabinet.bottomShelf.clone().setX(kitSpot.shelfX));
  presentWhile(zone, kit, () => !life.household.hasKit, (cb) => life.household.subscribe(cb));
  zone.placeAt(new HairDryer({
    label: (player) => life.stickerLabel(player.held?.game ?? null),
    use: (session) => {
      const game = session.held?.game;
      if (!game) {
        // A help click, not a mistake: said under the crosshair, never with the refusal buzzer.
        session.react('Bring a box with an old price sticker: warm air lifts it off.');
        return;
      }
      // A minute of warm air: the dryer's whir over a short fade, the box back in hand without its sticker.
      boxJob(household, session, game, {
        refusal: life.mayPeel(game),
        pastime: { ...HOUSEHOLD.pastime.peel, start: () => playHairDryer(2.2) },
        change: (before) => life.peelSticker(game, before),
      });
    },
  }), hairDryer);
}
