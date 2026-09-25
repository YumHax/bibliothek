import type { CatLike } from './SessionParts';
import { isAction } from '@/input/actions';
import type { KeyRoute, SessionHost } from './SessionHost';

export interface CatParts {
  cat?: CatLike;
}

/** How the cat was called: by name (C), or with the feather wand (an arcade prize). */
export type CatCall = 'voice' | 'feathers';

type Outcome = ReturnType<CatLike['call']>;

const LINES: Record<CatCall, Record<Outcome, (name: string) => string>> = {
  voice: {
    coming: (name) => `${name} is coming`,
    asleep: (name) => `${name} is fast asleep`,
    ignored: (name) => `${name} looks at you… and looks away`,
  },
  feathers: {
    coming: (name) => `${name} comes running for the feathers!`,
    ignored: (name) => `${name} watches the feathers swish, and decides against it.`,
    asleep: (name) => `${name} is asleep. The feathers can wait.`,
  },
};

/** Calls the cat and says how it went: the one place its answers are worded. */
export function callCat(cat: CatLike, how: CatCall): string {
  const name = cat.settings.name;
  return LINES[how][cat.call()](name);
}

/** C calls the cat over. */
export class CatCare implements KeyRoute {
  constructor(private readonly parts: CatParts, private readonly host: SessionHost) {}

  onKey(code: string): boolean {
    const { cat } = this.parts;
    if (!isAction(code, 'callCat') || !cat) return false;
    this.host.notify(callCat(cat, 'voice'), 1500);
    return true;
  }
}
