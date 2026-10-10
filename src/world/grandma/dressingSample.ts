import * as THREE from 'three';
import type { DayNight } from '../props/DayNight';
import { ChinaCabinet } from './ChinaCabinet';
import { LongcaseClock } from './LongcaseClock';
import { KitchenDresser } from './KitchenDresser';
import { EnamelCooker } from './EnamelCooker';
import { WhistlingKettle } from './WhistlingKettle';
import { OldTelevision } from './OldTelevision';
import { PhoneTable } from './PhoneTable';
import { TeaTray } from './TeaTray';
import { Footstool } from './Footstool';
import { MagazineRack } from './MagazineRack';
import { CrochetThrow } from './CrochetThrow';
import { Figurine } from './Figurine';
import { StandingPhoto } from './StandingPhoto';
import { BirdCage } from './BirdCage';
import { Doily } from './Doily';
import { TableCloth } from './TableCloth';
import { SundayTable } from './SundayTable';
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';

/**
 * Every piece of Mémé's dressing (`furnishGrandmaDecor`) in a row, 1.5 m apart, for the headless checks
 * (`surface/zfightCatalogue`): what her plan's decor list does not name. The Sunday table laid, on its cloth.
 */
export function grandmaDressingSample(clock: DayNight): THREE.Group {
  const group = new THREE.Group();
  const lunch = new SundayTable(PLAN.dressing.lunch);
  lunch.setSunday(true);
  const cloth = new TableCloth({ width: PLAN.table.width, depth: PLAN.table.depth, top: 0.75 });
  lunch.position.y = cloth.topHeight;
  const pieces: THREE.Object3D[] = [
    new ChinaCabinet(),
    new LongcaseClock(clock),
    new KitchenDresser(),
    new EnamelCooker(),
    new WhistlingKettle(),
    new OldTelevision(),
    new PhoneTable(),
    new TeaTray(),
    new Footstool(),
    new MagazineRack(),
    new CrochetThrow(),
    new Figurine('lady'),
    new Figurine('dog'),
    new Figurine('vase'),
    new StandingPhoto('christmas95'),
    new BirdCage(() => true),
    new Doily(0.17, 1.9),
    new THREE.Group().add(cloth, lunch),
  ];
  pieces.forEach((piece, i) => {
    piece.position.x = i * 1.5;
    group.add(piece);
  });
  return group;
}
