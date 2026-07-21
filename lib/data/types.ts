export type ID = string;

export type WordbookType = 'system' | 'custom';

export interface User {
  id: ID;
  username: string;
  createdAt: number;
}

export interface Wordbook {
  id: ID;
  ownerId: ID | null; // null for built-in system wordbooks
  name: string;
  level: string; // 'high-school' | 'cet4' | 'cet6' | 'custom'
  type: WordbookType;
  source?: string;
  createdAt: number;
}

export interface Word {
  id: ID;
  word: string;
  translation: string;
  pronunciation: string | null;
}

export interface WordbookWord {
  wordbookId: ID;
  wordId: ID;
}

export interface UserWordProgress {
  userId: ID;
  wordbookId: ID;
  wordId: ID;
  ef: number;
  interval: number;
  repetitions: number;
  due: number;
  correct: number;
  wrong: number;
}

export const DEFAULT_EF = 2.5;

// Local id generator. Aligned with the server's `user_id` / primary-key scheme
// (server uses BigInt/uuid; locally we generate stable random ids).
export function genId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
