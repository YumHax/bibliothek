import type { FirstPersonController } from '@/player/FirstPersonController';
import { SEED_GAMES } from '@/catalog';
import { flag } from '@/settings/flags';
import { seededRng, shuffled } from '@/random';
import { stagedPieces } from '@/world/build/owned';
import { inFlat, zonePlan } from '@/world/worldPlan';
import { IntroCutscene, introSeen, markIntroSeen } from '@/intro';
import type { Services } from './services';
import type { Ui } from './ui';
import type { BuiltWorld, GameWorld } from './world';

/**
 * The opening cutscene (docs/story.md "The opening"), asked first on the way into the room (`PointerLockFlow.setGate`):
 * on a new game (no progress, not `?debug`, not seen yet), or always with `?intro`, and only from the flat. Wiring only.
 */
export function createIntro(services: Services, parts: { player: FirstPersonController; ui: Ui; built: BuiltWorld; world: GameWorld }): void {
  const { engine, input, container, debug, returningPlayer } = services;
  const { player, ui, built, world } = parts;
  const forced = flag('intro');
  if (!forced && (debug || returningPlayer || introSeen())) return;
  let state: 'waiting' | 'playing' | 'done' = 'waiting';
  // The covers the dream's shelves wear: the built-in games with baked art, mixed so no shelf is one platform.
  const games = shuffled(seededRng('intro-covers'), SEED_GAMES.filter((game) => game.externalIds?.libretroName));
  ui.lockFlow.setGate((mode) => {
    if (state === 'done') return false;
    // Mid-film, nothing else enters the room (a stray tap, a pad's press): the film ends by itself.
    if (state === 'playing') return true;
    const living = world.handle('living');
    const bedroom = world.handle('bedroom');
    if (!living || !bedroom || !inFlat(built.zones.current.id)) {
      state = 'done';
      return false;
    }
    state = 'playing';
    const cutscene = new IntroCutscene({
      camera: engine.camera,
      player,
      container,
      setLook: (look, snap) => built.graphics.setLook(look, snap),
      zoneLook: () => built.graphics.setLook(zonePlan(built.zones.current.id).look, true),
      lens: built.graphics.postFx,
      living: {
        get bookcaseCount() {
          return living.shelving.bookcases.length;
        },
        standEveryBookcase: (every) => living.standEveryBookcase(every),
      },
      bed: bedroom.wakeUp,
      staged: stagedPieces,
      filmedZone: 'living',
      games,
      input,
      overlay: ui.overlay,
      engine,
      enter: (way) => {
        state = 'done';
        return ui.lockFlow.enter(way);
      },
      seen: markIntroSeen,
    });
    cutscene.play(mode);
    return true;
  });
}
