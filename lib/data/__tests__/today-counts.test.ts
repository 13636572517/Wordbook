import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import { getTodayCounts } from '../../todayCounts';

const repo: Repository = memoryRepo;
const NOW = Date.parse('2026-08-11T12:00:00Z');
const DAY = 86400000;

(async () => {
  const u = await repo.createUser('alice');
  const wb = await repo.createWordbook({ ownerId: null, name: 'HS', level: 'high-school', type: 'system' });

  // 今天：3 个新词（w0 学两次只算 1）、2 个复习词、4 条练习记录
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w0', grade: 2, ts: NOW - 1000, source: 'study', isNew: true });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w0', grade: 2, ts: NOW - 900, source: 'study', isNew: true });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w1', grade: 2, ts: NOW - 800, source: 'study', isNew: true });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w2', grade: 1, ts: NOW - 700, source: 'study', isNew: true });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w0', grade: 2, ts: NOW - 600, source: 'review' });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w0', grade: 3, ts: NOW - 500, source: 'review' });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w1', grade: 0, ts: NOW - 400, source: 'review' });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w1', grade: 2, ts: NOW - 300, source: 'quiz' });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w2', grade: 2, ts: NOW - 200, source: 'quiz' });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w3', grade: 0, ts: NOW - 100, source: 'quiz' });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w4', grade: 2, ts: NOW - 50, source: 'quiz' });

  // 昨天的日志不应计入
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w9', grade: 2, ts: NOW - DAY, source: 'study', isNew: true });
  await repo.addStudyLog({ userId: u.id, wordbookId: wb.id, wordId: 'w9', grade: 2, ts: NOW - DAY, source: 'quiz' });

  const c = await getTodayCounts(repo, u.id, wb.id, NOW);
  assert.strictEqual(c.newWords, 3, `newWords expected 3, got ${c.newWords}`);
  assert.strictEqual(c.reviewWords, 2, `reviewWords expected 2, got ${c.reviewWords}`);
  assert.strictEqual(c.quizCount, 4, `quizCount expected 4, got ${c.quizCount}`);

  console.log('today-counts.test.ts PASS');
})().catch((e) => { console.error(e); process.exit(1); });
