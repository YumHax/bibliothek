import { gameDayRandom } from '@/time/daily';
import { shuffled } from '@/random';
import { STREET_SHOPS } from './rules';
import type { Game } from '@/catalog/types';

/** One question of THE LOCAL's quiz: the answers as the quizmaster reads them out, `right` the good one's index. */
export interface PubQuestion {
  question: string;
  answers: readonly string[];
  right: number;
}

/** The questions, the good answer first (the round shuffles them). */
const BANK: readonly [string, string, string, string, string][] = [
  ['Which company made the Mega Drive?', 'Sega', 'Nintendo', 'Sony', 'Atari'],
  ['What is Mario’s brother called?', 'Luigi', 'Wario', 'Toad', 'Yoshi'],
  ['Sonic’s two-tailed sidekick is a…', 'fox', 'hedgehog', 'echidna', 'squirrel'],
  ['The falling blocks of Tetris were first programmed in which country?', 'the Soviet Union', 'Japan', 'the United States', 'Finland'],
  ['Which of Pac-Man’s ghosts is the red one?', 'Blinky', 'Pinky', 'Inky', 'Clyde'],
  ['Which game first introduced Kirby?', 'Kirby’s Dream Land', 'Kirby’s Adventure', 'Kirby Super Star', 'Kirby 64'],
  ['Which console came out in Japan in 1996 with a three-pronged pad?', 'the Nintendo 64', 'the GameCube', 'the Super Nintendo', 'the Virtual Boy'],
  ['Who is the bounty hunter of the Metroid series?', 'Samus Aran', 'Ridley', 'Kraid', 'Mother Brain'],
  ['In Street Fighter II, which fighter comes from Brazil?', 'Blanka', 'Guile', 'Dhalsim', 'E. Honda'],
  ['What is the hero of The Legend of Zelda called?', 'Link', 'Zelda', 'Ganon', 'Navi'],
  ['What does Donkey Kong throw down the girders in the 1981 arcade game?', 'barrels', 'bananas', 'coconuts', 'rocks'],
  ['What was Mario called in the first Donkey Kong?', 'Jumpman', 'Mr. Video', 'Plumber Joe', 'Red'],
  ['Which game is set in the city of Midgar?', 'Final Fantasy VII', 'Chrono Trigger', 'Secret of Mana', 'Xenogears'],
  ['Which series follows the Belmont family?', 'Castlevania', 'Ghosts ’n Goblins', 'Contra', 'Mega Man'],
  ['What is Mega Man’s robot dog called?', 'Rush', 'Beat', 'Proto', 'Bass'],
  ['What does Sonic collect to survive a hit?', 'rings', 'coins', 'stars', 'emeralds'],
  ['Which console had Super Mario World as its launch game?', 'the Super Nintendo', 'the NES', 'the Game Boy', 'the Nintendo 64'],
  ['Pokémon Red and Blue first came out on…', 'the Game Boy', 'the Game Boy Color', 'the Nintendo 64', 'the Game Boy Advance'],
  ['What type of Pokémon is Pikachu?', 'Electric', 'Fire', 'Normal', 'Psychic'],
  ['Which company made the Game Gear?', 'Sega', 'Nintendo', 'Atari', 'NEC'],
  ['Who is the villain of GoldenEye 007 on the Nintendo 64?', 'Alec Trevelyan', 'Jaws', 'Blofeld', 'Oddjob'],
  ['Lemmings was made by a studio in which country?', 'Scotland', 'Japan', 'the United States', 'France'],
  ['What is the name of Link’s horse in Ocarina of Time?', 'Epona', 'Agro', 'Roach', 'Shadowfax'],
  ['How many worlds are there in the first Super Mario Bros.?', 'eight', 'nine', 'six', 'ten'],
  ['Who created Super Mario Bros. and The Legend of Zelda?', 'Shigeru Miyamoto', 'Hideo Kojima', 'Yuji Naka', 'Gunpei Yokoi'],
  ['Who led the team that made the Game Boy?', 'Gunpei Yokoi', 'Satoru Iwata', 'Shigeru Miyamoto', 'Ken Kutaragi'],
  ['“It’s dangerous to go alone! Take this.” Which game?', 'The Legend of Zelda', 'Zelda II', 'Metroid', 'Kid Icarus'],
  ['“All your base are belong to us” comes from which game?', 'Zero Wing', 'R-Type', 'Gradius', 'Thunder Force'],
  ['Who is Sonic’s arch-enemy?', 'Dr. Robotnik', 'Dr. Wily', 'Bowser', 'Ganon'],
  ['Which scientist built Mega Man?', 'Dr. Light', 'Dr. Wily', 'Dr. Cossack', 'Dr. Robotnik'],
  ['Which was the first Final Fantasy on the PlayStation?', 'Final Fantasy VII', 'Final Fantasy VI', 'Final Fantasy VIII', 'Final Fantasy IX'],
  ['How does the Konami code begin?', 'Up, Up, Down, Down', 'Left, Right, Left, Right', 'A, B, A, B', 'Down, Down, Up, Up'],
  ['In which arcade game do you defend cities from falling missiles?', 'Missile Command', 'Asteroids', 'Defender', 'Galaga'],
  ['Four lines cleared at once in Tetris are called…', 'a Tetris', 'a Quad', 'a Combo', 'a Strike'],
  ['What was the Mega Drive called in North America?', 'the Genesis', 'the Master System', 'the Saturn', 'the Nomad'],
  ['What was the Super Nintendo called in Japan?', 'the Super Famicom', 'the Super Disk', 'the Famicom Plus', 'the Super Comboy'],
  ['Which pink hero swallows his enemies whole?', 'Kirby', 'Jigglypuff', 'Yoshi', 'Puyo'],
  ['Which company made the PlayStation?', 'Sony', 'Sega', 'Nintendo', 'Panasonic'],
  ['What colour is Yoshi, usually?', 'green', 'red', 'blue', 'yellow'],
  ['In Super Mario Bros., what does a Fire Flower let Mario do?', 'throw fireballs', 'fly', 'swim faster', 'turn invisible'],
  ['Which Sega console used discs and came out in 1994 in Japan?', 'the Saturn', 'the Dreamcast', 'the Mega Drive', 'the Master System'],
  ['What colour is Knuckles the Echidna?', 'red', 'blue', 'yellow', 'green'],
];

