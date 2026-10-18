import type { Engine } from '@/core/Engine';
import { registerLabScenes } from '@/cheats/socialLab';
import { onWelcomeKept } from '@/onboarding/firstWelcome';
import { rememberedLook } from '@/social/lookBook';
import { findPerson } from '@/social/people';
import { playSceneNow, setSceneStage, tickScenes, welcomeKept, type SceneVisitor } from '@/social/scenes/tierScenes';
import type { PersonId } from '@/social/types';
import type { NoticeActions } from '@/notices';
import { paintKeepsake, paintPhoto } from '@/world/kitchen/keepsakeTextures';
import { randomLook } from '@/world/people/looks';
import type { BuildingServices } from '@/world/stairwell/building';
import type { StairLife } from '@/world/stairwell/noiseAndCat';
import { inFlat } from '@/world/worldPlan';
import type { ZoneManager } from '@/world/zone';
import type { ZoneId } from '@/world/zoneIds';
import type { Services } from './services';
import type { GameWorld } from './world';

/** Mme Pereira, whose first-day promise kept is the first scene of all (`onboarding/firstWelcome`). */
const CONCIERGE: PersonId = 'pereira';

/**
 * The tier scenes' stage (docs/social.md "Tier scenes"): friends come up the stairs to the flat's door (one
 * `DoorVisitor` per person, made on the stairs once asked for, while the stairwell is loaded), envelopes and notes
 * slip under the door onto the hallway's mat, a close friend's photo is the frame as the player sees it at the door.
 * Ticked by the engine; `?debug`'s Social lab plays a scene on demand. Wiring only.
 */
export function wireTierScenes(services: Services, engine: Engine, world: GameWorld, parts: { building: BuildingServices; manager: ZoneManager<ZoneId>; notices: Pick<NoticeActions, 'slip'> }): void {
  const { building, manager, notices } = parts;
  const visitors = new WeakMap<StairLife, Map<PersonId, SceneVisitor>>();
  const visitorFor = (id: PersonId): SceneVisitor | null => {
    const stairs = world.zone('stairwell');
    if (!stairs.isActive) return null;
    const life = world.build('stairwell').life;
    const card = findPerson(id);
    if (!life || !card) return null;
    let byPerson = visitors.get(life);
    if (!byPerson) visitors.set(life, (byPerson = new Map()));
    let visitor = byPerson.get(id);
    if (!visitor) byPerson.set(id, (visitor = life.visitor(rememberedLook(id) ?? randomLook(card.look.seed, card.look.role))));
    return visitor;
  };
  setSceneStage({
    slipNote: (piece) => building.doorstep.slipNote(piece),
    visitorFor,
    atHome: () => inFlat(manager.current.id),
    hour: () => services.sky.dayNight.state.hours,
    day: () => services.today.gameDay,
    snapshot: () => {
      engine.renderFrame();
      return engine.renderer.domElement;
    },
    keepsakePicture: (def, giver, key, photo) => {
      const canvas = paintKeepsake(def, giver, key);
      if (def.kind === 'photo' && photo) {
        const print = new Image();
        print.onload = () => paintPhoto(canvas, print);
        print.src = photo;
      }
      return canvas;
    },
    notices,
  });
  engine.addUpdatable({ update: (dt: number) => tickScenes(dt) });
  onWelcomeKept((day) => welcomeKept(CONCIERGE, day));
  if (services.debug) registerLabScenes({ tierScene: playSceneNow });
}
