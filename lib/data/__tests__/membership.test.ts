import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word } from '../types';

const repo: Repository = memoryRepo;

function w(id: string, word: string): Word {
  return { id, word, translation: 'x', pronunciation: null };
}

(async () => {
  const a = await repo.createWordbook({ ownerId: null, name: 'A', level: 'lvlA', type: 'system' });
  const b = await repo.createWordbook({ ownerId: null, name: 'B', level: 'lvlB', type: 'system' });
  const w1 = w('w1', 'apple');
  const w2 = w('w2', 'banana');
  await repo.upsertWord(w1);
  await repo.upsertWord(w2);

  // one word belongs to BOTH books
  await repo.addWordToWordbook(a.id, w1.id);
  await repo.addWordToWordbook(b.id, w1.id);
  assert.strictEqual((await repo.getWordsByWordbook(a.id)).length, 1, 'A has w1');
  assert.strictEqual((await repo.getWordsByWordbook(b.id)).length, 1, 'B has w1');

  // adding the same membership again is idempotent
  await repo.addWordToWordbook(a.id, w1.id);
  assert.strictEqual((await repo.getWordsByWordbook(a.id)).length, 1, 'duplicate add is idempotent');

  // a second word lives only in A
  await repo.addWordToWordbook(a.id, w2.id);
  assert.strictEqual((await repo.getWordsByWordbook(a.id)).length, 2, 'A has w1 + w2');

  // removing from B must NOT affect A
  await repo.removeWordFromWordbook(b.id, w1.id);
  assert.strictEqual((await repo.getWordsByWordbook(b.id)).length, 0, 'B emptied');
  assert.strictEqual((await repo.getWordsByWordbook(a.id)).length, 2, 'A unaffected by B removal');

  // removing from A clears it without touching B (already empty)
  await repo.removeWordFromWordbook(a.id, w1.id);
  await repo.removeWordFromWordbook(a.id, w2.id);
  assert.strictEqual((await repo.getWordsByWordbook(a.id)).length, 0, 'A cleared');

  console.log('ALL MEMBERSHIP TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
