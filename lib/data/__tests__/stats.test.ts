import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import { defaultProgress } from '../quiz';
import { getWordbookStats } from '../stats';

const repo: Repository = memoryRepo;
const NOW = Date.parse('2026-07-21T12:00:00Z');
const DAY = 86400000;

function w(id: string) {
  return { id, word: id, translation: 'x', pronunciation: null };
}

(async () => {
  const u = await repo.createUser('alice');
  const wb = await repo.createWordbook({ ownerId: null, name: 'HS', level: 'high-school', type: 'system' });
  const words = ['w0', 'w1', 'w2', 'w3'].map(w);
  for (const x of words) {
    await repo.upsertWord(x);
    await repo.addWordToWordbook(wb.id, x.id);
  }

  // empty book
  let s = await getWordbookStats(repo, u.id, wb.id, NOW);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.newCount, 4);
  assert.strictEqual(s.due, 0);
  assert.strictEqual(s.mastered, 0);
  assert.strictEqual(s.accuracy, 0);
  assert.strictEqual(s.streak, 0);

  // w0 mastered, w1 due (overdue), w2 learning (future), w3 new
  await repo.setProgress({
    ...defaultProgress(u.id, wb.id, 'w0', NOW),
    repetitions: 3,
    correct: 5,
    wrong: 0,
    due: NOW - DAY,
    lastReviewTs: NOW - DAY,
  });
  await repo.setProgress({
    ...defaultProgress(u.id, wb.id, 'w1', NOW),
    repetitions: 1,
    correct: 1,
    wrong: 2,
    due: NOW - 1000,
    lastReviewTs: NOW - DAY,
  });
  await repo.setProgress({
    ...defaultProgress(u.id, wb.id, 'w2', NOW),
    repetitions: 1,
    correct: 2,
    wrong: 1,
    due: NOW + DAY,
    lastReviewTs: NOW - DAY,
  });

  s = await getWordbookStats(repo, u.id, wb.id, NOW);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.newCount, 1, 'w3 is new');
  assert.strictEqual(s.mastered, 1, 'w0 mastered');
  assert.strictEqual(s.due, 1, 'w1 due');
  assert.strictEqual(s.learning, 1, 'w2 learning');
  assert.strictEqual(s.accuracy, 8 / 11, 'accuracy across reviewed words');
  assert.strictEqual(s.streak, 1, 'streak counted from yesterday (today not studied yet)');

  // a review today extends the streak to 2
  const p0 = await repo.getProgress(u.id, wb.id, 'w0');
  await repo.setProgress({ ...p0!, lastReviewTs: NOW });
  s = await getWordbookStats(repo, u.id, wb.id, NOW);
  assert.strictEqual(s.streak, 2, 'streak includes today');

  // a different user sees their own isolated stats
  const u2 = await repo.createUser('bob');
  const s2 = await getWordbookStats(repo, u2.id, wb.id, NOW);
  assert.strictEqual(s2.newCount, 4, 'other user has no progress');
  assert.strictEqual(s2.streak, 0);

  console.log('ALL STATS TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
