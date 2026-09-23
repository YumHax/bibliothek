/** One line of the controls help. `whileHolding` lines are repeated in the game panel footer. */
export interface ControlHint {
  html: string;
  whileHolding?: boolean;
}

export const CONTROLS: ControlHint[] = [
  { html: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> move' },
  { html: 'Double-tap <kbd>W</kbd> / <kbd>Z</kbd> to sprint (keep it held), hold <kbd>Shift</kbd> to crouch' },
  { html: '<kbd>Mouse</kbd> look around' },
  { html: '<kbd>Click</kbd> a game to pick it up' },
  { html: 'Hold <kbd>Right click</kbd> to rotate it', whileHolding: true },
  { html: 'Bring it to the TV and <kbd>Click</kbd> the TV to watch a longplay', whileHolding: true },
  { html: 'Or <kbd>Click</kbd> the ceiling projector (or its wall) to watch it big', whileHolding: true },
  { html: '<kbd>O</kbd> open / close the box', whileHolding: true },
  { html: '<kbd>Click</kbd> elsewhere or <kbd>E</kbd> to put it back', whileHolding: true },
  { html: '<kbd>Click</kbd> an armchair to sit down in front of the TV or the projector wall, move to stand up' },
  { html: '<kbd>Click</kbd> a console on the TV stand to find its games' },
  { html: '<kbd>/</kbd> or <kbd>F</kbd> search a game, <kbd>Enter</kbd> to pick the result up' },
  { html: '<kbd>R</kbd> random pick — press again to walk to it' },
  { html: '<kbd>T</kbd> sort the shelves by platform / year / title' },
  { html: '<kbd>Click</kbd> a lamp (floor lamps, ceiling light, shelf spots) to switch it on or off, a window to draw its curtains, the wall clock to jump to night or day' },
  { html: '<kbd>N</kbd> night mode' },
  { html: '<kbd>C</kbd> call the cat, <kbd>Click</kbd> it to pet it, <kbd>Click</kbd> its bowl to refill the kibble' },
  { html: '<kbd>Click</kbd> the front door in the hallway to go out: the arcade pays tickets, the flea market and its mail-order counter sell games' },
  { html: 'At a cabinet: <kbd>A</kbd><kbd>D</kbd> / arrows move, <kbd>Space</kbd> fires, <kbd>E</kbd> walks away. Exchange tickets for coins at the prize counter' },
  { html: '<kbd>Tab</kbd> your collection: statuses, import / export' },
  { html: '<kbd>Esc</kbd> release the mouse and show this screen again' },
  { html: '<kbd>Controller</kbd> sticks move and look, <kbd>A</kbd> click, <kbd>X</kbd> put back, hold <kbd>RB</kbd> rotate, <kbd>LB</kbd> crouch, click the left stick to sprint, <kbd>Start</kbd> menu' },
  { html: '<kbd>Touch</kbd> left joystick, drag right to look, tap to click, long-press to rotate' },
];
