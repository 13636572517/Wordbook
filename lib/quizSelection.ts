// Local re-practice queue (used by the weak-words tab). Stores word ids
// (strings) so the DAL can match them against real Word.id values.
let priorityIds: string[] = [];

export function setPriorityIds(ids: string[]): void {
  priorityIds = [...ids];
}
export function clearPriorityIds(): void {
  priorityIds = [];
}
export function consumePriorityId(id: string): void {
  const index = priorityIds.indexOf(id);
  if (index >= 0) priorityIds.splice(index, 1);
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
// 3) brand-new words in wordbook order (sequential learning), 4) nothing left.
// When newOnly=true, skip priority and due branches — only select fresh words.
// Generic over T so callers (app Word, DAL candidates) keep their full object.
export function selectQuizWord<T extends QuizCandidate>(
  words: T[],
  priority: number[],
  now: number,
  newOnly = false,
): T | null {
  if (words.length === 0) return null;

  // 加练模式：跳过复习词，只选新词
  if (!newOnly) {
    for (const id of priority) {
      const w = words.find((x) => x.id === id);
      if (w) return w;
    }

    const due = words.filter((w) => w.due <= now).sort((a, b) => a.due - b.due);

    // 复习：按到期时间顺序（最久未复习的优先），确定性不随机
    if (due.length > 0) return due[0];
  }

  const fresh = words.filter((w) => w.repetitions === 0 && w.times_reviewed === 0);
  // 新词：按词本顺序依次学习（不随机抽取）
  if (fresh.length > 0) return fresh[0];

  return null;
}
