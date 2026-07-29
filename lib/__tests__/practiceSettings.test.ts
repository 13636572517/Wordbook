import assert from 'node:assert';
import { normalizePracticeGoal } from '../practiceSettings';

assert.strictEqual(normalizePracticeGoal(12), 10, 'legacy non-step goals round down to the nearest 10-word option');
assert.strictEqual(normalizePracticeGoal(27), 20, 'legacy values remain on a 10-word option');
assert.strictEqual(normalizePracticeGoal(0), 20, 'invalid goals use the default option');

console.log('ALL PRACTICE SETTINGS TESTS PASSED');
