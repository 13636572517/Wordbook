import type { Repository } from './data/repo';
import { startOfDayTs } from './data/types';

export interface DailyProgressGoals {
  dailyNewWordGoal: number;
  dailyQuizGoal: number;
}

export interface DailyProgress {
  totalWords: number;
  learnedWords: number;
  todayNewWords: number;
  dailyNewWordGoal: number;
  todayReviewCount: number;
  dueWords: number;
  todayQuizCount: number;
  dailyQuizGoal: number;
  allDone: boolean;
}

export async function getDailyProgress(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now: number,
  goals: DailyProgressGoals,
): Promise<DailyProgress> {
  const [stats, logs] = await Promise.all([
    repo.getWordbookStats(userId, wordbookId, now),
    repo.listStudyLogs(userId, wordbookId, { sinceTs: startOfDayTs(now) }),
  ]);
  const todayNewWords = new Set(
    logs.filter((log) => log.source === 'study' && log.isNew).map((log) => log.wordId),
  ).size;
  const todayQuizCount = logs.filter((log) => log.source === 'quiz').length;
  const todayReviewCount = logs.filter(
    (log) => log.source === 'review' || (log.source === 'study' && !log.isNew),
  ).length;
  const learnedWords = stats.total - stats.newCount;
  const allDone =
    todayNewWords >= goals.dailyNewWordGoal &&
    stats.due === 0 &&
    todayQuizCount >= goals.dailyQuizGoal;

  return {
    totalWords: stats.total,
    learnedWords,
    todayNewWords,
    dailyNewWordGoal: goals.dailyNewWordGoal,
    todayReviewCount,
    dueWords: stats.due,
    todayQuizCount,
    dailyQuizGoal: goals.dailyQuizGoal,
    allDone,
  };
}
