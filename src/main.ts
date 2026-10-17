import type { Session } from '@/game/Session';
import type { ZoneId } from '@/world/zoneIds';
import type { ZoneManager } from '@/world/zone';
import { late } from '@/bootstrap/late';
import { createServices } from '@/bootstrap/services';
import { createUi } from '@/bootstrap/ui';
import { buildWorld, createWorld, startWhenReady } from '@/bootstrap/world';
import { createPlayerMoves, type PlayerMoves } from '@/bootstrap/player';
import { createInteraction } from '@/bootstrap/input';
import { createSession } from '@/bootstrap/session';
import { createIntro } from '@/bootstrap/intro';
import { startLoading, type Loading } from '@/bootstrap/loading';

/*
 * Wiring only, in the order things need each other (each step in `src/bootstrap/`). What is made
 * later but asked for earlier (the Session, from a console click on the stand; the zone manager,
 * from the pause menu) goes through a `late` holder, which names it if it is asked too soon.
 */
const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

// The loading screen index.html painted: each step below moves its bar on, and lets the page paint it.
const loading = startLoading();
start(container, loading).catch((error: unknown) => loading.fail(error));

async function start(container: HTMLElement, loading: Loading): Promise<void> {
  const session = late<Session>('the session');
  const zones = late<ZoneManager<ZoneId>>('the zone manager');
  const moves = late<PlayerMoves>('the player moves');
  // The engine, the stores, the sky; then the world (nothing built yet) and the player walking it.
  await loading.step('services', 'Turning the key');
  const services = createServices(container);
  const { world, player } = createWorld(services);
  // The menus, the HUD and every panel, before the world: the market hall is handed its panels when its builder is bound.
  await loading.step('ui', 'Switching on the lights');
  const ui = createUi(services, player, { zones, session });
  // The zones from WORLD_PLAN (the flat built and compiled now, room by room), the cat, the graphics, the shelves as one; it sets `zones`.
  const built = await buildWorld(services, { world, player, marketHall: ui.marketHall, flat: ui, session, moves, zones }, loading);
  // Travel, sleep, the spot remembered across reloads, the footsteps; the crosshair and the input devices.
  await loading.step('session', 'Dusting the shelves');
  moves.set(createPlayerMoves(services, { world, built, player, fader: ui.fader }));
  const interaction = createInteraction(services, { world, built, player, overlay: ui.overlay, moves: moves.get(), notices: ui.notices });
  session.set(createSession(services, { player, ui, built, moves: moves.get(), interaction }));
  // The opening cutscene, asked first on the way into the room (a new game only, or `?intro`).
  createIntro(services, { player, ui, built, world });
  await loading.step('zone', 'Opening the door');
  startWhenReady(services.engine, world);
}
