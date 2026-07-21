import type { Repository } from './repo';
import type { UserWordProgress } from './types';

// Thresholds mirror the legacy weakWords.ts logic so behavior is preserved
// after the move to per-(user, wordbook, word) progress.
const WRONG_RATIO = 0.34;
const LOW_EF = 1.8;

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
): Promise<string[]> {
  const words = await repo.getWordsByWordbook(wordbookId);
  const ids: string[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (p && isWeakProgress(p)) ids.push(w.id);
  }
  return ids;
}
