import AsyncStorage from '@react-native-async-storage/async-storage';

// 每日新词上限（每用户全局）。本地优先：用 AsyncStorage 按 user 隔离存储，
// 云端同步（UserSettings 表）留待后续 migrate，先于业务/UI 实现。
export const DAILY_GOAL_DEFAULT = 20;
const keyFor = (userId: string) => `wb_daily_goal_${userId}`;

// 可注入存储（测试用）。默认使用真实 AsyncStorage。仅取 getItem/setItem 两个
// 方法，便于在 Node 下用内存实现替换，保持测试 RN-free。
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
let store: Storage = AsyncStorage;

/** 仅用于测试：替换底层存储实现。 */
export function setStoreForTesting(s: Storage): void {
  store = s;
}

export async function getDailyNewWordGoal(userId: string): Promise<number> {
  const raw = await store.getItem(keyFor(userId));
  if (raw == null) return DAILY_GOAL_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DAILY_GOAL_DEFAULT;
}

export async function setDailyNewWordGoal(userId: string, n: number): Promise<void> {
  await store.setItem(keyFor(userId), String(n));
}
