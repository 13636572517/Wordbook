import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';
import type { Word, UserWordProgress } from '../types';

const repo: Repository = memoryRepo;

function mkWord(id: string, word = 'hello'): Word {
  return { id, word, translation: '你好', pronunciation: '/həˈloʊ/' };
}

(async () => {
  // --- users ---
  const u1 = await repo.createUser('alice');
  const u2 = await repo.createUser('bob');
  assert.strictEqual((await repo.listUsers()).length, 2, 'two users created');
  assert.strictEqual((await repo.getActiveUser())?.id, u1.id, 'first user is auto-active');
  await repo.setActiveUser(u2.id);
  assert.strictEqual((await repo.getActiveUser())?.id, u2.id, 'active user switched');
  let threw = false;
  try {
    await repo.setActiveUser('nope');
  } catch {
    threw = true;
  }
  assert.ok(threw, 'switching to unknown user throws');

  // --- wordbooks (system + custom, owner scoping) ---
  const sys = await repo.createWordbook({
    ownerId: null,
    name: '高中',
    level: 'high-school',
    type: 'system',
  });
  const cust = await repo.createWordbook({
    ownerId: u1.id,
    name: '我的本',
    level: 'custom',
    type: 'custom',
  });
  assert.strictEqual((await repo.listWordbooks()).length, 2, 'two wordbooks total');
  const mine = await repo.listWordbooks(u1.id);
  assert.strictEqual(mine.length, 1, 'owner sees only their custom book');
  assert.strictEqual(mine[0].id, cust.id);

  // --- words + one-word-many-books membership ---
  const w1 = mkWord('w1');
  const w2 = mkWord('w2', 'world');
  await repo.upsertWord(w1);
  await repo.upsertWord(w2);
  await repo.addWordToWordbook(sys.id, w1.id);
  await repo.addWordToWordbook(sys.id, w2.id);
  await repo.addWordToWordbook(cust.id, w1.id); // w1 belongs to BOTH
  assert.strictEqual((await repo.getWordsByWordbook(sys.id)).length, 2, 'system book has 2 words');
  assert.strictEqual((await repo.getWordsByWordbook(cust.id)).length, 1, 'custom book has 1 word');
  await repo.removeWordFromWordbook(cust.id, w1.id);
  assert.strictEqual((await repo.getWordsByWordbook(cust.id)).length, 0, 'removal empties custom book');
  assert.strictEqual(
    (await repo.getWordsByWordbook(sys.id)).length,
    2,
    'removal from one book does NOT affect the other',
  );
  assert.strictEqual((await repo.getWord(w1.id))?.word, 'hello', 'word still retrievable');

  // --- progress isolated by user x wordbook x word ---
  const p: UserWordProgress = {
    userId: u1.id,
    wordbookId: sys.id,
    wordId: w1.id,
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    due: 0,
    correct: 0,
    wrong: 0,
  };
  await repo.setProgress(p);
  assert.ok(await repo.getProgress(u1.id, sys.id, w1.id), 'progress stored');
  assert.strictEqual(
    await repo.getProgress(u2.id, sys.id, w1.id),
    null,
    'other user has no progress for same word',
  );

  console.log('ALL DAL REPO TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
