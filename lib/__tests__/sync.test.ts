import assert from 'node:assert';
import {
  buildSnapshot,
  serializeSnapshot,
  parseSnapshot,
  mergeWords,
  SyncError,
  SCHEMA_VERSION,
} from '../sync';
import type { Word, StudyStats, StreakData } from '../database';

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

const words: Word[] = [
  mk({ id: 1, word: 'apple', times_reviewed: 3, due: 100 }),
  mk({ id: 2, word: 'banana', times_reviewed: 1, due: 200 }),
];
const streak: StreakData = { streak: 5, lastDate: '2026-07-21' };
const stats: StudyStats = {
  total: 2,
  due: 1,
  newCount: 0,
  mastered: 1,
  correct: 4,
  wrong: 1,
  accuracy: 0.8,
};

// --- round trip ---
const json = serializeSnapshot(buildSnapshot(words, streak, stats, { language: 'en' }));
const back = parseSnapshot(json);
assert.strictEqual(back.schemaVersion, SCHEMA_VERSION);
assert.deepStrictEqual(back.words, words, 'words survive round-trip');
assert.deepStrictEqual(back.streak, streak, 'streak survives round-trip');
assert.deepStrictEqual(back.stats, stats, 'stats survive round-trip');
assert.strictEqual(back.settings.language, 'en');

// --- invalid json ---
assert.throws(() => parseSnapshot('{not json'), SyncError, 'garbage throws SyncError');

// --- wrong schema version ---
assert.throws(
  () => parseSnapshot(JSON.stringify({ schemaVersion: 999, words: [] })),
  SyncError,
  'mismatched schema throws SyncError'
);

// --- missing words array ---
assert.throws(
  () => parseSnapshot(JSON.stringify({ schemaVersion: SCHEMA_VERSION })),
  SyncError,
  'missing words throws SyncError'
);

// --- merge: higher review count wins ---
const imported = [
  mk({ id: 9, word: 'apple', times_reviewed: 10, due: 500 }),
  mk({ id: 10, word: 'cherry', times_reviewed: 2, due: 300 }),
];
const merged = mergeWords(words, imported);
const apple = merged.find((w) => w.word === 'apple')!;
assert.strictEqual(apple.times_reviewed, 10, 'apple keeps imported (more reviews)');
assert.ok(merged.find((w) => w.word === 'cherry'), 'cherry added from import');
assert.ok(merged.find((w) => w.word === 'banana'), 'banana preserved');

// --- merge: tie on reviews -> earlier due wins ---
const tieImport = [mk({ id: 11, word: 'banana', times_reviewed: 1, due: 50 })];
const merged2 = mergeWords(words, tieImport);
const banana = merged2.find((w) => w.word === 'banana')!;
assert.strictEqual(banana.due, 50, 'banana keeps more urgent (earlier due) import on tie');

console.log('ALL SYNC TESTS PASSED');
