import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word } from '../types';
import { defaultProgress, getNextQuizWord } from '../quiz';

const repo: Repository = memoryRepo;
const NOW = 1_000_000;

function w(id: string, word: string): Word {
  return { id, word, translation: 'x', pronunciation: null };
}

(async () => {
  const u = await repo.createUser('alice');
  const A = await repo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });
  const B = await repo.createWordbook({ ownerId: null, name: 'B', level: 'b', type: 'system' });
  const wA1 = w('wA1', 'alpha');
  const wA2 = w('wA2', 'beta');
  const wB1 = w('wB1', 'gamma');
  const wB2 = w('wB2', 'delta');
  for (const x of [wA1, wA2, wB1, wB2]) await repo.upsertWord(x);
  await repo.addWordToWordbook(A.id, wA1.id);
  await repo.addWordToWordbook(A.id, wA2.id);
  await repo.addWordToWordbook(B.id, wB1.id);
  await repo.addWordToWordbook(B.id, wB2.id);

  // wA1 overdue, wB1 overdue (each within its own book)
  await repo.setProgress({ ...defaultProgress(u.id, A.id, wA1.id, NOW), due: NOW - 1000, repetitions: 1, correct: 1, wrong: 0 });
  await repo.setProgress({ ...defaultProgress(u.id, B.id, wB1.id, NOW), due: NOW - 500, repetitions: 1, correct: 1, wrong: 0 });

  const aSet = new Set([wA1.id, wA2.id]);
  const bSet = new Set([wB1.id, wB2.id]);

  // picking from A never returns a word from B (and vice versa)
  for (let i = 0; i < 20; i++) {
    const rA = await getNextQuizWord(repo, u.id, A.id, [], NOW);
    const rB = await getNextQuizWord(repo, u.id, B.id, [], NOW);
    assert.ok(rA && aSet.has(rA.id), 'A quiz returns only A words');
    assert.ok(rB && bSet.has(rB.id), 'B quiz returns only B words');
  }

  // priority re-practice injection: asking to re-practice wB2 returns wB2 even though it has no progress
  const rP = await getNextQuizWord(repo, u.id, B.id, [wB2.id], NOW);
  assert.strictEqual(rP?.id, wB2.id, 'priority word returned first');

  // empty wordbook -> null
  const E = await repo.createWordbook({ ownerId: null, name: 'E', level: 'e', type: 'system' });
  assert.strictEqual(await getNextQuizWord(repo, u.id, E.id, [], NOW), null, 'empty book -> null');

  console.log('ALL QUIZ TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
