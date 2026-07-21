import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANGUAGE_CODE } from './languages';
import { SEED_WORDS } from './seedWords';
import { lookupIpa } from './ipaData';

const LEGACY_WORDS_KEY = 'vocabulary_words';
const LEGACY_ID_KEY = 'vocabulary_next_id';
const SELECTED_LANGUAGE_KEY = 'selected_language';
const MIGRATED_KEY = 'vocabulary_migrated_v2';
const SEEDED_KEY = 'seeded_highschool_v1';

const DAY = 24 * 60 * 60 * 1000;

function wordsKey(languageCode: string): string {
  return `vocabulary_words_${languageCode}`;
}

function idKey(languageCode: string): string {
  return `vocabulary_next_id_${languageCode}`;
}

export type Word = {
  id: number;
  word: string;
  translation: string;
  pronunciation: string;
  created_at: number;
  times_reviewed: number;
  // Spaced-repetition (SM-2) scheduling fields
  ef: number; // ease factor, default 2.5
  interval: number; // current interval in days, default 0
  repetitions: number; // consecutive successful reps, default 0
  due: number; // next review due timestamp (ms), 0 = due immediately
  correct: number; // total correct (Hard/Good/Easy) reviews
  wrong: number; // total "Again" reviews
};

type LegacyWord = {
  id: number;
  chinese: string;
  english: string;
  pinyin: string;
  created_at: number;
  times_reviewed: number;
};

// Fill in scheduling defaults for words that predate this schema.
function normalize(w: Partial<Word> & { id: number; word: string; translation: string }): Word {
  return {
    id: w.id,
    word: w.word,
    translation: w.translation,
    pronunciation: w.pronunciation ?? '',
    created_at: w.created_at ?? Date.now(),
    times_reviewed: w.times_reviewed ?? 0,
    ef: w.ef ?? 2.5,
    interval: w.interval ?? 0,
    repetitions: w.repetitions ?? 0,
    due: w.due ?? 0,
    correct: w.correct ?? 0,
    wrong: w.wrong ?? 0,
  };
}

async function loadWords(languageCode: string): Promise<Word[]> {
  const json = await AsyncStorage.getItem(wordsKey(languageCode));
  if (!json) return [];
  const arr = JSON.parse(json) as Partial<Word>[];
  return arr.map((w) => normalize(w as Partial<Word> & { id: number; word: string; translation: string }));
}

async function saveWords(languageCode: string, words: Word[]): Promise<void> {
  await AsyncStorage.setItem(wordsKey(languageCode), JSON.stringify(words));
}

async function nextId(languageCode: string): Promise<number> {
  const key = idKey(languageCode);
  const val = await AsyncStorage.getItem(key);
  const id = val ? parseInt(val, 10) + 1 : 1;
  await AsyncStorage.setItem(key, id.toString());
  return id;
}

export async function migrateIfNeeded(): Promise<void> {
  const migrated = await AsyncStorage.getItem(MIGRATED_KEY);
  if (migrated) return;

  const legacyJson = await AsyncStorage.getItem(LEGACY_WORDS_KEY);
  if (legacyJson) {
    const legacyWords: LegacyWord[] = JSON.parse(legacyJson);
    const newWords: Word[] = legacyWords.map((w) =>
      normalize({
        id: w.id,
        word: w.chinese,
        translation: w.english,
        pronunciation: w.pinyin,
        created_at: w.created_at,
        times_reviewed: w.times_reviewed,
      })
    );
    await saveWords(DEFAULT_LANGUAGE_CODE, newWords);

    const legacyNextId = await AsyncStorage.getItem(LEGACY_ID_KEY);
    if (legacyNextId) {
      await AsyncStorage.setItem(idKey(DEFAULT_LANGUAGE_CODE), legacyNextId);
    }

    await AsyncStorage.removeItem(LEGACY_WORDS_KEY);
    await AsyncStorage.removeItem(LEGACY_ID_KEY);
  }

  await AsyncStorage.setItem(MIGRATED_KEY, '1');
}

