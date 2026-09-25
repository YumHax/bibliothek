/** Which tab of the Controls screen a line sits under. */
export type ControlGroup = 'room' | 'arcade' | 'market' | 'devices';

export const CONTROL_GROUPS: Array<{ id: ControlGroup; label: string }> = [
  { id: 'room', label: 'At home' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'market', label: 'Flea market' },
  { id: 'devices', label: 'Controller & touch' },
];

/**
 * One line of the controls help. `whileHolding` lines are repeated in the game panel footer;
 * `essential` lines are also on the title screen. Without a `group` a line goes under "At home".
 */
export interface ControlHint {
  html: string;
  group?: ControlGroup;
  whileHolding?: boolean;
  essential?: boolean;
}

export const CONTROLS: ControlHint[] = [
  { html: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> move, <kbd>Mouse</kbd> look around', essential: true },
  { html: 'Double-tap <kbd>W</kbd> / <kbd>Z</kbd> to sprint (keep it held), hold <kbd>Shift</kbd> to crouch' },
  { html: '<kbd>Click</kbd> a game to pick it up', essential: true },
  { html: 'Hold <kbd>Right click</kbd> to rotate it', whileHolding: true },
  { html: 'Bring it to the TV and <kbd>Click</kbd> the TV to watch a longplay', whileHolding: true },
  { html: 'Or <kbd>Click</kbd> the ceiling projector (or its wall) to watch it big', whileHolding: true },
  { html: '<kbd>O</kbd> open / close the box', whileHolding: true },
  { html: '<kbd>Click</kbd> elsewhere or <kbd>E</kbd> to put it back', whileHolding: true },
  { html: '<kbd>Click</kbd> an armchair to sit down in front of the TV or the projector wall, move to stand up' },
  { html: '<kbd>Click</kbd> a console on the TV stand to find its games' },
  { html: '<kbd>/</kbd> or <kbd>F</kbd> search a game, <kbd>Enter</kbd> to pick the result up', essential: true },
  { html: '<kbd>R</kbd> random pick — press again to walk to it' },
  { html: '<kbd>T</kbd> sort the shelves by platform / year / title' },
  { html: '<kbd>Click</kbd> a lamp (floor lamps, ceiling light, shelf spots) to switch it on or off, a window to draw its curtains or blind, a wall clock to hear the time (click twice for an alarm in an hour)' },
  { html: '<kbd>Click</kbd> doors, drawers, the fridge and cupboards to open them; the kettle, toaster, radio, taps, the flush and the bath all work' },
  { html: 'In bed, <kbd>Click</kbd> the bed again to sleep until morning' },
  { html: '<kbd>N</kbd> night mode' },
  { html: '<kbd>C</kbd> call the cat, <kbd>Click</kbd> it to pet it, <kbd>Click</kbd> its bowl to refill the kibble' },
  { html: '<kbd>Tab</kbd> your collection: statuses, import / export', essential: true },
  { html: '<kbd>Esc</kbd> release the mouse and pause', essential: true },
  { html: '<kbd>Click</kbd> the key bowl on the hall console to take your keys, then the front door to go out: the arcade pays tickets, the flea market and its mail-order counter sell games', essential: true },
  { html: 'At the flea market: <kbd>Click</kbd> a game to look closer, then <kbd>B</kbd> buy, <kbd>H</kbd> haggle (offers <kbd>1</kbd>–<kbd>3</kbd>, <kbd>Enter</kbd> takes their price; once a day per copy), <kbd>R</kbd> hold it for the day, <kbd>X</kbd> swap one of yours, <kbd>O</kbd> open it (fakes show inside)', group: 'market' },
  { html: 'Just bought and regret it? <kbd>U</kbd> within a few seconds hands it back. Hold <kbd>Q</kbd> to read the titles and prices on the stalls from the aisle', group: 'market' },
  { html: 'The notice board by the door: collectors’ wanted cards, private sales, the collectors’ club and your reputation. The glass case opens once the market knows you; a coffee softens the stallholders', group: 'market' },
  { html: 'At a cabinet: <kbd>A</kbd><kbd>D</kbd> / arrows move, <kbd>Space</kbd> fires, <kbd>E</kbd> walks away. A record asks for your initials: <kbd>W</kbd><kbd>S</kbd> letter, <kbd>Space</kbd> next', group: 'arcade' },
  { html: 'Pinball: <kbd>A</kbd> <kbd>D</kbd> flippers, hold <kbd>Space</kbd> and let go to launch. Alley: <kbd>A</kbd><kbd>D</kbd> aim, hold <kbd>Space</kbd>, let go at the power you want. Claw: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steer, <kbd>Space</kbd> drops', group: 'arcade' },
  { html: 'Neon Sheriff: look to aim, <kbd>Click</kbd> or <kbd>Space</kbd> shoots, shoot off the screen to reload. Step Beat: step with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows. Paddle Wars: <kbd>W</kbd><kbd>S</kbd>, hold <kbd>Space</kbd> to smash', group: 'arcade' },
  { html: 'Hoop Fever: look to aim, hold <kbd>Space</kbd> and let go to throw. Ticket wheel: <kbd>Space</kbd> or <kbd>Click</kbd> spins. <kbd>Click</kbd> the jukebox for the next station', group: 'arcade' },
  { html: 'The prize counter swaps tickets for prizes (they go on the shelf in the bedroom, or where they do their job), a mystery game, or coins. Medals, the weekly league and a daily streak pay extra tickets', group: 'arcade' },
  { html: '<kbd>Controller</kbd> sticks move and look, <kbd>A</kbd> click, <kbd>X</kbd> put back, <kbd>B</kbd> buy, <kbd>D-pad →</kbd> haggle, hold <kbd>RB</kbd> rotate, <kbd>LB</kbd> crouch, click the left stick to sprint, <kbd>Start</kbd> menu', group: 'devices' },
  { html: 'In the menus: <kbd>D-pad</kbd> moves, <kbd>A</kbd> picks, <kbd>B</kbd> goes back, <kbd>Start</kbd> resumes', group: 'devices' },
  { html: '<kbd>Touch</kbd> left joystick, drag right to look, tap to click, long-press to rotate', group: 'devices' },
];
