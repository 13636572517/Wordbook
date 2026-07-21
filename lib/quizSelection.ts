// Local re-practice queue (used by the weak-words tab). Stores word ids
// (strings) so the DAL can match them against real Word.id values.
let priorityIds: string[] = [];

export function setPriorityIds(ids: string[]): void {
  priorityIds = [...ids];
}
export function clearPriorityIds(): void {
  priorityIds = [];
}
export function getPriorityIds(): string[] {
  return priorityIds;
}

// Minimal shape a word needs for scheduling selection.
export interface QuizCandidate {
  id: number;
  due: number;
  repetitions: number;
  times_reviewed: number;
}

// Pure selection logic, extracted for testability.
// 1) priority (re-practice) words first, 2) most-overdue due words,
// 3) brand-new words, 4) nothing left.
// Generic over T so callers (app Word, DAL candidates) keep their full object.
export function selectQuizWord<T extends QuizCandidate>(
  words: T[],
  priority: number[],
  now: number,
): T | null {
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
