import assert from 'node:assert';
import { isWeak, getWeakWords, WEAK_WRONG_RATIO, WEAK_EF_THRESHOLD } from '../weakWords';
import type { Word } from '../database';

function mk(over: Partial<Word>): Word {
  return {
    id: 1,
    word: 'x',
    translation: 'x',
    pronunciation: '',
    created_at: 0,
    times_reviewed: 0,
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    due: 0,
    correct: 0,
    wrong: 0,
    ...over,
  };
}

// --- isWeak ---

assert.strictEqual(isWeak(mk({ correct: 0, wrong: 0 })), false, 'no reviews -> not weak');

assert.strictEqual(
  isWeak(mk({ correct: 1, wrong: 1 })),
  true,
  `wrong ratio ${1 / 2} >= ${WEAK_WRONG_RATIO} -> weak`
);

assert.strictEqual(
  isWeak(mk({ correct: 9, wrong: 1 })),
  false,
  `wrong ratio ${1 / 10} < ${WEAK_WRONG_RATIO} -> not weak (boundary just below)`
);

assert.strictEqual(
  isWeak(mk({ ef: WEAK_EF_THRESHOLD - 0.01, correct: 100, wrong: 0 })),
  true,
  'low ef -> weak even with no wrong answers'
);

// --- getWeakWords sorting ---

const words: Word[] = [
  mk({ id: 1, word: 'a', correct: 9, wrong: 1 }), // ratio .1, not weak
  mk({ id: 2, word: 'b', correct: 1, wrong: 1 }), // ratio .5, ef 2.5 -> weak, wrong 1
  mk({ id: 3, word: 'c', correct: 0, wrong: 3 }), // ratio 1, ef 2.5 -> weak, wrong 3
  mk({ id: 4, word: 'd', ef: 1.5, correct: 50, wrong: 0 }), // low ef -> weak, wrong 0
];

const weak = getWeakWords(words);
assert.deepStrictEqual(
  weak.map((w) => w.id),
  [3, 2, 4],
  'weak sorted by wrong desc, then ef asc; non-weak (id 1) excluded'
);

console.log('ALL WEAK-WORDS TESTS PASSED');
