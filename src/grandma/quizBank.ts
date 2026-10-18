/*
 * THE AFTERNOON QUIZ on Mémé's set (docs/grandma.md "Things to do with her"): the show's questions. General knowledge
 * and the old television she knows, more or less; the video games she never does (she guesses anyway). Between the
 * show's, her own: the family (she asks, and lets the player answer), and the player's shelves (`collectionQuestion`).
 */

/** What a question is about: what she knows of it. */
type QuizKind = 'general' | 'telly' | 'games' | 'family' | 'shelves';

export interface QuizQuestion {
  id: string;
  kind: QuizKind;
  question: string;
  /** The answers in the order the show gives them; `right` is the good one's index. */
  answers: readonly string[];
  right: number;
  /** A family question: asked only once this memory of her album has been seen. */
  after?: string;
  /** A family question: asked only once she has told this story of hers (`GRANDMA_STORIES`). */
  told?: string;
}

/** Questions a round asks. */
export const QUIZ_ROUND = 5;

export const QUIZ_BANK: readonly QuizQuestion[] = [
  { id: 'capitalAus', kind: 'general', question: 'What is the capital of Australia?', answers: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], right: 1 },
  { id: 'spiderLegs', kind: 'general', question: 'How many legs has a spider?', answers: ['Six', 'Eight', 'Ten', 'Twelve'], right: 1 },
  { id: 'monaLisa', kind: 'general', question: 'Who painted the Mona Lisa?', answers: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Botticelli'], right: 2 },
  { id: 'redPlanet', kind: 'general', question: 'Which planet is called the red planet?', answers: ['Venus', 'Jupiter', 'Mars', 'Mercury'], right: 2 },
  { id: 'boilWater', kind: 'general', question: 'At sea level, water boils at…', answers: ['90 °C', '100 °C', '110 °C', '120 °C'], right: 1 },
  { id: 'longestRiver', kind: 'general', question: 'Which is the longest river in France?', answers: ['The Seine', 'The Rhône', 'The Loire', 'The Garonne'], right: 2 },
  { id: 'pianoKeys', kind: 'general', question: 'How many keys has a modern piano?', answers: ['66', '78', '88', '96'], right: 2 },
  { id: 'eiffelYear', kind: 'general', question: 'The Eiffel Tower was finished in…', answers: ['1789', '1889', '1900', '1925'], right: 1 },
  { id: 'hexagon', kind: 'general', question: 'How many sides has a hexagon?', answers: ['Five', 'Six', 'Seven', 'Eight'], right: 1 },
  { id: 'goldSymbol', kind: 'general', question: 'What is the chemical symbol for gold?', answers: ['Go', 'Gd', 'Au', 'Ag'], right: 2 },
  { id: 'bigOcean', kind: 'general', question: 'Which is the largest ocean?', answers: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], right: 3 },
  { id: 'lunarMonth', kind: 'general', question: 'Roughly how long does the moon take to go round the Earth?', answers: ['A week', 'A month', 'Three months', 'A year'], right: 1 },
  { id: 'camembert', kind: 'general', question: 'Camembert comes from which region?', answers: ['Normandy', 'Provence', 'Alsace', 'Brittany'], right: 0 },
  { id: 'beesMake', kind: 'general', question: 'What do bees make?', answers: ['Wax and honey', 'Silk', 'Milk', 'Sugar beet'], right: 0 },
  { id: 'tourStage', kind: 'general', question: 'The Tour de France always finishes in…', answers: ['Lyon', 'Marseille', 'Paris', 'Bordeaux'], right: 2 },
  { id: 'knitPurl', kind: 'general', question: 'In knitting, the stitch that is not plain is…', answers: ['Pearl', 'Purl', 'Pull', 'Perm'], right: 1 },
  { id: 'teaCountry', kind: 'general', question: 'Darjeeling tea comes from…', answers: ['China', 'Japan', 'India', 'Kenya'], right: 2 },
  { id: 'centurySixty', kind: 'general', question: 'How many minutes in two hours and a half?', answers: ['130', '150', '170', '250'], right: 1 },
  { id: 'tvColour', kind: 'telly', question: 'French television went over to colour in…', answers: ['1957', '1967', '1977', '1987'], right: 1 },
  { id: 'tvSnooker', kind: 'telly', question: 'Which game was made popular on television by colour sets, its balls told apart?', answers: ['Darts', 'Snooker', 'Bowls', 'Chess'], right: 1 },
  { id: 'tvWeather', kind: 'telly', question: 'On the weather map, a sun with a cloud over it means…', answers: ['Storms', 'Fog', 'Sunny spells', 'Snow'], right: 2 },
  { id: 'tvMoon', kind: 'telly', question: 'Men first walked on the moon, live on television, in…', answers: ['1959', '1965', '1969', '1972'], right: 2 },
  { id: 'tvTintin', kind: 'telly', question: 'Tintin’s dog is called…', answers: ['Milou', 'Idéfix', 'Pif', 'Rintintin'], right: 0 },
  { id: 'tvAsterix', kind: 'telly', question: 'Asterix’s friend who carries menhirs is…', answers: ['Panoramix', 'Obelix', 'Abraracourcix', 'Assurancetourix'], right: 1 },
  { id: 'tvEurovision', kind: 'telly', question: 'The Eurovision song contest was won by ABBA with…', answers: ['Mamma Mia', 'Waterloo', 'Fernando', 'Dancing Queen'], right: 1 },
  { id: 'tvPiaf', kind: 'telly', question: 'Who sang “Non, je ne regrette rien”?', answers: ['Dalida', 'Édith Piaf', 'Juliette Gréco', 'Barbara'], right: 1 },
  { id: 'tvCousteau', kind: 'telly', question: 'Commandant Cousteau’s ship was the…', answers: ['Calypso', 'Nautilus', 'Bounty', 'Pourquoi-Pas'], right: 0 },
  { id: 'gamesPlumber', kind: 'games', question: 'In the video games, Mario is a…', answers: ['Baker', 'Plumber', 'Postman', 'Carpenter'], right: 1 },
  { id: 'gamesHedgehog', kind: 'games', question: 'Sega’s blue hedgehog is called…', answers: ['Tails', 'Knuckles', 'Sonic', 'Spike'], right: 2 },
  { id: 'gamesPacman', kind: 'games', question: 'What does Pac-Man eat?', answers: ['Cherries and dots', 'Mushrooms', 'Rings', 'Bananas'], right: 0 },
  { id: 'gamesTetris', kind: 'games', question: 'Tetris was first made in…', answers: ['Japan', 'The United States', 'The Soviet Union', 'France'], right: 2 },
  { id: 'gamesZelda', kind: 'games', question: 'In The Legend of Zelda, the hero in green is called…', answers: ['Zelda', 'Link', 'Ganon', 'Navi'], right: 1 },
  { id: 'gamesGameBoy', kind: 'games', question: 'The Game Boy came with which game in the box?', answers: ['Pong', 'Tetris', 'Pac-Man', 'Snake'], right: 1 },
  { id: 'gamesPikachu', kind: 'games', question: 'Pikachu is what kind of Pokémon?', answers: ['Fire', 'Water', 'Electric', 'Grass'], right: 2 },
  { id: 'gamesSega', kind: 'games', question: 'The Mega Drive was made by…', answers: ['Nintendo', 'Sony', 'Sega', 'Atari'], right: 2 },
  { id: 'gamesCartridge', kind: 'games', question: 'Why did people blow into cartridges?', answers: ['To cool them', 'To get the dust out', 'For luck', 'All three, honestly'], right: 3 },
];

