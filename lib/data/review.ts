import type { Repository } from './repo';
import type { UserWordProgress } from './types';
import { sm2, type Grade } from '../sm2';
import { defaultProgress } from './quiz';

/**
 * Record a review grade for a single (user, wordbook, word) and update its
 * SM-2 schedule. Progress is isolated per (user, wordbook, word); the first
 * review seeds a fresh card. `lastReviewTs` is stamped for streak tracking.
 */
export async function reviewWord(
  repo: Repository,
  userId: string,
  wordbookId: string,
  wordId: string,
  grade: Grade,
  now: number,
): Promise<UserWordProgress> {
  const existing = await repo.getProgress(userId, wordbookId, wordId);
  const base = existing ?? defaultProgress(userId, wordbookId, wordId, now);

  const sched = sm2(
    { ef: base.ef, interval: base.interval, repetitions: base.repetitions },
    grade,
    now,
  );

  const updated: UserWordProgress = {
    ...base,
    ef: sched.ef,
    interval: sched.interval,
    repetitions: sched.repetitions,
    due: sched.due,
    correct: base.correct + (grade >= 1 ? 1 : 0),
    wrong: base.wrong + (grade >= 1 ? 0 : 1),
    lastReviewTs: now,
  };

  await repo.setProgress(updated);
  return updated;
}
