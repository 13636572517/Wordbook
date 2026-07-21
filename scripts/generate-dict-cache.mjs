#!/usr/bin/env node
/**
 * Offline Dictionary Cache Generator
 * Reads PEPGaoZhong JSONL files, extracts unique words,
 * calls Youdao API for each word, and generates lib/data/dictCache.json.
 *
 * Usage: node scripts/generate-dict-cache.mjs
 * Estimated time: ~20 min for ~2900 words at 2.5 words/sec
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_PATH = path.join(ROOT, 'lib', 'data', 'dictCache.json');
const YOUDAO_API = 'https://dict.youdao.com/jsonapi_s';
const DELAY_MS = 400; // 2.5 requests/sec — conservative to avoid IP ban
const PROGRESS_FILE = path.join(DATA_DIR, 'dict-cache-progress.json');

// --- Step 1: Extract unique words from PEPGaoZhong JSONL files ---
function extractWords() {
  const words = new Set();
  const files = fs.readdirSync(DATA_DIR).filter(f => /^PEPGaoZhong_\d+\.json$/.test(f));
  for (const file of files) {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        const w = (obj.headWord || '').trim().toLowerCase();
        if (w && /^[a-z]+$/.test(w)) words.add(w);
      } catch { /* skip malformed lines */ }
    }
  }
  return [...words].sort();
}

// --- Step 2: Fetch from Youdao ---
async function fetchWord(word) {
  const params = new URLSearchParams({ doctype: 'json', jsonversion: '4', q: word, le: 'en' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${YOUDAO_API}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', Referer: 'https://dict.youdao.com/' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// --- Step 3: Parse response (same logic as lib/dictionary.ts) ---
function parseYoudao(data) {
  const definitions = [];
  const examples = [];
  const phrases = [];
  let phonetic;

  const ecTrs = data?.ec?.word?.trs;
  if (ecTrs) {
    const ecWord = data.ec.word;
    if (ecWord.usphone) phonetic = `/${ecWord.usphone}/`;
    else if (ecWord.ukphone) phonetic = `/${ecWord.ukphone}/`;
    else if (ecWord.phone) phonetic = `/${ecWord.phone}/`;

    for (const tr of ecTrs) {
      const pos = (tr.pos || '').replace(/\./g, '').trim();
      const meanings = [];
      if (tr.tran) meanings.push(tr.tran);
      if (tr.tr) for (const t of tr.tr) { if (t.tr && !meanings.includes(t.tr)) meanings.push(t.tr); }
      if (meanings.length > 0) definitions.push({ pos: pos || '释义', definition: meanings.join('；') });
    }
  }

  if (data?.phrs?.phrs) {
    for (const p of data.phrs.phrs.slice(0, 8)) {
      if (p.phr) {
        const meaning = (p.trs || []).map(t => t.tr).filter(Boolean).join('；');
        phrases.push({ phrase: p.phr, meaning });
      }
    }
  }

  const sentSource = data?.blng_sents_part?.['sentence-pair'] || data?.auth_sents_part?.['sentence-pair'] || [];
  for (const s of sentSource.slice(0, 4)) {
    if (s.sentence) examples.push({ en: s.sentence, zh: s['sentence-translation'] || undefined });
  }

  if (definitions.length === 0 && phrases.length === 0 && examples.length === 0) return null;
  return { phonetic, definitions, examples, phrases };
}

// --- Step 4: Load/save progress (resume-friendly) ---
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); } catch { return {}; }
}
function saveProgress(cache) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(cache));
}

// --- Main ---
async function main() {
  console.log('=== Offline Dict Cache Generator ===');
  console.log(`Output: ${OUTPUT_PATH}`);

  const words = extractWords();
  console.log(`Extracted ${words.length} unique words from PEPGaoZhong files`);

  // Resume from progress if available
  const cache = loadProgress();
  const done = Object.keys(cache).length;
  if (done > 0) console.log(`Resuming: ${done} words already cached`);

  const remaining = words.filter(w => !(w in cache));
  console.log(`Remaining: ${remaining.length} words to fetch`);
  console.log(`Estimated time: ~${Math.ceil(remaining.length * DELAY_MS / 60000)} min`);
  console.log('---');

  let success = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i++) {
    const word = remaining[i];
    try {
      const data = await fetchWord(word);
      const parsed = data ? parseYoudao(data) : null;
      cache[word] = parsed || { definitions: [], examples: [], phrases: [] };
      if (parsed) success++; else failed++;
    } catch {
      cache[word] = { definitions: [], examples: [], phrases: [] };
      failed++;
    }

    // Progress every 50 words
    if ((i + 1) % 50 === 0 || i === remaining.length - 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = (remaining.length - i - 1) / rate / 60;
      console.log(`[${done + i + 1}/${words.length}] ${word} | ok=${success} fail=${failed} | ${rate.toFixed(1)}/s | ETA ${eta.toFixed(1)}min`);
      saveProgress(cache);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Final save
  saveProgress(cache);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 0));
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n=== DONE ===`);
  console.log(`Total: ${words.length} | Success: ${success} | Failed: ${failed}`);
  console.log(`Output: ${OUTPUT_PATH} (${sizeMB} MB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
