import type { GameBox } from '@/world/GameBox';
import type { CoreParts } from './SessionParts';
import { isAction } from '@/input/actions';
import { lastDevice } from '@/input/lastDevice';
import type { KeyRoute } from './SessionHost';
import type { PaperReader } from '@/world/box/papers/PaperReader';
import { playSleeveSlide } from '@/audio/furnitureSounds';
import { mediaWord } from '@/world/box/unplayable';
import { actionCap } from '@/ui/verb';
import { actionKeyLabel } from '@/ui/keys';

export interface HandsParts extends Pick<CoreParts, 'inspector' | 'panel' | 'notices'> {
  /** The box's papers read in front of the eye (the booklet, a card, a leaflet, a poster: `world/box/papers`). */
  papers?: PaperReader;
}

/**
 * The box in the player's hand: taken (its panel shows), put back (E; a click at nothing does nothing), opened
 * (O), looked at (brought to the middle of the view: the arrows turn it a face at a time, Backspace back to its
 * front, a step walks on with it in the hand); open, its booklet and papers taken out and read (V: the arrows turn
 * the pages, the up and down arrows go from paper to paper, V or E puts them back). `letGo` runs on either move: the
 * market copy in hand is let go, a stale search glow cleared.
 */
export class Hands implements KeyRoute {
  /** The cartridge was lifted out while the box was looked at already: put back in, the box stays looked at. */
  private examinedBeforeLift = false;

  constructor(private readonly parts: HandsParts, private readonly letGo: (taking: boolean) => void) {}

  get held(): GameBox | null {
    return this.parts.inspector.current;
  }

  pickUp(box: GameBox): void {
    this.letGo(true);
    this.parts.inspector.keepClose = false;
    this.parts.inspector.inspect(box);
    this.parts.panel.show(box.game);
    this.parts.panel.setBackShown(false);
  }

  putBack(): void {
    this.parts.papers?.closeNow();
    this.letGo(false);
    this.parts.inspector.keepClose = false;
    this.parts.inspector.release();
    this.parts.panel.hide();
  }

  /**
   * The keys a box looked at answers to, as one prompt line (null: not looked at): closer (or, in the loupe, its front
   * again), the faces, put back. The faces are the keyboard's arrows: on a controller or a touchscreen the stick or
   * the finger turns it, and the line says only what its buttons do.
   */
  keysLine(): string | null {
    const { inspector } = this.parts;
    if (!inspector.examining) return null;
    const reading = this.readingLine();
    if (reading) return reading;
    const back = `[${actionCap('putBack')}] put back`;
    if (lastDevice() !== 'keyboard') return `[${this.closerCap()}] closer · ${back}`;
    const faces = `[${actionKeyLabel('turnBoxLeft')}${actionKeyLabel('turnBoxRight')}${actionKeyLabel('turnBoxUp')}${actionKeyLabel('turnBoxDown')}] faces`;
    if (inspector.magnifying) return `${faces} · [${actionKeyLabel('squareBox')}] its front · ${back}`;
    return `[Wheel] closer · ${faces} · ${back}`;
  }

  /** The cap for "bring it closer" with the device in hand: the wheel, the right trigger, a pinch. */
  closerCap(): string {
    const device = lastDevice();
    return device === 'gamepad' ? 'RT' : device === 'touch' ? 'Pinch' : 'Wheel';
  }

  /**
   * The keys of a paper read (null: none is): its pages (or, a sheet, turned over), the other papers of the box or the
   * loupe, and back in the box. On a controller or a touchscreen a sweep of the stick or the finger turns a page.
   */
  private readingLine(): string | null {
    const held = this.parts.papers?.reading ? this.parts.papers.held : null;
    if (!held) return null;
    const away = `[${actionKeyLabel('readBooklet')}] put it back`;
    if (lastDevice() !== 'keyboard') return `[${this.closerCap()}] closer · ${away}`;
    const turn = held.sheet ? `[${actionKeyLabel('pageOn')}] turn over` : `[${actionKeyLabel('pageBack')}${actionKeyLabel('pageOn')}] pages`;
    const more = held.count > 1 ? `[${actionKeyLabel('paperBefore')}${actionKeyLabel('paperAfter')}] the other papers` : `[Wheel] closer`;
    return `${turn} · ${more} · ${away}`;
  }

  /** The box open in hand: its booklet lifted out and opened in front of the eye, its papers under it; again, back in. Shut, or without one, a word. */
  private readBooklet(): void {
    const { papers, inspector } = this.parts;
    const box = inspector.current;
    if (!box || !papers) return;
    if (papers.active) return papers.close();
    if (!box.hasBooklet) return this.parts.notices.react('No booklet in this one: it went before it came to you.');
    if (!box.isOpen) return this.parts.notices.react(`Open it first: the booklet is inside.`);
    // The cartridge lifted out goes back in its tray first: one thing in front of the eye at a time.
    if (box.mediaLifted) {
      box.liftMedia();
      this.dropOrKeepClose(false);
    }
    papers.show(box);
  }

