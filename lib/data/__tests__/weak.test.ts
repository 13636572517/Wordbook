import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word } from '../types';
import { defaultProgress } from '../quiz';
import { getWeakWordIds } from '../weak';

const repo: Repository = memoryRepo;
const NOW = new Date('2026-07-24T12:00:00').getTime();

function word(id: string): Word {
  return { id, word: id, translation: id, pronunciation: null };
}

(async () => {
  const user = await repo.createUser('weak-practice-user');
  const wordbook = await repo.createWordbook({ ownerId: null, name: 'weak-practice', level: 'test', type: 'system' });
  const words = ['frequent', 'single', 'review-only'].map(word);
  for (const item of words) {
    await repo.upsertWord(item);
    await repo.addWordToWordbook(wordbook.id, item.id);
    await repo.setProgress({
      ...defaultProgress(user.id, wordbook.id, item.id, NOW),
      correct: 10,
      wrong: 0,
      repetitions: 3,
    });
  }

  // Repeated quiz mistakes must override an otherwise strong lifetime ratio.
  for (let i = 0; i < 2; i++) {
    await repo.addStudyLog({ userId: user.id, wordbookId: wordbook.id, wordId: 'frequent', grade: 0, source: 'quiz', ts: NOW - i });
  }
  await repo.addStudyLog({ userId: user.id, wordbookId: wordbook.id, wordId: 'single', grade: 0, source: 'quiz', ts: NOW });
  for (let i = 0; i < 2; i++) {
    await repo.addStudyLog({ userId: user.id, wordbookId: wordbook.id, wordId: 'review-only', grade: 0, source: 'review', ts: NOW - i });
  }

  const weakIds = await getWeakWordIds(repo, user.id, wordbook.id, NOW);
  assert.deepStrictEqual(
    weakIds,
    ['frequent', 'review-only'],
    'two recent quiz or review mistakes mark a word as weak',
  );

  // ===== 新增维度：逾期未复习 + 低强度陈旧词 =====
  const DAY = 24 * 60 * 60 * 1000;
  const user2 = await repo.createUser('weak-dims-user');
  const wb2 = await repo.createWordbook({ ownerId: null, name: 'weak-dims', level: 'test', type: 'system' });
  const mk = async (id: string, prog: object, firstLogTs?: number) => {
    await repo.upsertWord(word(id));
    await repo.addWordToWordbook(wb2.id, id);
    await repo.setProgress({ ...defaultProgress(user2.id, wb2.id, id, NOW), correct: 10, wrong: 0, repetitions: 3, ef: 2.5, ...prog });
    if (firstLogTs != null) {
      await repo.addStudyLog({ userId: user2.id, wordbookId: wb2.id, wordId: id, grade: 2, source: 'study', isNew: true, ts: firstLogTs });
    }
  };

  // 逾期未复习：due 已过 4 天（其余指标健康）→ 薄弱
  await mk('overdue4', { due: NOW - 4 * DAY }, NOW - 20 * DAY);
  // 逾期仅 2 天 → 不算薄弱
  await mk('overdue2', { due: NOW - 2 * DAY }, NOW - 20 * DAY);
  // 低强度陈旧词：10 天前学，reps=1，due 仍在手边（反复 Again 场景）→ 薄弱
  await mk('stale-reps1', { due: NOW, repetitions: 1 }, NOW - 10 * DAY);
  // reps=2 已进复习循环 → 不算陈旧薄弱
  await mk('stale-reps2', { due: NOW, repetitions: 2 }, NOW - 10 * DAY);
  // reps=1 但才学 3 天 → 还不算陈旧
  await mk('fresh-reps1', { due: NOW, repetitions: 1 }, NOW - 3 * DAY);

  const dims = await getWeakWordIds(repo, user2.id, wb2.id, NOW);
  assert.ok(dims.includes('overdue4'), 'overdue 4 days marks weak');
  assert.ok(!dims.includes('overdue2'), 'overdue 2 days alone is not weak');
  assert.ok(dims.includes('stale-reps1'), 'learned >7d ago with reps<=1 marks weak');
  assert.ok(!dims.includes('stale-reps2'), 'reps>=2 is not stale-weak');
  assert.ok(!dims.includes('fresh-reps1'), 'recently learned reps<=1 is not stale-weak');

  console.log('ALL WEAK-PRACTICE TESTS PASSED');
})().catch((error) => {
  console.error('TEST ERROR', error);
  process.exit(1);
});
