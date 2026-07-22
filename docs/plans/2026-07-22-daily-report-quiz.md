# 实现计划：今日报告 + 每日新词上限 + 测试模块 + 复习功能

> 日期：2026-07-22
> 阶段：Phase 2 — Writing Plans（基于已批准的设计文档）
> 分支：`feature/daily-report-quiz`
> 策略：本地优先（Local-first）。设置/计数先本地 AsyncStorage 实现，DAL 接口抽象，将来换云端 HttpRepo 不碰业务/UI。
> 铁律：**任何服务器写操作（migrate study_logs 加字段 / 加 user_settings 表 / 部署）必须先单独确认**。

---

## 总体任务分组

- **P1** 修 StudyLog 断点 + 今日报告
- **P2** 每日新词上限（设置 + 计数 + 选词闸门）
- **P3** 测试模块（题目生成 + 范围 + 结果映射 + 练习 Tab 测试区块）
- **P4** 复习功能（最近 N 天取词 + 翻卡 + 练习 Tab 复习区块）

每个任务 TDD：写失败测试 → 看失败 → 实现 → 看通过 → 提交。

---

## P1：修断点 + 今日报告

### T1 接通 StudyLog 上报（修断点）
- 文件：`app/(tabs)/index.tsx` 的 `handleGrade`
- 改动：评分后调用 `postStudyLogs([{ wordbookId: wordbook.id, wordId: word.id, grade, ts: Date.now() }])`
- 本地模式：`postStudyLogs` 经 `repo` 写（需给 Repository 加 `addStudyLog` / `listStudyLogs`，见 T2）
- 测试：`lib/data/__tests__/studylog.test.ts` — 验证 `handleGrade` 路径调用了 `postStudyLogs`（用 memoryRepo + spy）；验证云端 `httpRepo.postStudyLogs` 发起 POST。
- 提交。

### T2 学习日志读写（Repository 扩展）
- `repo.ts` 加：`addStudyLog(log)`、`listStudyLogs(userId, wordbookId?, opts?)`（opts: `{ sinceTs?, source?, isNew? }`）
- `memoryRepo.ts` / `asyncStorageRepo.ts` 实现（本地结构含 `source`/`isNew` 字段）
- `httpRepo.ts`：本地先 no-op 占位（云端真实实现留待 migrate 后；但 `postStudyLogs` 已存在，确保调用）
- 测试：`studylog.test.ts` — 写后查、按 sinceTs 过滤、按 source 过滤。
- 提交。

### T3 今日统计视图
- `lib/data/stats.ts` 加 `getTodayStats(repo, userId, wordbookId, now)` → `{ studied, mastered, accuracy, details: [{word, grade, ts}] }`
  - studied = 今日 studylog 去重词数
  - accuracy = 今日 Good/Easy 占比（Again/Hard 计未掌握）
  - details = 今日各词最后评级 + 时间
- 测试：`today-stats.test.ts` — 空为0；注入今日若干 log 验证计数/正确率/明细。
- 提交。

### T4 统计页今日报告 UI
- `app/(tabs)/stats.tsx` 加「今日」区块（今日学习数 / 今日掌握率进度条 / 今日词明细列表）。
- tsc + 手动校验（http://localhost:19006）。
- 提交。

---

## P2：每日新词上限

### T5 每日上限设置（本地 + 接口）
- `session.ts` 或新建 `lib/data/settings.ts`：`getDailyNewWordGoal(userId)` / `setDailyNewWordGoal(userId, n)`，AsyncStorage key `wb_daily_goal_{userId}`，默认 20。
- 后端：留 `UserSettings` 表待 migrate（本地优先阶段不做云端）。
- 测试：`settings.test.ts` — 默认20；设置后读回；按 user 隔离。
- 提交。

