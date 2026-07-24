import type { Repository } from './repo';
import type { UserWordProgress } from './types';

// Thresholds mirror the legacy weakWords.ts logic so behavior is preserved
// after the move to per-(user, wordbook, word) progress.
const WRONG_RATIO = 0.34;
const LOW_EF = 1.8;
const PRACTICE_WRONG_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PRACTICE_WRONG_THRESHOLD = 2;

export function isWeakProgress(p: UserWordProgress): boolean {
  const reviewed = p.correct + p.wrong;
  if (reviewed === 0) return false;
  const wrongRatio = p.wrong / reviewed;
  if (wrongRatio >= WRONG_RATIO) return true;
  if (p.ef < LOW_EF) return true;
  return false;
}

/**
 * Word ids in a wordbook that the user is weak on, based on their progress.
 * Returns [] for empty wordbooks (safe to feed straight into getNextQuizWord).
 */
export async function getWeakWordIds(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now = Date.now(),
): Promise<string[]> {
  const words = await repo.getWordsByWordbook(wordbookId);
  const logs = await repo.listStudyLogs(userId, wordbookId, {
    sinceTs: now - PRACTICE_WRONG_WINDOW_MS,
  });
  const practiceWrongCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.ts <= now && log.source === 'quiz' && log.grade === 0) {
      practiceWrongCounts.set(log.wordId, (practiceWrongCounts.get(log.wordId) ?? 0) + 1);
    }
  }

  const ids: string[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    const frequentPracticeWrong = (practiceWrongCounts.get(w.id) ?? 0) >= PRACTICE_WRONG_THRESHOLD;
    if (p && (isWeakProgress(p) || frequentPracticeWrong)) ids.push(w.id);
  }
  return ids;
}
