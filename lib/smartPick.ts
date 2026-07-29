import type { Word } from './data/types';

export type SmartQuestionType = 'dictation' | 'choice' | 'sentence-choice' | 'phrase-blank';

export interface SmartQuestionPlan {
  wordId: string;
  type: SmartQuestionType;
}

export interface SmartPracticeInput {
  words: Word[];
  todayNewWordIds: string[];
  todayQuizWordIds: string[];
  dueWordIds: string[];
  weakWordIds: string[];
  goal: number;
}

const QUESTION_ORDER: SmartQuestionType[] = [
  'dictation',
  'choice',
  'sentence-choice',
  'phrase-blank',
];
const RARE_FIRST_ORDER: SmartQuestionType[] = [
  'sentence-choice',
  'phrase-blank',
  'dictation',
  'choice',
];

function uniqueExisting(words: Word[], groups: string[][]): Word[] {
  const byId = new Map(words.map((word) => [word.id, word]));
  const seen = new Set<string>();
  const result: Word[] = [];
  for (const id of groups.flat()) {
    const word = byId.get(id);
    if (word && !seen.has(id)) {
      seen.add(id);
      result.push(word);
    }
  }
  for (const word of words) {
    if (!seen.has(word.id)) result.push(word);
  }
  return result;
}

/**
 * Select a bounded, non-repeating set of words for the smart scope. Question
 * type remains the caller's choice, so the same scope works for every card.
 */
export function selectSmartPracticeWordIds(input: SmartPracticeInput): string[] {
  const todayQuiz = new Set(input.todayQuizWordIds);
  return uniqueExisting(input.words, [
    input.todayNewWordIds.filter((id) => !todayQuiz.has(id)),
    input.dueWordIds,
    input.weakWordIds,
  ])
    .slice(0, Math.max(0, Math.floor(input.goal)))
    .map((word) => word.id);
}

function typesFor(word: Word): SmartQuestionType[] {
  const types: SmartQuestionType[] = ['dictation', 'choice'];
  if (word.examples?.some((example) => example.en.toLowerCase().includes(word.word.toLowerCase()))) {
    types.push('sentence-choice');
  }
  if (word.phrases?.some((phrase) => new RegExp(`\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(phrase.phrase))) {
    types.push('phrase-blank');
  }
  return types;
}

function quotas(goal: number): Record<SmartQuestionType, number> {
  const count = Math.max(0, Math.floor(goal));
  const result: Record<SmartQuestionType, number> = {
    dictation: Math.floor(count * 0.3),
    choice: Math.floor(count * 0.3),
    'sentence-choice': Math.floor(count * 0.2),
    'phrase-blank': Math.floor(count * 0.2),
  };
  let assigned = QUESTION_ORDER.reduce((sum, type) => sum + result[type], 0);
  for (const type of QUESTION_ORDER) {
    if (assigned >= count) break;
    result[type] += 1;
    assigned += 1;
  }
  return result;
}

export function buildSmartPracticePlan(input: SmartPracticeInput): SmartQuestionPlan[] {
  const ids = selectSmartPracticeWordIds({ ...input, goal: input.words.length });
  const byId = new Map(input.words.map((word) => [word.id, word]));
  const priority = ids.map((id) => byId.get(id)).filter((word): word is Word => word != null);
  if (priority.length === 0 || input.goal <= 0) return [];

  const selected = Array.from({ length: Math.floor(input.goal) }, (_, index) => priority[index % priority.length]);
  const remaining = quotas(selected.length);
  const plan: SmartQuestionPlan[] = [];
  for (const word of selected) {
    const available = typesFor(word);
    const type = RARE_FIRST_ORDER.find(
      (candidate) => available.includes(candidate) && remaining[candidate] > 0,
    )
      ?? available.find((candidate) => candidate === 'dictation' || candidate === 'choice')
      ?? 'dictation';
    remaining[type] = Math.max(0, remaining[type] - 1);
    plan.push({ wordId: word.id, type });
  }
  return plan;
}
