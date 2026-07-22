import type { Repository, CreateWordbookInput, ListStudyLogsOpts } from './repo';
import type { ID, User, Wordbook, Word, UserWordProgress, StudyLog } from './types';
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
  private membership = new Map<ID, Set<ID>>(); // wordbookId -> Set<wordId>
  private progress = new Map<string, UserWordProgress>();
  private studyLogs: StudyLog[] = [];

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
    const wb = this.wordbooks.get(id);
    if (wb && wb.type === 'system') throw new Error(`cannot delete system wordbook: ${id}`);
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
    const set = this.membership.get(wordbookId);
    if (!set) return [];
    return [...set].map((id) => this.words.get(id)!).filter(Boolean);
  }
  async addWordToWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    if (!this.membership.has(wordbookId)) this.membership.set(wordbookId, new Set());
    this.membership.get(wordbookId)!.add(wordId);
  }
  async removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    this.membership.get(wordbookId)?.delete(wordId);
  }

  async getProgress(userId: ID, wordbookId: ID, wordId: ID): Promise<UserWordProgress | null> {
    return this.progress.get(progressKey(userId, wordbookId, wordId)) ?? null;
  }
  async setProgress(p: UserWordProgress): Promise<void> {
    this.progress.set(progressKey(p.userId, p.wordbookId, p.wordId), p);
  }

  async addStudyLog(log: StudyLog): Promise<void> {
    this.studyLogs.push({
      source: 'study',
      isNew: false,
      ...log,
    });
  }
  async listStudyLogs(userId: ID, wordbookId?: ID, opts?: ListStudyLogsOpts): Promise<StudyLog[]> {
    return this.studyLogs.filter((l) => {
      if (l.userId !== userId) return false;
      if (wordbookId !== undefined && l.wordbookId !== wordbookId) return false;
      if (opts?.sinceTs !== undefined && l.ts < opts.sinceTs) return false;
      if (opts?.source !== undefined && (l.source ?? 'study') !== opts.source) return false;
      if (opts?.isNew !== undefined && (l.isNew === true) !== opts.isNew) return false;
      return true;
    });
  }

  // 每日新词上限（测试用内存实现）
  private dailyGoals = new Map<ID, number>();
  async getDailyNewWordGoal(userId: ID): Promise<number> {
    return this.dailyGoals.get(userId) ?? 20;
  }
  async setDailyNewWordGoal(userId: ID, n: number): Promise<void> {
    this.dailyGoals.set(userId, n);
  }

  // seed helpers (bulk writes for initial import performance)
  async bulkUpsertWords(words: Word[]): Promise<void> {
    for (const w of words) this.words.set(w.id, w);
  }
  async bulkSetMembership(wordbookId: ID, wordIds: ID[]): Promise<void> {
    this.membership.set(wordbookId, new Set(wordIds));
  }
}

export const memoryRepo = new MemoryRepo();
