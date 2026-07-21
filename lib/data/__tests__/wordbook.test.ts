import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';

const repo: Repository = memoryRepo;

(async () => {
  const sys = await repo.createWordbook({
    ownerId: null,
    name: '高中',
    level: 'high-school',
    type: 'system',
  });
  const cust = await repo.createWordbook({
    ownerId: 'u1',
    name: '我的',
    level: 'custom',
    type: 'custom',
  });
  assert.strictEqual((await repo.listWordbooks()).length, 2, 'two wordbooks created');

  // system wordbook cannot be deleted
  let sysRejected = false;
  try {
    await repo.deleteWordbook(sys.id);
  } catch {
    sysRejected = true;
  }
  assert.ok(sysRejected, 'deleting system wordbook should be rejected');
  assert.ok(await repo.getWordbook(sys.id), 'system wordbook still present');

  // custom wordbook can be deleted
  await repo.deleteWordbook(cust.id);
  assert.strictEqual(await repo.getWordbook(cust.id), null, 'custom wordbook deleted');

  console.log('ALL WORDBOOK TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