/**
 * The questions of quiz night `day` (the same all night, a different round each week). The quizmaster knows the
 * player is a collector: with enough games on their shelves, one or two questions are about games they own (the year
 * one came out, who published it), so the round never quite repeats.
 */
export function quizRound(day: number, owned: readonly Game[] = []): PubQuestion[] {
  const random = gameDayRandom('pubQuiz', day);
  const own = collectionQuestions(random, owned);
  return [...shuffled(random, BANK).slice(0, STREET_SHOPS.quiz.questions - own.length), ...own]
    .map(([question, ...answers]) => {
      const order = shuffled(random, [0, 1, 2, 3]);
      return { question, answers: order.map((i) => answers[i]!), right: order.indexOf(0) };
    });
}

/** Up to two questions about the player's own games, the good answer first: a release year, a publisher. */
function collectionQuestions(random: () => number, owned: readonly Game[]): [string, string, string, string, string][] {
  const out: [string, string, string, string, string][] = [];
  const dated = shuffled(random, owned.filter((g) => /^\d{4}/.test(g.releaseDate ?? '')));
  const year = dated[0];
  if (year) {
    const y = Number(year.releaseDate!.slice(0, 4));
    out.push([`A collector’s question: which year did ${year.title} come out?`, `${y}`, `${y - 2}`, `${y + 1}`, `${y + 3}`]);
  }
  const publishers = [...new Set(owned.map((g) => g.publisher).filter((p): p is string => !!p))];
  const published = shuffled(random, owned.filter((g) => g.publisher && g.id !== year?.id))[0];
  const others = shuffled(random, publishers.filter((p) => p !== published?.publisher)).slice(0, 3);
  if (published && others.length === 3) out.push([`And another for the collectors: who published ${published.title}?`, published.publisher!, others[0]!, others[1]!, others[2]!]);
  return out;
}

/** What the other team got right of `round` (THE USUAL SUSPECTS, at the table by the dartboard): a good team, not a perfect one. */
export function rivalsRight(day: number, count: number): number {
  const random = gameDayRandom('pubQuiz.rivals', day);
  return Math.min(count, 3 + Math.floor(random() * 3));
}
