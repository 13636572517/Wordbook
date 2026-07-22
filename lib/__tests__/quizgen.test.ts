import assert from 'node:assert';
import { memoryRepo } from '../data/memoryRepo';
import type { Repository } from '../data/repo';
import type { Word, WordPhrase } from '../data/types';
import { defaultProgress } from '../data/quiz';
import { genChoice, genDictation, genPhrase, pickRange } from '../quizgen';

const repo: Repository = memoryRepo;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-22T12:00:00').getTime();

function w(id: string, word: string, translation: string, phrases?: WordPhrase[]): Word {
  return { id, word, translation, pronunciation: null, phrases };
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

(async () => {
  const u = await repo.createUser('alice');
  const A = await repo.createWordbook({ ownerId: null, name: 'A', level: 'a', type: 'system' });

  // 10 个词，translation 各不相同，供选择题干扰项充足
  const words: Word[] = Array.from({ length: 10 }, (_, i) =>
    w(`w${i}`, `word${i}`, `释义${i}`),
  );
  for (const x of words) await repo.upsertWord(x);
  for (const x of words) await repo.addWordToWordbook(A.id, x.id);

  // --- ① 选择题：options 恰 4 项、含答案且唯一、无重复 ---
  for (let t = 0; t < 50; t++) {
    const target = words[Math.floor(Math.random() * words.length)];
    const q = genChoice(words, target);
    assert.strictEqual(q.type, 'choice', 'type is choice');
    assert.strictEqual(q.options.length, 4, 'exactly 4 options');
    // 唯一正确项 = target.translation
    const answerMatches = q.options.filter((o) => o === q.answer);
    assert.strictEqual(answerMatches.length, 1, 'correct answer appears exactly once');
    assert.strictEqual(q.answer, target.translation, 'answer equals target translation');
    // 无重复
    assert.strictEqual(new Set(q.options).size, 4, 'no duplicate options');
    // 干扰项（除答案外的项）均不等于答案
    for (const o of q.options) {
      if (o !== q.answer) assert.notStrictEqual(o, q.answer, 'distractor must not be the answer');
    }
  }

  // --- ② genPhrase：hints 长度匹配；空 phrases 返回 null ---
  const withPhrase = w('ph1', 'break', '打破', [
    { phrase: 'break the ice', meaning: '破冰；打破僵局' },
    { phrase: 'break up', meaning: '分手；破裂' },
  ]);
  const pq = genPhrase(withPhrase);
  assert.ok(pq, 'genPhrase returns a question for non-empty phrases');
  assert.strictEqual(pq!.type, 'phrase', 'type is phrase');
  assert.strictEqual(pq!.answer, 'break the ice', 'answer = first phrase.phrase');
  assert.strictEqual(pq!.meaning, '破冰；打破僵局', 'meaning = first phrase.meaning');
  assert.deepStrictEqual(pq!.hints, [5, 3, 3], 'hints = per-word lengths [5,3,3]');

  const noPhrase = w('ph2', 'hello', '你好', undefined);
  assert.strictEqual(genPhrase(noPhrase), null, 'undefined phrases -> null');
  const emptyPhrase = w('ph3', 'world', '世界', []);
  assert.strictEqual(genPhrase(emptyPhrase), null, 'empty phrases -> null');

  // --- ②b genDictation：answer = word.word ---
  const dq = genDictation(words);
  assert.strictEqual(dq.type, 'dictation', 'type is dictation');
  assert.strictEqual(dq.answer, dq.word.word, 'answer equals the word text');

  // --- ③ pickRange 各范围筛选正确 ---
  const setProgress = (id: string, over: Record<string, unknown>) =>
    repo.setProgress({ ...defaultProgress(u.id, A.id, id, NOW), ...(over as any) });

  // 设置进度：w0/w2 薄弱，w1/w3 不薄弱，w4/w5 无进度
  await setProgress('w0', { correct: 0, wrong: 3 }); // 错率 1 -> 薄弱
  await setProgress('w1', { correct: 10, wrong: 0, ef: 2.5 }); // 不薄弱
  await setProgress('w2', { correct: 5, wrong: 0, ef: 1.5 }); // ef<1.8 -> 薄弱
  await setProgress('w3', { correct: 5, wrong: 1, ef: 2.5 }); // 错率 .166 -> 不薄弱
  // w4, w5 无进度

  const all = await pickRange(repo, u.id, A.id, 'all', { now: NOW });
  assert.strictEqual(all.length, 10, 'all -> every word in the wordbook');
  assert.deepStrictEqual(
    new Set(all.map((x) => x.id)),
    new Set(words.map((x) => x.id)),
    'all -> correct ids',
  );

  const weak = await pickRange(repo, u.id, A.id, 'weak', { now: NOW });
  const weakIds = new Set(weak.map((x) => x.id));
  assert.ok(weakIds.has('w0'), 'weak includes w0 (high wrong ratio)');
  assert.ok(weakIds.has('w2'), 'weak includes w2 (low ef)');
  assert.strictEqual(weak.length, 2, 'weak -> exactly 2 weak words');
  assert.ok(!weakIds.has('w1') && !weakIds.has('w3'), 'weak excludes non-weak words');
  assert.ok(!weakIds.has('w4') && !weakIds.has('w5'), 'weak excludes no-progress words');

  // recent：w6/w7/w8 lastReviewTs 落在 7 天窗口内，其余窗口外或无进度
  await setProgress('w6', { lastReviewTs: NOW });
  await setProgress('w7', { lastReviewTs: NOW - 6 * DAY });
  await setProgress('w8', { lastReviewTs: NOW - 8 * DAY }); // 窗口外
  const recent = await pickRange(repo, u.id, A.id, 'recent', { now: NOW, days: 7 });
  const recentIds = new Set(recent.map((x) => x.id));
  assert.ok(recentIds.has('w6') && recentIds.has('w7'), 'recent includes words within 7d');
  assert.strictEqual(recent.length, 2, 'recent -> exactly 2 within window');
  assert.ok(!recentIds.has('w8'), 'recent excludes word 8 days ago');

  const custom = await pickRange(repo, u.id, A.id, 'custom', {
    now: NOW,
    wordIds: ['w0', 'w1', 'does-not-exist'],
  });
  const customIds = custom.map((x) => x.id);
  assert.deepStrictEqual(customIds, ['w0', 'w1'], 'custom -> maps given wordIds, drops unknown');

  // 其他 user 看不到 alice 的薄弱/最近词
  const u2 = await repo.createUser('bob');
  const weak2 = await pickRange(repo, u2.id, A.id, 'weak', { now: NOW });
  assert.strictEqual(weak2.length, 0, 'weak is isolated per user');

  // 用 shuffle 包装 genChoice 多次验证稳定性（实际由内部随机，上面已覆盖）
  void shuffle;

  console.log('ALL QUIZGEN TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
