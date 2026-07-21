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
  wordCount?: number; // 服务器端返回，避免前端拉全量单词计数
}

export interface WordExample {
  en: string;
  zh?: string;
}

export interface WordPhrase {
  phrase: string;
  meaning: string;
}

export interface WordDefinition {
  pos: string; // part of speech: 'noun', 'verb', 'adjective', etc.
  definition: string;
  example?: string;
}

export interface Word {
  id: ID;
  word: string;
  translation: string;
  pronunciation: string | null;
  // Enriched fields (auto-fetched from dictionary API)
  phonetic?: string; // IPA phonetic transcription
  definitions?: WordDefinition[]; // detailed definitions by part of speech
  phrases?: WordPhrase[]; // common phrases/collocations
  examples?: WordExample[]; // example sentences
  audioUrl?: string; // pronunciation audio URL
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
  lastReviewTs?: number; // last review timestamp, for streak (local phase; server adds study_logs)
}

export const DEFAULT_EF = 2.5;

// Local id generator. Aligned with the server's `user_id` / primary-key scheme
// (server uses BigInt/uuid; locally we generate stable random ids).
export function genId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
