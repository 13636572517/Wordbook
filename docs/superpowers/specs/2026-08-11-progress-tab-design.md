# 「进度」Tab 设计规格（替换薄弱词）

> 状态：已获用户确认（方案 A）
> 日期：2026-08-11
> 分支：feature/progress-tab

## 1. 背景与目标

现有「薄弱词」Tab 仅展示薄弱词列表 + 重练入口，信息单一。将其升级为「进度」Tab，
为学员提供个人化学习分析：总体进度、需加强的词（可一键专项复习/练习）、以及基于
规则引擎生成的学习建议（含未来几天学习量规划）。

**决策记录**：
- 方案 A：单页滚动 + 页内训练覆盖层（复用 FlashCard / QuizRunner）
- 建议板块由前端规则模板生成（非 LLM），零外部依赖、可快速迭代
- 统计范围：仅当前选中词本
- 学习量规则：目标日期倒推（设置页新增「目标完成日期」；未设置则按近 7 天均速推算）
- 专项训练：页内全屏直接开始，做完返回本页并刷新

## 2. 页面结构

- 路由文件 `app/(tabs)/weak.tsx` 重命名为 `progress.tsx`
- Tab 标题「薄弱词」→「进度」（改 `app/(tabs)/_layout.tsx`），图标保留
- 单滚动视图，三张卡片自上而下：① 总体进度 → ② 需加强的词 → ③ 建议

数据全部复用现有接口，无新增网络请求类型：
`getWordbookStats`、`getWeakWordIds`、`listStudyLogs`、`getTodayNewWordCount`、进度批量缓存。

## 3. 卡片 ①：总体进度

| 展示项 | 数据源 |
|--------|--------|
| 词本进度条：已学 X/总数 N（百分比） | `stats.total - stats.newCount` |
| 已掌握 / 学习中 / 待复习 三个数字 | `stats.mastered` / `stats.learning` / `stats.due` |
| 今日新词 x/目标 | `getTodayNewWordCount` + `getDailyNewWordGoal` |
| 今日复习 x 词 | study logs `source=review` 当日去重计数 |
| 今日练习 x 题 | study logs `source=quiz` 当日计数 |
| 连续学习 streak 天 | `stats.streak` |

新增 `lib/todayCounts.ts`：
```ts
export interface TodayCounts { newWords: number; reviewWords: number; quizCount: number }
export async function getTodayCounts(repo, userId, wordbookId, now): Promise<TodayCounts>
```
一次 `listStudyLogs(sinceTs=今日0点)` 后按 `source` / `isNew` 分类统计。

## 4. 卡片 ②：需加强的词

- 复用 `getWeakWordIds`（错误率>=34% / EF<1.8 / 30天内练习错>=2次）
- 列表项：单词 + 释义 + 标签（「错 N 次」「错误率 X%」），可展开释义/词组/例句（保留现有展开 UI）
- 卡片顶部两个按钮：
  - **专项复习**：页内全屏闪卡（复用 `FlashCard` + SM-2 评分 `reviewWord`），评分写回进度并上报 study log（source=review）
  - **专项练习**：页内全屏测验（复用 `QuizRunner`，默写+选择+例句选择混合，干扰项取词本内词），做完显示成绩
- 训练层为页面内全屏覆盖状态（`training: 'review' | 'quiz' | null`），退出后 `load()` 刷新
- 薄弱词为 0 时显示空状态「暂无薄弱词，继续保持」

## 5. 卡片 ③：建议（规则引擎）

新建 `lib/progressAdvice.ts`，纯函数，输入聚合数据、输出建议条目数组：

```ts
export interface AdviceItem {
  kind: 'due' | 'weak' | 'plan' | 'peak' | 'good';
  text: string;          // 展示文案
  action?: 'review' | 'practice';  // 可点击触发的动作（可选）
}
export function buildAdvice(input: AdviceInput): AdviceItem[]
```

规则（按优先级）：
1. **到期提醒**：`due > 0` → 「先完成 N 个到期词复习」，action=review
2. **薄弱词加练**：薄弱词数 M > 0 → 「建议专项练习 M 个薄弱词」，action=practice
3. **学习量规划**：
   - 已设目标日期：每日建议新词 = ceil(剩余未学词数 / 剩余天数)；叠加明日到期复习量
     → 「建议每天新学 N 个 + 复习约 M 个，可在 MM-DD 完成词本」
   - 未设目标日期：按近 7 天实际新词均速 K 推算 → 「按当前节奏（日均 K 词），预计还需 D 天学完」
4. **复习高峰预警**：未来 3 天任一天到期词 > 50 → 「后天将有 M 词到期，建议今天新词控制在 K 个以内」
5. 无触发 → 「状态很好，保持节奏！」

未来到期曲线计算：遍历进度记录，统计 `due` 落在 `[now, now+3d]` 每天的词数。

## 6. 设置扩展：目标完成日期

- 后端 `UserSettings` 新增 `target_finish_date`（DateField, null=True），`/settings/` GET/POST 读写
- 前端 `lib/data/settings.ts` 新增 `getTargetFinishDate(userId)` / `setTargetFinishDate(userId, date|null)`
  （本地模式走 AsyncStorage，云端走 httpRepo `/settings/`）
- `profile.tsx` 设置区新增「目标完成日期」选择器（可清空）

## 7. 改动清单

| 操作 | 文件 |
|------|------|
| 新建 | `lib/progressAdvice.ts`（建议规则引擎） |
| 新建 | `lib/todayCounts.ts`（今日复习/练习统计） |
| 重命名+重写 | `app/(tabs)/weak.tsx` → `app/(tabs)/progress.tsx` |
| 修改 | `app/(tabs)/_layout.tsx`（Tab 标题） |
| 修改 | `lib/data/settings.ts`、`lib/data/httpRepo.ts`（目标日期读写） |
| 修改 | `app/(tabs)/profile.tsx`（目标日期设置 UI） |
| 后端 | `apps/vocab/models.py`、`serializers.py`、views `/settings/` + migration |

## 8. 实施顺序

1. 后端：`target_finish_date` 字段 + migration + 部署
2. 前端数据层：`todayCounts.ts`、`progressAdvice.ts`、settings 扩展
3. 页面：`progress.tsx` 三卡片 + 页内训练覆盖层
4. Tab 标题 + 设置页 UI
5. 集成验证（生产服务器）+ 更新 HANDOFF.md
