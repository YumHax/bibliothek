import { Vector3 } from 'three';
import { Interactor } from '@/interaction/Interactor';
import { Highlighter } from '@/game/Highlighter';
import { GamepadInput, TouchControls, SyntheticMouse, PAD_ALIASES } from '@/input';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { applySettings } from '@/settings/apply';
import { keyLabelsChanged } from '@/ui/keys';
import { hudSlot } from '@/ui/hudSlot';
import { scrollPanel } from '@/ui/menu/MenuNav';
import type { Overlay } from '@/ui/Overlay';
import type { Services } from './services';
import type { BuiltWorld, GameWorld } from './world';
import type { PlayerMoves } from './player';
import type { NoticeActions } from '@/notices';
import type { SpeechLayer } from '@/notices/SpeechLayer';
import { PhotoMode } from '@/photo';
import { LOOKS } from '@/graphics';
import { inFlat, zonePlan } from '@/world/worldPlan';
import { FurnitureCarrier } from '@/furnishing/FurnitureCarrier';
import { PlanView } from '@/furnishing/planView/PlanView';
import { friendsIn } from '@/furnishing/friendsIn';
import { ShelfPlacing } from '@/world/shelving/ShelfPlacing';
import { BoxTipping } from '@/world/shelving/BoxTipping';
import { ShelfView } from '@/shelfView/ShelfView';
import { BookcaseFronts } from '@/shelfView/BookcaseFronts';
import { primaryCode } from '@/input/actions';
import { SecondHand } from '@/interaction/SecondHand';
import { Armful } from '@/interaction/Armful';

export type Interaction = ReturnType<typeof createInteraction>;

/** The body the bookcase view's eye keeps clear of furniture (m): narrower than the walk's, a glance past a sofa's arm. */
const VIEW_BODY = 0.2;

/**
 * The crosshair and the hands: the box in hand ticked, the search glow, and the ray that finds what
 * is clickable (following the world's live clickables and walls). Then the other devices: a
 * controller and the touch bar feed the same key / mouse channels the Session listens to, and the
 * player's settings are applied to all of them.
 */
