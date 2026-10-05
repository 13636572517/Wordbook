# 首字母转练实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在练习 Tab 新增「首字母转练」——选字母 → 快速浏览 → 释义选择 → 单词默写，练习中可一键跳过尚未作答的已掌握单词。

**架构：** 纯逻辑抽到 `lib/firstLetter.ts`（可单测）；`FirstLetterTrainer` 组件承载四段式流程并在练习页内以模式切换挂载；`QuizRunner` 新增可选 `skipTool` 属性支持响应式剔除未作答题；已掌握口径复用 stats 的 `MASTERED_REPETITIONS`（repetitions >= 3）。

**技术栈：** Expo SDK 54 + React Native Web + TypeScript + expo-router；测试用 `node_modules/.bin/tsx` 跑 node:assert 纯逻辑测试。

**规格：** `docs/superpowers/specs/2026-10-05-first-letter-practice-design.md`

**关键约束：**
- 阶段词表必须在进入阶段时一次性冻结（choiceWordIds / dictationWordIds），过滤只经 `skipTool` 从 QuizRunner 内部剔除题目——不得让 `opts.wordIds` 在阶段中途变化，否则 QuizRunner 会重载题目池、丢失答题进度。
- `QuizRunner` 不传 `skipTool` 时行为必须与现在完全一致（其他 5 处调用方不受影响）。
- 浏览阶段不写任何进度。
- 两个阶段的 QuizRunner 用不同 `key` 强制重挂（choice/dictation），避免状态残留。

---

### 任务 1：lib/firstLetter.ts 纯逻辑 + 单测（TDD）

**文件：**
- 创建：`lib/firstLetter.ts`
- 创建：`lib/__tests__/firstLetter.test.ts`
- 修改：`lib/data/stats.ts:28`（导出常量）

- [ ] **步骤 1：编写失败的测试**

创建 `lib/__tests__/firstLetter.test.ts`：

```ts
import assert from 'node:assert';
import type { UserWordProgress, Word } from '../data/types';
import { countWordsByLetter, isMastered, letterOf, pickMasteredIds, wordsStartingWith } from '../firstLetter';

const word = (id: string, text: string): Word => ({
  id,
  word: text,
  translation: `${text} 释义`,
  pronunciation: null,
});

const progress = (repetitions: number): UserWordProgress => ({
  userId: 'u1',
  wordbookId: 'wb1',
  wordId: 'w',
  ef: 2.5,
  interval: 10,
  repetitions,
  due: 0,
  correct: 0,
  wrong: 0,
});

// letterOf：普通 / 大写 / 数字 / 空串 / 中文
assert.strictEqual(letterOf('apple'), 'A', 'lowercase first letter is grouped by upper case');
assert.strictEqual(letterOf('Banana'), 'B', 'already upper case stays');
assert.strictEqual(letterOf('123abc'), '#', 'non-letter start falls into #');
assert.strictEqual(letterOf(''), '#', 'empty string falls into #');
assert.strictEqual(letterOf('你好'), '#', 'non-ascii start falls into #');

// countWordsByLetter：统计与边界
const counts = countWordsByLetter([
  word('w1', 'apple'),
  word('w2', 'apply'),
  word('w3', 'banana'),
  word('w4', '123go'),
]);
assert.strictEqual(counts.get('A'), 2, 'A counts both words');
assert.strictEqual(counts.get('B'), 1, 'B counts one word');
assert.strictEqual(counts.get('#'), 1, '# counts non-letter words');
assert.strictEqual(counts.get('C'), undefined, 'letters without words are absent');

// wordsStartingWith：过滤与排序（字母序）
const list = wordsStartingWith(
  [word('w1', 'banana'), word('w2', 'axe'), word('w3', 'ant'), word('w4', 'cat')],
  'A',
);
assert.deepStrictEqual(list.map((w) => w.id), ['w3', 'w2'], 'filters by letter and sorts alphabetically');

// isMastered：repetitions 2 / 3 / null
assert.strictEqual(isMastered(null), false, 'no progress is not mastered');
assert.strictEqual(isMastered(progress(2)), false, 'two repetitions are not mastered');
assert.strictEqual(isMastered(progress(3)), true, 'three repetitions are mastered');
assert.strictEqual(isMastered(progress(5)), true, 'beyond threshold stays mastered');

// pickMasteredIds：混合输入只返回已掌握
assert.deepStrictEqual(
  pickMasteredIds([
    { id: 'a', progress: progress(3) },
    { id: 'b', progress: progress(1) },
    { id: 'c', progress: null },
    { id: 'd', progress: progress(4) },
  ]),
  ['a', 'd'],
  'returns only mastered ids in input order',
);

console.log('ALL FIRST LETTER TESTS PASSED');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node_modules/.bin/tsx lib/__tests__/firstLetter.test.ts`
预期：FAIL，报错 `Cannot find module '../firstLetter'`。

