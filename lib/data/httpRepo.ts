/**
 * HTTP Repository — Phase B 云端实现。
 *
 * 通过 HTTPS 调用 learning.yusuan.xyz/api/ 后端，
 * 登录走 GESP SSO（yusuan.xyz/api/auth/），JWT 存本地。
 *
 * 与 asyncStorageRepo 实现相同的 Repository 接口，
 * 业务/UI 代码无需改动。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreateWordbookInput, Repository, ListStudyLogsOpts } from './repo';
import type { ID, User, UserWordProgress, Word, Wordbook, WordDefinition, WordExample, WordPhrase, StudyLog } from './types';
import { DAILY_GOAL_DEFAULT } from './settings';

// --- 配置 ---
const API_BASE = __DEV__
  ? 'http://localhost:8000/api'
  : 'https://learning.yusuan.xyz/api';

const GESP_AUTH_BASE = __DEV__
  ? 'http://localhost:8002/api/auth'
  : 'https://yusuan.xyz/api/auth';

const TOKEN_KEY = 'vocab_jwt_token';
const USER_KEY = 'vocab_active_user';

// --- Token 管理 ---
async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

export async function isLoggedIn(): Promise<boolean> {
  const t = await getToken();
  return !!t;
}

/**
 * 通过 GESP 登录获取 JWT。
 * @returns user info or throws
 */
export async function login(username: string, password: string): Promise<User> {
  const res = await fetch(`${GESP_AUTH_BASE}/login/username/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.error || `登录失败 (${res.status})`);
  }
  const data = await res.json();
  const token = data.access || data.token;
  if (!token) throw new Error('响应中缺少 token');
  await setToken(token);

  // 解析 user_id from JWT payload
  const payload = JSON.parse(atob(token.split('.')[1]));
  const user: User = {
    id: String(payload.user_id || payload.id),
    username: payload.username || username,
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

// --- HTTP 工具 ---
async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    await clearToken();
    throw new Error('登录已过期，请重新登录');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.detail || `API 错误 (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- ID 转换（服务器用数字 ID，前端用字符串）---
const toStr = (id: any): ID => String(id);
const toNum = (id: ID): number => Number(id);

// --- 进度缓存（解决逐词 getProgress 的 N+1 请求问题）---
let progressCache: {
  wordbookId: ID;
  map: Map<string, any>;
  promise: Promise<Map<string, any>>;
} | null = null;

async function getProgressCache(wordbookId: ID): Promise<Map<string, any>> {
  if (progressCache && progressCache.wordbookId === wordbookId) {
    return progressCache.promise;
  }
  const promise = api<any[]>(`/progress/?wordbook_id=${toNum(wordbookId)}`).then(
    (data) => new Map(data.map((p) => [String(p.word_id), p])),
  );
  progressCache = { wordbookId, map: new Map(), promise };
  return promise;
}

function invalidateProgressCache(): void {
  progressCache = null;
}

// --- slim 词表 in-flight 去重（并发调用只发一次请求）---
const wordsInflight = new Map<number, Promise<any[]>>();

/** 清除某词本的 slim 词表缓存（添加/删除单词后调用，确保学习队列立即可见新词）。 */
export function invalidateWordbookWords(wordbookId: ID): void {
  wordsInflight.delete(toNum(wordbookId));
}

// --- 释义数据清洗（历史脏数据可能嵌套对象，直接渲染会 React #31 崩溃）---
function extractText(v: any): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const l = v.l;
    if (l && typeof l === 'object' && l.i != null) {
      if (typeof l.i === 'string') return l.i.trim();
      if (Array.isArray(l.i)) return l.i.filter((x: any) => typeof x === 'string').join('；');
    }
    for (const key of ['tr', 'headword', 'phr', 'translation']) {
      if (v[key]) {
        const t = extractText(v[key]);
        if (t) return t;
      }
    }
    if (Array.isArray(v.trs)) return v.trs.map(extractText).filter(Boolean).join('；');
  }
  return '';
}

function toStr2(v: any): string {
  return typeof v === 'string' ? v : extractText(v);
}

function sanitizeDefinitions(raw: any): WordDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WordDefinition[] = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const definition = toStr2(d.definition);
    if (!definition) continue;
    out.push({ pos: normalizePos(toStr2(d.pos)), definition });
  }
  return out.length > 0 ? out : undefined;
}

