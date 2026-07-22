/**
 * Dictionary API wrapper using Youdao (有道词典).
 * Provides Chinese definitions, phrases/collocations, and bilingual examples.
 *
 * Lookup strategy:
 *  1. Check offline cache (dictCache.json, pre-generated for 3743 words)
 *  2. If not in cache, call Youdao API (works on native; may hit CORS on web)
 *
 * No API key required.
 */

import type { WordDefinition, WordExample, WordPhrase } from './data/types';

const YOUDAO_API = 'https://dict.youdao.com/jsonapi_s';

// 云端模式：走后端同源词典代理，规避浏览器 / 华为 HarmonyOS 的跨域拦截
// （直连 dict.youdao.com 会被 CORS 拦截，导致自动匹配释义失败 → 无法保存）。
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';
const DICT_PROXY = __DEV__
  ? 'http://localhost:8000/api/dict/'
  : 'https://learning.yusuan.xyz/api/dict/';

// --- Offline cache (lazy-loaded) ---
let offlineCache: Record<string, DictionaryResult> | null = null;

async function loadOfflineCache(): Promise<Record<string, DictionaryResult> | null> {
  if (offlineCache !== null) return offlineCache;
  try {
    // Dynamic import so bundler can code-split the large JSON
    const mod = await import('./data/dictCache.json');
    offlineCache = (mod.default ?? mod) as unknown as Record<string, DictionaryResult>;
    return offlineCache;
  } catch {
    // dictCache.json not yet generated — skip offline lookup
    offlineCache = {};
    return null;
  }
}

export interface DictionaryResult {
  phonetic?: string; // IPA or phonetic transcription
  audioUrl?: string;
  definitions: WordDefinition[]; // Chinese definitions by part of speech
  examples: WordExample[]; // Bilingual example sentences
  phrases: WordPhrase[]; // Phrases/collocations with Chinese meaning
}

// Youdao API response types (partial, only fields we use)
interface YoudaoEcWord {
  trs?: { pos?: string; tran?: string; tr?: { tr?: string }[] }[];
  usphone?: string;
  ukphone?: string;
  phone?: string;
}

interface YoudaoEc {
  word?: YoudaoEcWord;
  source?: { name?: string; url?: string };
}

interface YoudaoPhrs {
  phrs?: { phr?: string; trs?: { tr?: string }[] }[];
}

interface YoudaoBlngSent {
  'sentence-pair'?: {
    sentence?: string;
    'sentence-translation'?: string;
  }[];
}

interface YoudaoAuthSent {
  'sentence-pair'?: {
    sentence?: string;
    'sentence-translation'?: string;
  }[];
}

interface YoudaoResponse {
  ec?: YoudaoEc;
  phrs?: YoudaoPhrs;
  blng_sents_part?: YoudaoBlngSent;
  auth_sents_part?: YoudaoAuthSent;
}

/**
 * Look up a word. Checks offline cache first, then falls back to Youdao API.
 * Returns Chinese definitions, phrases, and bilingual examples.
 * Returns null if the word is not found.
 */
export async function lookupWord(
  word: string,
): Promise<DictionaryResult | null> {
  const trimmed = word.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Check offline cache
  const cache = await loadOfflineCache();
  if (cache && trimmed in cache) {
    const entry = cache[trimmed];
    // Skip empty entries (previously failed lookups)
    if (entry.definitions.length > 0 || entry.phrases.length > 0 || entry.examples.length > 0) {
      return entry;
    }
  }

  // 2. Fall back to online lookup (for user-added words not in cache).
  //    云端：走后端同源代理 /api/dict/（规避跨域）；否则直连有道（原生 App 可用）。
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let url: string;
    if (USE_CLOUD) {
      const params = new URLSearchParams({ q: trimmed });
      url = `${DICT_PROXY}?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        doctype: 'json',
        jsonversion: '4',
        q: trimmed,
        le: 'en',
      });
      url = `${YOUDAO_API}?${params.toString()}`;
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers: USE_CLOUD
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', Referer: 'https://dict.youdao.com/' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data: YoudaoResponse = await res.json();
    return parseYoudao(data);
  } catch {
    // Network error, timeout, or CORS block (direct call on web only)
    clearTimeout(timeout);
    return null;
  }
}

function parseYoudao(data: YoudaoResponse): DictionaryResult | null {
  const definitions: WordDefinition[] = [];
  const examples: WordExample[] = [];
  const phrases: WordPhrase[] = [];
  let phonetic: string | undefined;

  // --- Parse EC (English-Chinese) definitions ---
  const ecTrs = data.ec?.word?.trs;
  if (ecTrs) {
    const ecWord = data.ec!.word!;

    // Get phonetic
    if (ecWord.usphone) {
      phonetic = `/${ecWord.usphone}/`;
    } else if (ecWord.ukphone) {
      phonetic = `/${ecWord.ukphone}/`;
    } else if (ecWord.phone) {
      phonetic = `/${ecWord.phone}/`;
    }

    // Parse all definitions (一词多义)
    for (const tr of ecTrs) {
      const pos = tr.pos?.replace(/\./g, '').trim() ?? '';
      // Collect all translations for this entry
      const meanings: string[] = [];
      if (tr.tran) {
        meanings.push(tr.tran);
      }
      if (tr.tr) {
        for (const t of tr.tr) {
          if (t.tr && !meanings.includes(t.tr)) {
            meanings.push(t.tr);
          }
        }
      }
      if (meanings.length > 0) {
        definitions.push({
          pos: pos || '释义',
          definition: meanings.join('；'),
        });
      }
    }
  }

  // --- Parse phrases/collocations (词组) ---
  if (data.phrs?.phrs) {
    for (const p of data.phrs.phrs.slice(0, 8)) {
      if (p.phr) {
        const meaning =
          p.trs?.map((t) => t.tr).filter(Boolean).join('；') ?? '';
        phrases.push({
          phrase: p.phr,
          meaning,
        });
      }
    }
  }

  // --- Parse bilingual example sentences (双语例句) ---
  const sentSource =
    data.blng_sents_part?.['sentence-pair'] ??
    data.auth_sents_part?.['sentence-pair'] ??
    [];
  for (const s of sentSource.slice(0, 4)) {
    if (s.sentence) {
      examples.push({
        en: s.sentence,
        zh: s['sentence-translation'] ?? undefined,
      });
    }
  }

  // Return null if we got nothing useful
  if (definitions.length === 0 && phrases.length === 0 && examples.length === 0) {
    return null;
  }

  return {
    phonetic,
    definitions,
    examples,
    phrases,
  };
}

/**
 * Build a concise Chinese summary from dictionary result.
 * Used to auto-fill the translation field.
 */
export function formatChineseSummary(result: DictionaryResult): string {
  if (result.definitions.length === 0) return '';
  return result.definitions
    .map((d) => (d.pos && d.pos !== '释义' ? `${d.pos} ${d.definition}` : d.definition))
    .join('；');
}