- [ ] **步骤 3：导出既有常量**

修改 `lib/data/stats.ts` 第 28 行：

```ts
// 原：const MASTERED_REPETITIONS = 3;
export const MASTERED_REPETITIONS = 3;
```

- [ ] **步骤 4：编写最少实现代码**

创建 `lib/firstLetter.ts`：

```ts
// 首字母转练纯逻辑：字母分组、按字母过滤、已掌握判定与筛选。
// 「已掌握」口径与词本统计同源（MASTERED_REPETITIONS = repetitions >= 3），
// 不得使用教师端薄弱词接口的严格口径。
import type { UserWordProgress, Word } from './data/types';
import { MASTERED_REPETITIONS } from './data/stats';

/** 单词首字符大写后在 A-Z 内取该字母，否则归入 '#'。 */
export function letterOf(word: string): string {
  const ch = (word.charAt(0) || '').toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

/** 统计词表中每个字母（含 '#'）的单词数。 */
export function countWordsByLetter(words: Word[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of words) {
    const letter = letterOf(w.word);
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

/** 该字母下的单词，按字母序排列（浏览顺序）。 */
export function wordsStartingWith(words: Word[], letter: string): Word[] {
  return words
    .filter((w) => letterOf(w.word) === letter)
    .sort((a, b) => a.word.localeCompare(b.word));
}

/** 已掌握：repetitions >= MASTERED_REPETITIONS（与数据页「已掌握」统计同口径）。 */
export function isMastered(p: UserWordProgress | null): boolean {
  return p != null && p.repetitions >= MASTERED_REPETITIONS;
}

/** 从候选中筛出已掌握的 id（保持输入顺序）。 */
export function pickMasteredIds(
  pairs: { id: string; progress: UserWordProgress | null }[],
): string[] {
  return pairs.filter((pair) => isMastered(pair.progress)).map((pair) => pair.id);
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`node_modules/.bin/tsx lib/__tests__/firstLetter.test.ts`
预期：PASS，输出 `ALL FIRST LETTER TESTS PASSED`。

- [ ] **步骤 6：Commit**

```bash
git add lib/firstLetter.ts lib/__tests__/firstLetter.test.ts lib/data/stats.ts
git commit -m "feat: 首字母转练纯逻辑（字母分组/过滤/已掌握判定）+ 单测"
```

---

### 任务 2：letterOf 迁移共用

**文件：**
- 修改：`components/StudentProgressParts.tsx:1-14`

- [ ] **步骤 1：改为从 lib 导入**

将文件头部：

```tsx
import type { StudentProgressSummary, WeakWordEntry, WrongLogEntry } from '@/lib/data/studentProgress';

const DAY_MS = 24 * 60 * 60 * 1000;

export function letterOf(word: string): string {
  const ch = (word.charAt(0) || '').toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}
```

改为：

```tsx
import type { StudentProgressSummary, WeakWordEntry, WrongLogEntry } from '@/lib/data/studentProgress';
import { letterOf } from '@/lib/firstLetter';

