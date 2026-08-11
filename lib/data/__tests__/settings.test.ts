import assert from 'node:assert';
import {
  DAILY_QUIZ_GOAL_DEFAULT,
  DEFAULT_DAILY_SETTINGS,
  getDailySettings,
  getDailyNewWordGoal,
  setDailySettings,
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

  // 新增每日设置有稳定默认值，并按用户隔离保存
  assert.deepStrictEqual(
    await getDailySettings('u4'),
    DEFAULT_DAILY_SETTINGS,
    'daily settings default to documented values',
  );
  assert.strictEqual(DAILY_QUIZ_GOAL_DEFAULT, 20, 'quiz default is 20');
  await setDailySettings('u4', { dailyQuizGoal: 12, showDailyPlan: false });
  assert.deepStrictEqual(
    await getDailySettings('u4'),
    { dailyNewWordGoal: 20, dailyQuizGoal: 12, dailyPhraseGoal: 10, showDailyPlan: false, targetFinishDate: null },
    'partial daily settings update preserves the new-word goal',
  );

  // targetFinishDate：设置/读回/清空/非法值回退 null
  await setDailySettings('u5', { targetFinishDate: '2026-09-01' });
  assert.strictEqual((await getDailySettings('u5')).targetFinishDate, '2026-09-01', 'target date set & read back');
  await setDailySettings('u5', { targetFinishDate: null });
  assert.strictEqual((await getDailySettings('u5')).targetFinishDate, null, 'target date cleared');
  await setDailySettings('u5', { targetFinishDate: 'not-a-date' as unknown as null });
  assert.strictEqual((await getDailySettings('u5')).targetFinishDate, null, 'invalid target date falls back to null');

  // 非法/缺失值回落默认
  mem.set('wb_daily_goal_u3', 'not-a-number');
  assert.strictEqual(await getDailyNewWordGoal('u3'), DAILY_GOAL_DEFAULT, 'non-numeric falls back to default');

  console.log('ALL SETTINGS TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