/** 归一化词性：Free Dictionary 全称 -> 缩写(小写无点)，有道已是缩写不变 */
function normalizePos(pos: string): string {
  if (!pos) return '释义';
  const lower = pos.toLowerCase().replace(/\.$/, '');
  const map: Record<string, string> = {
    noun: 'n', adjective: 'adj', verb: 'v', adverb: 'adv',
    preposition: 'prep', conjunction: 'conj', interjection: 'interj',
    pronoun: 'pron', abbreviation: 'abbr', article: 'art',
    determiner: 'det', numeral: 'num', auxiliary: 'aux',
    'auxiliary verb': 'aux', 'modal verb': 'aux',
    prefix: 'pref', suffix: 'suff', symbol: 'sym',
    'proper noun': 'n', 'phrasal verb': 'phr v',
    idiom: 'idiom', exclamation: 'interj',
  };
  if (map[lower]) return map[lower];
  if (/^[a-z]+$/.test(lower)) return lower;
  return lower;
}

function sanitizePhrases(raw: any): WordPhrase[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WordPhrase[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const phrase = toStr2(p.phrase);
    if (!phrase) continue;
    out.push({ phrase, meaning: toStr2(p.meaning) });
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeExamples(raw: any): WordExample[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WordExample[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const en = toStr2(e.en);
    if (!en) continue;
    const zh = toStr2(e.zh);
    out.push({ en, ...(zh ? { zh } : {}) });
  }
  return out.length > 0 ? out : undefined;
}

// --- Repository 实现 ---
export const httpRepo: Repository = {
  // ===== Users (SSO: 本地仅缓存，不做 CRUD) =====
  async listUsers(): Promise<User[]> {
    const u = await this.getActiveUser();
    return u ? [u] : [];
  },

  async getUser(id: ID): Promise<User | null> {
    const u = await this.getActiveUser();
    return u && u.id === id ? u : null;
  },

  async createUser(_username: string): Promise<User> {
    // SSO 模式下不本地创建用户
    throw new Error('SSO 模式：请通过登录创建会话');
  },

  async setActiveUser(id: ID): Promise<void> {
    // SSO 单用户，无需切换
  },

  async getActiveUser(): Promise<User | null> {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  // ===== Wordbooks =====
  async listWordbooks(_ownerId?: ID | null): Promise<Wordbook[]> {
    const data = await api<any[]>('/wordbooks/');
    return data.map((wb) => ({
      id: toStr(wb.id),
      ownerId: wb.owner_id != null ? toStr(wb.owner_id) : null,
      name: wb.name,
      level: wb.level || 'custom',
      type: wb.type,
      source: wb.source,
      createdAt: wb.created_at,
      wordCount: wb.word_count,
    }));
  },

  async getWordbook(id: ID): Promise<Wordbook | null> {
    const list = await this.listWordbooks();
    return list.find((wb) => wb.id === id) || null;
  },

  async createWordbook(input: CreateWordbookInput): Promise<Wordbook> {
    const data = await api<any>('/wordbooks/', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        level: input.level,
      }),
    });
    return {
      id: toStr(data.id),
      ownerId: data.owner_id != null ? toStr(data.owner_id) : null,
      name: data.name,
      level: data.level || 'custom',
      type: data.type,
      source: data.source,
      createdAt: data.created_at,
    };
  },

  async deleteWordbook(id: ID): Promise<void> {
    await api(`/wordbooks/${toNum(id)}/`, { method: 'DELETE' });
  },

  // ===== Words + Membership =====
  async listWords(): Promise<Word[]> {
    // 云端模式：按词本获取，全局 list 不常用
    return [];
  },

  async getWord(id: ID): Promise<Word | null> {
    try {
      const data = await api<any>(`/words/${toNum(id)}/`);
      return {
        id: toStr(data.id),
        word: data.word,
        translation: data.translation,
        pronunciation: data.pronunciation,
      };
    } catch {
      return null;
    }
  },

  async upsertWord(word: Word): Promise<Word> {
    // 云端单词由管理端导入，前端不直接 upsert
    return word;
  },

  async createWord(word: Word): Promise<Word> {
    // 云端手动添加单词：创建或获取（按 word 唯一），返回服务端记录（含数字 id）
    const data = await api<any>('/words/', {
      method: 'POST',
      body: JSON.stringify({
        word: word.word,
        translation: word.translation,
        pronunciation: word.pronunciation ?? word.phonetic ?? null,
        phonetic: word.pronunciation ?? word.phonetic ?? null,
        definitions: word.definitions ?? null,
        phrases: word.phrases ?? null,
        examples: word.examples ?? null,
      }),
    });
    return {
      id: toStr(data.id),
      word: data.word,
      translation: data.translation,
      pronunciation: data.pronunciation,
      phonetic: data.pronunciation ?? undefined,
      definitions: sanitizeDefinitions(data.definitions),
      phrases: sanitizePhrases(data.phrases),
      examples: sanitizeExamples(data.examples),
    };
  },

  async getWordsByWordbook(wordbookId: ID): Promise<Word[]> {
    // slim=1: 测验/列表流程不需要释义大字段，大幅减小响应体积
    const key = toNum(wordbookId);
    let promise = wordsInflight.get(key);
    if (!promise) {
      promise = api<any[]>(`/wordbooks/${key}/words/?slim=1`);
      wordsInflight.set(key, promise);
      promise.catch(() => {}).then(() => wordsInflight.delete(key));
    }
    const data = await promise;
    return data.map((item) => ({
      id: toStr(item.word_id),
      word: item.word_detail.word,
      translation: item.word_detail.translation,
      pronunciation: item.word_detail.pronunciation,
    }));
  },

  async addWordToWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    await api(`/wordbooks/${toNum(wordbookId)}/words/`, {
      method: 'POST',
      body: JSON.stringify({ word_id: toNum(wordId) }),
    });
    // 刚添加单词后，使 slim 词表缓存失效，确保学习队列能立即看到新词
    invalidateWordbookWords(wordbookId);
  },

  async removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    await api(`/wordbooks/${toNum(wordbookId)}/words/`, {
      method: 'DELETE',
      body: JSON.stringify({ word_id: toNum(wordId) }),
    });
  },

  // ===== Progress =====
  // 进度缓存：避免逐词查询的 N+1 请求爆炸（每词本只拉取一次）
  async getProgress(
    userId: ID,
    wordbookId: ID,
    wordId: ID,
  ): Promise<UserWordProgress | null> {
    const cache = await getProgressCache(wordbookId);
    const item = cache.get(wordId);
    if (!item) return null;
    return {
      userId,
      wordbookId,
      wordId,
      ef: item.ef,
      interval: item.interval,
      repetitions: item.repetitions,
      due: item.due,
      correct: item.correct,
      wrong: item.wrong,
    };
  },

  async setProgress(p: UserWordProgress): Promise<void> {
    invalidateProgressCache();
    await api('/progress/', {
      method: 'PUT',
      body: JSON.stringify({
        items: [{
          wordbook_id: toNum(p.wordbookId),
          word_id: toNum(p.wordId),
          ef: p.ef,
          interval: p.interval,
          repetitions: p.repetitions,
          due: p.due,
          correct: p.correct,
          wrong: p.wrong,
        }],
      }),
    });
  },

  // ===== Bulk helpers =====
  async bulkUpsertWords(_words: Word[]): Promise<void> {
    // 云端由管理命令导入，前端不需要
  },

  async bulkSetMembership(wordbookId: ID, wordIds: ID[]): Promise<void> {
    await api(`/wordbooks/${toNum(wordbookId)}/words/`, {
      method: 'POST',
      body: JSON.stringify({ word_ids: wordIds.map(toNum) }),
    });
  },

  // ===== Study logs (cloud mode) =====
  // 云端模式经 postStudyLogs() 上报；listStudyLogs 走 /study-logs/list/ 真实接口。
  async addStudyLog(_log: StudyLog): Promise<void> {
    // no-op: cloud path uses postStudyLogs()
  },
  async listStudyLogs(
    userId: ID,
    wordbookId?: ID,
    opts?: ListStudyLogsOpts,
  ): Promise<StudyLog[]> {
    const params = new URLSearchParams();
    if (wordbookId) params.set('wordbook_id', toNum(wordbookId).toString());
    if (opts?.sinceTs != null) params.set('since_ts', String(opts.sinceTs));
    if (opts?.source) params.set('source', opts.source);
    if (opts?.isNew != null) params.set('is_new', opts.isNew ? '1' : '0');
    const qs = params.toString();
    const data = await api<any[]>(`/study-logs/list/${qs ? '?' + qs : ''}`);
    return data.map((item: any) => ({
      userId: String(item.user_id),
      wordbookId: toStr(item.wordbook_id),
      wordId: toStr(item.word_id),
      grade: item.grade,
      ts: item.ts,
      source: item.source,
      isNew: !!item.is_new,
    }));
  },

  // 词本级统计（服务端聚合，一次请求替代客户端 N+1 计算）
  async getWordbookStats(userId: ID, wordbookId: ID, _now: number) {
    const data = await api<any>(`/wordbooks/${toNum(wordbookId)}/stats/`);
    return {
      total: Number(data.total),
      newCount: Number(data.newCount),
      due: Number(data.due),
      learning: Number(data.learning),
      mastered: Number(data.mastered),
      accuracy: Number(data.accuracy),
      streak: Number(data.streak),
    };
  },

  // 每日新词上限（云端）：走 /settings/ 接口，按 user 隔离。
  async getDailyNewWordGoal(userId: ID): Promise<number> {
    const data = await api<any>('/settings/');
    return Number(data.daily_new_word_goal) || DAILY_GOAL_DEFAULT;
  },
  async setDailyNewWordGoal(userId: ID, n: number): Promise<void> {
    await api('/settings/', {
      method: 'POST',
      body: JSON.stringify({ daily_new_word_goal: n }),
    });
  },
};