const DAY_MS = 24 * 60 * 60 * 1000;
```

注意：文件内两处调用 `letterOf(...)` 不变；`letterOf` 由 `export` 变为导入符号（此前无其他文件 import 它，已确认）。

- [ ] **步骤 2：类型检查 + 回归测试**

运行：`./node_modules/.bin/tsc --noEmit`
运行：`node_modules/.bin/tsx components/__tests__/ui-regressions.test.ts`
预期：均通过。

- [ ] **步骤 3：Commit**

```bash
git add components/StudentProgressParts.tsx
git commit -m "refactor: letterOf 迁移至 lib/firstLetter 共用，避免字母判定漂移"
```

---

### 任务 3：QuizRunner 增加 skipTool 属性

**文件：**
- 修改：`components/QuizRunner.tsx`

- [ ] **步骤 1：扩展 props 接口**

在 `QuizRunnerProps`（原第 52-63 行）中，`onExit` 之后新增：

```ts
  /** 练习中「跳过已掌握」工具：点击时收集尚未作答（当前题之后）的词 id 交给 resolve，
   *  返回的 id 将从题目池剔除；已答题目与当前题不受影响。不传时按钮不渲染。 */
  skipTool?: {
    label: string;
    resolve: (remainingWordIds: string[]) => Promise<string[]>;
    onResult?: (removed: number, remaining: number) => void;
  };
```

并在函数参数解构中加入 `skipTool,`。

- [ ] **步骤 2：新增状态与处理函数**

在 `const [showExitConfirm, setShowExitConfirm] = useState(false);` 之后新增：

```ts
  const [skipBusy, setSkipBusy] = useState(false);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
