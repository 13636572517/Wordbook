import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { StudyLog } from '../types';

const repo: Repository = memoryRepo;

(async () => {
  const u1 = await repo.createUser('alice');
  const u2 = await repo.createUser('bob');
  const wb = await repo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });

  // defaults: source='study', isNew=false
  await repo.addStudyLog({ userId: u1.id, wordbookId: wb.id, wordId: 'w1', grade: 2, ts: 100 });
  const all = await repo.listStudyLogs(u1.id);
  assert.strictEqual(all.length, 1, 'one log after add');
  assert.strictEqual(all[0].source, 'study', 'default source is study');
  assert.strictEqual(all[0].isNew, false, 'default isNew is false');

  // explicit source + isNew
  await repo.addStudyLog({ userId: u1.id, wordbookId: wb.id, wordId: 'w2', grade: 0, ts: 200, source: 'quiz', isNew: true });
  await repo.addStudyLog({ userId: u1.id, wordbookId: wb.id, wordId: 'w3', grade: 2, ts: 300, source: 'review', isNew: false });

  // sinceTs filter
  const since200 = await repo.listStudyLogs(u1.id, undefined, { sinceTs: 200 });
  assert.strictEqual(since200.length, 2, 'sinceTs keeps ts>=200');
  assert.ok(since200.every((l) => l.ts >= 200), 'all kept logs satisfy sinceTs');

  // source filter
  const quizLogs = await repo.listStudyLogs(u1.id, undefined, { source: 'quiz' });
  assert.strictEqual(quizLogs.length, 1, 'source filter matches one');
  assert.strictEqual(quizLogs[0].wordId, 'w2', 'source filter returns correct log');

  // isNew filter
  const newLogs = await repo.listStudyLogs(u1.id, undefined, { isNew: true });
  assert.strictEqual(newLogs.length, 1, 'isNew=true matches the new-word log');
  assert.strictEqual(newLogs[0].wordId, 'w2', 'isNew filter returns correct log');
  const notNewLogs = await repo.listStudyLogs(u1.id, undefined, { isNew: false });
  assert.strictEqual(notNewLogs.length, 2, 'isNew=false matches study+review logs');

  // wordbook scoping
  const scoped = await repo.listStudyLogs(u1.id, wb.id);
  assert.strictEqual(scoped.length, 3, 'all three logs belong to wb');

  // user isolation
  const other = await repo.listStudyLogs(u2.id);
  assert.strictEqual(other.length, 0, 'logs are isolated per user');

  console.log('ALL STUDYLOG TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
