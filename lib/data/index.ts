// Active data-access implementation for the app runtime.
// Swap this to an HttpRepo when migrating to the server (Phase B).
import { asyncStorageRepo } from './asyncStorageRepo';

export const repo = asyncStorageRepo;

export * from './types';
export * from './repo';
export { memoryRepo } from './memoryRepo';
export { asyncStorageRepo } from './asyncStorageRepo';
