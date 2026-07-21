// Build-time, fully-offline script: derive IPA for every seed word from the
// CMU Pronouncing Dictionary (cmudict.dict) and emit lib/ipaData.ts.
//
//   npx tsx scripts/build-ipa-cmudict.ts
//
// cmudict stores ARPABET phonemes (with stress digits). We convert ARPABET -> IPA
// with a standard mapping. No network at runtime.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SEED_WORDS } from '../lib/seedWords';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'lib', 'ipaData.ts');
const CMUDICT = process.env.CMUDICT_PATH || '/tmp/cmudict.dict';

// ARPABET -> IPA. Vowels are stress-aware (digit suffix handled separately).
const VOWELS: Record<string, { s0: string; s1: string; s2: string }> = {
  AA: { s0: 'ɑ', s1: 'ɑ', s2: 'ɑ' },
  AE: { s0: 'æ', s1: 'æ', s2: 'æ' },
  AH: { s0: 'ə', s1: 'ʌ', s2: 'ʌ' },
  AO: { s0: 'ɔ', s1: 'ɔ', s2: 'ɔ' },
  AW: { s0: 'aʊ', s1: 'aʊ', s2: 'aʊ' },
  AY: { s0: 'aɪ', s1: 'aɪ', s2: 'aɪ' },
  EH: { s0: 'ɛ', s1: 'ɛ', s2: 'ɛ' },
  ER: { s0: 'ɚ', s1: 'ɝ', s2: 'ɝ' },
  EY: { s0: 'eɪ', s1: 'eɪ', s2: 'eɪ' },
  IH: { s0: 'ɪ', s1: 'ɪ', s2: 'ɪ' },
  IY: { s0: 'i', s1: 'i', s2: 'i' },
  OW: { s0: 'oʊ', s1: 'oʊ', s2: 'oʊ' },
  OY: { s0: 'ɔɪ', s1: 'ɔɪ', s2: 'ɔɪ' },
  UH: { s0: 'ə', s1: 'ʊ', s2: 'ʊ' },
  UW: { s0: 'u', s1: 'u', s2: 'u' },
};

const CONSONANTS: Record<string, string> = {
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', DX: 'ɾ', F: 'f', G: 'ɡ',
  H: 'h', HH: 'h', JH: 'dʒ', J: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n',
  NG: 'ŋ', P: 'p', R: 'ɹ', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v',
  W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
  EL: 'əl', EM: 'əm', EN: 'ən', ENG: 'əŋ',
};

function arpabetToIpa(tokens: string[]): string | null {
  const out: string[] = [];
  let pendingConsonants: string[] = []; // consonants since the last vowel (syllable onset)
  const flushPending = () => {
    out.push(...pendingConsonants);
    pendingConsonants = [];
  };
  for (const tok of tokens) {
    const m = tok.match(/^([A-Z]+)([012]?)$/);
    if (!m) continue;
    const base = m[1];
    const stress = m[2] as '0' | '1' | '2' | '';
    if (VOWELS[base]) {
      const v = VOWELS[base];
      const ipa = stress === '1' ? v.s1 : stress === '2' ? v.s2 : v.s0;
      if (stress === '1' || stress === '2') {
        // place the stress mark at the syllable onset (before its consonants)
        out.push(stress === '1' ? 'ˈ' : 'ˌ');
        flushPending();
      } else {
        flushPending();
      }
      out.push(ipa);
    } else if (CONSONANTS[base]) {
      pendingConsonants.push(CONSONANTS[base]);
    }
    // unknown phoneme — skip silently
  }
  flushPending();
  const joined = out.join('').replace(/ˈˈ/g, 'ˈ').replace(/ˌˌ/g, 'ˌ');
  return joined.length > 0 ? `/${joined}/` : null;
}

function buildDict(path: string): Map<string, string[]> {
  const text = readFileSync(path, 'utf8');
  const map = new Map<string, string[]>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    let word = parts[0];
    // strip variant suffix like ABANDON(2)
    word = word.replace(/\([0-9]+\)$/, '').toLowerCase();
    if (!map.has(word)) {
      map.set(word, parts.slice(1));
    }
  }
  return map;
}

function escapeKey(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function main() {
  const dict = buildDict(CMUDICT);
  const result: Record<string, string> = {};
  let hits = 0;

  for (const s of SEED_WORDS) {
    const entry = dict.get(s.word.toLowerCase());
    if (entry) {
      const ipa = arpabetToIpa(entry);
      if (ipa) {
        result[s.word] = ipa;
        hits++;
      }
    }
  }

  const lines = Object.entries(result)
    .map(([w, ipa]) => `  "${escapeKey(w)}": "${escapeKey(ipa)}",`)
    .join('\n');

  const file = `// Auto-generated IPA map. Source: CMU Pronouncing Dictionary (cmudict, public domain),
// converted ARPABET -> IPA at build time. See scripts/build-ipa-cmudict.ts.
// Runtime is fully offline.
export const ipaData: Record<string, string> = {
${lines}
};

export function lookupIpa(word: string): string | undefined {
  return ipaData[word];
}
`;
  writeFileSync(OUT, file, 'utf8');
  console.log(`Done. ${hits}/${SEED_WORDS.length} words have IPA (${(hits / SEED_WORDS.length * 100).toFixed(1)}%).`);
  console.log(`Wrote ${OUT}`);
}

main();