/** Her own questions, slipped in between the show's: about the family, once she has told the memory behind each. */
export const FAMILY_QUIZ: readonly QuizQuestion[] = [
  { id: 'famTortoise', kind: 'family', question: 'Mémé’s question! Félix’s tortoise was called…', answers: ['Flash', 'Speedy', 'Napoleon', 'Turbo'], right: 1, told: 'tortoise' },
  { id: 'famGeorges', kind: 'family', question: 'Mémé’s question! Your grandfather Georges mended…', answers: ['Shoes', 'Bicycles', 'Clocks', 'Radios'], right: 2, told: 'georges' },
  { id: 'famSeaside', kind: 'family', question: 'Mémé’s question! At Le Crotoy in fifty-nine, Georges hired a…', answers: ['Rowing boat', 'Tandem', 'Donkey', 'Caravan'], right: 1, told: 'seaside' },
  { id: 'famWrap', kind: 'family', question: 'Mémé’s question! What did Félix wrap your Game Boy in?', answers: ['Brown paper', 'The sports pages', 'A tea towel', 'Gold foil'], right: 1, after: 'christmas95' },
  { id: 'famCushion', kind: 'family', question: 'Mémé’s question! On your Wednesdays at Félix’s, you sat…', answers: ['In his armchair', 'On a cushion on the floor', 'On the windowsill', 'On his knee'], right: 1, after: 'wednesdays' },
  { id: 'famLetters', kind: 'family', question: 'Mémé’s question! Your first high score: how many letters did you type?', answers: ['Two', 'Three', 'Four', 'Your whole name'], right: 1, after: 'arcade' },
  { id: 'famMoney', kind: 'family', question: 'Mémé’s question! Gaspard called Félix’s cartridges…', answers: ['Plastic toys', 'Money asleep', 'A waste of a life', 'Dust traps'], right: 1, after: 'row' },
  { id: 'famLots', kind: 'family', question: 'Mémé’s question! How many lots were in Félix’s sale?', answers: ['112', '298', '412', 'A thousand'], right: 2, after: 'sale' },
];

/**
 * A question about the player's own shelves (`owned`: titles in the collection, `others`: games it does not hold):
 * which of four is theirs. Null with too few of either.
 */
export function collectionQuestion(owned: readonly string[], others: readonly string[], rng: () => number): QuizQuestion | null {
  if (!owned.length || others.length < 3) return null;
  const mine = owned[Math.floor(rng() * owned.length)]!;
  const pool = [...others].filter((t) => t !== mine);
  const wrong: string[] = [];
  while (wrong.length < 3 && pool.length) wrong.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  if (wrong.length < 3) return null;
  const right = Math.floor(rng() * 4);
  const answers = [...wrong];
  answers.splice(right, 0, mine);
  return { id: `shelves:${mine}`, kind: 'shelves', question: 'Mémé’s question! Which of these is on your shelves?', answers, right };
}
