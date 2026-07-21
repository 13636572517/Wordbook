import type { Word } from './database';

// Words the user explicitly asked to re-practice (e.g. from the weak-words tab).
// selectQuizWord drains these before falling back to scheduled/due words.
let priorityIds: number[] = [];

export function setPriorityIds(ids: number[]): void {
  priorityIds = [...ids];
}

export function clearPriorityIds(): void {
  priorityIds = [];
}

export function getPriorityIds(): number[] {
  return priorityIds;
}

// Pure selection logic, extracted for testability.
// 1) priority (re-practice) words first, 2) most-overdue due words,
// 3) brand-new words, 4) nothing left.
export function selectQuizWord(words: Word[], priority: number[], now: number): Word | null {
  if (words.length === 0) return null;

  for (const id of priority) {
    const w = words.find((x) => x.id === id);
    if (w) return w;
  }

  const due = words.filter((w) => w.due <= now).sort((a, b) => a.due - b.due);

  if (due.length > 0) {
    const pool = due.slice(0, Math.min(10, due.length));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const fresh = words.filter((w) => w.repetitions === 0 && w.times_reviewed === 0);
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];

  return null;
}
