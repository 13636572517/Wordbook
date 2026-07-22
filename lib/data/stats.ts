import type { Repository } from './repo';
import type { UserWordProgress, StudyLog, Word } from './types';
import { startOfDayTs } from './types';

export interface WordbookStats {
  total: number;
  newCount: number;
  due: number;
  learning: number;
  mastered: number;
  accuracy: number; // 0..1, 0 when no reviews yet
  streak: number; // consecutive study days (ending today or yesterday)
}

export interface TodayStatDetail {
  word: string;
  grade: number;
  ts: number;
}

export interface TodayStats {
  studied: number; // distinct words studied today
  mastered: number; // distinct words whose last grade today is Good/Easy (>=2)
  accuracy: number; // 0..1, mastered/studied, 0 when none
  details: TodayStatDetail[]; // one entry per word, last grade + ts
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

/**
 * Today's study summary for a single (user, wordbook), scoped to the calendar
 * day containing `now` (local midnight). `studied` is the count of distinct
 * words logged today; `mastered`/`accuracy` are based on each word's LAST grade
 * today (Good/Easy = >=2 counts as mastered); `details` lists one entry per
 * word with its last grade and timestamp.
 */
export async function getTodayStats(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now: number,
): Promise<TodayStats> {
  const logs = await repo.listStudyLogs(userId, wordbookId, { sinceTs: startOfDayTs(now) });
  if (logs.length === 0) return { studied: 0, mastered: 0, accuracy: 0, details: [] };

  // keep only the latest log per word
  const lastByWord = new Map<string, StudyLog>();
  for (const l of logs) {
    const prev = lastByWord.get(l.wordId);
    if (!prev || l.ts > prev.ts) lastByWord.set(l.wordId, l);
  }

  const wordIds = [...lastByWord.keys()];
  const textById = new Map<string, string>();
  for (const id of wordIds) {
    const w: Word | null = await repo.getWord(id);
    textById.set(id, w ? w.word : id);
  }

  let mastered = 0;
  const details: TodayStatDetail[] = [];
  for (const [id, l] of lastByWord) {
    if (l.grade >= 2) mastered++;
    details.push({ word: textById.get(id)!, grade: l.grade, ts: l.ts });
  }
  details.sort((a, b) => b.ts - a.ts);

  const studied = lastByWord.size;
  const accuracy = studied > 0 ? mastered / studied : 0;
  return { studied, mastered, accuracy, details };
}
