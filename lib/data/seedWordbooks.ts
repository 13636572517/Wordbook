import type { Repository } from './repo';
import type { Word } from './types';
import { SEED_WORDS } from '../seedWords';
import { lookupIpa } from '../ipaData';

// Built-in wordbooks, grouped by level. High-school is seeded from the open
// KyleBing list; CET-4/6 are placeholders pending an open-source import (TB5).
const BUILTIN: { level: string; name: string; source: string }[] = [
  { level: 'high-school', name: '高中', source: 'KyleBing/english-vocabulary 高中-乱序 (open)' },
  { level: 'cet4', name: '四级', source: 'open (pending import)' },
  { level: 'cet6', name: '六级', source: 'open (pending import)' },
];

/**
 * Idempotently create the built-in (system) wordbooks and fill the high-school
 * book with the open vocabulary list. Safe to call on every app start.
 */
export async function seedBuiltInWordbooks(r: Repository): Promise<void> {
  const existing = await r.listWordbooks();
  const have = new Set(existing.map((w) => w.level));

  for (const def of BUILTIN) {
    if (have.has(def.level)) continue;
    const wb = await r.createWordbook({
      ownerId: null,
      name: def.name,
      level: def.level,
      type: 'system',
      source: def.source,
    });
    if (def.level === 'high-school') {
      // id uses the list index (not the word itself) because the source list
      // contains duplicate headwords; keeps all 6008 entries like the legacy seed.
      const words: Word[] = SEED_WORDS.map((s, i) => ({
        id: `w_${i}`,
        word: s.word,
        translation: s.translation,
        pronunciation: lookupIpa(s.word) ?? null,
      }));
      await r.bulkUpsertWords(words);
      await r.bulkSetMembership(
        wb.id,
        words.map((w) => w.id),
      );
    }
  }
}
