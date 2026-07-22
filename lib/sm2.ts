// Pure SM-2 spaced-repetition scheduler, extracted from lib/database.ts so it
// can be unit-tested without React Native. `now` is injectable for determinism.

export type Grade = 0 | 1 | 2 | 3; // Again, Hard, Good, Easy

export interface Sm2Card {
  ef: number;
  interval: number;
  repetitions: number;
}

export interface Sm2Result {
  ef: number;
  interval: number;
  repetitions: number;
  due: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function sm2(card: Sm2Card, grade: Grade, now: number = Date.now()): Sm2Result {
  let { ef, interval, repetitions } = card;
  const q = 2 + grade; // Again=2(fail) Hard=3 Good=4 Easy=5

  if (q < 3) {
    // Failed recall: reset and show again soon.
    repetitions = 0;
    interval = 0;
    ef = Math.max(1.3, ef - 0.2);
  } else {
    if (repetitions === 0) {
      interval = grade === 1 ? 1 : grade === 2 ? 1 : 4;
    } else if (repetitions === 1) {
      interval = grade === 1 ? 3 : grade === 2 ? 6 : 10;
    } else {
      const mult = grade === 1 ? 1.2 : grade === 2 ? ef : ef * 1.3;
      interval = Math.round(interval * mult);
    }
    repetitions += 1;
  }

  // Classic SM-2 ease-factor update.
  ef = Math.min(2.8, Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
  const due = now + interval * DAY;
  return { ef, interval, repetitions, due };
}