// Seed the open-licensed high-school English vocabulary into the `en` library
// once, on first launch. IPA (offline, from ipaData) is attached to
// `pronunciation` so the flashcard can show it without any network call.
export async function seedHighSchoolIfNeeded(): Promise<void> {
  const flagged = await AsyncStorage.getItem(SEEDED_KEY);
  if (flagged) return;

  const existing = await loadWords('en');
  if (existing.length === 0) {
    let id = await nextId('en');
    const startId = id;
    const words: Word[] = SEED_WORDS.map((s) =>
      normalize({
        id: id++,
        word: s.word,
        translation: s.translation,
        pronunciation: lookupIpa(s.word) ?? '',
      })
    );
    await saveWords('en', words);
    await AsyncStorage.setItem(idKey('en'), id.toString());
    void startId;
  }
  await AsyncStorage.setItem(SEEDED_KEY, '1');
}

// One-time backfill: existing words seeded before IPA existed have an empty
// pronunciation; fill it from the offline ipaData map.
const IPA_BACKFILLED_KEY = 'ipa_backfilled_v1';
export async function backfillIpaIfNeeded(): Promise<void> {
  const flagged = await AsyncStorage.getItem(IPA_BACKFILLED_KEY);
  if (flagged) return;
  const words = await loadWords('en');
  let changed = false;
  for (const w of words) {
    if (!w.pronunciation) {
      const ipa = lookupIpa(w.word);
      if (ipa) {
        w.pronunciation = ipa;
        changed = true;
      }
    }
  }
  if (changed) await saveWords('en', words);
  await AsyncStorage.setItem(IPA_BACKFILLED_KEY, '1');
}

export async function getSelectedLanguage(): Promise<string> {
  const code = await AsyncStorage.getItem(SELECTED_LANGUAGE_KEY);
  return code ?? DEFAULT_LANGUAGE_CODE;
}

export async function setSelectedLanguage(code: string): Promise<void> {
  await AsyncStorage.setItem(SELECTED_LANGUAGE_KEY, code);
}

export async function insertWord(
  languageCode: string,
  wordText: string,
  translation: string,
  pronunciation: string
): Promise<void> {
  const words = await loadWords(languageCode);
  const id = await nextId(languageCode);
  words.push(
    normalize({
      id,
      word: wordText,
      translation,
      pronunciation,
    })
  );
  await saveWords(languageCode, words);
}

export async function getAllWords(languageCode: string): Promise<Word[]> {
  const words = await loadWords(languageCode);
  return words.sort((a, b) => b.created_at - a.created_at);
}

export async function searchWords(languageCode: string, query: string): Promise<Word[]> {
  const words = await loadWords(languageCode);
  const lower = query.toLowerCase();
  return words
    .filter(
      (w) =>
        w.word.toLowerCase().includes(query.toLowerCase()) ||
        w.translation.toLowerCase().includes(lower) ||
        w.pronunciation.toLowerCase().includes(lower)
    )
    .sort((a, b) => b.created_at - a.created_at);
}

export async function getRandomWord(languageCode: string): Promise<Word | null> {
  const words = await loadWords(languageCode);
  if (words.length === 0) return null;
  return words[Math.floor(Math.random() * words.length)];
}

export async function deleteWord(languageCode: string, id: number): Promise<void> {
  const words = await loadWords(languageCode);
  await saveWords(
    languageCode,
    words.filter((w) => w.id !== id)
  );
}

export type Grade = 0 | 1 | 2 | 3; // Again, Hard, Good, Easy

