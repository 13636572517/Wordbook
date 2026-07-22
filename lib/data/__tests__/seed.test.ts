import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import { seedBuiltInWordbooks } from '../seedWordbooks';
import { SEED_WORDS } from '../../seedWords';
import { SEED_WORDS_CET4 } from '../../seedWordsCet4';
import { SEED_WORDS_CET6 } from '../../seedWordsCet6';

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
  const cet4Words = await memoryRepo.getWordsByWordbook(cet4.id);
  assert.strictEqual(cet4Words.length, SEED_WORDS_CET4.length, 'cet4 book seeded with full list');
  assert.ok(cet4Words.every((w) => w.id.startsWith('cet4_')), 'cet4 word ids use cet4_ prefix');

  const cet6 = books.find((b) => b.level === 'cet6')!;
  const cet6Words = await memoryRepo.getWordsByWordbook(cet6.id);
  assert.strictEqual(cet6Words.length, SEED_WORDS_CET6.length, 'cet6 book seeded with full list');
  assert.ok(cet6Words.every((w) => w.id.startsWith('cet6_')), 'cet6 word ids use cet6_ prefix');

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
