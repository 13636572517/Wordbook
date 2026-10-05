// 首字母转练纯逻辑：字母分组、按字母过滤、已掌握判定与筛选。
// 「已掌握」口径与词本统计同源（MASTERED_REPETITIONS = repetitions >= 3），
// 不得使用教师端薄弱词接口的严格口径。
import type { UserWordProgress, Word } from './data/types';
import { MASTERED_REPETITIONS } from './data/stats';

/** 单词首字符大写后在 A-Z 内取该字母，否则归入 '#'。 */
export function letterOf(word: string): string {
  const ch = (word.charAt(0) || '').toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

/** 统计词表中每个字母（含 '#'）的单词数。 */
export function countWordsByLetter(words: Word[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of words) {
    const letter = letterOf(w.word);
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

/** 该字母下的单词，按字母序排列（浏览顺序）。 */
export function wordsStartingWith(words: Word[], letter: string): Word[] {
  return words
    .filter((w) => letterOf(w.word) === letter)
    .sort((a, b) => a.word.localeCompare(b.word));
}

/** 已掌握：repetitions >= MASTERED_REPETITIONS（与数据页「已掌握」统计同口径）。 */
export function isMastered(p: UserWordProgress | null): boolean {
  return p != null && p.repetitions >= MASTERED_REPETITIONS;
}

/** 从候选中筛出已掌握的 id（保持输入顺序）。 */
export function pickMasteredIds(
  pairs: { id: string; progress: UserWordProgress | null }[],
): string[] {
  return pairs.filter((pair) => isMastered(pair.progress)).map((pair) => pair.id);
}
