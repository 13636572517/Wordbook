import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Repository, CreateWordbookInput } from './repo';
import type { ID, User, Wordbook, Word, UserWordProgress, WordbookWord } from './types';
import { genId } from './types';

// Storage keys — aligned with the server `learning` schema tables.
const K = {
  users: 'vocab_users',
  activeUser: 'vocab_active_user',
  wordbooks: 'vocab_wordbooks',
  words: 'vocab_words',
  membership: 'vocab_wordbook_words',
  progress: 'vocab_user_progress',
};

async function read<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return fallback;
  return JSON.parse(raw) as T;
}
async function write<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

class AsyncStorageRepo implements Repository {
  async listUsers(): Promise<User[]> {
    const users = await read<User[]>(K.users, []);
    return [...users].sort((a, b) => a.createdAt - b.createdAt);
  }
  async getUser(id: ID): Promise<User | null> {
    const users = await read<User[]>(K.users, []);
    return users.find((u) => u.id === id) ?? null;
  }
  async createUser(username: string): Promise<User> {
    const users = await read<User[]>(K.users, []);
    if (users.some((u) => u.username === username)) {
      throw new Error(`user already exists: ${username}`);
    }
    const u: User = { id: genId(), username, createdAt: Date.now() };
    users.push(u);
    await write(K.users, users);
    const active = await AsyncStorage.getItem(K.activeUser);
    if (!active) await AsyncStorage.setItem(K.activeUser, u.id);
    return u;
  }
  async setActiveUser(id: ID): Promise<void> {
    const users = await read<User[]>(K.users, []);
    if (!users.some((u) => u.id === id)) throw new Error(`unknown user: ${id}`);
    await AsyncStorage.setItem(K.activeUser, id);
  }
  async getActiveUser(): Promise<User | null> {
    const id = await AsyncStorage.getItem(K.activeUser);
    if (!id) return null;
    return this.getUser(id);
  }

  async listWordbooks(ownerId?: ID | null): Promise<Wordbook[]> {
    const all = await read<Wordbook[]>(K.wordbooks, []);
    if (ownerId === undefined) return all;
    return all.filter((w) => w.ownerId === ownerId);
  }
  async getWordbook(id: ID): Promise<Wordbook | null> {
    const all = await read<Wordbook[]>(K.wordbooks, []);
    return all.find((w) => w.id === id) ?? null;
  }
  async createWordbook(input: CreateWordbookInput): Promise<Wordbook> {
    const all = await read<Wordbook[]>(K.wordbooks, []);
    const wb: Wordbook = { ...input, id: genId(), createdAt: Date.now() };
    all.push(wb);
    await write(K.wordbooks, all);
    return wb;
  }
  async deleteWordbook(id: ID): Promise<void> {
    const all = await read<Wordbook[]>(K.wordbooks, []);
    await write(K.wordbooks, all.filter((w) => w.id !== id));
  }

  async listWords(): Promise<Word[]> {
    return read<Word[]>(K.words, []);
  }
  async getWord(id: ID): Promise<Word | null> {
    const all = await read<Word[]>(K.words, []);
    return all.find((w) => w.id === id) ?? null;
  }
  async upsertWord(word: Word): Promise<Word> {
    const all = await read<Word[]>(K.words, []);
    const idx = all.findIndex((w) => w.id === word.id);
    if (idx >= 0) all[idx] = word;
    else all.push(word);
    await write(K.words, all);
    return word;
  }
  async getWordsByWordbook(wordbookId: ID): Promise<Word[]> {
    const links = await read<WordbookWord[]>(K.membership, []);
    const ids = new Set(links.filter((l) => l.wordbookId === wordbookId).map((l) => l.wordId));
    const words = await read<Word[]>(K.words, []);
    return words.filter((w) => ids.has(w.id));
  }
  async addWordToWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    const links = await read<WordbookWord[]>(K.membership, []);
    if (!links.some((l) => l.wordbookId === wordbookId && l.wordId === wordId)) {
      links.push({ wordbookId, wordId });
      await write(K.membership, links);
    }
  }
  async removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    const links = await read<WordbookWord[]>(K.membership, []);
    await write(
      K.membership,
      links.filter((l) => !(l.wordbookId === wordbookId && l.wordId === wordId)),
    );
  }

  async getProgress(userId: ID, wordbookId: ID, wordId: ID): Promise<UserWordProgress | null> {
    const all = await read<UserWordProgress[]>(K.progress, []);
    return (
      all.find((p) => p.userId === userId && p.wordbookId === wordbookId && p.wordId === wordId) ?? null
    );
  }
  async setProgress(p: UserWordProgress): Promise<void> {
    const all = await read<UserWordProgress[]>(K.progress, []);
    const idx = all.findIndex(
      (x) => x.userId === p.userId && x.wordbookId === p.wordbookId && x.wordId === p.wordId,
    );
    if (idx >= 0) all[idx] = p;
    else all.push(p);
    await write(K.progress, all);
  }
}

export const asyncStorageRepo = new AsyncStorageRepo();
