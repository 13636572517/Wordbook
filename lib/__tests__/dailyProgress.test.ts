import assert from 'node:assert';
import { memoryRepo } from '../data/memoryRepo';
import { defaultProgress } from '../data/quiz';
import { getDailyProgress } from '../dailyProgress';

const now = new Date('2026-07-29T12:00:00').getTime();

(async () => {
  const user = await memoryRepo.createUser('daily-progress');
  const wordbook = await memoryRepo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });
  const first = await memoryRepo.upsertWord({ id: 'progress-a', word: 'alpha', translation: '阿尔法', pronunciation: null });
  const second = await memoryRepo.upsertWord({ id: 'progress-b', word: 'beta', translation: '贝塔', pronunciation: null });
  await memoryRepo.addWordToWordbook(wordbook.id, first.id);
  await memoryRepo.addWordToWordbook(wordbook.id, second.id);
  await memoryRepo.setProgress({ ...defaultProgress(user.id, wordbook.id, first.id, now), repetitions: 1, correct: 1, due: now - 1 });
  await memoryRepo.addStudyLog({ userId: user.id, wordbookId: wordbook.id, wordId: first.id, grade: 2, ts: now, source: 'study', isNew: true });
  await memoryRepo.addStudyLog({ userId: user.id, wordbookId: wordbook.id, wordId: first.id, grade: 2, ts: now, source: 'quiz' });

  const progress = await getDailyProgress(memoryRepo, user.id, wordbook.id, now, {
    dailyNewWordGoal: 1,
    dailyQuizGoal: 1,
  });
  assert.strictEqual(progress.totalWords, 2);
  assert.strictEqual(progress.learnedWords, 1);
  assert.strictEqual(progress.todayNewWords, 1);
  assert.strictEqual(progress.dueWords, 1);
  assert.strictEqual(progress.todayQuizCount, 1);
  assert.strictEqual(progress.allDone, false, 'a due word keeps the daily plan incomplete');

  await memoryRepo.setProgress({ ...defaultProgress(user.id, wordbook.id, first.id, now), repetitions: 1, correct: 1, due: now + 1 });
  const completed = await getDailyProgress(memoryRepo, user.id, wordbook.id, now, {
    dailyNewWordGoal: 1,
    dailyQuizGoal: 1,
  });
  assert.ok(completed.allDone, 'allDone combines new-word, due-review and quiz goals');
  console.log('ALL DAILY PROGRESS TESTS PASSED');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
