import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { StockItem } from '@/economy/StockItem';
import { ForSaleBox } from '../market/ForSaleBox';
import { pointSound } from '../build/hearing';
import { ShutDoor } from '../props/ShutDoor';
import { FuseBox } from '../stairwell/powerCut/FuseBox';
import { POWER_CUT_PLAN } from '../stairwell/powerCut/powerCutPlan';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan';
import { CELL, CELLAR_PLAN as plan, COLUMNS, ROWS, cellAt, cellCentre, type StorageBox } from './cellarPlan';
import { CellarVaults } from './CellarVaults';
import { CellarBox } from './CellarBox';
import { CellarLights } from './CellarLights';
import { StairsUp } from './CellarDoor';
import { Rat } from './Rat';
import { Boiler } from './Boiler';
import { BoilerHum, Drips } from './cellarSounds';
import { isTaken, markTaken } from './cellarFinds';
import { cellarDressers } from './huntHook';

/** Where a find comes from, for the receipt. */
const CELLAR_WHERE = 'a carton in the cellars';
/** A box front's yaw by the side it faces (its passage on its +z side). */
const FACING: Record<StorageBox['faces'], number> = { north: 0, south: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };
const STEP: Record<StorageBox['faces'], [number, number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };

/**
 * Builds the cellars into their zone from `CELLAR_PLAN`: the vaulted brick maze (`CellarVaults`), the storage boxes'
 * slatted fronts (`CellarBox`: ours to open, two abandoned, the rest padlocked), the one-off finds in their cartons
 * (a game each, a `ForSaleBox` that is `free`: looked at in hand, B takes it, once for good), the
 * lights (the player's torch, the timer bulbs and their buttons), the boiler room with its boiler and the main fuse
 * board (a power cut is reset here too), the rat, the drips, the stairs back up to the hall, and whatever another
 * feature dresses the cellars with (`huntHook`). A zone reached by travel only, no `Room`: returns its light level.
 */
export function furnishCellar(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'listener' | 'acoustics' | 'collection' | 'covers' | 'market' | 'money' | 'today'>): ZoneHandle {
  const { listener, acoustics } = ctx;
  const hearing = { listener, acoustics };
  const origin = new THREE.Vector3();
  const vaults = zone.place(new CellarVaults(), origin);
  const lights = zone.place(new CellarLights(listener), origin);
  for (const button of lights.buttons) zone.place(button, button.position.clone(), button.rotation.y);
  zone.place(new Rat(listener), origin);

  // The stairs up to the hall: the door at the top, and the steps to click to go up, set down in front of the hall's cellar door.
  zone.place(new ShutDoor({ style: 'panelled', mat: false }), vaults.door.at, vaults.door.yaw);
  const [hx, hz] = plan.hallReturn.at;
  const [sx, sy, sz] = STAIRWELL_PLAN.origin;
  zone.place(new StairsUp(vaults.stairsBox, plan.stairs.label, { position: new THREE.Vector3(sx + hx, sy, sz + hz), yaw: plan.hallReturn.yaw }), origin);

  // The storage boxes and their finds.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      const box = plan.boxes.find((b) => String(b.n) === cellAt(c, r));
      if (!box) continue;
      const [x, z] = cellCentre(c, r);
      const [dc, dr] = STEP[box.faces];
      const front = zone.place(new CellarBox(box), new THREE.Vector3(x + (dc * CELL) / 2, 0, z + (dr * CELL) / 2), FACING[box.faces]);
      if (box.find && !isTaken(box.n)) void placeFind(zone, front, ctx);
    }
  }

  // The boiler room: the boiler on the east wall, the main fuse board on the north wall, a pipe along the vault.
  const [bx, bz] = cellCentre(...plan.boiler.cell);
  const h = CELL / 2;
  zone.place(new Boiler(), new THREE.Vector3(bx + h - 0.4, 0, bz));
  zone.place(new FuseBox(POWER_CUT_PLAN.fuse, 'MAIN BOARD · BUILDING'), new THREE.Vector3(bx - 0.2, 1.5, bz + h - 0.005), Math.PI);
  zone.place(pointSound(hearing, new BoilerHum(), { referenceDistance: 1.2, rolloff: 1.2, maxDistance: 9 }), new THREE.Vector3(bx + h - 0.4, 0.9, bz));
  for (const [c, r] of plan.drips) {
    const [x, z] = cellCentre(c, r);
    zone.place(pointSound(hearing, new Drips(), { referenceDistance: 0.8, rolloff: 1.3, maxDistance: 7 }), new THREE.Vector3(x, 0.1, z));
  }

  // What other features put down here (the treasure hunt's clue).
  for (const dress of cellarDressers()) dress(zone, plan.huntSpots);

  return {
    lightLevel: () => lights.lightLevel(),
    surfaceAt: () => 'concrete',
  };
}

/**
 * The game in box `front`'s carton: one drawn for the box (the same each time, a game the player does not own), laid
 * on the carton, free to take; taken, it is gone for good (`cellarFinds`).
 */
async function placeFind(zone: Zone, front: CellarBox, { covers, collection, money, market }: Pick<BuildContext, 'covers' | 'collection' | 'money' | 'market'>): Promise<void> {
  // `zone.isLoaded` stays true once the cellars' code is fetched: only this says they went away before the draw came.
  let unloaded = false;
  zone.onUnload(() => {
    unloaded = true;
  });
  const games = await market.stock.randomGames(`cellar:${front.number}`, 6).catch(() => []);
  const game = games.find((g) => !collection.owns(g.id));
  if (!game || unloaded) return;
  const item = new StockItem(game, 'worn', 'bin', { list: 0, final: true });
  const box = new ForSaleBox(item, covers, {
    pose: { kind: 'flat' },
    tag: false,
    wallet: money.wallet,
    where: CELLAR_WHERE,
    free: true,
    isWanted: () => collection.isWanted(game.id),
    thanks: () => 'Nobody will miss it down here.',
  });
  const at = zone.toLocal(front.localToWorld(front.cartonTop.clone()));
  box.onSold = () => {
    zone.remove(box);
    markTaken(front.number);
  };
  zone.place(box, at, front.rotation.y + 0.3);
}
