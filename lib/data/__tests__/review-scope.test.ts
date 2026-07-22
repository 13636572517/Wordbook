import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word } from '../types';
import { defaultProgress } from '../quiz';
import { getRecentWords } from '../review-scope';

const repo: Repository = memoryRepo;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-22T12:00:00').getTime();

function w(id: string, word: string): Word {
  return { id, word, translation: 'x', pronunciation: null };
}

(async () => {
  const u = await repo.createUser('alice');
  const A = await repo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });
  const words = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'].map((id, i) => w(id, `word${i}`));
  for (const x of words) await repo.upsertWord(x);
  for (const x of words) await repo.addWordToWordbook(A.id, x.id);

  // 设定 lastReviewTs 落在不同位置（days=7 窗口 = [NOW-7d, NOW]）
  const setTs = async (id: string, ts: number) => {
    await repo.setProgress({ ...defaultProgress(u.id, A.id, id, NOW), lastReviewTs: ts });
  };
  await setTs('w0', NOW); // 窗口内（今天）
  await setTs('w1', NOW - 6 * DAY); // 窗口内
  await setTs('w2', NOW - 7 * DAY); // 边界（恰好 7 天前）含
  await setTs('w3', NOW - 8 * DAY); // 窗口外（8 天前）不含
  // w4、w5 无进度 -> 不含

  const recent = await getRecentWords(repo, u.id, A.id, 7, NOW);
  const ids = new Set(recent.map((x) => x.id));
  assert.ok(ids.has('w0'), 'today included');
  assert.ok(ids.has('w1'), '6 days ago included');
  assert.ok(ids.has('w2'), 'boundary (7 days ago) included');
  assert.ok(!ids.has('w3'), '8 days ago excluded');
  assert.ok(!ids.has('w4'), 'no-progress word excluded');
  assert.ok(!ids.has('w5'), 'no-progress word excluded');
  assert.strictEqual(recent.length, 3, 'exactly 3 recent words');

  // 仅按 user 隔离（不同 user 看不到）
  const u2 = await repo.createUser('bob');
  const recent2 = await getRecentWords(repo, u2.id, A.id, 7, NOW);
  assert.strictEqual(recent2.length, 0, 'other user has no recent words');

  console.log('ALL REVIEW-SCOPE TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
