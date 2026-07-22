import type { Repository } from './repo';
import type { Word } from './types';
import { SEED_WORDS } from '../seedWords';
import { SEED_WORDS_CET4 } from '../seedWordsCet4';
import { SEED_WORDS_CET6 } from '../seedWordsCet6';
import { lookupIpa } from '../ipaData';

// Built-in wordbooks, grouped by level. All seeded from the open KyleBing list.
const BUILTIN: { level: string; name: string; source: string }[] = [
  { level: 'high-school', name: '高中', source: 'KyleBing/english-vocabulary 高中-乱序 (open)' },
  { level: 'cet4', name: '四级', source: 'KyleBing/english-vocabulary CET4-顺序 (open)' },
  { level: 'cet6', name: '六级', source: 'KyleBing/english-vocabulary CET6-顺序 (open)' },
];

const SEED_MAP: Record<string, { word: string; translation: string }[]> = {
  'high-school': SEED_WORDS,
  cet4: SEED_WORDS_CET4,
  cet6: SEED_WORDS_CET6,
};

/**
 * Idempotently create the built-in (system) wordbooks and fill each book with
 * its open vocabulary list. Safe to call on every app start.
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
    const seedList = SEED_MAP[def.level];
    if (seedList && seedList.length > 0) {
      // id uses level prefix + index to avoid collisions across wordbooks.
      const prefix = def.level === 'high-school' ? 'w' : def.level;
      const words: Word[] = seedList.map((s, i) => ({
        id: `${prefix}_${i}`,
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
