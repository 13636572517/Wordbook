import type { Repository } from './repo';
import type { Word } from './types';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Words in `wordbookId` the user studied within the last `days` days, based on
 * persisted study logs. Window is inclusive on both ends:
 * `[now - days*DAY, now]`. Logs are shared by learning, quiz, and review flows,
 * so this also works in cloud mode where progress has no lastReviewTs field.
 */
export async function getRecentWords(
  repo: Repository,
  userId: string,
  wordbookId: string,
  days: number,
  now: number,
): Promise<Word[]> {
  const words = await repo.getWordsByWordbook(wordbookId);
  const lower = now - days * DAY;
  const logs = await repo.listStudyLogs(userId, wordbookId, { sinceTs: lower });
  const recentIds = new Set(logs.filter((log) => log.ts <= now).map((log) => log.wordId));
  return words.filter((word) => recentIds.has(word.id));
}

/**
 * Words in `wordbookId` the user has already studied at least once, based on
 * each word's progress. "Studied" means a progress record exists AND the user
 * has actually graded it — i.e. `repetitions >= 1`, or `lastReviewTs` is set, or
 * there is any correct/wrong tally. Words that have never been studied (no
 * progress, or a bare default record) are excluded. This is the pool used by
 * 每日测试 so it only quizzes words the user has learned. Progress is isolated
 * per (user, wordbook, word).
 */
export async function getStudiedWords(
  repo: Repository,
  userId: string,
  wordbookId: string,
): Promise<Word[]> {
  const words = await repo.getWordsByWordbook(wordbookId);
  const result: Word[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (
      p &&
      (p.repetitions >= 1 ||
        p.lastReviewTs != null ||
        (p.correct ?? 0) + (p.wrong ?? 0) > 0)
    ) {
      result.push(w);
    }
  }
  return result;
}
