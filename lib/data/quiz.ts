import type { Repository } from './repo';
import type { Word, UserWordProgress, StudyLog } from './types';
import { DEFAULT_EF, startOfDayTs } from './types';
import { selectQuizWord, type QuizCandidate } from '../quizSelection';

export function defaultProgress(
  userId: string,
  wordbookId: string,
  wordId: string,
  now: number,
): UserWordProgress {
  return {
    userId,
    wordbookId,
    wordId,
    ef: DEFAULT_EF,
    interval: 0,
    repetitions: 0,
    due: now,
    correct: 0,
    wrong: 0,
  };
}

// Map a DAL Word + its progress into a scheduling candidate. Candidate id is the
// array index (not the word id) so it round-trips back to `words[idx]`.
function toCandidate(word: Word, progress: UserWordProgress | null, idx: number, now: number): QuizCandidate {
  const reviewed = progress ? progress.correct + progress.wrong : 0;
  return {
    id: idx,
    due: progress ? progress.due : now,
    repetitions: progress ? progress.repetitions : 0,
    times_reviewed: reviewed,
  };
}

/**
 * Choose the next word to study within ONE wordbook. Only words belonging to
 * `wordbookId` are considered; progress is isolated per (user, wordbook, word).
 * `priorityWordIds` are re-practice words (e.g. from the weak-words tab),
 * already filtered to this wordbook by the caller.
 * `allowNew` gates brand-new words: when false (daily new-word cap reached)
 * only due/overdue review words are returned.
 */
export function selectQuizWordForWordbook(
  words: Word[],
  progresses: Map<string, UserWordProgress>,
  priorityWordIds: string[],
  now: number,
  allowNew = true,
  newOnly = false,
): Word | null {
  const candidates = words.map((w, i) => toCandidate(w, progresses.get(w.id) ?? null, i, now));
  if (!allowNew) {
    // Block new (unstudied) words so only due review words remain selectable.
    for (const c of candidates) {
      if (c.repetitions === 0 && c.times_reviewed === 0) {
        c.due = now + 1; // exclude from the due branch
        c.repetitions = 1; // exclude from the fresh branch
      }
    }
  }
  const priorityIdx = priorityWordIds
    .map((id) => words.findIndex((w) => w.id === id))
    .filter((i) => i >= 0);
  const chosen = selectQuizWord(candidates, priorityIdx, now, newOnly);
  return chosen ? words[chosen.id] : null;
}

/**
 * High-level helper: load a wordbook's words + the user's progress, then pick
 * the next word. Returns null when the wordbook is empty or fully reviewed.
 *
 * `dailyNewWordGoal` / `todayNewWordCount` enforce the per-user daily new-word
 * cap: when `todayNewWordCount >= dailyNewWordGoal`, brand-new words are skipped
 * and only due review words are offered (study continues via review).
 */
export async function getNextQuizWord(
  repo: Repository,
  userId: string,
  wordbookId: string,
  priorityWordIds: string[],
  now: number,
  dailyNewWordGoal = Number.POSITIVE_INFINITY,
  todayNewWordCount = 0,
  newOnly = false,
): Promise<Word | null> {
  const words = await repo.getWordsByWordbook(wordbookId);
  // 新词按字母 A→Z 排序：保证从 a 开始顺序学习（到期复习仍按 due 优先，不受影响）
  words.sort((a, b) => a.word.localeCompare(b.word));
  if (words.length === 0) return null;
  const progresses = new Map<string, UserWordProgress>();
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (p) progresses.set(w.id, p);
  }
  const allowNew = todayNewWordCount < dailyNewWordGoal;
  return selectQuizWordForWordbook(words, progresses, priorityWordIds, now, allowNew, newOnly);
}

/**
 * Number of NEW words studied today (logs with isNew=true within the calendar
 * day containing `now`). Counted GLOBALLY across the user's wordbooks, matching
 * the per-user global daily-new-word goal (the `wordbookId` is accepted for
 * signature symmetry but the cap is global).
 */
export async function getTodayNewWordCount(
  repo: Repository,
  userId: string,
  _wordbookId: string,
  now: number,
): Promise<number> {
  const logs: StudyLog[] = await repo.listStudyLogs(userId, undefined, {
    sinceTs: startOfDayTs(now),
    isNew: true,
  });
  // 按 wordId 去重：同一词多次 isNew 日志（如循环评分产生）不应重复计入，
  // 否则计数虚高导致 newWordGoal 提前关闭，用户无新词可学。
  const uniqueWordIds = new Set(logs.map((l) => l.wordId));
  return uniqueWordIds.size;
}
