import type { Repository } from './repo';
import type { UserWordProgress } from './types';

const DAY = 24 * 60 * 60 * 1000;

// 「需加强的词」= 历史上掌握不牢靠的词，判定维度：
// 1. 错误率 >= 34% 或 EF < 1.8（反复答错/被评 Again）
// 2. 近 30 天练习/复习错 >= 2 次（近期活跃错误）
// 3. 逾期未复习：到期已超 3 天仍未复习（记忆正在衰减）
// 4. 低强度陈旧词：首学已超 7 天但 repetitions <= 1（从未真正进入复习循环，
//    典型场景是反复评 Again、due 被不断重置但始终记不住）
const WRONG_RATIO = 0.34;
const LOW_EF = 1.8;
const PRACTICE_WRONG_WINDOW_MS = 30 * DAY;
const PRACTICE_WRONG_THRESHOLD = 2;
const OVERDUE_WEAK_MS = 3 * DAY;
const STALE_LEARN_MS = 7 * DAY;
const STALE_MAX_REPS = 1;

export function isWeakProgress(p: UserWordProgress): boolean {
  const reviewed = p.correct + p.wrong;
  if (reviewed === 0) return false;
  const wrongRatio = p.wrong / reviewed;
  if (wrongRatio >= WRONG_RATIO) return true;
  if (p.ef < LOW_EF) return true;
  return false;
}

/** 逾期未复习：到期时间已过去 3 天以上 */
export function isOverdueWeak(p: UserWordProgress, now: number): boolean {
  return p.due <= now - OVERDUE_WEAK_MS;
}

/** 低强度陈旧词：首学超 7 天但 repetitions 仍 <= 1 */
export function isStaleWeak(p: UserWordProgress, firstLearnTs: number | undefined, now: number): boolean {
  if (p.repetitions > STALE_MAX_REPS) return false;
  if (firstLearnTs == null) return false;
  return now - firstLearnTs >= STALE_LEARN_MS;
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
  // 全量日志：既要 30 天窗口内的练习错误次数，也要每个词的首学时间（可能更早）
  const logs = await repo.listStudyLogs(userId, wordbookId, {});
  const practiceWrongCounts = new Map<string, number>();
  const firstLearnTs = new Map<string, number>();
  for (const log of logs) {
    if (log.ts > now) continue;
    const prev = firstLearnTs.get(log.wordId);
    if (prev == null || log.ts < prev) firstLearnTs.set(log.wordId, log.ts);
    if (
      log.ts >= now - PRACTICE_WRONG_WINDOW_MS
      && (log.source === 'quiz' || log.source === 'review')
      && log.grade === 0
    ) {
      practiceWrongCounts.set(log.wordId, (practiceWrongCounts.get(log.wordId) ?? 0) + 1);
    }
  }

  const ids: string[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (!p) continue;
    const frequentPracticeWrong = (practiceWrongCounts.get(w.id) ?? 0) >= PRACTICE_WRONG_THRESHOLD;
    if (
      isWeakProgress(p)
      || frequentPracticeWrong
      || isOverdueWeak(p, now)
      || isStaleWeak(p, firstLearnTs.get(w.id), now)
    ) {
      ids.push(w.id);
    }
  }
  return ids;
}
