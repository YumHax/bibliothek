import type { Game } from '@/catalog/types';
import type { ProgramProvider, ScreenProgram } from './ScreenProgram';

/** Every provider registered, asked in order; the first that knows the game wins. */
const providers: ProgramProvider[] = [];

/**
 * Registers what runs some games on the screen instead of a longplay (the emulator for the homebrew carts, a canvas
 * game). Call once at start-up (a module's top level, imported by `onscreen/index.ts` or a bootstrap step); returns
 * an unregister function.
 */
export function registerProgram(provider: ProgramProvider): () => void {
  providers.push(provider);
  return () => {
    const i = providers.indexOf(provider);
    if (i >= 0) providers.splice(i, 1);
  };
}

/** The program `game` runs as, or null: `game/Screens.playOn` asks this before searching a longplay. */
export function programFor(game: Game): (() => ScreenProgram) | null {
  for (const provider of providers) {
    const make = provider(game);
    if (make) return make;
  }
  return null;
}
