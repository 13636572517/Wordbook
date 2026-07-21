import type { Word, StudyStats, StreakData } from './database';

export const SCHEMA_VERSION = 1;

export type ProgressSettings = { language: string };

export type ProgressSnapshot = {
  schemaVersion: number;
  exportedAt: string;
  words: Word[];
  streak: StreakData;
  stats: StudyStats;
  settings: ProgressSettings;
};

export class SyncError extends Error {}

// Build a serializable snapshot of the user's learning progress.
export function buildSnapshot(
  words: Word[],
  streak: StreakData,
  stats: StudyStats,
  settings: ProgressSettings
): ProgressSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    words,
    streak,
    stats,
    settings,
  };
}

export function serializeSnapshot(snapshot: ProgressSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// Parse + validate an imported snapshot. Throws SyncError on bad input.
export function parseSnapshot(json: string): ProgressSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new SyncError('文件不是合法的 JSON');
  }
  if (typeof data !== 'object' || data === null) {
    throw new SyncError('文件内容格式不正确');
  }
  const s = data as Partial<ProgressSnapshot>;
  if (typeof s.schemaVersion !== 'number') {
    throw new SyncError('缺少 schemaVersion，可能不是本应用的进度文件');
  }
  if (s.schemaVersion !== SCHEMA_VERSION) {
    throw new SyncError(
      `版本不兼容：文件为 v${s.schemaVersion}，本应用为 v${SCHEMA_VERSION}`
    );
  }
  if (!Array.isArray(s.words)) {
    throw new SyncError('缺少 words 数组');
  }
  return {
    schemaVersion: s.schemaVersion,
    exportedAt: typeof s.exportedAt === 'string' ? s.exportedAt : '',
    words: s.words as Word[],
    streak: (s.streak as StreakData) ?? { streak: 0, lastDate: '' },
    stats: (s.stats as StudyStats) ?? emptyStats(),
    settings: (s.settings as ProgressSettings) ?? { language: 'en' },
  };
}

// Merge imported words into existing ones, keyed by `word` text.
// Prefer the record with more reviews; tie-break by the more urgent (earlier) due date.
export function mergeWords(existing: Word[], imported: Word[]): Word[] {
  const byKey = new Map<string, Word>();
  for (const w of existing) byKey.set(w.word, w);
  for (const w of imported) {
    const prev = byKey.get(w.word);
    if (!prev || isBetter(w, prev)) byKey.set(w.word, w);
  }
  return Array.from(byKey.values());
}

function isBetter(a: Word, b: Word): boolean {
  if (a.times_reviewed !== b.times_reviewed) return a.times_reviewed > b.times_reviewed;
  return a.due < b.due; // earlier due = more urgent = preferred
}

function emptyStats(): StudyStats {
  return {
    total: 0,
    due: 0,
    newCount: 0,
    mastered: 0,
    correct: 0,
    wrong: 0,
    accuracy: 0,
  };
}
