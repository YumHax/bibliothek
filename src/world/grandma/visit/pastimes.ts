import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import type { TalkExtra } from '@/social/talk';
import { MEME_ID } from '@/social/people/family';
import { nudge } from '@/social/standing';
import { random, shuffled } from '@/random';
import { capitalise } from '@/text/strings';
import { momentAt } from '@/grandma/GrandmaTalk';
import { LineBag } from '@/grandma/lineBag';
import { PASTIME_LINES as WORDS } from '@/grandma/pastimeLines';
import { PASTIME_DEEDS, QUIZ_COIN, WOOL_FOR_SCARF, memePastimes } from '@/grandma/pastimes';
import { FAMILY_QUIZ, QUIZ_BANK, QUIZ_ROUND, collectionQuestion, type QuizQuestion } from '@/grandma/quizBank';
import { SEED_GAMES } from '@/catalog';
import { CROSSWORD_BANK } from '@/grandma/crosswordBank';
import { cardName, deal, type HerMove } from '@/grandma/crazyEights';
import type { MemeFeature, MemeScene } from '../memeScene';
import { GRANDMA_FLAT_PLAN as PLAN } from '../grandmaFlatPlan';

/** Who has her while a pastime runs (`MemeScene.claim`). */
const OWNER = 'pastimes';

/** A list's line at random, `{key}`s filled in (`{Key}`: the same, a capital first). */
function pick(lines: readonly string[], values: Record<string, string> = {}): string {
  return fill(lines[Math.floor(random() * lines.length)] ?? '', values);
}

function fill(line: string, values: Record<string, string>): string {
  return line.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key.toLowerCase()] ?? '';
    return key === key.toLowerCase() ? value : capitalise(value);
  });
}

/**
 * WHAT THE PLAYER DOES WITH MÉMÉ at hers (docs/grandma.md "Things to do with her"): each an entry of her conversation
 * at its hour, hidden the rest of the day: the quiz on her set in the afternoon, the crossword at her table in the
 * morning, a game of cards in the evening (she walks to the table for it, and back to her knitting after), holding the
 * wool while she knits in the evening (enough of it and the scarf is done). Each warms her once a day.
 */
export const pastimesAtHers: MemeFeature = {
  id: 'pastimes',
  start(scene) {
    const panels = scene.ctx.panels.memePastimes;
    if (!panels) return {};
    const free = (): string | null => (scene.busyWith !== null ? 'She is busy' : null);
    /** Hidden unless free at `moment` and, for a once-a-day pastime, not done today. */
    const when = (moment: ReturnType<typeof momentAt>, once?: 'quiz' | 'crossword' | 'wool') => (): string | null =>
      free() ?? (momentAt(scene.hour()) !== moment ? 'Not now' : once && memePastimes().doneOn(once, scene.day()) ? 'Done today' : null);
    return {
      extras(session): TalkExtra[] {
        return [
          { id: 'memeQuiz', group: 'invite', label: WORDS.quiz.entry, opensPanel: true, disabled: when('day', 'quiz'), run: () => quiz(scene, session) },
          { id: 'memeCrossword', group: 'invite', label: WORDS.crossword.entry, opensPanel: true, disabled: when('morning', 'crossword'), run: () => crossword(scene, session) },
          { id: 'memeCards', group: 'invite', label: WORDS.cards.entry, opensPanel: true, disabled: when('evening'), run: () => cards(scene, session) },
          { id: 'memeWool', group: 'invite', label: WORDS.wool.entry, opensPanel: true, disabled: when('evening', 'wool'), run: () => wool(scene, session) },
        ];
      },
      left() {
        scene.release(OWNER);
      },
    };
  },
};

/** Opens `panel`; once it closes, `closed` (once). */
function openThen(session: SessionActions, panel: ModalLike & { addOpenListener(listener: (open: boolean) => void): () => void }, closed: () => void): void {
  let off: (() => void) | null = null;
  off = panel.addOpenListener((open) => {
    if (open) return;
    off?.();
    closed();
  });
  session.openPanel(panel);
}

/** Warms her for `pastime`, once a game day. */
function warm(scene: MemeScene, pastime: keyof typeof PASTIME_DEEDS): void {
  const deed = PASTIME_DEEDS[pastime];
  nudge(MEME_ID, { warmth: deed.warmth, trust: 1, why: deed.why, reason: `pastime-${pastime}`, day: scene.day() });
}

