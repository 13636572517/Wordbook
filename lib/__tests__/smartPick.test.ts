import assert from 'node:assert';
import type { Word } from '../data/types';
import { buildSmartPracticePlan } from '../smartPick';

const now = new Date('2026-07-29T12:00:00').getTime();
const word = (id: string, extra: Partial<Word> = {}): Word => ({
  id,
  word: id,
  translation: `${id} meaning`,
  pronunciation: null,
  ...extra,
});

const words = [
  word('today'),
  word('due'),
  word('weak'),
  word('other', {
    phrases: [{ phrase: 'other than', meaning: '除了' }],
    examples: [{ en: 'The other answer is correct.', zh: '另一个答案是正确的。' }],
  }),
];

const plan = buildSmartPracticePlan({
  words,
  todayNewWordIds: ['today'],
  todayQuizWordIds: [],
  dueWordIds: ['due'],
  weakWordIds: ['weak'],
  goal: 8,
});

assert.strictEqual(plan.length, 8, 'fills the configured daily goal');
assert.strictEqual(plan[0].wordId, 'today', 'today new and unquizzed leads the session');
assert.strictEqual(plan[1].wordId, 'due', 'due words follow today new words');
assert.strictEqual(plan[2].wordId, 'weak', 'weak words follow due words');

const typeCounts = new Map<string, number>(plan.map((item) => [item.type, 0]));
for (const item of plan) typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1);
assert.ok((typeCounts.get('dictation') ?? 0) >= 2, 'dictation receives its 30% quota');
assert.ok((typeCounts.get('choice') ?? 0) >= 2, 'choice receives its 30% quota');
assert.ok((typeCounts.get('sentence-choice') ?? 0) >= 1, 'sentence receives its 20% quota when possible');
assert.ok((typeCounts.get('phrase-blank') ?? 0) >= 1, 'phrase receives its 20% quota when possible');

const fallback = buildSmartPracticePlan({
  words: [word('plain-a'), word('plain-b')],
  todayNewWordIds: ['plain-a'],
  todayQuizWordIds: [],
  dueWordIds: [],
  weakWordIds: [],
  goal: 5,
});
assert.strictEqual(fallback.length, 5, 'still builds a full session without examples or phrases');
assert.ok(
  fallback.every((item) => item.type === 'dictation' || item.type === 'choice'),
  'unavailable content types fall back to word questions',
);

console.log('ALL SMART PICK TESTS PASSED');
