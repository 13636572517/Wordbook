import type { Word } from './database';

// Thresholds for classifying a word as "weak" (not yet mastered).
export const WEAK_WRONG_RATIO = 0.34; // wrong / (correct + wrong)
export const WEAK_EF_THRESHOLD = 1.8; // ease factor below this => weak

export function isWeak(word: Word): boolean {
  const correct = word.correct ?? 0;
  const wrong = word.wrong ?? 0;
  const total = correct + wrong;
  if (total === 0) return false; // never reviewed -> not weak yet
  const ratio = wrong / total;
  const ef = word.ef ?? 2.5;
  return ratio >= WEAK_WRONG_RATIO || ef < WEAK_EF_THRESHOLD;
}

// Weak words sorted by wrong count desc, then by ease factor asc (lowest mastery first).
export function getWeakWords(words: Word[]): Word[] {
  return words
    .filter(isWeak)
    .sort((a, b) => (b.wrong ?? 0) - (a.wrong ?? 0) || (a.ef ?? 2.5) - (b.ef ?? 2.5));
}
