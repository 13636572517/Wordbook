import type { Repository } from './repo';
import type { Word } from './types';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Words in `wordbookId` the user reviewed within the last `days` days, based on
 * each word's progress `lastReviewTs`. Window is inclusive on both ends:
 * `[now - days*DAY, now]`. Words with no progress (never reviewed) are excluded.
 * Progress is isolated per (user, wordbook, word).
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
  const result: Word[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (p && p.lastReviewTs != null && p.lastReviewTs >= lower && p.lastReviewTs <= now) {
      result.push(w);
    }
  }
  return result;
}
