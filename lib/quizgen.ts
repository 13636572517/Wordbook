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

export interface PhraseBlankQuiz {
  type: 'phrase-blank';
  word: Word;
  phrase: string; // 完整词组（答案展示用）
  blanked: string; // 带空格的词组 "break the ___"
  meaning: string; // 词组释义
  answer: string; // 缺失的单词 "ice"
  hintLength: number; // 答案字母数
}

export interface SentenceChoiceQuiz {
  type: 'sentence-choice';
  word: Word;
  sentence: string; // 带空格的例句 "A lion is a dangerous ______."
  sentenceZh?: string; // 例句中文翻译（提示）
  options: string[]; // 4 选项
  answer: string; // 正确单词
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

/**
 * 词组填空：在词组语境中填写目标词（逐字母输入）。
 * 找包含 word.word 的词组，将目标词替换为 ___。
 * 找不到则返回 null。
 */
export function genPhraseBlank(word: Word): PhraseBlankQuiz | null {
  const phrases = word.phrases;
  if (!phrases || phrases.length === 0) return null;
  const target = word.word.toLowerCase();
  for (const p of phrases) {
    const phraseLower = p.phrase.toLowerCase();
    // 用单词边界匹配（避免 "ice" 匹配到 "notice" 中的子串）
    const regex = new RegExp(`\\b${escapeRegex(target)}\\b`, 'i');
    if (regex.test(phraseLower)) {
      // 用与答案等长的下划线替换，让用户直观看到需要填多少字母
      const blanked = p.phrase.replace(regex, '_'.repeat(target.length));
      return {
        type: 'phrase-blank',
        word,
        phrase: p.phrase,
        blanked,
        meaning: p.meaning,
        answer: word.word,
        hintLength: word.word.length,
      };
    }
  }
  return null;
}

/**
 * 例句选择：在例句语境中四选一选出正确单词。
 * 遍历 word.examples 中所有包含目标词（或其变形）的例句，每句生成一道题。
 * 干扰项从词本内其他单词中随机取 3 个。
 */
export function genSentenceChoiceAll(word: Word, distractorPool: string[]): SentenceChoiceQuiz[] {
  const examples = word.examples;
  if (!examples || examples.length === 0) return [];
  const target = word.word.toLowerCase();
  const forms = buildWordForms(target);
  const formsSet = new Set(forms);
  const formsPattern = forms.map(escapeRegex).join('|');
  const regex = new RegExp(`\\b(${formsPattern})\\b`, 'i');

  // 预过滤干扰项池（排除目标词及其变形）
  const validDistractors = distractorPool.filter(
    (s) => !formsSet.has(s.toLowerCase()),
  );
  if (validDistractors.length < 3) return [];

  const results: SentenceChoiceQuiz[] = [];
  for (const ex of examples) {
    const en = ex.en;
    const match = en.match(regex);
    if (!match) continue;
    const matchedWord = match[1];
    const sentence = en.replace(regex, '______');
    const distractors = fisherYates(validDistractors).slice(0, 3);
    const options = fisherYates([matchedWord, ...distractors]);
    results.push({
      type: 'sentence-choice',
      word,
      sentence,
      sentenceZh: ex.zh,
      options,
      answer: matchedWord,
    });
  }
  return results;
}

/** @deprecated 使用 genSentenceChoiceAll 代替 */
export function genSentenceChoice(word: Word, similarWords: string[]): SentenceChoiceQuiz | null {
  const results = genSentenceChoiceAll(word, similarWords);
  return results.length > 0 ? results[0] : null;
}

/** 构建单词变形列表（用于例句匹配） */
function buildWordForms(base: string): string[] {
  const forms = new Set<string>([base]);
  const suffixes = ['s', 'es', 'ing', 'ed', 'ly', 'er', 'est'];
  for (const s of suffixes) {
    forms.add(base + s);
    if (base.endsWith('e')) forms.add(base.slice(0, -1) + s); // make -> making
    if (base.endsWith('y')) forms.add(base.slice(0, -1) + 'i' + s); // happy -> happily
  }
  // 双写辅音: run -> running
  if (base.length >= 3 && !'aeiouwxy'.includes(base[base.length - 1]) && 'aeiou'.includes(base[base.length - 2]) && !'aeiou'.includes(base[base.length - 3])) {
    forms.add(base + base[base.length - 1] + 'ing');
    forms.add(base + base[base.length - 1] + 'ed');
  }
  return [...forms];
}

/** 转义正则特殊字符 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
