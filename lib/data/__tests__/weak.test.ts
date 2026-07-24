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
  assert.deepStrictEqual(weakIds, ['frequent'], 'two recent quiz mistakes mark only that word as weak');

  console.log('ALL WEAK-PRACTICE TESTS PASSED');
})().catch((error) => {
  console.error('TEST ERROR', error);
  process.exit(1);
});
