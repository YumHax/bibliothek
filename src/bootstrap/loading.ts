import { LoadingScreen } from '@/ui/loading/LoadingScreen';
import { onWorldLoad } from '@/ui/worldLoad';
import { FLAT } from '@/world/zoneIds';

/** The start's steps, in the order `main.ts` and `buildWorld` announce them: every room of the flat is one. */
const STEPS = ['services', 'ui', 'world', ...FLAT, 'life', 'prime', 'session', 'zone'] as const;

type LoadingStep = (typeof STEPS)[number];

/** What the bootstrap steps tell the loading screen. */
export interface Loading {
  /** The start moved on to `name` (`line` under the bar, when given); resolves once the page has painted it. */
  step(name: LoadingStep, line?: string): Promise<void>;
  /** The start threw: the screen says so, and the error goes on to the console. */
  fail(error: unknown): void;
}

/**
 * The loading screen `index.html` painted (`ui/loading`) handed to the bootstrap: it leaves when the first zone is
 * ready (`ui/worldLoad`), or at once when that fails, so the start card's Retry shows.
 */
export function startLoading(): Loading {
  const screen = LoadingScreen.fromPage(STEPS);
  const stop = onWorldLoad((state) => {
    if (state === 'loading' || !screen) return;
    if (state === 'ready') screen.finish();
    else screen.abandon();
    queueMicrotask(() => stop());
  });
  return {
    step: (name, line) => (screen ? screen.step(name, line) : Promise.resolve()),
    fail: (error) => {
      screen?.fail();
      console.error('[boot] the start failed', error);
    },
  };
}
