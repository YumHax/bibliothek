import type { ModalLike } from '@/game/SessionParts';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { installCoverPlaceholders } from '@/ui/coverPlaceholder';
import { late } from './late';
import type { Services } from './services';
import { addPauseButtons, createMenus, type UiLate } from './uiMenus';
import { createBookPanels, createCollectionPanels, createHomePanels, createMarketPanels, wireHud } from './uiPanels';

export type Ui = ReturnType<typeof createUi>;

/**
 * The start card and pause menu with the pointer lock flow, the HUD, and every DOM panel: made before the world, in
 * the order they stack in the page (each family in `uiMenus` / `uiPanels`), so the market's hall is handed its panels
 * when its builder is bound. What they ask of the world and the Session is read on use (`holders`, the `late` ones).
 */
export function createUi(services: Services, player: FirstPersonController, holders: UiLate) {
  const menus = createMenus(services, player, holders);
  const { overlay, notices, lockFlow } = menus;
  // A thumbnail whose art does not load becomes a made-up box (platform colour, title) in every panel.
  installCoverPlaceholders(services.container);
  const collection = createCollectionPanels(services, notices);
  const market = createMarketPanels(services, notices);
  // The journal's People button opens the book made with the social panels, below.
  const peopleBook = late<ModalLike>('the People book');
  const books = createBookPanels(services, holders, peopleBook);
  addPauseButtons(services, player, holders, menus, { journalPanel: books.journalPanel, peopleBook });
  const home = createHomePanels(services, notices, holders, player);
  peopleBook.set(home.peopleBook);
  const hud = wireHud(services, player, menus, holders);
  return { overlay, lockFlow, notices, ...collection, ...market, ...books, ...home, ...hud };
}
