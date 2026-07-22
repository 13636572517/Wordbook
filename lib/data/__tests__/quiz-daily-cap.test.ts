import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word } from '../types';
import { defaultProgress, getNextQuizWord, getTodayNewWordCount } from '../quiz';

const repo: Repository = memoryRepo;
const NOW = new Date('2026-07-22T12:00:00').getTime();

function w(id: string, word: string): Word {
  return { id, word, translation: 'x', pronunciation: null };
}

(async () => {
  const u = await repo.createUser('alice');
  const A = await repo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });
  const C = await repo.createWordbook({ ownerId: null, name: 'C', level: 'c', type: 'system' });
  const wA1 = w('wA1', 'alpha');
  const wA2 = w('wA2', 'beta');
  const wA3 = w('wA3', 'gamma');
  const wC1 = w('wC1', 'one');
  const wC2 = w('wC2', 'two');
  for (const x of [wA1, wA2, wA3, wC1, wC2]) await repo.upsertWord(x);
  await repo.addWordToWordbook(A.id, wA1.id);
  await repo.addWordToWordbook(A.id, wA2.id);
  await repo.addWordToWordbook(A.id, wA3.id);
  await repo.addWordToWordbook(C.id, wC1.id);
  await repo.addWordToWordbook(C.id, wC2.id);

  // --- getTodayNewWordCount ---
  assert.strictEqual(await getTodayNewWordCount(repo, u.id, A.id, NOW), 0, 'no new words yet');
  await repo.addStudyLog({ userId: u.id, wordbookId: A.id, wordId: wA1.id, grade: 2, ts: NOW, isNew: true });
  await repo.addStudyLog({ userId: u.id, wordbookId: A.id, wordId: wA2.id, grade: 2, ts: NOW, isNew: true });
  assert.strictEqual(await getTodayNewWordCount(repo, u.id, A.id, NOW), 2, 'counts two isNew logs today');
  // 非新词不计入
  await repo.addStudyLog({ userId: u.id, wordbookId: A.id, wordId: wA3.id, grade: 0, ts: NOW, isNew: false });
  assert.strictEqual(await getTodayNewWordCount(repo, u.id, A.id, NOW), 2, 'isNew=false excluded');
  // 昨天的 isNew 不计入今日
  await repo.addStudyLog({ userId: u.id, wordbookId: A.id, wordId: wA3.id, grade: 2, ts: NOW - 24 * 3600 * 1000 - 1000, isNew: true });
  assert.strictEqual(await getTodayNewWordCount(repo, u.id, A.id, NOW), 2, 'yesterday isNew excluded');

  // --- 选词闸门：达上限后不再出新词 ---
  // 全部新词、上限=2、今日已学新词=2 -> 应返回 null（no due, new blocked）
  const blocked = await getNextQuizWord(repo, u.id, A.id, [], NOW, 2, 2);
  assert.strictEqual(blocked, null, 'cap reached -> no new word (null)');

  // 达上限但仍走到期复习：把 wA1 设为真实到期复习词（有进度、due<=now）
  await repo.setProgress({
    ...defaultProgress(u.id, A.id, wA1.id, NOW),
    due: NOW - 1000,
    repetitions: 1,
    correct: 1,
    wrong: 0,
  });
  const stillDue = await getNextQuizWord(repo, u.id, A.id, [], NOW, 2, 2);
  assert.ok(stillDue, 'cap reached but due review word still returned');
  assert.strictEqual(stillDue?.id, wA1.id, 'returns the due review word, not a new word');

  // 未达上限：新词正常出
  const fresh = await getNextQuizWord(repo, u.id, C.id, [], NOW, 2, 0);
  assert.ok(fresh, 'cap not reached -> a word is offered');
  assert.ok([wC1.id, wC2.id].includes(fresh!.id), 'offered word belongs to the wordbook');

  console.log('ALL QUIZ-DAILY-CAP TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
