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
import type { ID, User, Wordbook, Word, UserWordProgress } from './types';
import type { Repository, CreateWordbookInput } from './repo';

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
  const res = await fetch(`${GESP_AUTH_BASE}/login/`, {
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

  async getWordsByWordbook(wordbookId: ID): Promise<Word[]> {
    const data = await api<any[]>(`/wordbooks/${toNum(wordbookId)}/words/`);
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
  },

  async removeWordFromWordbook(wordbookId: ID, wordId: ID): Promise<void> {
    await api(`/wordbooks/${toNum(wordbookId)}/words/`, {
      method: 'DELETE',
      body: JSON.stringify({ word_id: toNum(wordId) }),
    });
  },

  // ===== Progress =====
  async getProgress(
    userId: ID,
    wordbookId: ID,
    wordId: ID,
  ): Promise<UserWordProgress | null> {
    const data = await api<any[]>(
      `/progress/?wordbook_id=${toNum(wordbookId)}`,
    );
    const item = data.find((p) => String(p.word_id) === wordId);
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
};

// --- 额外 API（非 Repository 接口，Phase B 增强）---

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
  logs: { wordbookId: ID; wordId: ID; grade: number; ts: number }[],
): Promise<void> {
  await api('/study-logs/', {
    method: 'POST',
    body: JSON.stringify({
      logs: logs.map((l) => ({
        wordbook_id: toNum(l.wordbookId),
        word_id: toNum(l.wordId),
        grade: l.grade,
        ts: l.ts,
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