### T6 今日新词计数 + 选词闸门
- `lib/data/quiz.ts`：`getNextQuizWord` 增参 `dailyNewWordGoal`、`todayNewCount`，新词分支前判断 `todayNewCount >= dailyNewWordGoal` 则跳过新词（只走到期复习）。
- 今日新词计数：`getTodayNewWordCount(repo, userId, wordbookId, now)` — 基于 studylog `isNew=true` 今日计数（本地结构）；若未记 isNew 则退化为 progress 今日首次。
- `handleGrade`：学新词时 `addStudyLog(..., {isNew:true})`（首次）。
- 测试：`quiz-daily-cap.test.ts` — 达上限后不再出新词、仍出到期复习词；todayNewCount 正确累加。
- 提交。

### T7 「我的」页设置 UI
- `app/(tabs)/profile.tsx`（或新建）加「每日新词目标」输入（数字，全局），存 `setDailyNewWordGoal`。
- tsc + 手动校验。
- 提交。

---

## P3：测试模块

### T8 题目生成 + 范围选择
- 新建 `lib/quizgen.ts`：
  - `genDictation(words)`：看 translation 写 word
  - `genChoice(words, word)`：看 word 四选一选 translation（3 干扰取自同词本）
  - `genPhrase(words)`：看 phrase meaning 写整组词组（提示每词长度）
  - `pickRange(repo, userId, wordbookId, range, opts)`：范围 ①全部 ②薄弱词 ③最近N天 ④自选
- 测试：`quizgen.test.ts` — 选择题干扰不含答案；词组提示长度匹配；范围筛选正确。
- 提交。

### T9 测试流程 + 结果映射
- 新建 `app/(practice)/quiz-run.tsx`（或 `components/QuizRunner.tsx`）：逐题作答 → 结束给正确率 + 逐题回顾。
- 结果映射（复用 `reviewWord`）：对=Good(2)、错=Again(0)；词组整组对才对。
- 每题完成调用 `reviewWord` + `addStudyLog(..., {source:'quiz'})`。
- 测试：`quiz-run` 逻辑测试（映射正确、studylog source=quiz）。
- 提交。

### T10 「练习」Tab — 测试区块 UI
- 新建 `app/(tabs)/practice.tsx`：两个区块「每日测试」「复习」。
- 测试区块：选范围 → 选题型（默写/选择/词组，可多选）→ 启动 `QuizRunner`。
- 注册到 `_layout.tsx`（新增「练习」Tab）。
- tsc + 手动校验。
- 提交。

---

## P4：复习功能

### T11 最近 N 天取词 + 翻卡
- `lib/data/review-scope.ts`：`getRecentWords(repo, userId, wordbookId, days, now)` — progress 中 `lastReviewTs` 落在 `[now-days*day, now]`。
- `app/(practice)/review-run.tsx`：翻卡（复用 `FlashCard`）+ 四档评分，复用 `reviewWord` + `addStudyLog(...,{source:'review'})`。
- 测试：`review-scope.test.ts` — N 天窗口过滤正确；边界。
- 提交。

### T12 「练习」Tab — 复习区块 UI
- `practice.tsx` 复习区块：选 N（7/14/30）→ 启动 `review-run`。
- 注册 Tab 已在 T10 完成，此处补复习入口。
- tsc + 手动校验（http://localhost:19006）+ `expo export` 验证打包。
- 提交。

---

## 收尾
- 全量 `tsc --noEmit` 0 错误 + 全部 `__tests__` 绿。
- dev server HTTP 200 手动走查（学新词达上限/今日报告/测试三种题型/复习翻卡）。
- 写/更新 HANDOFF.md（新增 4 功能说明 + 待 migrate 项）。
- 进入 Phase 5：merge 本地 / 推 PR / 部署（部署需确认）。

---

## 服务器写操作清单（实现时单独确认，不擅自动）
- `study_logs` 加 `source`、`is_new` 字段（若云端要精确统计）。
- 新增 `user_settings` 表（每日上限云端同步）。
- 部署到 `learning.yusuan.xyz`。