  /**
   * A paper out of the box being read: the arrows are its pages and the other papers, E (or V) puts it back in the box
   * (the box stays in hand), a step puts it back and walks on; O shuts the box on it. Keys of the box itself (T, R) do
   * nothing meanwhile. False: the key goes on.
   */
  private onReadingKey(code: string): boolean {
    const papers = this.parts.papers!;
    if (isAction(code, 'putBack', 'readBooklet')) papers.close();
    else if (isAction(code, 'forward', 'back', 'left', 'right')) {
      papers.close();
      this.parts.inspector.examine(false);
      return false;
    }
    // The box's face keys share the arrows and bring the controller's d-pad: it leafs through the paper, never turns the box behind it.
    else if (isAction(code, 'pageOn', 'turnBoxRight')) papers.turn(1);
    else if (isAction(code, 'pageBack', 'turnBoxLeft')) papers.turn(-1);
    else if (isAction(code, 'paperAfter', 'turnBoxDown')) papers.nextPaper(1);
    else if (isAction(code, 'paperBefore', 'turnBoxUp')) papers.nextPaper(-1);
    else if (isAction(code, 'openBox')) {
      papers.closeNow();
      return false;
    } else if (!isAction(code, 'liftMedia', 'turnBox', 'squareBox')) return false;
    return true;
  }

  /** The box open in hand: its cartridge (or disc) lifted out to read the label, brought close; again, back in its tray. */
  private liftMedia(): void {
    const { inspector } = this.parts;
    const box = inspector.current;
    if (!box) return;
    if (box.mediaOut) return this.parts.notices.react(`The ${mediaWord(box)} is in the console just now.`);
    if (!box.isOpen) return this.parts.notices.react(`Open it first: the ${mediaWord(box)} is inside.`);
    if (!box.liftMedia()) return;
    playSleeveSlide(0.03);
    // Lifted: the box looked at, close enough to read the label; put back: back to arm's length, unless it was looked at before.
    if (box.mediaLifted) this.examinedBeforeLift = inspector.examining;
    this.dropOrKeepClose(box.mediaLifted);
  }

  /** The cartridge lifted (`lifted`) keeps the box looked at; back in its tray, the box goes back to where it was held before. */
  private dropOrKeepClose(lifted: boolean): void {
    const { inspector } = this.parts;
    inspector.keepClose = lifted;
    if (lifted) inspector.examine(true);
    else if (!this.examinedBeforeLift) inspector.examine(false);
  }

  /** The card shows the whole blurb while the back of the box faces the eye (`setBackShown`), as the back prints it. */
  private showSide(): void {
    playSleeveSlide(0.035); // the box turned in the hand
    this.parts.panel.setBackShown(this.parts.inspector.facingBack);
  }

  onKey(code: string): boolean {
    const { inspector } = this.parts;
    if (!inspector.isActive) return false;
    if (this.parts.papers?.out && this.onReadingKey(code)) return true;
    if (isAction(code, 'putBack')) this.putBack();
    else if (isAction(code, 'openBox')) {
      // Shut on a lifted cartridge: it drops back in its tray, and the box goes back to where it was held with it.
      if (inspector.current?.mediaLifted) this.dropOrKeepClose(false);
      inspector.keepClose = false;
      inspector.toggleOpen();
    }
    else if (isAction(code, 'readBooklet')) this.readBooklet();
    else if (isAction(code, 'liftMedia')) this.liftMedia();
    else if (isAction(code, 'turnBox')) {
      if (inspector.turnOver()) this.showSide();
    }
    else if (inspector.examining) return this.onExamineKey(code);
    else return false;
    return true;
  }

  /** A box looked at: the arrows turn it a face at a time, Backspace brings its front back; a step walks on with it in the hand (the key goes on to the walk). */
  private onExamineKey(code: string): boolean {
    const { inspector } = this.parts;
    if (isAction(code, 'forward', 'back', 'left', 'right')) {
      inspector.examine(false);
      return false;
    }
    const way = isAction(code, 'turnBoxLeft') ? 'left' : isAction(code, 'turnBoxRight') ? 'right' : isAction(code, 'turnBoxUp') ? 'up' : isAction(code, 'turnBoxDown') ? 'down' : null;
    if (way) {
      if (inspector.turnFace(way)) this.showSide();
      return true;
    }
    if (isAction(code, 'squareBox')) {
      if (inspector.squareUp()) this.showSide();
      return true;
    }
    return false;
  }
}
