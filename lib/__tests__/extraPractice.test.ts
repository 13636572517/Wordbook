import assert from 'node:assert';
import { advanceExtraPractice } from '../extraPractice';

assert.deepStrictEqual(
  advanceExtraPractice(10, true),
  { remaining: 9, finished: false },
  'a newly learned extra word decrements the remaining count even when another card follows',
);
assert.deepStrictEqual(
  advanceExtraPractice(1, true),
  { remaining: 0, finished: true },
  'the final new extra word completes the batch',
);
assert.deepStrictEqual(
  advanceExtraPractice(4, false),
  { remaining: 4, finished: false },
  'review words do not consume the extra-new-word quota',
);

console.log('ALL EXTRA PRACTICE TESTS PASSED');
