import assert from 'node:assert';
import {
  getDailyNewWordGoal,
  setDailyNewWordGoal,
  DAILY_GOAL_DEFAULT,
  setStoreForTesting,
} from '../settings';

// In-memory AsyncStorage stand-in so the test stays RN-free.
const mem = new Map<string, string>();
const mock = {
  getItem: async (k: string): Promise<string | null> => (mem.has(k) ? mem.get(k)! : null),
  setItem: async (k: string, v: string): Promise<void> => {
    mem.set(k, v);
  },
};

(async () => {
  setStoreForTesting(mock);

  // 默认 20
  assert.strictEqual(await getDailyNewWordGoal('u1'), DAILY_GOAL_DEFAULT, 'default goal is 20');

  // 设置后读回
  await setDailyNewWordGoal('u1', 15);
  assert.strictEqual(await getDailyNewWordGoal('u1'), 15, 'set then read back');

  // 按 user 隔离
  assert.strictEqual(await getDailyNewWordGoal('u2'), DAILY_GOAL_DEFAULT, 'other user keeps default');
  await setDailyNewWordGoal('u2', 5);
  assert.strictEqual(await getDailyNewWordGoal('u1'), 15, 'u1 unaffected by u2 change');
  assert.strictEqual(await getDailyNewWordGoal('u2'), 5, 'u2 reads its own goal');

  // 非法/缺失值回落默认
  mem.set('wb_daily_goal_u3', 'not-a-number');
  assert.strictEqual(await getDailyNewWordGoal('u3'), DAILY_GOAL_DEFAULT, 'non-numeric falls back to default');

  console.log('ALL SETTINGS TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
