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

/*
 * Wiring only, in the order things need each other (each step in `src/bootstrap/`). What is made
 * later but asked for earlier (the Session, from a console click on the stand; the zone manager,
 * from the pause menu) goes through a `late` holder, which names it if it is asked too soon.
 */
const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

const session = late<Session>('the session');
const zones = late<ZoneManager<ZoneId>>('the zone manager');
const moves = late<PlayerMoves>('the player moves');
// The engine, the stores, the sky; then the world (nothing built yet) and the player walking it.
const services = createServices(container);
const { world, player } = createWorld(services);
// The menus, the HUD and every panel, before the world: the market hall is handed its panels when its builder is bound.
const ui = createUi(services, player, { zones, session });
// The zones from WORLD_PLAN (the flat built and compiled now), the cat, the graphics, the shelves as one.
const built = buildWorld(services, { world, player, marketHall: ui.marketHall, flat: ui, session, moves });
zones.set(built.zones);
// Travel, sleep, the spot remembered across reloads, the footsteps; the crosshair and the input devices.
moves.set(createPlayerMoves(services, { world, built, player, fader: ui.fader }));
const interaction = createInteraction(services, { world, built, player, overlay: ui.overlay, moves: moves.get(), toast: ui.toast });
session.set(createSession(services, { player, ui, built, moves: moves.get(), interaction }));
startWhenReady(services.engine, world);
