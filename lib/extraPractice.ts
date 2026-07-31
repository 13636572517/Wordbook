export function advanceExtraPractice(
  remaining: number,
  learnedNewWord: boolean,
): { remaining: number; finished: boolean } {
  if (!learnedNewWord || remaining <= 0) return { remaining, finished: false };
  const next = remaining - 1;
  return { remaining: next, finished: next === 0 };
}

export function nextExtraBatchStep(finished: boolean): 'review' | 'continue' {
  return finished ? 'review' : 'continue';
}
