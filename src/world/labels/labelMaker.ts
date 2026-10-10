import * as THREE from 'three';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
import type { NoticeActions } from '@/notices';
import { playPlasticClick } from '@/audio/furnitureSounds';
import { actionKeyLabel } from '@/ui/keys';
import type { LabelPanel } from '@/ui/LabelPanel';
import type { LabelMakerLike } from '@/game/Labelling';
import type { ShelvingGroup } from '../shelving/ShelvingGroup';
import type { LabelSpot, ShelfLabels } from './ShelfLabels';

/** How far a shelf edge can be labelled from (m). */
const REACH = 2.2;

interface LabelMakerOptions {
  labels: ShelfLabels;
  panel: LabelPanel;
  shelves: ShelvingGroup;
  camera: THREE.Camera;
  /** A wall stands between two world points. */
  blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  upgrades: HomeUpgrades;
  /** The player is in one of the flat's rooms (not the stairwell). */
  atHome: () => boolean;
  notices: Pick<NoticeActions, 'react' | 'tip'>;
}

/**
 * The label maker as the session's K uses it (`game/Labelling`): owned once bought at SECOND HOME (a tip says how it
 * works, the first time), aimed from the crosshair at the flat's bookcases, its panel dealt for the edge aimed at.
 */
export function labelMaker(options: LabelMakerOptions): LabelMakerLike<LabelSpot> {
  const { labels, panel, shelves, camera, blocked, upgrades, notices } = options;
  const raycaster = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);
  let owned = upgrades.has('labelMaker');
  upgrades.subscribe(() => {
    if (owned || !upgrades.has('labelMaker')) return;
    owned = true;
    notices.tip(`Label maker: aim at a shelf’s front edge, [${actionKeyLabel('labelShelf')}] prints a label.`, { id: 'label-maker' });
  });
  return {
    get owned() {
      return owned;
    },
    get atHome() {
      return options.atHome();
    },
    aim: () => {
      raycaster.setFromCamera(centre, camera);
      const ray = raycaster.ray;
      const spot = labels.aim(ray, shelves.bookcaseList(), REACH);
      // A bookcase behind a wall (the next room's) is out of reach.
      if (!spot || (spot.point && blocked(ray.origin, spot.point))) return null;
      return spot;
    },
    panelFor: (spot) => {
      const { existing } = spot;
      panel.show({
        existing: existing ? { text: existing.text, tape: existing.tape } : null,
        preview: (canvas, text, tape) => void labels.preview(canvas, text, tape),
        print: (text, tape) => {
          // Printed over an old label: that one comes off, the new one in its place.
          const refusal = labels.add(spot, text, tape, existing?.id);
          if (refusal) return refusal;
          playPlasticClick(true, 0.08);
          notices.react(`Label stuck on: ${text}`);
          return null;
        },
        ...(existing
          ? {
              peel: () => {
                labels.remove(existing.id);
                playPlasticClick(false, 0.06);
                notices.react(`Peeled off: ${existing.text}`);
              },
            }
          : {}),
      });
      return panel;
    },
  };
}
