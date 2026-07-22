import assert from 'node:assert';
import { sm2, type Grade } from '../sm2';

const NOW = 1_000_000;
const DAY = 86400000;

// Again fails: reset repetitions/interval, due immediately, ef lowered
let r = sm2({ ef: 2.5, interval: 10, repetitions: 3 }, 0 as Grade, NOW);
assert.strictEqual(r.repetitions, 0);
assert.strictEqual(r.interval, 0);
assert.strictEqual(r.due, NOW);
assert.ok(r.ef >= 1.3 && r.ef < 2.5, 'Again lowers ef');

// first Good -> interval 1, repetitions 1
r = sm2({ ef: 2.5, interval: 0, repetitions: 0 }, 2 as Grade, NOW);
assert.strictEqual(r.repetitions, 1);
assert.strictEqual(r.interval, 1);

// first Easy -> interval 4, repetitions 1
r = sm2({ ef: 2.5, interval: 0, repetitions: 0 }, 3 as Grade, NOW);
assert.strictEqual(r.repetitions, 1);
assert.strictEqual(r.interval, 4);

// second Good (repetitions was 1) -> interval 6
r = sm2({ ef: 2.5, interval: 1, repetitions: 1 }, 2 as Grade, NOW);
assert.strictEqual(r.repetitions, 2);
assert.strictEqual(r.interval, 6);

// due is now + interval days
r = sm2({ ef: 2.5, interval: 0, repetitions: 0 }, 3 as Grade, NOW);
assert.strictEqual(r.due, NOW + 4 * DAY);

console.log('ALL SM2 TESTS PASSED');
