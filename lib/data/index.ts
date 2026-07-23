// Active data-access implementation for the app runtime.
// Phase B: 云端模式用 httpRepo，本地开发用 asyncStorageRepo。
// 通过 USE_CLOUD 环境变量或运行时配置切换。
import { asyncStorageRepo } from './asyncStorageRepo';
import { httpRepo } from './httpRepo';

// 构建标识：每次部署改变此值可强制所有 chunk 哈希变化，避免客户端缓存新旧碎片。
// 通过 EXPO_PUBLIC_BUILD_ID 注入；缺失时为 dev。
export const BUILD_ID = process.env.EXPO_PUBLIC_BUILD_ID || 'dev';
// 历史版本：20260723v2（cfd021e3）已部署；本次 bump 到 v3 强制所有客户端刷新。

if (typeof window !== 'undefined') {
  (window as any).__APP_BUILD__ = BUILD_ID;
}

// 切换开关：部署时设为 true，本地开发保持 false
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

export const repo = USE_CLOUD ? httpRepo : asyncStorageRepo;

export { asyncStorageRepo } from './asyncStorageRepo';
export { clearToken, fetchDueWords, fetchSimilarWords, fetchStats, httpRepo, isLoggedIn, login, postStudyLogs, searchWords } from './httpRepo';
export { memoryRepo } from './memoryRepo';
export * from './repo';
export * from './types';

