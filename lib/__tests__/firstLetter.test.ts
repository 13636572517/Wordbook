import assert from 'node:assert';
import type { UserWordProgress, Word } from '../data/types';
import { countWordsByLetter, isMastered, letterOf, pickMasteredIds, wordsStartingWith } from '../firstLetter';

const word = (id: string, text: string): Word => ({
  id,
  word: text,
  translation: `${text} 释义`,
  pronunciation: null,
});

const progress = (repetitions: number): UserWordProgress => ({
  userId: 'u1',
  wordbookId: 'wb1',
  wordId: 'w',
  ef: 2.5,
  interval: 10,
  repetitions,
  due: 0,
  correct: 0,
  wrong: 0,
});

// letterOf：普通 / 大写 / 数字 / 空串 / 中文
assert.strictEqual(letterOf('apple'), 'A', 'lowercase first letter is grouped by upper case');
assert.strictEqual(letterOf('Banana'), 'B', 'already upper case stays');
assert.strictEqual(letterOf('123abc'), '#', 'non-letter start falls into #');
assert.strictEqual(letterOf(''), '#', 'empty string falls into #');
assert.strictEqual(letterOf('你好'), '#', 'non-ascii start falls into #');

// countWordsByLetter：统计与边界
const counts = countWordsByLetter([
  word('w1', 'apple'),
  word('w2', 'apply'),
  word('w3', 'banana'),
  word('w4', '123go'),
]);
assert.strictEqual(counts.get('A'), 2, 'A counts both words');
assert.strictEqual(counts.get('B'), 1, 'B counts one word');
assert.strictEqual(counts.get('#'), 1, '# counts non-letter words');
assert.strictEqual(counts.get('C'), undefined, 'letters without words are absent');

// wordsStartingWith：过滤与排序（字母序）
const list = wordsStartingWith(
  [word('w1', 'banana'), word('w2', 'axe'), word('w3', 'ant'), word('w4', 'cat')],
  'A',
);
assert.deepStrictEqual(list.map((w) => w.id), ['w3', 'w2'], 'filters by letter and sorts alphabetically');

// isMastered：repetitions 2 / 3 / null
assert.strictEqual(isMastered(null), false, 'no progress is not mastered');
assert.strictEqual(isMastered(progress(2)), false, 'two repetitions are not mastered');
assert.strictEqual(isMastered(progress(3)), true, 'three repetitions are mastered');
assert.strictEqual(isMastered(progress(5)), true, 'beyond threshold stays mastered');

// pickMasteredIds：混合输入只返回已掌握
assert.deepStrictEqual(
  pickMasteredIds([
    { id: 'a', progress: progress(3) },
    { id: 'b', progress: progress(1) },
    { id: 'c', progress: null },
    { id: 'd', progress: progress(4) },
  ]),
  ['a', 'd'],
  'returns only mastered ids in input order',
);

console.log('ALL FIRST LETTER TESTS PASSED');
