# 「进度」Tab 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将「薄弱词」Tab 升级为「进度」Tab：总体进度 / 需加强的词（一键专项复习与练习）/ 规则化学习建议（含目标日期倒推的未来学习量规划）。

**架构：** 纯前端聚合（复用 getWordbookStats / getWeakWordIds / listStudyLogs / 进度缓存），建议由纯函数规则引擎 `lib/progressAdvice.ts` 生成；专项训练以页内全屏覆盖层复用 FlashCard 与 QuizRunner（`range='custom'` + `opts.wordIds`）。唯一后端改动：UserSettings 新增 target_finish_date。

**技术栈：** Expo Router + React Native Web、TypeScript、Django REST（后端加字段）、tsx 跑纯逻辑测试（`node_modules/.bin/tsx lib/data/__tests__/x.test.ts`）。

**规格：** `docs/superpowers/specs/2026-08-11-progress-tab-design.md`

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `lib/todayCounts.ts` | 今日新词/复习/练习计数（单次 listStudyLogs 分类统计） |
| 新建 | `lib/progressAdvice.ts` | 建议规则引擎（纯函数） |
| 新建 | `app/(tabs)/progress.tsx` | 进度页（三卡片 + 训练覆盖层） |
| 删除 | `app/(tabs)/weak.tsx` | 被 progress.tsx 取代 |
| 修改 | `app/(tabs)/_layout.tsx` | Tab 名 weak→progress，标题「进度」 |
| 修改 | `lib/data/settings.ts` | DailySettings 增加 targetFinishDate |
| 修改 | `lib/data/httpRepo.ts` | fetch/updateDailySettings 映射 target_finish_date |
| 修改 | `app/(tabs)/profile.tsx` | 目标完成日期设置 UI |
| 后端 | `apps/vocab/models.py` + `serializers.py` + migration | UserSettings.target_finish_date |

---

### 任务 1：后端 target_finish_date 字段

**文件：** 服务器 `/opt/learning/backend/apps/vocab/models.py`（UserSettings 在 192 行附近）、`serializers.py`

- [ ] **步骤 1：** models.py UserSettings 加 `target_finish_date = models.DateField(null=True, blank=True)`
- [ ] **步骤 2：** UserSettings 相关 serializer fields 加 `target_finish_date`；确认 UserSettingsView GET/POST 透传（该 view 若逐字段白名单需补）
- [ ] **步骤 3：** `python manage.py makemigrations vocab && python manage.py migrate`
- [ ] **步骤 4：** `systemctl restart learning`，用 curl 验证 `/api/settings/` 返回含 `target_finish_date: null`

### 任务 2：lib/todayCounts.ts（TDD）

**文件：** 新建 `lib/todayCounts.ts`、测试 `lib/data/__tests__/today-counts.test.ts`

- [ ] **步骤 1：写失败测试**（memoryRepo 造 study logs：study/isNew、review、quiz 三类，跨日数据不计入）
- [ ] **步骤 2：** `node_modules/.bin/tsx lib/data/__tests__/today-counts.test.ts` 确认 FAIL
- [ ] **步骤 3：实现**
```ts
export interface TodayCounts { newWords: number; reviewWords: number; quizCount: number }
export async function getTodayCounts(repo, userId, wordbookId, now): Promise<TodayCounts>
// listStudyLogs(sinceTs=startOfDayTs(now))：
// newWords = isNew 日志按 wordId 去重数；reviewWords = source=review 按 wordId 去重数；quizCount = source=quiz 条数
```
- [ ] **步骤 4：** 测试通过，commit

### 任务 3：lib/progressAdvice.ts（TDD）

**文件：** 新建 `lib/progressAdvice.ts`、测试 `lib/data/__tests__/progress-advice.test.ts`

