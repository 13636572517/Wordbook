/**
 * Batch dictionary enrichment script.
 * Fetches Chinese definitions, phrases, and examples from Youdao Dictionary
 * for all seed words, and saves to lib/data/dictCache.json.
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/build-dict-cache.ts
 *
 * Features:
 *  - Deduplicates words (6008 entries → ~3500 unique)
 *  - Rate-limited (500ms between requests) to avoid IP ban
 *  - Incremental: saves progress every 50 words; resumes from cache
 *  - Estimated time: ~30 min for 3500 unique words
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// --- Types (mirrors lib/dictionary.ts) ---
interface WordDefinition {
  pos: string;
  definition: string;
  example?: string;
}
interface WordExample {
  en: string;
  zh?: string;
}
interface WordPhrase {
  phrase: string;
  meaning: string;
}
interface DictEntry {
  phonetic?: string;
  definitions: WordDefinition[];
  examples: WordExample[];
  phrases: WordPhrase[];
}
type DictCache = Record<string, DictEntry>;

// --- Youdao API parsing (same logic as lib/dictionary.ts) ---
const YOUDAO_API = 'https://dict.youdao.com/jsonapi_s';

async function lookupWord(word: string): Promise<DictEntry | null> {
  try {
    const params = new URLSearchParams({
      doctype: 'json',
      jsonversion: '4',
      q: word,
      le: 'en',
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${YOUDAO_API}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', Referer: 'https://dict.youdao.com/' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return parseYoudao(data);
  } catch {
    return null;
  }
}

function parseYoudao(data: any): DictEntry | null {
  const definitions: WordDefinition[] = [];
  const examples: WordExample[] = [];
  const phrases: WordPhrase[] = [];
  let phonetic: string | undefined;

  const ecTrs = data?.ec?.word?.trs;
  if (ecTrs) {
    const ecWord = data.ec.word;
    if (ecWord.usphone) phonetic = `/${ecWord.usphone}/`;
    else if (ecWord.ukphone) phonetic = `/${ecWord.ukphone}/`;
    else if (ecWord.phone) phonetic = `/${ecWord.phone}/`;

    for (const tr of ecTrs) {
      const pos = tr.pos?.replace(/\./g, '').trim() ?? '';
      const meanings: string[] = [];
      if (tr.tran) meanings.push(tr.tran);
      if (tr.tr) {
        for (const t of tr.tr) {
          if (t.tr && !meanings.includes(t.tr)) meanings.push(t.tr);
        }
      }
      if (meanings.length > 0) {
        definitions.push({ pos: pos || '释义', definition: meanings.join('；') });
      }
    }
  }

  if (data?.phrs?.phrs) {
    for (const p of data.phrs.phrs.slice(0, 8)) {
      if (p.phr) {
        const meaning = p.trs?.map((t: any) => t.tr).filter(Boolean).join('；') ?? '';
        phrases.push({ phrase: p.phr, meaning });
      }
    }
  }

  const sentSource =
    data?.blng_sents_part?.['sentence-pair'] ??
    data?.auth_sents_part?.['sentence-pair'] ??
    [];
  for (const s of sentSource.slice(0, 4)) {
    if (s.sentence) {
      examples.push({ en: s.sentence, zh: s['sentence-translation'] ?? undefined });
    }
  }

  if (definitions.length === 0 && phrases.length === 0 && examples.length === 0) {
    return null;
  }
  return { phonetic, definitions, examples, phrases };
}

// --- Main ---
async function main() {
  const ROOT = resolve(import.meta.dirname ?? __dirname, '..');
  const CACHE_PATH = resolve(ROOT, 'lib/data/dictCache.json');

  // Load seed words
  const { SEED_WORDS } = (await import(resolve(ROOT, 'lib/seedWords.ts'))) as {
    SEED_WORDS: { word: string; translation: string }[];
  };
  const uniqueWords: string[] = [...new Set(SEED_WORDS.map((s) => s.word.toLowerCase().trim()))];
  console.log(`Total seed entries: ${SEED_WORDS.length}`);
  console.log(`Unique words: ${uniqueWords.length}`);

  // Load existing cache (for resume)
  let cache: DictCache = {};
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
      console.log(`Loaded existing cache: ${Object.keys(cache).length} entries`);
    } catch { /* start fresh */ }
  }

  // Filter out already-cached words
  const todo = uniqueWords.filter((w) => !(w in cache));
  console.log(`Words to fetch: ${todo.length}`);
  if (todo.length === 0) {
    console.log('All done! Nothing to fetch.');
    return;
  }

  let done = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const word of todo) {
    const result = await lookupWord(word);
    if (result) {
      cache[word] = result;
    } else {
      // Mark as attempted (empty entry) to avoid re-fetching
      cache[word] = { definitions: [], examples: [], phrases: [] };
      failed++;
    }
    done++;

    // Progress log every 20 words
    if (done % 20 === 0 || done === todo.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (done / (Date.now() - startTime) * 1000).toFixed(1);
      const eta = (((todo.length - done) / parseFloat(rate)) ).toFixed(0);
      console.log(
        `[${done}/${todo.length}] ${rate} words/s | failed: ${failed} | elapsed: ${elapsed}s | ETA: ${eta}s`,
      );
    }

    // Save incrementally every 100 words
    if (done % 100 === 0) {
      writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
    }

    // Rate limit: 400ms between requests
    await new Promise((r) => setTimeout(r, 400));
  }

  // Final save
  writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
  const size = (readFileSync(CACHE_PATH).length / 1024 / 1024).toFixed(2);
  console.log(`\nDone! Cache saved to lib/data/dictCache.json (${size} MB)`);
  console.log(`Total entries: ${Object.keys(cache).length}, failed: ${failed}`);
}

main().catch(console.error);
