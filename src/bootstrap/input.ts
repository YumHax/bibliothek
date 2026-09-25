import { Interactor } from '@/interaction/Interactor';
import { Highlighter } from '@/game/Highlighter';
import { GamepadInput, TouchControls, SyntheticMouse, PAD_ALIASES } from '@/input';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { applySettings } from '@/settings/apply';
import { keyLabelsChanged } from '@/ui/keys';
import type { Overlay } from '@/ui/Overlay';
import type { Services } from './services';
import type { BuiltWorld, GameWorld } from './world';
import type { PlayerMoves } from './player';
import type { Toast } from '@/ui/Toast';
import { PhotoMode } from '@/photo';
import { LOOKS } from '@/graphics';
import { zonePlan } from '@/world/worldPlan';

export type Interaction = ReturnType<typeof createInteraction>;

/**
 * The crosshair and the hands: the box in hand ticked, the search glow, and the ray that finds what
 * is clickable (following the world's live clickables and walls). Then the other devices: a
 * controller and the touch bar feed the same key / mouse channels the Session listens to, and the
 * player's settings are applied to all of them.
 */
export function createInteraction(services: Services, parts: { world: GameWorld; built: BuiltWorld; player: FirstPersonController; overlay: Overlay; moves: PlayerMoves; toast: Toast }) {
  const { engine, input, settings, container } = services;
  const { world, built, player, overlay, moves, toast } = parts;
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

  // Controller and touch feed the same key / mouse channels the session already listens to.
  const syntheticMouse = new SyntheticMouse(engine.renderer.domElement);
  const gamepad = new GamepadInput(input, player, syntheticMouse, { keyAliases: PAD_ALIASES });
  engine.addUpdatable(gamepad);
  const touch = new TouchControls(container, engine.renderer.domElement, input, player, syntheticMouse);
  applySettings(settings, { camera: engine.camera, input, mouse: player, gamepad, touch, hud: overlay, onBindingsChange: keyLabelsChanged });

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
    blocked: () => (inspector.isActive ? 'Put the game down first' : moves.travel.isTravelling || moves.sleep.isAsleep ? 'Not now' : null),
    say: (text) => toast.show(text, 2000),
  });
  engine.addUpdatable(photo);

  return { inspector, highlighter, interactor, photo };
}