- [ ] **步骤 1：写失败测试**，覆盖 5 条规则：到期提醒、薄弱词加练、目标日期倒推、无目标日期按均速、复习高峰预警、全绿状态
- [ ] **步骤 2：** 确认 FAIL
- [ ] **步骤 3：实现** `buildAdvice(input): AdviceItem[]`，输入：
```ts
interface AdviceInput {
  dueNow: number; weakCount: number;
  remainingNew: number;              // 词本剩余未学词数
  targetFinishDate: string | null;   // ISO yyyy-mm-dd
  avgDailyNew7d: number;             // 近7天新词均速
  dueNext3Days: number[];            // [明天, 后天, 大后天] 到期数
  now: number;
}
```
  规则与文案按规格 §5；目标日期倒推：`perDay = ceil(remainingNew / daysLeft)`，daysLeft<=0 时提示「目标日期已过，剩余 N 词」
- [ ] **步骤 4：** 测试通过，commit

### 任务 4：settings 增加 targetFinishDate（TDD）

**文件：** `lib/data/settings.ts`、`lib/data/httpRepo.ts`、测试并入 `settings.test.ts`

- [ ] **步骤 1：写失败测试**：set 后 get 回显；null 可清空；非法值回退 null
- [ ] **步骤 2：** DailySettings 加 `targetFinishDate: string | null`（默认 null）；normalizeSettings 校验 `/^\d{4}-\d{2}-\d{2}$/` 否则 null
- [ ] **步骤 3：** httpRepo fetchDailySettings/updateDailySettings 映射 `target_finish_date`
- [ ] **步骤 4：** 测试通过，commit

### 任务 5：progress.tsx 页面（核心）

**文件：** 新建 `app/(tabs)/progress.tsx`，删除 `app/(tabs)/weak.tsx`

- [ ] **步骤 1：** `git mv app/\(tabs\)/weak.tsx app/\(tabs\)/progress.tsx`
- [ ] **步骤 2：数据加载** `load()`：并行取 `getWordbookStats`、`getWeakWordIds`、`getTodayCounts`、`getDailySettings`、近7天新词日志（算均速）、进度全量（算 dueNext3Days 与薄弱词明细 correct/wrong）
- [ ] **步骤 3：卡片①总体进度**：进度条（已学/总数%）、已掌握/学习中/待复习、今日新词 x/目标、今日复习、今日练习、streak
- [ ] **步骤 4：卡片②需加强的词**：列表项含「错 N 次 / 错误率 X%」标签；保留展开释义 UI；顶部「专项复习」「专项练习」按钮
- [ ] **步骤 5：训练覆盖层**：
  - `training='review'`：全屏闪卡循环（镜像 practice.tsx review 模式：`reviewWord` + `postStudyLogs(source=review)` + 4 档评分），做完显示完成提示
  - `training='quiz'`：`<QuizRunner range="custom" opts={{ wordIds: weakIds }} types={['dictation','choice','sentence-choice']} limit={min(weakIds.length*2, 20)} onExit={返回并刷新} />`
  - 退出/完成后 `load()` 刷新三卡片
- [ ] **步骤 6：卡片③建议**：`buildAdvice` 结果逐条渲染；action=review/practice 的条目可点击触发对应训练层
- [ ] **步骤 7：** `tsc --noEmit` 通过，commit

### 任务 6：Tab 标题 + 设置页 UI

**文件：** `app/(tabs)/_layout.tsx`、`app/(tabs)/profile.tsx`

- [ ] **步骤 1：** _layout.tsx：`name="weak"` → `name="progress"`，title「薄弱词」→「进度」
- [ ] **步骤 2：** profile.tsx 学习设置区加「目标完成日期」：TextInput（yyyy-mm-dd）+ 清除按钮，失焦时校验并 `setDailySettings({ targetFinishDate })`
- [ ] **步骤 3：** 全局 grep `weak` 清理残留引用（router.push('/weak') 等），tsc 通过，commit

### 任务 7：集成部署 + HANDOFF

- [ ] **步骤 1：** feature/progress-tab merge 到 main，push
- [ ] **步骤 2：** 服务器 `git pull && bash deploy.sh`（前端），后端已在任务1部署
- [ ] **步骤 3：** 生产验证：admin 打开「进度」Tab，确认三卡片数据正确、专项复习/练习可进入、建议文案随数据变化
- [ ] **步骤 4：** 更新 HANDOFF.md（新章节 + 最近提交）