/** The afternoon's quiz: the set held on the game show, five questions, her blurting answers. */
function quiz(scene: MemeScene, session: SessionActions): void {
  const panel = scene.ctx.panels.memePastimes?.quiz;
  if (!panel || !scene.claim(OWNER)) return;
  const { meme, things } = scene;
  const store = memePastimes();
  store.done('quiz', scene.day());
  things.tv.showQuiz(true);
  meme.speak(pick(WORDS.quiz.start));
  // The show's questions not asked lately, shuffled; one of hers about the family in the middle (once its memory is
  // seen), and one about the player's own shelves.
  const fresh = QUIZ_BANK.filter((q) => !store.asked.includes(q.id));
  const show: QuizQuestion[] = shuffled(random, fresh.length >= QUIZ_ROUND ? fresh : QUIZ_BANK);
  const family = shuffled(random, FAMILY_QUIZ.filter((q) => (!q.after || scene.visits.hasSeen(q.after)) && (!q.told || (scene.ctx.grandmaPresence?.hasTold(q.told) ?? false)) && !store.asked.includes(q.id)))[0];
  const owned = scene.ctx.collection.games.games.filter((g) => (g.status ?? 'owned') === 'owned').map((g) => g.title);
  const others = SEED_GAMES.filter((g) => !scene.ctx.collection.owns(g.id)).map((g) => g.title);
  const shelves = owned.length >= 5 ? collectionQuestion(owned, others, random) : null;
  const hers = [family, shelves].filter((q): q is QuizQuestion => !!q);
  const questions: QuizQuestion[] = show.slice(0, QUIZ_ROUND - hers.length);
  hers.forEach((q, i) => questions.splice(1 + i * 2, 0, q));
  store.ask(questions.filter((q) => q.kind !== 'shelves').map((q) => q.id), QUIZ_BANK.length + FAMILY_QUIZ.length);
  panel.show({
    questions,
    blurt: (q) => {
      // Hers: she knows the answer, and lets the player give it.
      if (q.kind === 'family' || q.kind === 'shelves') return { answer: null, line: pick(q.kind === 'family' ? WORDS.quiz.herOwn : WORDS.quiz.herShelves) };
      const knows = q.kind !== 'games' && random() < (q.kind === 'telly' ? 0.75 : 0.6);
      const wrong = q.answers.map((_, i) => i).filter((i) => i !== q.right);
      const answer = knows ? q.right : q.kind === 'games' ? Math.floor(random() * q.answers.length) : wrong[Math.floor(random() * wrong.length)]!;
      meme.gesture('point');
      const lines = q.kind === 'games' ? WORDS.quiz.blurtGames : knows ? WORDS.quiz.blurtRight : WORDS.quiz.blurtWrong;
      return { answer, line: pick(lines, { answer: q.answers[answer] ?? '' }) };
    },
    answered: (_, right) => {
      if (right) {
        meme.gesture('clap');
        meme.feel({ smile: 1, browsUp: 0.4 }, 2);
      } else meme.feel({ frown: 0.4, browsUp: 0.5 }, 1.8);
      return pick(right ? WORDS.quiz.youRight : WORDS.quiz.youWrong);
    },
    finished: (you, her) => {
      warm(scene, 'quiz');
      if (you >= QUIZ_COIN.from && you > her) {
        scene.ctx.money.purse?.earnCoins(QUIZ_COIN.coins);
        scene.ctx.notices.reward({ ...WORDS.quiz.coin, coins: QUIZ_COIN.coins });
      }
      meme.gesture(you > her ? 'clap' : her > you ? 'fistPump' : 'shrug');
      return pick(you > her ? WORDS.quiz.endYou : you === her ? WORDS.quiz.endLevel : WORDS.quiz.endHer);
    },
  });
  openThen(session, panel, () => {
    things.tv.showQuiz(false);
    scene.release(OWNER);
  });
}

