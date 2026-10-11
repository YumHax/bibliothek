import { CardsPanel } from './CardsPanel';
import { CrosswordPanel } from './CrosswordPanel';
import { QuizPanel } from './QuizPanel';
import { WoolPanel } from './WoolPanel';

/** The panels of what the player does with Mémé (docs/grandma.md "Things to do with her"), made once with the UI. */
export interface PastimePanels {
  quiz: QuizPanel;
  crossword: CrosswordPanel;
  cards: CardsPanel;
  wool: WoolPanel;
}

export function createPastimePanels(container: HTMLElement): PastimePanels {
  return { quiz: new QuizPanel(container), crossword: new CrosswordPanel(container), cards: new CardsPanel(container), wool: new WoolPanel(container) };
}
