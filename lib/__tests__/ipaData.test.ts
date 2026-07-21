import assert from 'node:assert';
import { SEED_WORDS } from '../seedWords';
import { ipaData, lookupIpa } from '../ipaData';

const MIN_COVERAGE = 0.95;

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name} -> ${(e as Error).message}`);
  }
}

check('ipaData is a non-empty object', () => {
  assert.ok(typeof ipaData === 'object' && ipaData !== null);
  assert.ok(Object.keys(ipaData).length > 0, 'ipaData should not be empty');
});

check(`coverage of seed words >= ${MIN_COVERAGE * 100}%`, () => {
  let hits = 0;
  for (const s of SEED_WORDS) if (lookupIpa(s.word)) hits++;
  const cov = hits / SEED_WORDS.length;
  const msg = `coverage ${(cov * 100).toFixed(1)}% < ${(MIN_COVERAGE * 100).toFixed(0)}%`;
  assert.ok(cov >= MIN_COVERAGE, msg);
});

check('sample common words have IPA with slashes', () => {
  for (const w of ['hello', 'world', 'apple', 'student', 'teacher']) {
    const ipa = lookupIpa(w);
    assert.ok(ipa, `${w} should have IPA`);
    assert.ok(ipa!.startsWith('/') && ipa!.endsWith('/'), `${w} IPA should be wrapped in slashes: ${ipa}`);
  }
});

check('lookupIpa missing word returns undefined (graceful)', () => {
  assert.strictEqual(lookupIpa('zzznotarealwordzzz'), undefined);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
} else {
  console.log(`\nAll ${passed} ipaData tests passed`);
}