// SM-2 scheduling. Returns updated scheduling fields for a card.
export function sm2(
  card: { ef: number; interval: number; repetitions: number },
  grade: Grade
): { ef: number; interval: number; repetitions: number; due: number } {
  let { ef, interval, repetitions } = card;
  const q = 2 + grade; // Again=2(fail) Hard=3 Good=4 Easy=5

  if (q < 3) {
    // Failed recall: reset and show again soon.
    repetitions = 0;
    interval = 0;
    ef = Math.max(1.3, ef - 0.2);
  } else {
    if (repetitions === 0) {
      interval = grade === 1 ? 1 : grade === 2 ? 1 : 4;
    } else if (repetitions === 1) {
      interval = grade === 1 ? 3 : grade === 2 ? 6 : 10;
    } else {
      const mult = grade === 1 ? 1.2 : grade === 2 ? ef : ef * 1.3;
      interval = Math.round(interval * mult);
    }
    repetitions += 1;
  }

  // Classic SM-2 ease-factor update.
  ef = Math.min(2.8, Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
  const due = Date.now() + interval * DAY;
  return { ef, interval, repetitions, due };
}

// Words the user explicitly asked to re-practice (e.g. from the weak-words tab).
// getQuizWord drains these before falling back to scheduled/due words.
import { selectQuizWord, getPriorityIds, setPriorityIds } from './quizSelection';

// Pick the next word to study: priority (re-practice) words first, then most-overdue
// due words, then brand-new ones. Consumed priority ids are removed so they aren't repeated.
export async function getQuizWord(languageCode: string): Promise<Word | null> {
  const words = await loadWords(languageCode);
  const priority = getPriorityIds();
  const chosen = selectQuizWord(words, priority, Date.now());
  if (chosen && priority.includes(chosen.id)) {
    setPriorityIds(priority.filter((id) => id !== chosen.id));
  }
  return chosen;
}

// Record a review grade for a word and update its schedule.
export async function reviewWord(
  languageCode: string,
  id: number,
  grade: Grade
): Promise<void> {
  const words = await loadWords(languageCode);
  const word = words.find((w) => w.id === id);
  if (!word) return;

  const { ef, interval, repetitions, due } = sm2(word, grade);
  word.ef = ef;
  word.interval = interval;
  word.repetitions = repetitions;
  word.due = due;
  word.times_reviewed += 1;
  if (grade >= 1) word.correct += 1;
  else word.wrong += 1;

  await saveWords(languageCode, words);
  await recordStudyEvent();
}

export async function updateWord(
  languageCode: string,
  id: number,
  wordText: string,
  translation: string,
  pronunciation: string
): Promise<void> {
  const words = await loadWords(languageCode);
  const word = words.find((w) => w.id === id);
  if (word) {
    word.word = wordText;
    word.translation = translation;
    word.pronunciation = pronunciation;
    await saveWords(languageCode, words);
  }
}

export async function getWordCount(languageCode: string): Promise<number> {
  const words = await loadWords(languageCode);
  return words.length;
}

export type StudyStats = {
  total: number;
  due: number;
  newCount: number;
  mastered: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

// Aggregate statistics for the streak strip / stats screen.
export async function getStats(languageCode: string): Promise<StudyStats> {
  const words = await loadWords(languageCode);
  const now = Date.now();
  let due = 0;
  let newCount = 0;
  let mastered = 0;
  let correct = 0;
  let wrong = 0;

  for (const w of words) {
    if (w.due <= now) {
      if (w.repetitions === 0 && w.times_reviewed === 0) newCount++;
      else due++;
    } else if (w.interval >= 21) {
      mastered++;
    }
    correct += w.correct;
    wrong += w.wrong;
  }

  const totalReviews = correct + wrong;
  return {
    total: words.length,
    due,
    newCount,
    mastered,
    correct,
    wrong,
    accuracy: totalReviews > 0 ? correct / totalReviews : 0,
  };
}

// ---- Streak tracking (global, date-based) ----

const STREAK_KEY = 'study_streak_v1';
export type StreakData = { streak: number; lastDate: string };

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function recordStudyEvent(): Promise<StreakData> {
  const raw = await AsyncStorage.getItem(STREAK_KEY);
  const data: StreakData = raw ? JSON.parse(raw) : { streak: 0, lastDate: '' };
  const today = dateStr(new Date());
  const yesterday = dateStr(new Date(Date.now() - DAY));

  if (data.lastDate === today) {
    // already counted today
  } else if (data.lastDate === yesterday) {
    data.streak += 1;
    data.lastDate = today;
  } else {
    data.streak = 1;
    data.lastDate = today;
  }

  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
  return data;
}

export async function getStreak(): Promise<StreakData> {
  const raw = await AsyncStorage.getItem(STREAK_KEY);
  return raw ? JSON.parse(raw) : { streak: 0, lastDate: '' };
}

export async function setStreak(data: StreakData): Promise<void> {
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

// Replace all words for a language (used by progress import). Keeps the id counter
// ahead of the highest imported id to avoid collisions.
export async function importWords(languageCode: string, words: Word[]): Promise<void> {
  await saveWords(languageCode, words);
  const maxId = words.reduce((m, w) => Math.max(m, w.id), 0);
  await AsyncStorage.setItem(idKey(languageCode), String(maxId));
}