// --- 额外 API（非 Repository 接口， Phase B 增强）---

/** 获取单个单词完整数据（释义/词组/例句，学习卡片按需加载用） */
export async function fetchWordDetail(wordId: ID): Promise<Word> {
  const d = await api<any>(`/words/${toNum(wordId)}/`);
  return {
    id: toStr(d.id),
    word: d.word,
    translation: d.translation,
    pronunciation: d.pronunciation,
    phonetic: d.pronunciation ?? undefined,
    definitions: sanitizeDefinitions(d.definitions),
    phrases: sanitizePhrases(d.phrases),
    examples: sanitizeExamples(d.examples),
  };
}

/** 获取词本全部单词（含释义/词组/例句完整数据，词本详情页用） */
export async function fetchWordbookWordsFull(wordbookId: ID): Promise<Word[]> {
  const data = await api<any[]>(`/wordbooks/${toNum(wordbookId)}/words/`);
  return data.map((item) => ({
    id: toStr(item.word_id),
    word: item.word_detail.word,
    translation: item.word_detail.translation,
    pronunciation: item.word_detail.pronunciation,
    phonetic: item.word_detail.pronunciation ?? undefined,
    definitions: sanitizeDefinitions(item.word_detail.definitions),
    phrases: sanitizePhrases(item.word_detail.phrases),
    examples: sanitizeExamples(item.word_detail.examples),
  }));
}

