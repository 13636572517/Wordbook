import type { Repository } from './repo';
import type { Word, UserWordProgress } from './types';
import { DEFAULT_EF } from './types';
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
 */
export function selectQuizWordForWordbook(
  words: Word[],
  progresses: Map<string, UserWordProgress>,
  priorityWordIds: string[],
  now: number,
): Word | null {
  const candidates = words.map((w, i) => toCandidate(w, progresses.get(w.id) ?? null, i, now));
  const priorityIdx = priorityWordIds
    .map((id) => words.findIndex((w) => w.id === id))
    .filter((i) => i >= 0);
  const chosen = selectQuizWord(candidates, priorityIdx, now);
  return chosen ? words[chosen.id] : null;
}

/**
 * High-level helper: load a wordbook's words + the user's progress, then pick
 * the next word. Returns null when the wordbook is empty or fully reviewed.
 */
export async function getNextQuizWord(
  repo: Repository,
  userId: string,
  wordbookId: string,
  priorityWordIds: string[],
  now: number,
): Promise<Word | null> {
  const words = await repo.getWordsByWordbook(wordbookId);
  if (words.length === 0) return null;
  const progresses = new Map<string, UserWordProgress>();
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (p) progresses.set(w.id, p);
  }
  return selectQuizWordForWordbook(words, progresses, priorityWordIds, now);
}
