import type { Repository, CreateWordbookInput } from './repo';
import type { ID, User, Wordbook, Word, UserWordProgress } from './types';
import { genId } from './types';

const progressKey = (u: ID, wb: ID, w: ID) => `${u}|${wb}|${w}`;

/**
 * In-memory Repository for tests. No React Native / AsyncStorage dependency,
 * so it runs directly under `tsx` in Node.
 */
class MemoryRepo implements Repository {
  private users = new Map<ID, User>();
  private activeUserId: ID | null = null;
  private wordbooks = new Map<ID, Wordbook>();
  private words = new Map<ID, Word>();
  private membership = new Set<string>(); // `${wordbookId}:${wordId}`
  private progress = new Map<string, UserWordProgress>();

  async listUsers(): Promise<User[]> {
    return [...this.users.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  async getUser(id: ID): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
  async createUser(username: string): Promise<User> {
    if ([...this.users.values()].some((u) => u.username === username)) {
      throw new Error(`user already exists: ${username}`);
    }
    const u: User = { id: genId(), username, createdAt: Date.now() };
    this.users.set(u.id, u);
    if (this.activeUserId === null) this.activeUserId = u.id;
    return u;
  }
  async setActiveUser(id: ID): Promise<void> {
    if (!this.users.has(id)) throw new Error(`unknown user: ${id}`);
    this.activeUserId = id;
  }
  async getActiveUser(): Promise<User | null> {
    return this.activeUserId ? this.users.get(this.activeUserId) ?? null : null;
  }

  async listWordbooks(ownerId?: ID | null): Promise<Wordbook[]> {
    const all = [...this.wordbooks.values()];
    if (ownerId === undefined) return all;
    return all.filter((w) => w.ownerId === ownerId);
  }
  async getWordbook(id: ID): Promise<Wordbook | null> {
    return this.wordbooks.get(id) ?? null;
  }
  async createWordbook(input: CreateWordbookInput): Promise<Wordbook> {
    const wb: Wordbook = { ...input, id: genId(), createdAt: Date.now() };
    this.wordbooks.set(wb.id, wb);
    return wb;
  }
  async deleteWordbook(id: ID): Promise<void> {
    this.wordbooks.delete(id);
  }

  async listWords(): Promise<Word[]> {
    return [...this.words.values()];
  }
  async getWord(id: ID): Promise<Word | null> {
    return this.words.get(id) ?? null;
  }
  async upsertWord(word: Word): Promise<Word> {
    this.words.set(word.id, word);
    return word;
  }
  async getWordsByWordbook(wordbookId: ID): Promise<Word[]> {
    const ids = [...this.membership]
      .filter((k) => k.startsWith(`${wordbookId}:`))
      .map((k) => k.split(':')[1]);
    return ids.map((id) => this.words.get(id)!).filter(Boolean);
  }
  async addWordToWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    this.membership.add(`${wordbookId}:${wordId}`);
  }
  async removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    this.membership.delete(`${wordbookId}:${wordId}`);
  }

  async getProgress(userId: ID, wordbookId: ID, wordId: ID): Promise<UserWordProgress | null> {
    return this.progress.get(progressKey(userId, wordbookId, wordId)) ?? null;
  }
  async setProgress(p: UserWordProgress): Promise<void> {
    this.progress.set(progressKey(p.userId, p.wordbookId, p.wordId), p);
  }
}

export const memoryRepo = new MemoryRepo();
