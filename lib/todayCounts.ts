import type { Repository } from './data/repo';
import type { StudyLog } from './data/types';
import { startOfDayTs } from './data/types';

/** 今日学习统计（仅当前词本，按日历日 scope）。 */
export interface TodayCounts {
  /** 今日新学单词数（isNew 日志按 wordId 去重） */
  newWords: number;
  /** 今日复习单词数（source=review 按 wordId 去重） */
  reviewWords: number;
  /** 今日练习题数（source=quiz 日志条数） */
  quizCount: number;
}

/**
 * 一次 listStudyLogs 拉取今日全部日志后分类统计，避免多次请求。
 * newWords/reviewWords 按 wordId 去重（同词多次记录只算一次），
 * quizCount 按条数计（每题一条日志）。
 */
export async function getTodayCounts(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now: number,
): Promise<TodayCounts> {
  const logs: StudyLog[] = await repo.listStudyLogs(userId, wordbookId, {
    sinceTs: startOfDayTs(now),
  });
  const newIds = new Set<string>();
  const reviewIds = new Set<string>();
  let quizCount = 0;
  for (const l of logs) {
    if (l.ts > now) continue;
    if (l.isNew) newIds.add(l.wordId);
    if (l.source === 'review') reviewIds.add(l.wordId);
    if (l.source === 'quiz') quizCount++;
  }
  return { newWords: newIds.size, reviewWords: reviewIds.size, quizCount };
}
