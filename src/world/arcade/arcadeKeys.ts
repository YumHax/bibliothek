import { ACTIONS } from '@/input/actions';

/**
 * The keys every arcade machine reads straight from `Input` while the player is at it: the stick's
 * four ways and the fire button, from the action table (`input/actions`: game codes, so WASD is ZQSD
 * on AZERTY and a rebound key follows).
 */
export const ARCADE_KEYS = {
  left: ACTIONS.stickLeft.codes,
  right: ACTIONS.stickRight.codes,
  up: ACTIONS.stickUp.codes,
  down: ACTIONS.stickDown.codes,
  fire: ACTIONS.fire.codes,
} as const satisfies Record<string, readonly string[]>;
