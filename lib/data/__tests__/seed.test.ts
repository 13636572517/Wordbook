import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import { seedBuiltInWordbooks } from '../seedWordbooks';
import { SEED_WORDS } from '../../seedWords';

(async () => {
  await seedBuiltInWordbooks(memoryRepo);
  const books = await memoryRepo.listWordbooks();
  const levels = new Set(books.map((b) => b.level));
  assert.ok(levels.has('high-school'), 'has high-school book');
  assert.ok(levels.has('cet4'), 'has cet4 book');
  assert.ok(levels.has('cet6'), 'has cet6 book');

  const hs = books.find((b) => b.level === 'high-school')!;
  const hsWords = await memoryRepo.getWordsByWordbook(hs.id);
  assert.strictEqual(hsWords.length, SEED_WORDS.length, 'high-school book seeded with full list');
  assert.ok(hsWords.every((w) => w.id.startsWith('w_')), 'word ids use w_ prefix');

  const cet4 = books.find((b) => b.level === 'cet4')!;
  assert.strictEqual(
    (await memoryRepo.getWordsByWordbook(cet4.id)).length,
    0,
    'cet4 is an empty placeholder',
  );

  // idempotent re-seed
  await seedBuiltInWordbooks(memoryRepo);
  assert.strictEqual((await memoryRepo.listWordbooks()).length, 3, 're-seed does not duplicate books');
  assert.strictEqual(
    (await memoryRepo.getWordsByWordbook(hs.id)).length,
    SEED_WORDS.length,
    're-seed idempotent for words',
  );

  console.log('ALL SEED TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
