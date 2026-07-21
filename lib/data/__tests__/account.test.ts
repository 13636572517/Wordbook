import assert from 'node:assert';
import { memoryRepo } from '../memoryRepo';
import type { Repository } from '../repo';

const repo: Repository = memoryRepo;

(async () => {
  await repo.createUser('alice');

  // duplicate username is rejected
  let dup = false;
  try {
    await repo.createUser('alice');
  } catch {
    dup = true;
  }
  assert.ok(dup, 'duplicate username should be rejected');

  await repo.createUser('bob');
  assert.strictEqual((await repo.listUsers()).length, 2, 'two distinct users');

  // switching to an unknown user is rejected
  let unknown = false;
  try {
    await repo.setActiveUser('nope');
  } catch {
    unknown = true;
  }
  assert.ok(unknown, 'switching to unknown user should be rejected');

  console.log('ALL ACCOUNT TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
