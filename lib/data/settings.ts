import AsyncStorage from '@react-native-async-storage/async-storage';

const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

export const DAILY_GOAL_DEFAULT = 20;
export const DAILY_QUIZ_GOAL_DEFAULT = 20;
export const DAILY_PHRASE_GOAL_DEFAULT = 10;
export interface DailySettings {
  dailyNewWordGoal: number;
  dailyQuizGoal: number;
  dailyPhraseGoal: number;
  showDailyPlan: boolean;
  /** 目标完成词本日期（ISO yyyy-mm-dd），null 表示未设置 */
  targetFinishDate: string | null;
}

export const DEFAULT_DAILY_SETTINGS: DailySettings = {
  dailyNewWordGoal: DAILY_GOAL_DEFAULT,
  dailyQuizGoal: DAILY_QUIZ_GOAL_DEFAULT,
  dailyPhraseGoal: DAILY_PHRASE_GOAL_DEFAULT,
  showDailyPlan: true,
  targetFinishDate: null,
};

const legacyGoalKeyFor = (userId: string) => `wb_daily_goal_${userId}`;
const settingsKeyFor = (userId: string) => `wb_daily_settings_${userId}`;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
let store: Storage = AsyncStorage;

export function setStoreForTesting(s: Storage): void {
  store = s;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 校验 yyyy-mm-dd；null/空/非法值一律回退 null */
function normalizeTargetDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.slice(0, 10);
  return ISO_DATE_RE.test(v) ? v : null;
}

function normalizeSettings(value: Partial<DailySettings> | null | undefined): DailySettings {
  return {
    dailyNewWordGoal: positiveInt(value?.dailyNewWordGoal, DAILY_GOAL_DEFAULT),
    dailyQuizGoal: positiveInt(value?.dailyQuizGoal, DAILY_QUIZ_GOAL_DEFAULT),
    dailyPhraseGoal: positiveInt(value?.dailyPhraseGoal, DAILY_PHRASE_GOAL_DEFAULT),
    showDailyPlan: value?.showDailyPlan !== false,
    targetFinishDate: normalizeTargetDate(value?.targetFinishDate),
  };
}

export async function getDailySettings(userId: string): Promise<DailySettings> {
  if (USE_CLOUD) {
    const { fetchDailySettings } = await import('./httpRepo');
    return fetchDailySettings(userId);
  }
  const raw = await store.getItem(settingsKeyFor(userId));
  if (raw != null) {
    try {
      return normalizeSettings(JSON.parse(raw));
    } catch {
      // A malformed local value should never prevent the learning screen opening.
    }
  }
  const legacyGoal = await store.getItem(legacyGoalKeyFor(userId));
  return normalizeSettings({ dailyNewWordGoal: legacyGoal == null ? undefined : Number(legacyGoal) });
}

export async function setDailySettings(
  userId: string,
  update: Partial<DailySettings>,
): Promise<void> {
  if (USE_CLOUD) {
    const { updateDailySettings } = await import('./httpRepo');
    await updateDailySettings(userId, update);
    return;
  }
  const next = normalizeSettings({ ...(await getDailySettings(userId)), ...update });
  await store.setItem(settingsKeyFor(userId), JSON.stringify(next));
}

export async function getDailyNewWordGoal(userId: string): Promise<number> {
  return (await getDailySettings(userId)).dailyNewWordGoal;
}

export async function setDailyNewWordGoal(userId: string, n: number): Promise<void> {
  await setDailySettings(userId, { dailyNewWordGoal: n });
}
