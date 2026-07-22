import type { Repository } from './data/repo';
import type { Word } from './data/types';
import { getWeakWordIds } from './data/weak';
import { getRecentWords, getStudiedWords } from './data/review-scope';

// 题目生成 + 范围选择（纯逻辑，可测）。三种题型对应设计文档 §3：
// 单词默写 / 单词选择题 / 词组默写。范围对应 §3 的 ①全部 ②薄弱词 ③最近N天 ④自选。

export interface DictationQuiz {
  type: 'dictation';
  word: Word;
  answer: string; // = word.word；大小写/首尾空格的容错比对由 UI 负责
}

export interface ChoiceQuiz {
  type: 'choice';
  word: Word;
  options: string[]; // 4 项：1 正确 + 3 干扰，已打乱
  answer: string; // = word.translation（正确项）
}

export interface PhraseQuiz {
  type: 'phrase';
  word: Word;
  meaning: string; // 词组释义（提示）
  answer: string; // = phrases[0].phrase
  hints: number[]; // 每个词的长度，供 UI 画下划线提示
}

function fisherYates<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 单词默写：看 translation 写 word。从给定词池随机取一词做题干，
 * answer = 该词的 word 文本。比对（忽略大小写/空格）交给 UI。
 */
export function genDictation(words: Word[]): DictationQuiz {
  if (words.length === 0) throw new Error('genDictation: empty word pool');
  const word = words[Math.floor(Math.random() * words.length)];
  return { type: 'dictation', word, answer: word.word };
}

/**
 * 单词选择题：看 word 四选一选 translation。1 个正确项（target.translation）
 * + 3 个干扰项（从 allWords 中排除 target 后随机取不同 translation，且不等于答案）。
 * 确保 4 项、无重复；当词池不足以凑满 3 个干扰时返回少于 4 项（调用方应保证词池充足）。
 */
export function genChoice(allWords: Word[], target: Word): ChoiceQuiz {
  const answer = target.translation;
  const distractorPool = Array.from(
    new Set(
      allWords
        .filter((w) => w.id !== target.id && w.translation !== answer)
        .map((w) => w.translation),
    ),
  );
  const distractors = fisherYates(distractorPool).slice(0, 3);
  const options = fisherYates([answer, ...distractors]);
  return { type: 'choice', word: target, options, answer };
}

/**
 * 词组默写：取 word.phrases 的第一个词组，看 meaning 写整组 phrase。
 * hints = phrase 按空格拆分后每个词的长度（如 "break the ice" -> [5,3,3]）。
 * word.phrases 为空或 null 时返回 null（UI 降级提示"该词无词组"）。
 */
export function genPhrase(word: Word): PhraseQuiz | null {
  const phrases = word.phrases;
  if (!phrases || phrases.length === 0) return null;
  const p = phrases[0];
  const hints = p.phrase.split(' ').map((s) => s.length);
  return { type: 'phrase', word, meaning: p.meaning, answer: p.phrase, hints };
}

export type RangeKind = 'all' | 'studied' | 'weak' | 'recent' | 'custom';

export interface PickRangeOpts {
  now: number; // 必填（recent 范围据此计算窗口）
  days?: number; // recent 范围窗口天数，默认 7
  wordIds?: string[]; // custom 范围：要抽出的词 id
}

/**
 * 按范围选取一组词（设计文档 §3 的范围）：
 *  - 'all'     : 词本全部词
 *  - 'studied' : 该词本中已学过的词（每日测试用，见 getStudiedWords）
 *  - 'weak'    : 复用 lib/data/weak.ts 的薄弱词判定，返回该词本薄弱词
 *  - 'recent'  : 调 getRecentWords（最近 N 天学过的词）
 *  - 'custom'  : 按 opts.wordIds 映射到 repo.getWord（跳过不存在的 id）
 */
export async function pickRange(
  repo: Repository,
  userId: string,
  wordbookId: string,
  range: RangeKind,
  opts: PickRangeOpts,
): Promise<Word[]> {
  switch (range) {
    case 'all':
      return repo.getWordsByWordbook(wordbookId);
    case 'studied':
      return getStudiedWords(repo, userId, wordbookId);
    case 'weak': {
      const ids = await getWeakWordIds(repo, userId, wordbookId);
      const idSet = new Set(ids);
      const all = await repo.getWordsByWordbook(wordbookId);
      return all.filter((w) => idSet.has(w.id));
    }
    case 'recent':
      return getRecentWords(repo, userId, wordbookId, opts.days ?? 7, opts.now);
    case 'custom': {
      const ids = opts.wordIds ?? [];
      const fetched = await Promise.all(ids.map((id) => repo.getWord(id)));
      return fetched.filter((w): w is Word => w != null);
    }
  }
}