/** 获取到期复习词 */
export async function fetchDueWords(
  wordbookId?: ID,
  limit = 50,
): Promise<UserWordProgress[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (wordbookId) params.set('wordbook_id', String(toNum(wordbookId)));
  const data = await api<any[]>(`/progress/due/?${params}`);
  return data.map((item) => ({
    userId: String(item.user_id),
    wordbookId: toStr(item.wordbook_id),
    wordId: toStr(item.word_id),
    ef: item.ef,
    interval: item.interval,
    repetitions: item.repetitions,
    due: item.due,
    correct: item.correct,
    wrong: item.wrong,
  }));
}

/** 获取学习统计 */
export async function fetchStats(wordbookId?: ID) {
  const params = wordbookId ? `?wordbook_id=${toNum(wordbookId)}` : '';
  return api<{
    total_words: number;
    total_reviews: number;
    accuracy: number;
    streak: number;
    today_count: number;
  }>(`/stats/${params}`);
}

/** 批量上报学习日志 */
export async function postStudyLogs(
  logs: { wordbookId: ID; wordId: ID; grade: number; ts: number; source?: string; isNew?: boolean }[],
): Promise<void> {
  await api('/study-logs/', {
    method: 'POST',
    body: JSON.stringify({
      logs: logs.map((l) => ({
        wordbook_id: toNum(l.wordbookId),
        word_id: toNum(l.wordId),
        grade: l.grade,
        ts: l.ts,
        source: l.source || 'study',
        is_new: !!l.isNew,
      })),
    }),
  });
}

