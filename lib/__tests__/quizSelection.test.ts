import assert from 'node:assert';
import { selectQuizWord, setPriorityIds, clearPriorityIds, getPriorityIds } from '../quizSelection';
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

const NOW = 1_000_000;

// empty library
assert.strictEqual(selectQuizWord([], [], NOW), null, 'no words -> null');

// priority word wins even when others are due
const words = [
  mk({ id: 1, due: 0 }), // due now
  mk({ id: 2, due: NOW + 9999 }), // not due
  mk({ id: 3, due: 0 }), // due now
];
setPriorityIds([3]);
assert.strictEqual(selectQuizWord(words, getPriorityIds(), NOW)?.id, 3, 'priority id returned first');
clearPriorityIds();

// no priority, due words exist -> a due word is returned
const chosen = selectQuizWord(words, [], NOW);
assert.ok(chosen && chosen.due <= NOW, 'falls back to a due word');

// no priority, nothing due, but fresh words exist
const onlyFresh = [mk({ id: 10, repetitions: 0, times_reviewed: 0, due: NOW + 5000 })];
assert.strictEqual(selectQuizWord(onlyFresh, [], NOW)?.id, 10, 'fresh word chosen when nothing due');

// nothing due and nothing fresh -> null
const done = [mk({ id: 20, repetitions: 3, times_reviewed: 5, due: NOW + 5000 })];
assert.strictEqual(selectQuizWord(done, [], NOW), null, 'all reviewed & not due -> null');

console.log('ALL QUIZ-SELECTION TESTS PASSED');
