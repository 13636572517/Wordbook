/**
 * TB7: 旧数据迁移（本地 AsyncStorage → 服务器 learning 库）
 *
 * 幂等设计：按 (user_id, word_text) 匹配服务器 word_id，upsert 进度。
 * 在前端设置页提供"迁移旧进度"按钮调用此模块。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserWordProgress, Word } from './types';

const API_BASE = __DEV__
  ? 'http://localhost:8000/api'
  : 'https://learning.yusuan.xyz/api';

const TOKEN_KEY = 'vocab_jwt_token';
const MIGRATED_KEY = 'vocab_migration_done';

export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: string[];
}

/**
 * 检查是否已完成迁移。
 */
export async function isMigrationDone(): Promise<boolean> {
  const v = await AsyncStorage.getItem(MIGRATED_KEY);
  return v === 'true';
}

/**
 * 执行迁移：读取本地进度 → 匹配服务器单词 → 上传进度。
 * 幂等：重复调用不会重复写入（服务器端 update_or_create）。
 */
export async function migrateLocalProgress(
  targetWordbookId: number,
): Promise<MigrationResult> {
  const result: MigrationResult = { total: 0, migrated: 0, skipped: 0, errors: [] };

  // 1. 读取本地数据
  const progressRaw = await AsyncStorage.getItem('vocab_user_progress');
  const wordsRaw = await AsyncStorage.getItem('vocab_words');

  if (!progressRaw) {
    result.errors.push('本地无进度数据');
    return result;
  }

  const localProgress: UserWordProgress[] = JSON.parse(progressRaw);
  const localWords: Word[] = wordsRaw ? JSON.parse(wordsRaw) : [];

  // 建立 localWordId -> word text 映射
  const wordTextMap = new Map<string, string>();
  for (const w of localWords) {
    wordTextMap.set(w.id, w.word);
  }

  result.total = localProgress.length;
  if (localProgress.length === 0) return result;

  // 2. 获取服务器词本中的单词列表（word_text -> server_word_id）
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) {
    result.errors.push('未登录，无法迁移');
    return result;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 获取服务器词本单词
  const wordsRes = await fetch(`${API_BASE}/wordbooks/${targetWordbookId}/words/`, { headers });
  if (!wordsRes.ok) {
    result.errors.push(`获取服务器词本失败 (${wordsRes.status})`);
    return result;
  }
  const serverWords: any[] = await wordsRes.json();
  const serverWordMap = new Map<string, number>(); // word_text -> server_word_id
  for (const sw of serverWords) {
    if (sw.word_detail) {
      serverWordMap.set(sw.word_detail.word.toLowerCase(), sw.word_id);
    }
  }

  // 3. 匹配并构建上传数据
  const items: any[] = [];
  for (const p of localProgress) {
    const wordText = wordTextMap.get(p.wordId);
    if (!wordText) {
      result.skipped++;
      continue;
    }
    const serverWordId = serverWordMap.get(wordText.toLowerCase());
    if (!serverWordId) {
      result.skipped++;
      continue;
    }
    items.push({
      wordbook_id: targetWordbookId,
      word_id: serverWordId,
      ef: p.ef,
      interval: p.interval,
      repetitions: p.repetitions,
      due: p.due,
      correct: p.correct,
      wrong: p.wrong,
    });
  }

  // 4. 批量上传（每批 200 条）
  const BATCH_SIZE = 200;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${API_BASE}/progress/`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ items: batch }),
      });
      if (!res.ok) {
        result.errors.push(`批次 ${Math.floor(i / BATCH_SIZE) + 1} 上传失败 (${res.status})`);
      } else {
        result.migrated += batch.length;
      }
    } catch (e: any) {
      result.errors.push(`网络错误: ${e.message}`);
    }
  }

  // 5. 标记迁移完成
  if (result.errors.length === 0) {
    await AsyncStorage.setItem(MIGRATED_KEY, 'true');
  }

  return result;
}
