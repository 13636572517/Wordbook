import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import { reviewWord } from '../review';
import type { Grade } from '../../sm2';

const repo: Repository = memoryRepo;
const NOW = 1_000_000;
const DAY = 86400000;

(async () => {
  const u = await repo.createUser('alice');
  const wb = await repo.createWordbook({ ownerId: null, name: 'HS', level: 'high-school', type: 'system' });

  // first Good review
  let p = await reviewWord(repo, u.id, wb.id, 'w1', 2 as Grade, NOW);
  assert.strictEqual(p.repetitions, 1);
  assert.strictEqual(p.correct, 1);
  assert.strictEqual(p.wrong, 0);
  assert.strictEqual(p.interval, 1);
  assert.strictEqual(p.due, NOW + 1 * DAY);
  assert.strictEqual(p.lastReviewTs, NOW, 'lastReviewTs stamped');

  // second Easy (repetitions was 1) -> interval 10
  p = await reviewWord(repo, u.id, wb.id, 'w1', 3 as Grade, NOW + DAY);
  assert.strictEqual(p.repetitions, 2);
  assert.strictEqual(p.correct, 2);
  assert.strictEqual(p.interval, 10, 'Easy from repetitions=1 -> interval 10');

  // Again resets repetitions and increments wrong (correct unchanged)
  p = await reviewWord(repo, u.id, wb.id, 'w1', 0 as Grade, NOW + 2 * DAY);
  assert.strictEqual(p.repetitions, 0);
  assert.strictEqual(p.wrong, 1);
  assert.strictEqual(p.correct, 2);

  // isolation: a different user gets a fresh card for the same word
  const u2 = await repo.createUser('bob');
  const p2 = await reviewWord(repo, u2.id, wb.id, 'w1', 2 as Grade, NOW);
  assert.strictEqual(p2.repetitions, 1);
  assert.strictEqual(p2.correct, 1);

  console.log('ALL REVIEW TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
