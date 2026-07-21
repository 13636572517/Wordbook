// Active data-access implementation for the app runtime.
// Phase B: 云端模式用 httpRepo，本地开发用 asyncStorageRepo。
// 通过 USE_CLOUD 环境变量或运行时配置切换。
import { asyncStorageRepo } from './asyncStorageRepo';
import { httpRepo } from './httpRepo';

// 切换开关：部署时设为 true，本地开发保持 false
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

export const repo = USE_CLOUD ? httpRepo : asyncStorageRepo;

export * from './types';
export * from './repo';
export { memoryRepo } from './memoryRepo';
export { asyncStorageRepo } from './asyncStorageRepo';
export { httpRepo, login, isLoggedIn, clearToken, fetchDueWords, fetchStats, postStudyLogs, searchWords } from './httpRepo';
