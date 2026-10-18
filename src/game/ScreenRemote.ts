import { isAction } from '@/input/actions';
import { lastDevice } from '@/input/lastDevice';
import { actionKeyLabel } from '@/ui/keys';
import type { LongplayRemote } from '@/world/screen';
import type { KeyRoute, SessionHost } from './SessionHost';

/** A press of the arrows jumps this far into the longplay (s). */
const JUMP_S = 60;
/** How long the remote's keys stay on the prompt line once a longplay came on, or after a press (ms). */
const PROMPT_MS = 9000;

/**
 * The longplay's remote at home (docs/media.md "Longplays"): Space holds it and runs it on, the arrows jump a minute
 * back or on, Backspace asks for another video of the game (the search is told not to offer that one again). The keys
 * show on the prompt line for a few seconds when a longplay comes on and after each press. Keys nothing else takes in
 * the flat; a program's pad in hand (`ProgramPlay`, earlier in the routes) keeps every key.
 */
export class ScreenRemote implements KeyRoute {
  private shownUntil = 0;

  constructor(private readonly remote: () => LongplayRemote | null, private readonly host: SessionHost) {}

  /** A longplay just came on: its keys on the prompt line a while. */
  showKeys(): void {
    // Keyboard keys only (every pad button is taken while walking): no key caps a controller cannot press.
    if (lastDevice() !== 'keyboard') return;
    this.shownUntil = performance.now() + PROMPT_MS;
    const remote = this.remote;
    const cap = (id: 'remotePause' | 'remoteBack' | 'remoteOn' | 'remoteAnother'): string => `[${actionKeyLabel(id)}]`;
    this.host.prompt(() => `${cap('remotePause')} ${remote()?.paused ? 'run it on' : 'pause'} · ${cap('remoteBack')}${cap('remoteOn')} a minute back, on · ${cap('remoteAnother')} another video`, {
      id: 'longplay-remote',
      until: () => !remote() || performance.now() > this.shownUntil || lastDevice() !== 'keyboard',
    });
  }

  onKey(code: string): boolean {
    const remote = this.remote();
    if (!remote) return false;
    if (isAction(code, 'remotePause')) {
      if (remote.paused) remote.resume();
      else remote.pause();
    } else if (isAction(code, 'remoteBack')) remote.seekBy(-JUMP_S);
    else if (isAction(code, 'remoteOn')) remote.seekBy(JUMP_S);
    else if (isAction(code, 'remoteAnother')) {
      remote.another();
      this.host.react('Another video of it, then.');
    } else return false;
    this.showKeys();
    return true;
  }
}
