import type { ID, User, Wordbook, Word, UserWordProgress } from './types';

export type CreateWordbookInput = Omit<Wordbook, 'id' | 'createdAt'>;

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
  getWordsByWordbook(wordbookId: ID): Promise<Word[]>;
  addWordToWordbook(wordbookId: ID, wordId: ID): Promise<void>;
  removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void>;

  // progress (user x wordbook x word)
  getProgress(userId: ID, wordbookId: ID, wordId: ID): Promise<UserWordProgress | null>;
  setProgress(p: UserWordProgress): Promise<void>;
}
