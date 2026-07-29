export const PRACTICE_GOAL_DEFAULT = 20;

/** Keep legacy numeric settings on the 10-word options shown in the practice UI. */
export function normalizePracticeGoal(value: unknown): number {
  const goal = Math.floor(Number(value));
  if (!Number.isFinite(goal) || goal < 10) return PRACTICE_GOAL_DEFAULT;
  return Math.floor(goal / 10) * 10;
}
