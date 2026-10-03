import { paint } from '../materials/palette';
import { part } from '../props/Prop';
import { UsableProp } from '../props/UsableProp';

/** A folded sheet's size (m): an A5 letter folded once, lying on its back. */
const SHEET = { w: 0.15, d: 0.105, t: 0.003 };

/**
 * A folded letter left on a surface (a scripted ad's note on the seller's sideboard, `ScriptedExtras.clue`): a click
 * reads it as a letter card. Origin on the surface under its middle. Never collides.
 */
export class NoteCard extends UsableProp {
  constructor(note: { title: string; text: string }) {
    super({
      label: () => 'A letter · read',
      use: (session) => session.read({ title: note.title, text: note.text, look: 'letter' }),
    });
    this.name = 'NoteCard';
    // Two leaves of the fold, the top one a little open; the edge a shade darker.
    part(this, SHEET.w, SHEET.t, SHEET.d, paint(0xf2ecdc, 0.85), { y: SHEET.t / 2 });
    const top = part(this, SHEET.w, SHEET.t, SHEET.d * 0.96, paint(0xe8e0cc, 0.85), { y: SHEET.t * 1.5 + 0.004, z: 0.002 });
    top.rotation.x = -0.06;
    this.rotation.y = 0.3;
    this.target(SHEET.w + 0.04, 0.05, SHEET.d + 0.04, { y: 0.02 });
  }
}