export function createInteraction(services: Services, parts: { world: GameWorld; built: BuiltWorld; player: FirstPersonController; overlay: Overlay; moves: PlayerMoves; notices: NoticeActions & { setTipsShown(shown: boolean): void; speech: Pick<SpeechLayer, 'setLineOfSight'> } }) {
  const { engine, input, settings, container } = services;
  const { world, built, player, overlay, moves, notices } = parts;
  const { inspector, graphics, zones } = built;
  engine.addUpdatable(inspector);

  const highlighter = new Highlighter();
  engine.addUpdatable(highlighter);

  const interactor = new Interactor(engine.camera);
  interactor.add(...world.interactables);
  world.onInteractableAdded((item) => interactor.add(item));
  world.onInteractableRemoved((item) => interactor.remove(item));
  // The walls cut the crosshair ray: nothing is clickable through them.
  interactor.addOccluders(...world.occluders);
  world.onOccluderAdded((object) => interactor.addOccluders(object));
  world.onOccluderRemoved((object) => interactor.removeOccluders(object));
  engine.addUpdatable(interactor);
  // The crosshair aims from the steady eye (not the walk's bob), and a speech bubble is not drawn over a wall.
  interactor.eyeSway = player.eyeSway;
  notices.speech.setLineOfSight((from, to) => interactor.blocked(from, to));
  // Moving things about the flat (right-click or M, docs/furnishing.md): the box in hand into any shelf's gap, the furniture about its room.
  const blocked = (from: Vector3, to: Vector3) => interactor.blocked(from, to);
  // A second box held beside the one in hand to compare (C), and boxes carried behind it in the arms (Y): docs/furnishing.md.
  const secondHand = new SecondHand(inspector, engine.camera, engine.scene);
  engine.addUpdatable(secondHand);
  const armful = new Armful(inspector, engine.scene);
  engine.addUpdatable(armful);
  // Aimed from the crosshair, or the bookcase view's cursor (`interactor.aim`); nothing is shelved out of a full armful.
  const shelfPlacing = new ShelfPlacing(engine.camera, engine.scene, built.shelves, inspector, blocked, services.showcases, interactor.aim, () => armful.boxes.length > 0);
  engine.addUpdatable(shelfPlacing);
  const friends = friendsIn(world.zones.filter((zone) => inFlat(zone.id)));
  const furniture = new FurnitureCarrier(engine.camera, services.furnishings, {
    blocked,
    scene: engine.scene,
    handsFree: () => player.isLocked && !inspector.current && !player.isSeated,
    // The flat's rooms (not the stairwell): a piece carried through a doorway follows, one put away comes out there.
    roomHere: () => (built.activity.atHome ? zones.current : null),
    // Nothing is set down on the cat nor on a friend visiting (the player's own feet the carrier minds itself).
    occupants: () => [
      ...(built.cat.adopted ? [{ at: built.cat.getWorldPosition(new Vector3()), radius: 0.3, height: 0.35, name: services.catSettings.settings.name }] : []),
      ...friends.around().map((friend) => ({ at: friend.getWorldPosition(new Vector3()), radius: 0.3, height: 1.75, name: friend.name })),
    ],
  });
  engine.addUpdatable(furniture);
  // Q held at home with free hands: the box looked at tips half out of its row to be read (docs/furnishing.md "Tipping a box out").
  engine.addUpdatable(new BoxTipping({
    input,
    key: primaryCode('tipBox'),
    camera: engine.camera,
    boxes: () => [...built.shelves.boxes, ...services.showcases.boxes()],
    // Not while frozen (a program's pad in hand standing up, an arcade play): Q is no pad key, but nothing moves then.
    allowed: () => player.isLocked && player.movementEnabled && !inspector.current && !player.isSeated && !furniture.piece && built.activity.inFlat,
    blocked,
  }));
  // Facing a bookcase (a click on it between its boxes, or B): the eye square before it, a cursor over its boxes (docs/furnishing.md "The bookcase view").
  const shelfView = new ShelfView({ camera: engine.camera, canvas: engine.renderer.domElement, container, scene: engine.scene, player, interactor, shelves: built.shelves, hand: inspector, blocked, inFurniture: (at) => player.bodyBlockedAt(at, VIEW_BODY) });
  engine.addUpdatable(shelfView);
  engine.addUpdatable(new BookcaseFronts({
    scene: engine.scene,
    bookcases: () => built.shelves.bookcaseList().map((b) => b.shelf),
    interactor,
    // Facing one already, or seated: only the boxes are clicked.
    passing: () => shelfView.active || player.isSeated,
  }));

  // Controller and touch feed the same key / mouse channels the session already listens to.
  const syntheticMouse = new SyntheticMouse(engine.renderer.domElement);
  // A controller unplugged while it was the way in: back to the menu (nothing else would move), and a word either way.
  const gamepad = new GamepadInput(input, player, syntheticMouse, {
    keyAliases: PAD_ALIASES,
    // Out of the room the right stick scrolls the open panel.
    onScroll: (pixels) => void scrollPanel(pixels),
    // The right trigger held brings the box in hand close to read (the mouse wheel's job), at home only: at the market it buys.
    onRightTrigger: (pressure) => inspector.holdClose(built.activity.inFlat ? pressure : 0),
    // The d-pad turns the box looked at a face at a time, and walks the bookcase view's rows and bookcases: no step then.
    dpadWalks: () => !inspector.examining && !(shelfView.active && !shelfView.isParked),
    onConnectionChange: (connected) => {
      if (connected) {
        // In the room with the mouse, a button does nothing until the menu is up: say the way in that works.
        notices.tip(player.hasPointerLock ? 'Controller connected: [Start], then any button.' : 'Controller connected: press any button.', { id: 'controller', head: 'Controller', ms: 4000 });
        return;
      }
      if (player.isVirtualLocked && document.body.classList.contains('input-gamepad')) player.exitVirtual();
      notices.react('The controller has gone quiet: unplugged, or out of battery.');
    },
  });
  engine.addUpdatable(gamepad);
  // The "rotating" badge joins the HUD's column under the crosshair (the input layer knows no HUD: the slot is handed in).
  // Two fingers on the look side pinch the box in hand closer to read, or back (the mouse wheel's job).
  const touch = new TouchControls(container, engine.renderer.domElement, input, player, syntheticMouse, {
    badgeHome: hudSlot(container, 'crosshair'),
    // In photo mode the pinch is the lens's zoom; else it brings the box in hand closer.
    onPinch: (amount) => (photo.isActive ? photo.pinch(amount) : inspector.pinch(amount)),
  });
  applySettings(settings, { input, mouse: player, player, inspector, notices, gamepad, touch, hud: overlay, display: engine, onBindingsChange: keyLabelsChanged });

  // Photo mode (P): the HUD away, a free camera on a leash, the lens and the grade, a PNG of the frame (docs/graphics.md).
  const photo = new PhotoMode({
    camera: engine.camera,
    canvas: engine.renderer.domElement,
    renderFrame: () => engine.renderFrame(),
    player,
    keys: input,
    postFx: graphics.postFx,
    zoneLook: () => LOOKS[zonePlan(zones.current.id).look ?? 'home'],
    setLook: (look, snap) => graphics.setLook(look, snap),
    container,
    interactor,
    // Facing a bookcase the view is the cursor's (it would hold the look still under the photo's): back from it first.
    blocked: (): string | null => (inspector.isActive ? 'Put the game down first' : shelfView.active ? 'Step back from the bookcase first' : furniture.piece || planView.isOpen ? 'Set the furniture down first' : moves.travel.isTravelling || moves.sleep.isAsleep || built.pastimes.isBusy ? 'Not now' : null),
    say: (text) => notices.refuse(text),
    kept: (shot) => services.photoRoll.keep(shot),
  });
  engine.addUpdatable(photo);

  // The room from above (L, docs/furnishing.md): its furniture moved with the mouse on the same grid.
  const planView = new PlanView({
    camera: engine.camera,
    canvas: engine.renderer.domElement,
    container,
    scene: engine.scene,
    player,
    carrier: furniture,
    zone: () => zones.current,
    interactor,
    blocked: (): string | null => (inspector.isActive ? 'Put the game down first' : photo.isActive ? 'Not in photo mode' : moves.travel.isTravelling || moves.sleep.isAsleep || built.pastimes.isBusy ? 'Not now' : null),
    say: (text) => notices.refuse(text),
  });
  engine.addUpdatable(planView);

  return { inspector, highlighter, interactor, photo, touch, shelfPlacing, furniture, planView, shelfView, secondHand, armful };
}