/** 搜索单词 */
export async function searchWords(q: string): Promise<Word[]> {
  const data = await api<any[]>(`/words/search/?q=${encodeURIComponent(q)}`);
  return data.map((item) => ({
    id: toStr(item.id),
    word: item.word,
    translation: item.translation,
    pronunciation: item.pronunciation,
  }));
}

// --- 管理员 & 补全释义 API ---

export interface MeInfo {
  user_id: number;
  is_admin: boolean;
  is_teacher: boolean;
}

/** 获取当前用户信息（含管理员状态） */
export async function fetchMe(): Promise<MeInfo> {
  return api<MeInfo>('/me/');
}

export interface EnrichLogEntry {
  ts: number;
  word: string;
  status: 'ok' | 'skip' | 'fail' | 'info' | 'error';
  detail: string;
}

export interface EnrichProgress {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'done' | 'error' | 'interrupted';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  current_word?: string | null;
  error?: string | null;
  recent_log: EnrichLogEntry[];
}

/** 获取补全进度 */
export async function fetchEnrichProgress(): Promise<EnrichProgress> {
  return api<EnrichProgress>('/enrich/');
}

/** 启动补全任务 */
export async function startEnrich(): Promise<{ started: boolean; reason?: string }> {
  return api<{ started: boolean; reason?: string }>('/enrich/', { method: 'POST' });
}

/** 停止补全任务 */
export async function stopEnrich(): Promise<{ stopped: boolean; reason?: string }> {
  return api<{ stopped: boolean; reason?: string }>('/enrich/stop/', { method: 'POST' });
}

/** 获取近义词（例句选择题干扰项用） */
export async function fetchSimilarWords(word: string): Promise<string[]> {
  const data = await api<{ word: string; similar: string[] }>(`/words/similar/?word=${encodeURIComponent(word)}`);
  return data.similar || [];
}

// --- 教师/管理员 学员统计 API ---

export interface StudentInfo {
  user_id: number;
  nickname: string;
  phone: string;
  avatar: string;
  word_count: number;
  studied_days: number;
  recent_days: number;
  last_active: number;
}

export interface DailyProgress {
  date: string;
  total: number;
  new_count: number;
  correct_rate: number;
}

export interface TeacherWeakWord {
  word_id: number;
  word: string;
  translation: string;
  ef: number;
  correct: number;
  wrong: number;
  error_rate: number;
  repetitions: number;
  interval: number;
  due: number;
}

export interface TeacherWrongLog {
  word_id: number;
  word: string;
  translation: string;
  wrong_count: number;
  last_wrong_ts: number;
  sources: string;
}

export async function fetchStudents(q?: string): Promise<StudentInfo[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  return api<StudentInfo[]>(`/teacher/students/${params}`);
}

export async function fetchStudentDaily(
  userId: number,
  wordbookId?: number,
): Promise<DailyProgress[]> {
  const params = wordbookId ? `?wordbook_id=${wordbookId}` : '';
  return api<DailyProgress[]>(`/teacher/students/${userId}/daily/${params}`);
}

export async function fetchStudentWeakWords(
  userId: number,
  wordbookId?: number,
): Promise<TeacherWeakWord[]> {
  const params = wordbookId ? `?wordbook_id=${wordbookId}` : '';
  return api<TeacherWeakWord[]>(`/teacher/students/${userId}/weak-words/${params}`);
}

export async function fetchStudentWrongLogs(
  userId: number,
  wordbookId?: number,
  limit = 50,
  offset = 0,
): Promise<{ total: number; items: TeacherWrongLog[] }> {
  const parts = [`limit=${limit}`, `offset=${offset}`];
  if (wordbookId) parts.push(`wordbook_id=${wordbookId}`);
  return api<{ total: number; items: TeacherWrongLog[] }>(
    `/teacher/students/${userId}/wrong-logs/?${parts.join('&')}`,
  );
}