/** The morning's crossword: the word she is stuck on. */
function crossword(scene: MemeScene, session: SessionActions): void {
  const panel = scene.ctx.panels.memePastimes?.crossword;
  if (!panel || !scene.claim(OWNER)) return;
  const { meme } = scene;
  const store = memePastimes();
  store.done('crossword', scene.day());
  const fresh = CROSSWORD_BANK.filter((w) => !store.solved.includes(w.id));
  const word = shuffled(random, fresh.length ? fresh : CROSSWORD_BANK)[0]!;
  const wrong = new LineBag(() => WORDS.crossword.wrong);
  panel.show({
    word,
    start: pick(WORDS.crossword.start),
    wrong: () => wrong.next(),
    hint: () => WORDS.crossword.hint,
    solved: () => {
      store.solve(word.id, CROSSWORD_BANK.length);
      warm(scene, 'crossword');
      meme.nod();
      meme.feel({ smile: 1, browsUp: 0.5 }, 2.5);
      return pick(WORDS.crossword.solved);
    },
    leave: () => WORDS.crossword.leave,
  });
  openThen(session, panel, () => scene.release(OWNER));
}

/** The evening's cards: she walks to the table, the game, then back to her knitting. */
function cards(scene: MemeScene, session: SessionActions): void {
  const panel = scene.ctx.panels.memePastimes?.cards;
  if (!panel || !scene.claim(OWNER)) return;
  const { meme } = scene;
  const store = memePastimes();
  const path = PLAN.pastimes.toTable.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const back = [...path.slice(0, -1).reverse(), new THREE.Vector3(PLAN.armchair.at[0], 0, PLAN.armchair.at[1])];
  const { table } = PLAN.memeDay;
  const [gx, gy, gz] = PLAN.pastimes.cardsGaze;
  const played = new LineBag(() => WORDS.cards.play);
  meme.speak(pick(WORDS.cards.fetch));
  meme.walk(path, () => {
    meme.sit(table.yaw, table.seat, 'read', scene.world(gx, gy, gz));
    // The player gone meanwhile: no game (the next visit sits her where she belongs).
    if (!scene.playerIn) {
      scene.release(OWNER);
      return;
    }
    panel.show({
      deal,
      start: '',
      played: (move: HerMove) => {
        if (move.kind === 'cheat') {
          meme.gesture('coverMouth');
          return pick(WORDS.cards.cheat, { card: cardName(move.card) });
        }
        if (move.kind === 'play') return move.card.rank === 8 ? pick(WORDS.cards.eight, { suit: move.suit }) : fill(played.next(), { card: cardName(move.card) });
        return pick(WORDS.cards.draw);
      },
      refused: (_, suit) => pick(WORDS.cards.refuse, { suit }),
      over: (winner) => {
        store.cardsWon(winner);
        warm(scene, 'cards');
        if (winner === 'her') meme.gesture('fistPump');
        else meme.feel({ smile: 0.8, browsUp: 0.6 }, 2);
        return pick(winner === 'you' ? WORDS.cards.youWin : WORDS.cards.herWin);
      },
      tally: () => ({ ...store.tally }),
    });
    openThen(session, panel, () => {
      if (!scene.playerIn) {
        scene.release(OWNER);
        return;
      }
      // Back to her armchair and her knitting.
      meme.walk(back, () => {
        scene.reseat();
        scene.release(OWNER);
      });
    });
  });
}

/** Holding the wool while she knits; the sessions knit the player's scarf. */
function wool(scene: MemeScene, session: SessionActions): void {
  const panel = scene.ctx.panels.memePastimes?.wool;
  if (!panel || !scene.claim(OWNER)) return;
  const { meme, visits } = scene;
  const store = memePastimes();
  panel.show({
    start: pick(WORDS.wool.start),
    talk: shuffled(random, WORDS.wool.talk),
    snap: WORDS.wool.snap,
    finished: () => {
      const sessions = store.heldWool(scene.day());
      warm(scene, 'wool');
      meme.feel({ smile: 0.9 }, 2.5);
      if (sessions >= WOOL_FOR_SCARF && visits.knitScarf()) {
        meme.gesture('clap');
        scene.ctx.notices.reward({ ...WORDS.wool.scarf, big: true });
        return pick(WORDS.wool.done);
      }
      return `${pick(WORDS.wool.done)}${visits.scarfKnitted(false) ? ` ${pick(WORDS.wool.after)}` : ''}`;
    },
  });
  openThen(session, panel, () => scene.release(OWNER));
}