```

在 `const q = questions[idx];` 附近新增（组件体内、条件 return 之前）：

```ts
  // 跳过提示自动消失
  useEffect(() => {
    if (!skipNotice) return;
    const timer = setTimeout(() => setSkipNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [skipNotice]);

  // 跳过已掌握：收集尚未作答的词 id → resolve → 从池中剔除（索引大于当前题）
  const handleSkipTool = async () => {
    if (!skipTool || skipBusy) return;
    setSkipBusy(true);
    try {
      const remainingIds = Array.from(new Set(questions.slice(idx + 1).map((item) => item.word.id)));
      const removeIds = new Set(await skipTool.resolve(remainingIds));
      const next = questions.filter((item, i) => i <= idx || !removeIds.has(item.word.id));
      const removed = questions.length - next.length;
      if (removed > 0) {
        setQuestions(next);
        setSkipNotice(`已跳过 ${removed} 个已掌握单词`);
      } else {
        setSkipNotice('当前没有已掌握的单词');
      }
      skipTool.onResult?.(removed, remainingIds.length - removed);
    } catch {
      setSkipNotice('跳过失败，请重试');
    } finally {
      setSkipBusy(false);
    }
  };
```

- [ ] **步骤 3：工具栏按钮与提示**

将 `progressRow` 区块（原第 291-305 行）改为：

```tsx
      <View style={styles.progressRow}>
        {onExit && (
          <TouchableOpacity
            style={styles.backBtnWrap}
            onPress={() => setShowExitConfirm(true)}
            hitSlop={8}
          >
            <FontAwesome name="chevron-left" size={16} color={colors.tint} />
            <Text style={[styles.backBtnText, { color: colors.tint }]}>返回</Text>
          </TouchableOpacity>
        )}
        {skipTool && (
          <TouchableOpacity
            style={[styles.skipBtn, { borderColor: colors.border }]}
            onPress={handleSkipTool}
            disabled={skipBusy}
            activeOpacity={0.7}
          >
            {skipBusy ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <FontAwesome name="forward" size={12} color={colors.tint} />
            )}
            <Text style={[styles.skipBtnText, { color: colors.tint }]}>{skipTool.label}</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.progressText, { color: colors.subtitle }]}>
          第 {idx + 1} / {questions.length} 题
        </Text>
      </View>
      {skipNotice ? (
        <Text style={[styles.skipNotice, { color: colors.tint }]}>{skipNotice}</Text>
      ) : null}
```

- [ ] **步骤 4：新增样式**

在 `styles` 中新增：

```ts
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  skipBtnText: { fontSize: 12.5, fontWeight: '600' },
  skipNotice: { fontSize: 12.5, marginBottom: 8 },
```

- [ ] **步骤 5：验证**

运行：`./node_modules/.bin/tsc --noEmit`
预期：通过（其他调用方未传 skipTool，行为不变）。

- [ ] **步骤 6：Commit**

```bash
git add components/QuizRunner.tsx
git commit -m "feat: QuizRunner 支持 skipTool——练习中一键跳过尚未作答的已掌握题目"
```

---

### 任务 4：FirstLetterTrainer 组件

**文件：**
- 创建：`components/FirstLetterTrainer.tsx`

- [ ] **步骤 1：实现组件**

创建 `components/FirstLetterTrainer.tsx`（关键逻辑如下；样式遵循 practice.tsx/QuizRunner.tsx 既有风格：colors.card / colors.border / borderRadius 6-12）：

```tsx
// 首字母转练：选字母 → 快速浏览（纯浏览，可跳过）→ 释义选择 → 单词默写 → 完成汇总。
// 练习阶段可经 skipTool 一键跳过尚未作答的已掌握单词（口径 repetitions >= 3）。
// 与 lib/firstLetter.ts 配对；词表在进入阶段时冻结，过滤只经 skipTool 剔除题目。
import { repo } from '@/lib/data';
import type { UserWordProgress, Word } from '@/lib/data';
import { countWordsByLetter, pickMasteredIds, wordsStartingWith } from '@/lib/firstLetter';
import { getLanguageByCode } from '@/lib/languages';
import { useSession } from '@/components/SessionProvider';
import QuizRunner from '@/components/QuizRunner';
import FlashCard from '@/components/FlashCard';
import useColors from '@/components/useColors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ENGLISH = getLanguageByCode('en');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

type TrainerStage = 'pick' | 'review' | 'choice' | 'dictation' | 'done';
interface StageScore { correct: number; total: number }

export default function FirstLetterTrainer({ onExit }: { onExit: () => void }) {
  const colors = useColors();
  const { user, wordbook } = useSession();
  const [words, setWords] = useState<Word[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<TrainerStage>('pick');
  const [letter, setLetter] = useState<string | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [choiceWordIds, setChoiceWordIds] = useState<string[]>([]);
  const [dictationWordIds, setDictationWordIds] = useState<string[]>([]);
  const [choiceScore, setChoiceScore] = useState<StageScore | null>(null);
  const [dictationScore, setDictationScore] = useState<StageScore | null>(null);
  // 同步累积的剔除集：阶段切换到下一段时需读取最新值，state 异步不可靠
  const skippedRef = useRef<Set<string>>(new Set());

  const loadWords = useCallback(async () => {
    if (!user || !wordbook) {
      setLoadError('请先登录并选择词本');
      return;
    }
    setLoadError(null);
    setWords(null);
    try {
      setWords(await repo.getWordsByWordbook(wordbook.id));
    } catch {
      setLoadError('词表加载失败，请重试');
    }
  }, [user, wordbook]);

  useEffect(() => { loadWords(); }, [loadWords]);

  const counts = useMemo(() => countWordsByLetter(words ?? []), [words]);
  const letterWords = useMemo(
    () => (letter ? wordsStartingWith(words ?? [], letter) : []),
    [words, letter],
  );

  const resetSkipped = () => {
    skippedRef.current = new Set();
    setSkippedIds(new Set());
  };

  const startLetter = (l: string) => {
    resetSkipped();
    setLetter(l);
    setReviewIdx(0);
    setChoiceScore(null);
    setDictationScore(null);
    setStage('review');
  };

  const backToPick = () => {
    setStage('pick');
    setLetter(null);
    resetSkipped();
  };

  // skipTool.resolve：实时读进度判定已掌握，累积到 skippedRef 供后续阶段剔除
  const resolveRemaining = useCallback(async (remainingWordIds: string[]): Promise<string[]> => {
    if (!user || !wordbook) return [];
    const pairs: { id: string; progress: UserWordProgress | null }[] = [];
    for (const id of remainingWordIds) {
      pairs.push({ id, progress: await repo.getProgress(user.id, wordbook.id, id) });
    }
    const mastered = pickMasteredIds(pairs);
    if (mastered.length > 0) {
      const next = new Set(skippedRef.current);
      for (const id of mastered) next.add(id);
      skippedRef.current = next;
      setSkippedIds(next);
    }
    return mastered;
  }, [user, wordbook]);

  const remainingIds = () =>
    letterWords.filter((w) => !skippedRef.current.has(w.id)).map((w) => w.id);

  const beginPractice = () => {
    const ids = remainingIds();
    if (ids.length === 0) { setStage('done'); return; }
    setChoiceWordIds(ids);
    setStage('choice');
  };

  const afterChoice = (correct: number, total: number) => {
    setChoiceScore({ correct, total });
    const ids = remainingIds();
    if (ids.length === 0) { setStage('done'); return; }
    setDictationWordIds(ids);
    setStage('dictation');
  };

  const afterDictation = (correct: number, total: number) => {
    setDictationScore({ correct, total });
    setStage('done');
  };

  // ===== 加载/错误 =====
  if (loadError) { /* 错误文案 + 重试(TouchableOpacity onPress={loadWords}) + 返回(onExit) */ }
  if (words == null) { /* ActivityIndicator */ }

  // ===== 字母选择 =====
  if (stage === 'pick') {
    // 顶部：返回(onExit) | 标题「首字母转练」| 右侧占位
    // 提示：「选择首字母，先快速浏览，再集中练选择与默写」
    // ScrollView 内 letterGrid：[...LETTERS, counts.get('#') ? '#' : null 过滤]
    //   每格 letterCell：字母 + 词数；count===0 时 disabled + opacity 0.35
    //   onPress={() => startLetter(l)}
  }

  // ===== 快速浏览 =====
  if (stage === 'review') {
    const current = letterWords[reviewIdx];
    if (!current) { /* 防御：空状态 + 返回按钮(backToPick) */ }
    const isLast = reviewIdx + 1 >= letterWords.length;
    // 顶部：返回(backToPick) | 「快速浏览 · {letter}」| 「跳过复习」(beginPractice)
    // 进度文案：第 {reviewIdx + 1} / {letterWords.length} 词
    // ScrollView 内 <FlashCard key={current.id} word={current} language={ENGLISH} />
    // 底部导航：上一词(disabled={reviewIdx===0}, setReviewIdx-1) | isLast ? 「开始练习」(beginPractice) : 「下一词」(setReviewIdx+1)
  }

  // ===== 选择 / 默写 =====
  if (stage === 'choice' || stage === 'dictation') {
    const isChoice = stage === 'choice';
    return (
      <View style={styles.root}>
        <Text style={[styles.stageTitle, { color: colors.text }]}>
          {isChoice ? '释义选择' : '单词默写'} · {letter}
        </Text>
        <QuizRunner
          key={isChoice ? 'first-letter-choice' : 'first-letter-dictation'}
          range="custom"
          opts={{ wordIds: isChoice ? choiceWordIds : dictationWordIds }}
          types={[isChoice ? 'choice' : 'dictation']}
          skipTool={{ label: '跳过已掌握', resolve: resolveRemaining }}
          onExit={(correct, total) => {
            if (correct === undefined) { backToPick(); return; }
            if (isChoice) afterChoice(correct, total ?? 0);
            else afterDictation(correct, total ?? 0);
          }}
        />
      </View>
    );
  }

  // ===== 完成汇总 =====
  // 标题「首字母 {letter} 训练完成」
  // choiceScore / dictationScore 两行：文案 + 正确率（correct/total + 百分比）
  // 三个按钮：「再练本字母」startLetter(letter!) | 「换个字母」setStage('pick') | 「返回练习」onExit
}
```

样式键（StyleSheet）：`root`（flex:1）、`topBar`（row/space-between/padding 20/16）、`backBtn`、`backText`、`title`、`topRightSpacer`、`hint`、`gridContent`、`letterGrid`（row/wrap/gap 10）、`letterCell`（5 列：flexBasis '17%'，aspectRatio 1，borderWidth 1，radius 8，居中）、`letterText`（18/700）、`letterCount`（11）、`progress`、`reviewBody`、`reviewNav`（row/space-between/gap 12）、`navBtn`、`navBtnPrimary`、`navText`、`stageTitle`、`doneBody`、`doneTitle`、`scoreCard`、`scoreLabel`、`scoreValue`、`doneBtn`、`doneBtnPrimary`。

- [ ] **步骤 2：验证**

运行：`./node_modules/.bin/tsc --noEmit`
预期：通过。

- [ ] **步骤 3：Commit**

```bash
git add components/FirstLetterTrainer.tsx
git commit -m "feat: FirstLetterTrainer 组件——选字母/快速浏览/选择/默写四段式流程"
```

---

### 任务 5：练习页接入入口

**文件：**
- 修改：`app/(tabs)/practice.tsx`

- [ ] **步骤 1：接入模式与入口卡片**

1. `type Mode = 'menu' | 'quiz';` → `type Mode = 'menu' | 'quiz' | 'letters';`
2. import 区新增：`import FirstLetterTrainer from '@/components/FirstLetterTrainer';`
3. 在 `if (mode === 'quiz')` 分支之后新增：

```tsx
  if (mode === 'letters') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.contentCol}>
          <FirstLetterTrainer onExit={() => setMode('menu')} />
        </View>
      </View>
    );
  }
