import { isAction } from '@/input/actions';
import type { ModalLike } from './SessionParts';
import type { KeyRoute } from './SessionHost';

export interface PhotoParts {
  /** Photo mode (`src/photo`): while it is on, every key is its own. */
  photo?: { readonly isActive: boolean; enter(): void; handleKey(code: string): boolean };
  /** The journal's panel (the notebook on the hall console opens it too). */
  journalPanel?: ModalLike;
}

/** P: photo mode (while it is on every key is its own); J: the journal. */
export class PhotoControl implements KeyRoute {
  constructor(private readonly parts: PhotoParts, private readonly openPanel: (panel: ModalLike) => void) {}

  onKey(code: string): boolean {
    const { photo, journalPanel } = this.parts;
    if (photo?.isActive) return photo.handleKey(code);
    if (photo && isAction(code, 'photoMode')) {
      photo.enter();
      return true;
    }
    if (journalPanel && isAction(code, 'journal')) {
      this.openPanel(journalPanel);
      return true;
    }
    return false;
  }
}
