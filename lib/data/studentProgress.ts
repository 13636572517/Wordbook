// 学员学习进度聚合数据（与后端 /teacher/students/<id>/progress/ 返回同构）。
// 学员端无教师接口权限，由前端直接经 repo 组装同样结构，供共享 UI 复用。
import type { Repository } from './repo';
import type { Word } from './types';
import { startOfDayTs } from './types';
import { scanWeakLogs, getWeakReason, type WeakReason } from './weak';

const DAY = 24 * 60 * 60 * 1000;
const CHECKIN_DAYS = 30;
const MASTERED_REPS = 3;

export interface StudentProgressSummary {
  wordbook: { total: number; learned: number; mastered: number; learning: number; due: number };
  today: { new_words: number; review_words: number };
  checkin: { date: string; count: number; new_count: number }[];
  progress: {
    word_id: number;
    word: string;
    translation: string;
    repetitions: number;
    due: number;
    ef: number;
    correct: number;
    wrong: number;
  }[];
}

/** 薄弱词条目（教师端 TeacherWeakWord 同构，多数字段用于展示原因标签） */
export interface WeakWordEntry {
  word_id: number;
  word: string;
  translation: string;
  ef: number;
  correct: number;
  wrong: number;
  error_rate: number;
  repetitions: number;
  due: number;
  reason: WeakReason;
}

function isoDay(ts: number): string {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day}`;
}

function toNumId(id: string | number): number {
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 前端组装学员进度聚合数据（云端/本地通用，走 repo 抽象）。
 * 一次遍历词表+进度（云端有批量缓存），一次全量日志（打卡+薄弱判定共用）。
 */
export async function buildStudentProgressSummary(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now = Date.now(),
): Promise<StudentProgressSummary> {
  const [words, logs] = await Promise.all([
    repo.getWordsByWordbook(wordbookId),
    repo.listStudyLogs(userId, wordbookId, { sinceTs: now - CHECKIN_DAYS * DAY }),
  ]);

  // 词本概览 + 已学词进度列表
  let learned = 0;
  let mastered = 0;
  let due = 0;
  const progress: StudentProgressSummary['progress'] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (!p) continue;
    learned += 1;
    if (p.repetitions >= MASTERED_REPS) mastered += 1;
    else if (p.due <= now) due += 1;
    progress.push({
      word_id: toNumId(w.id),
      word: w.word,
      translation: w.translation ?? '',
      repetitions: p.repetitions,
      due: p.due,
      ef: Math.round(p.ef * 100) / 100,
      correct: p.correct,
      wrong: p.wrong,
    });
  }
  progress.sort((a, b) => a.word.localeCompare(b.word));

  // 今日统计（去重词数）
  const today0 = startOfDayTs(now);
  const newIds = new Set<string>();
  const reviewIds = new Set<string>();
  for (const l of logs) {
    if (l.ts < today0 || l.ts > now) continue;
    if (l.isNew) newIds.add(l.wordId);
    if (l.source === 'review') reviewIds.add(l.wordId);
  }

  // 近30天打卡（空日补0）
  const agg = new Map<string, { count: number; newCount: number }>();
  for (const l of logs) {
    if (l.ts > now) continue;
    const d = isoDay(l.ts);
    const e = agg.get(d) ?? { count: 0, newCount: 0 };
    e.count += 1;
    if (l.isNew) e.newCount += 1;
    agg.set(d, e);
  }
  const checkin: StudentProgressSummary['checkin'] = [];
  for (let i = CHECKIN_DAYS - 1; i >= 0; i--) {
    const d = isoDay(now - i * DAY);
    const e = agg.get(d);
    checkin.push({ date: d, count: e?.count ?? 0, new_count: e?.newCount ?? 0 });
  }

  return {
    wordbook: {
      total: words.length,
      learned,
      mastered,
      learning: learned - mastered - due,
      due,
    },
    today: { new_words: newIds.size, review_words: reviewIds.size },
    checkin,
    progress,
  };
}

/**
 * 前端组装薄弱词条目（4 维口径 + 原因，与教师端 weak-words 接口同构）。
 */
export async function buildWeakWordEntries(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now = Date.now(),
): Promise<WeakWordEntry[]> {
  const [words, logs] = await Promise.all([
    repo.getWordsByWordbook(wordbookId),
    repo.listStudyLogs(userId, wordbookId, {}),
  ]);
  const logStats = scanWeakLogs(logs, now);

  const result: WeakWordEntry[] = [];
  for (const w of words) {
    const p = await repo.getProgress(userId, wordbookId, w.id);
    if (!p) continue;
    const reason = getWeakReason(p, logStats.get(w.id), now);
    if (!reason) continue;
    const reviewed = p.correct + p.wrong;
    result.push({
      word_id: toNumId(w.id),
      word: w.word,
      translation: w.translation ?? '',
      ef: Math.round(p.ef * 100) / 100,
      correct: p.correct,
      wrong: p.wrong,
      error_rate: reviewed > 0 ? Math.round((p.wrong / reviewed) * 1000) / 1000 : 0,
      repetitions: p.repetitions,
      due: p.due,
      reason,
    });
  }
  return result;
}

/** 错题记录条目（与教师端 TeacherWrongLog 同构） */
export interface WrongLogEntry {
  word_id: number;
  word: string;
  translation: string;
  wrong_count: number;
  last_wrong_ts: number;
  sources: string;
}

/**
 * 前端组装错题清单（口径与后端 TeacherStudentWrongLogsView 一致）：
 * study_logs 中 grade<3（Again/Hard）的记录，按单词聚合错误次数与最近错误时间，
 * 按错误次数倒序。
 */
export async function buildWrongLogEntries(
  repo: Repository,
  userId: string,
  wordbookId: string,
  now = Date.now(),
): Promise<WrongLogEntry[]> {
  const [words, logs] = await Promise.all([
    repo.getWordsByWordbook(wordbookId),
    repo.listStudyLogs(userId, wordbookId, {}),
  ]);
  const wordById = new Map(words.map((w) => [w.id, w]));

  const agg = new Map<string, { count: number; lastTs: number; sources: Set<string> }>();
  for (const l of logs) {
    if (l.ts > now || l.grade >= 3) continue;
    let e = agg.get(l.wordId);
    if (!e) {
      e = { count: 0, lastTs: 0, sources: new Set() };
      agg.set(l.wordId, e);
    }
    e.count += 1;
    if (l.ts > e.lastTs) e.lastTs = l.ts;
    if (l.source) e.sources.add(l.source);
  }

  const result: WrongLogEntry[] = [];
  for (const [wordId, e] of agg) {
    const w = wordById.get(wordId);
    if (!w) continue;
    result.push({
      word_id: toNumId(wordId),
      word: w.word,
      translation: w.translation ?? '',
      wrong_count: e.count,
      last_wrong_ts: e.lastTs,
      sources: [...e.sources].sort().join(','),
    });
  }
  result.sort((a, b) => b.wrong_count - a.wrong_count || b.last_wrong_ts - a.last_wrong_ts);
  return result;
}

/** A-Z 全量词表（含未学词）：只取 id + word */
export async function buildAZWords(repo: Repository, wordbookId: string): Promise<{ id: string; word: string }[]> {
  const words: Word[] = await repo.getWordsByWordbook(wordbookId);
  return words.map((w) => ({ id: w.id, word: w.word }));
}