```

4. menu 视图 `ScrollView > scrollContent` 的最顶部（`scopeHint` 之前）新增入口卡片：

```tsx
        <TouchableOpacity
          style={[styles.letterEntry, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setMode('letters')}
          activeOpacity={0.8}
        >
          <View style={[styles.typeIconWrap, { backgroundColor: colors.tint + '22' }]}>
            <FontAwesome name="sort-alpha-asc" size={20} color={colors.tint} />
          </View>
          <View style={styles.letterEntryMain}>
            <Text style={[styles.letterEntryTitle, { color: colors.text }]}>首字母转练</Text>
            <Text style={[styles.letterEntryDesc, { color: colors.subtitle }]}>
              选一个字母，快速浏览后集中练选择与默写
            </Text>
          </View>
          <FontAwesome name="chevron-right" size={13} color={colors.subtitle} />
        </TouchableOpacity>
```

5. styles 新增：

```ts
  letterEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    marginBottom: 18,
  },
  letterEntryMain: { flex: 1 },
  letterEntryTitle: { fontSize: 15, fontWeight: '700' },
  letterEntryDesc: { fontSize: 12, marginTop: 3 },
```

- [ ] **步骤 2：验证**

运行：`./node_modules/.bin/tsc --noEmit`
预期：通过。

- [ ] **步骤 3：Commit**

```bash
git add "app/(tabs)/practice.tsx"
git commit -m "feat: 练习页接入首字母转练入口与页内模式"
```

---

### 任务 6：全量验证与收尾

- [ ] **步骤 1：类型检查与单测**

```bash
./node_modules/.bin/tsc --noEmit
node_modules/.bin/tsx lib/__tests__/firstLetter.test.ts
node_modules/.bin/tsx components/__tests__/ui-regressions.test.ts
node_modules/.bin/tsx lib/data/__tests__/weak.test.ts
```
预期：全部通过。

- [ ] **步骤 2：本地 web 预览手动全流程**

运行：`npx expo start --web`（AI 主动启动并把网址给用户），验证：
1. 练习页顶部出现「首字母转练」入口。
2. 字母网格：有词的字母可点并显示词数，无词灰显。
3. 浏览：翻面/发音/上一词/下一词/跳过复习。
4. 选择：答题判定正常；「跳过已掌握」点击后未作答的已掌握题被剔除、提示文案正确；跨阶段生效（选择阶段剔除的词不再出现在默写）。
5. 默写完成后出现汇总页，三个按钮行为正确。
6. 中途退出（返回确认）回到字母网格。
7. 手机窄屏布局不溢出。

- [ ] **步骤 3：提交并合并**

```bash
git add -A && git commit -m "feat: 首字母转练功能完成"
git checkout main && git merge feature/first-letter-practice
```

部署与否询问用户（HANDOFF 铁律 2：服务器写操作必须显式确认）。

- [ ] **步骤 4：更新 HANDOFF.md**

在 HANDOFF.md 增加小节：功能说明、验证结果、部署状态（未部署/已部署）。
