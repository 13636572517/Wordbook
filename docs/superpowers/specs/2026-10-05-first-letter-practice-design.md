# 首字母转练设计

## 目标

在练习 Tab 新增「首字母转练」：学员选择一个首字母后，按 A-Z 顺序快速浏览该字母的全部单词（纯浏览、可跳过），随后连续完成「释义选择」与「单词默写」两个练习阶段；练习过程中可一键跳过尚未作答的已掌握单词。

## 范围

- 词池为当前词本中该首字母开头的全部单词（含未学过）。
- 不做数量截断；训练量由「跳过复习」与「跳过已掌握」两个按钮自然控制。
- 浏览阶段不写任何学习进度；练习阶段作答照常写入 SM-2 进度与学习日志（source='quiz'）。
- 入口位于练习页，流程全程在练习页内以模式切换完成，不新增路由。

## 术语与口径

- **已掌握**：`repetitions >= 3`，与数据页「已掌握」统计同口径（lib/data/stats.ts 的 MASTERED_REPETITIONS）。
- **首字母分组**：单词首字符大写后若在 A-Z 内取该字母，否则归入 `#`。网格展示 A-Z，`#` 组有词时同样展示且可训练。

## 用户流程

1. 练习页顶部新增「首字母转练」入口卡片，点击进入字母选择视图（不影响下方现有范围/题型配置）。
2. 字母选择：A-Z 网格 + `#`（有词时），每格显示字母与该字母下的单词数；无单词的字母灰显禁用；顶部返回按钮回练习菜单。
3. 快速浏览：按字母序逐个浏览单词闪卡（正面单词、点击翻面+发音，背面读音/释义/例句/词组），底部「上一词/下一词」，顶部显示进度与「跳过复习」按钮。
4. 释义选择：浏览完（或跳过后）自动进入；四选一选释义，题目打乱顺序。
5. 单词默写：选择阶段完成后自动进入；看释义拼写单词。
6. 完成汇总：显示两阶段正确率，提供「再练本字母」「换个字母」「返回练习」。

## 跳过已掌握

- 位置：选择与默写两个阶段的顶部工具栏均提供「跳过已掌握」按钮。
- 判定：点击时实时读取每个「尚未作答」词的当前进度，`repetitions >= 3` 视为已掌握。
- 影响面：仅剔除尚未作答的题目（当前正在作答的题不受影响）；剔除结果累积保存，后续阶段不再出现这些词。
- 反馈：「已跳过 N 个已掌握单词」；无可跳过时提示「当前没有已掌握的单词」。
- 中途退出（题目页返回按钮确认退出）回字母选择视图，并重置本次剔除累积。

## 技术设计

### 模块划分

| 文件 | 职责 |
| --- | --- |
| lib/firstLetter.ts（新增） | 纯逻辑：字母分组、按字母过滤、已掌握判定与筛选，可单测。 |
| components/FirstLetterTrainer.tsx（新增） | 四段式流程编排（pick/review/choice/dictation/done）+ 字母网格、浏览卡片流视图。 |
| components/QuizRunner.tsx（增强） | 新增可选 `skipTool` 属性：工具栏「跳过已掌握」按钮，响应式从未作答题中剔除指定单词的题目；不传时行为完全不变。 |
| lib/data/stats.ts（微改） | 导出既有常量 `MASTERED_REPETITIONS`（值 3）供复用。 |
| components/StudentProgressParts.tsx（微改） | `letterOf` 迁移至 lib/firstLetter.ts 并改为导入，避免两处字母判定漂移。 |
| app/(tabs)/practice.tsx（改） | Mode 增加 'letters'；菜单顶部新增入口卡片；渲染 FirstLetterTrainer。 |

### lib/firstLetter.ts 接口

- `letterOf(word: string): string` — 首字母分组（A-Z，否则 `#`）。
- `countWordsByLetter(words: Word[]): Map<string, number>` — 各字母词数，供网格展示。
- `wordsStartingWith(words: Word[], letter: string): Word[]` — 按字母过滤并按 localeCompare 排序。
- `isMastered(p: UserWordProgress | null): boolean` — repetitions >= 3。
- `pickMasteredIds(pairs: { id: string; progress: UserWordProgress | null }[]): string[]` — 从候选中筛出已掌握的 id。

### QuizRunner.skipTool

```ts
skipTool?: {
  label: string;
  /** 传入尚未作答的词 id（去重），返回应剔除的词 id */
  resolve: (remainingWordIds: string[]) => Promise<string[]>;
  onResult?: (removed: number, remaining: number) => void;
};
```

- 点击按钮 → 收集 `questions.slice(idx + 1)` 的去重 word id → `await resolve(ids)` → 从题目池过滤掉这些词且索引大于当前 idx 的题目（idx 不变，已答题目与当前题不受影响）。
- 剔除后剩余题目不足时，当前题答毕经既有 `handleNext` 逻辑自然进入完成页。
- 结果以页内提示条反馈，数秒后自动消失。

### FirstLetterTrainer 状态

- 数据加载：挂载时 `repo.getWordsByWordbook` 一次；失败显示错误与重试。
- `view: 'pick' | 'review' | 'choice' | 'dictation' | 'done'`。
- `letter`、`reviewIdx`、`skippedIds`（Ref 同步累积 + state 触发渲染）、两阶段成绩。
- 阶段词表：`letterWords - skippedIds`；进入选择阶段若为空则跳过该阶段（防御，正常流程不出现）。
- `resolve` 实现：逐个 `repo.getProgress` 判定已掌握，同步写入 skippedIds（Ref），返回剔除 id。
- 每次重新开始（选字母 / 再练本字母）重置 skippedIds 与成绩。

### 数据流与进度写入

- 浏览：无任何写入。
- 选择/默写：复用 QuizRunner 现有 `recordGrade` 路径（`reviewWord` + study log source='quiz'，activityType 自动记录题型），无需新写入逻辑。
- 云端进度缓存：`setProgress` 落库后失效缓存，过滤判定可读到最新进度。

## 边界与错误处理

- 词本无单词 / 该字母无词：对应字母灰显禁用。
- 加载失败：错误提示 + 重试。
- 跳过按钮无可剔除：轻提示，不影响作答。
- 中途退出：回字母选择；已写入的作答记录保留。
- 宽屏：沿用 Layout.maxContentWidth 限宽。

## 测试

- 单测 `lib/__tests__/firstLetter.test.ts`：
  - letterOf：普通 / 大写 / 数字 / 空串 / 中文
  - countWordsByLetter：统计与边界
  - wordsStartingWith：过滤与排序
  - isMastered：repetitions 2 / 3 / null
  - pickMasteredIds：混合输入只返回已掌握
- `tsc --noEmit` 类型检查。
- 本地 web 预览手动全流程：选字母 → 浏览（翻面/发音/跳过）→ 选择（答对答错/跳过已掌握/跨阶段生效）→ 默写 → 完成汇总 → 再练/换字母。

## 设计决策记录

- 不做数量截断：以「跳过已掌握」控制训练量（用户明确选择）。
- 已掌握口径复用 `repetitions >= 3`（用户可见统计口径），不采用教师端薄弱词的严格口径（reps>=2 且 EF>=2.5 且 interval>=21）。
- 练习阶段题目打乱（防顺序记忆）；浏览阶段保持字母序。
- 浏览不自动发音，点击卡片时发音（沿用 FlashCard 行为）。
- 完成页三个操作按钮：再练本字母 / 换个字母 / 返回练习。
