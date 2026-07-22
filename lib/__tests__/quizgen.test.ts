import assert from 'node:assert';
import { memoryRepo } from '../data/memoryRepo';
import type { Repository } from '../data/repo';
import type { Word, WordPhrase } from '../data/types';
import { defaultProgress } from '../data/quiz';
import { genChoice, genDictation, genPhrase, genPhraseBlank, genSentenceChoice, pickRange } from '../quizgen';

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

  // studied：仅已学过的词（有 correct/wrong 或 lastReviewTs）。
  // 到这里 w0..w3 有 correct/wrong，w6/w7/w8 有 lastReviewTs → 共 7 个；w4/w5/w9 无进度被排除。
  const studied = await pickRange(repo, u.id, A.id, 'studied', { now: NOW });
  const studiedIds = new Set(studied.map((x) => x.id));
  assert.strictEqual(studied.length, 7, 'studied -> only words with real progress');
  for (const id of ['w0', 'w1', 'w2', 'w3', 'w6', 'w7', 'w8']) {
    assert.ok(studiedIds.has(id), `studied includes ${id}`);
  }
  for (const id of ['w4', 'w5', 'w9']) {
    assert.ok(!studiedIds.has(id), `studied excludes never-studied ${id}`);
  }

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

  // --- ④ genPhraseBlank：有词组/无词组/词组不含目标词 ---
  const iceWord: Word = {
    id: 'ice1', word: 'ice', translation: '冰', pronunciation: null,
    phrases: [
      { phrase: 'break the ice', meaning: '打破僵局' },
      { phrase: 'on thin ice', meaning: '如履薄冰' },
    ],
  };
  const pbq = genPhraseBlank(iceWord);
  assert.ok(pbq, 'genPhraseBlank returns a question for word in phrase');
  assert.strictEqual(pbq!.type, 'phrase-blank');
  assert.strictEqual(pbq!.answer, 'ice');
  assert.strictEqual(pbq!.hintLength, 3);
  assert.ok(pbq!.blanked.includes('___'), 'blanked contains ___');
  assert.ok(!pbq!.blanked.toLowerCase().includes('ice'), 'blanked does not contain answer');
  assert.strictEqual(pbq!.meaning, '打破僵局');

  // 无词组 -> null
  const noPhraseWord = w('np1', 'test', '测试');
  assert.strictEqual(genPhraseBlank(noPhraseWord), null, 'no phrases -> null');

  // 词组不含目标词 -> null
  const mismatchWord: Word = {
    id: 'mm1', word: 'cat', translation: '猫', pronunciation: null,
    phrases: [{ phrase: 'dog and pony show', meaning: '做秀' }],
  };
  assert.strictEqual(genPhraseBlank(mismatchWord), null, 'phrase not containing word -> null');

  // 边界匹配：“ice” 不应匹配 "notice" 中的子串
  const noticeWord: Word = {
    id: 'nt1', word: 'ice', translation: '冰', pronunciation: null,
    phrases: [{ phrase: 'take notice', meaning: '注意' }],
  };
  assert.strictEqual(genPhraseBlank(noticeWord), null, 'should not match substring in notice');

  // --- ⑤ genSentenceChoice：有例句/无例句/例句不含目标词/选项唯一性 ---
  const runWord: Word = {
    id: 'run1', word: 'run', translation: '跑', pronunciation: null,
    examples: [
      { en: 'She likes to run in the morning.', zh: '她喜欢早上跑步。' },
      { en: 'The company is running out of money.', zh: '公司快没钱了。' },
    ],
  };
  const similar = ['walk', 'jog', 'sprint', 'dash', 'race', 'hurry', 'rush', 'gallop'];
  const scq = genSentenceChoice(runWord, similar);
  assert.ok(scq, 'genSentenceChoice returns a question');
  assert.strictEqual(scq!.type, 'sentence-choice');
  assert.strictEqual(scq!.options.length, 4, 'exactly 4 options');
  assert.ok(scq!.options.includes(scq!.answer), 'options include the answer');
  assert.strictEqual(new Set(scq!.options).size, 4, 'no duplicate options');
  assert.ok(scq!.sentence.includes('______'), 'sentence has blank');
  assert.ok(!scq!.sentence.toLowerCase().includes('run'), 'sentence does not contain answer word');
  assert.ok(scq!.sentenceZh, 'has Chinese translation');

  // 无例句 -> null
  const noExWord = w('ne1', 'jump', '跳');
  assert.strictEqual(genSentenceChoice(noExWord, similar), null, 'no examples -> null');

  // 例句不含目标词 -> null
  const noMatchWord: Word = {
    id: 'nm1', word: 'fly', translation: '飞', pronunciation: null,
    examples: [{ en: 'The bird sings beautifully.' }],
  };
  assert.strictEqual(genSentenceChoice(noMatchWord, similar), null, 'example not containing word -> null');

  // 干扰项不足 (< 3) -> null
  const fewSimilar = ['walk', 'jog'];
  assert.strictEqual(genSentenceChoice(runWord, fewSimilar), null, 'too few similar words -> null');

  // 变形匹配：running 应匹配 run
  const runWord2: Word = {
    id: 'run2', word: 'run', translation: '跑', pronunciation: null,
    examples: [{ en: 'He is running fast.', zh: '他跑得很快。' }],
  };
  const scq2 = genSentenceChoice(runWord2, similar);
  assert.ok(scq2, 'matches word form (running) for base word (run)');
  assert.strictEqual(scq2!.answer, 'running', 'answer is the matched form');

  console.log('ALL QUIZGEN TESTS PASSED');
})().catch((e) => {
  console.error('TEST ERROR', e);
  process.exit(1);
});
