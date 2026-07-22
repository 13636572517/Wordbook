import type { ID, User, Wordbook, Word, UserWordProgress, StudyLog, StudyLogSource } from './types';

export type CreateWordbookInput = Omit<Wordbook, 'id' | 'createdAt'>;

// Optional filters for `listStudyLogs`. All are AND-ed; omit a key to ignore.
export interface ListStudyLogsOpts {
  sinceTs?: number; // only logs with ts >= sinceTs
  source?: StudyLogSource; // only logs with this source
  isNew?: boolean; // only logs whose isNew flag matches
}

/**
 * Data Access Layer. Every read/write of the app goes through this interface.
 *
 * Two implementations exist:
 *  - asyncStorageRepo (App runtime, backed by AsyncStorage)
 *  - memoryRepo (tests, no RN dependency)
 *
 * When migrating to the server, a third HttpRepo can be added and swapped in
 * via `lib/data/index.ts` without touching business/UI code.
 */
export interface Repository {
  // users (local placeholder; server phase replaces auth with gesp SSO)
  listUsers(): Promise<User[]>;
  getUser(id: ID): Promise<User | null>;
  createUser(username: string): Promise<User>;
  setActiveUser(id: ID): Promise<void>;
  getActiveUser(): Promise<User | null>;

  // wordbooks
  listWordbooks(ownerId?: ID | null): Promise<Wordbook[]>;
  getWordbook(id: ID): Promise<Wordbook | null>;
  createWordbook(input: CreateWordbookInput): Promise<Wordbook>;
  deleteWordbook(id: ID): Promise<void>;

  // words + membership
  listWords(): Promise<Word[]>;
  getWord(id: ID): Promise<Word | null>;
  upsertWord(word: Word): Promise<Word>;
  /** 创建或获取单词（云端入库/本地 upsert），返回落库后的 Word（含服务端 id）。 */
  createWord(word: Word): Promise<Word>;
  getWordsByWordbook(wordbookId: ID): Promise<Word[]>;
  addWordToWordbook(wordbookId: ID, wordId: ID): Promise<void>;
  removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void>;

  // progress (user x wordbook x word)
  getProgress(userId: ID, wordbookId: ID, wordId: ID): Promise<UserWordProgress | null>;
  setProgress(p: UserWordProgress): Promise<void>;

  // study logs (user x wordbook; local-first, feeds today-stats & new-word cap)
  addStudyLog(log: StudyLog): Promise<void>;
  listStudyLogs(userId: ID, wordbookId?: ID, opts?: ListStudyLogsOpts): Promise<StudyLog[]>;

  // 每日新词上限（每用户全局；云端走 UserSettings 表）
  getDailyNewWordGoal(userId: ID): Promise<number>;
  setDailyNewWordGoal(userId: ID, n: number): Promise<void>;

  // seed helpers (bulk writes for initial import performance)
  bulkUpsertWords(words: Word[]): Promise<void>;
  bulkSetMembership(wordbookId: ID, wordIds: ID[]): Promise<void>;
}
