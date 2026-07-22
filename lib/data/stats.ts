import type { Repository } from './repo';
import type { UserWordProgress } from './types';

export interface WordbookStats {
  total: number;
  newCount: number;
  due: number;
  learning: number;
  mastered: number;
  accuracy: number; // 0..1, 0 when no reviews yet
  streak: number; // consecutive study days (ending today or yesterday)
}

const MASTERED_REPETITIONS = 3;

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
function prevDay(key: string): string {
  return new Date(Date.parse(key + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
}

function computeStreak(lastReviewTsList: number[], now: number): number {
  const days = new Set(lastReviewTsList.filter((t) => t > 0).map(dayKey));
  if (days.size === 0) return 0;
  const countFrom = (start: string): number => {
    let s = 0;
    let cur = start;
    while (days.has(cur)) {
      s++;
      cur = prevDay(cur);
    }
    return s;
  };
  const fromToday = countFrom(dayKey(now));
  if (fromToday > 0) return fromToday;
  // today not studied yet — count from yesterday if present
  return countFrom(prevDay(dayKey(now)));
}

/**
 * Aggregate study statistics for a single (user, wordbook). All numbers are
 * isolated to that user and wordbook.
 */
export async function getWordbookStats(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now: number,
): Promise<WordbookStats> {
  const words = await repo.getWordsByWordbook(wordbookId);
  const total = words.length;

  const progresses: UserWordProgress[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (p) progresses.push(p);
  }

  let due = 0;
  let learning = 0;
  let mastered = 0;
  let correct = 0;
  let wrong = 0;
  const lastReviewTsList: number[] = [];

  for (const p of progresses) {
    if (p.repetitions >= MASTERED_REPETITIONS) mastered++;
    else if (p.due <= now) due++;
    else learning++;
    correct += p.correct;
    wrong += p.wrong;
    if (p.lastReviewTs) lastReviewTsList.push(p.lastReviewTs);
  }

  const accuracy = correct + wrong > 0 ? correct / (correct + wrong) : 0;

  return {
    total,
    newCount: total - progresses.length,
    due,
    learning,
    mastered,
    accuracy,
    streak: computeStreak(lastReviewTsList, now),
  };
}
