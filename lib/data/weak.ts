import type { Repository } from './repo';
import type { StudyLog, UserWordProgress } from './types';

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

export type WeakReason = 'wrong' | 'recent' | 'overdue' | 'stale';

export interface WeakLogStats {
  /** 近 30 天练习/复习答错次数 */
  frequentWrong: number;
  /** 该词最早一条学习日志时间（首学时间） */
  firstLearnTs?: number;
}

/** 扫描全量日志，得到每个词的 {近期错误次数, 首学时间} */
export function scanWeakLogs(logs: StudyLog[], now: number): Map<string, WeakLogStats> {
  const map = new Map<string, WeakLogStats>();
  for (const log of logs) {
    if (log.ts > now) continue;
    let entry = map.get(log.wordId);
    if (!entry) {
      entry = { frequentWrong: 0, firstLearnTs: undefined };
      map.set(log.wordId, entry);
    }
    if (entry.firstLearnTs == null || log.ts < entry.firstLearnTs) entry.firstLearnTs = log.ts;
    if (
      log.ts >= now - PRACTICE_WRONG_WINDOW_MS
      && (log.source === 'quiz' || log.source === 'review')
      && log.grade === 0
    ) {
      entry.frequentWrong += 1;
    }
  }
  return map;
}

const EMPTY_LOG_STATS: WeakLogStats = { frequentWrong: 0, firstLearnTs: undefined };

/**
 * 薄弱原因判定（优先级 wrong > recent > overdue > stale），非薄弱返回 null。
 * 学员端与教师端口径同源；后端 TeacherStudentWeakWordsView 保持同样规则。
 */
export function getWeakReason(
  p: UserWordProgress,
  logStats: WeakLogStats | undefined,
  now: number,
): WeakReason | null {
  const s = logStats ?? EMPTY_LOG_STATS;
  const reviewed = p.correct + p.wrong;
  if ((reviewed > 0 && p.wrong / reviewed >= WRONG_RATIO) || p.ef < LOW_EF) return 'wrong';
  if (s.frequentWrong >= PRACTICE_WRONG_THRESHOLD) return 'recent';
  if (p.due <= now - OVERDUE_WEAK_MS) return 'overdue';
  if (p.repetitions <= STALE_MAX_REPS && s.firstLearnTs != null && now - s.firstLearnTs >= STALE_LEARN_MS) return 'stale';
  return null;
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
  const logStats = scanWeakLogs(logs, now);

  const ids: string[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (!p) continue;
    if (getWeakReason(p, logStats.get(w.id), now) != null) ids.push(w.id);
  }
  return ids;
}
