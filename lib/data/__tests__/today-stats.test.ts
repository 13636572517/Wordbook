import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word } from '../types';
import { getTodayStats } from '../stats';

const repo: Repository = memoryRepo;

function w(id: string, word: string): Word {
  return { id, word, translation: 'x', pronunciation: null };
}

(async () => {
  const u = await repo.createUser('alice');
  const wb = await repo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });
  const w1 = w('w1', 'apple');
  const w2 = w('w2', 'banana');
  const w3 = w('w3', 'cherry');
  for (const x of [w1, w2, w3]) await repo.upsertWord(x);
  await repo.addWordToWordbook(wb.id, w1.id);
  await repo.addWordToWordbook(wb.id, w2.id);
  await repo.addWordToWordbook(wb.id, w3.id);

  // 固定一个白天时间戳，确保日志落在同一天
  const now = new Date('2026-07-22T12:00:00').getTime();

  // 空 -> 全 0
  const empty = await getTodayStats(repo, u.id, wb.id, now);
  assert.strictEqual(empty.studied, 0, 'empty studied=0');
  assert.strictEqual(empty.mastered, 0, 'empty mastered=0');
  assert.strictEqual(empty.accuracy, 0, 'empty accuracy=0');
  assert.deepStrictEqual(empty.details, [], 'empty details=[]');

  // 注入今日日志：w1 先 Good 后 Again(最后 Again)，w2 Easy，w3 Good
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: w1.id, grade: 2, ts: now });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: w1.id, grade: 0, ts: now + 1 });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: w2.id, grade: 3, ts: now });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: w3.id, grade: 2, ts: now });

  const s = await getTodayStats(repo, u.id, wb.id, now);
  assert.strictEqual(s.studied, 3, 'studied = distinct words today');
  // 最后评级：w1=0(Again), w2=3, w3=2 -> 掌握 2 个
  assert.strictEqual(s.mastered, 2, 'mastered = words with last grade>=2');
  assert.ok(Math.abs(s.accuracy - 2 / 3) < 1e-9, 'accuracy = mastered/studied');

  const byWord = new Map(s.details.map((d) => [d.word, d]));
  assert.strictEqual(byWord.get('apple')!.grade, 0, 'w1 last grade is Again(0)');
  assert.strictEqual(byWord.get('apple')!.ts, now + 1, 'w1 detail uses last ts');
  assert.strictEqual(byWord.get('banana')!.grade, 3, 'w2 grade Easy');
  assert.strictEqual(byWord.get('cherry')!.grade, 2, 'w3 grade Good');
  assert.strictEqual(s.details.length, 3, 'details has one entry per word');

  // 昨天的日志不计入今日
  const yest = now - 24 * 3600 * 1000 - 1000;
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: w3.id, grade: 2, ts: yest });
  const s2 = await getTodayStats(repo, u.id, wb.id, now);
  assert.strictEqual(s2.studied, 3, 'yesterday log excluded from today');

  console.log('ALL TODAY-STATS TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
