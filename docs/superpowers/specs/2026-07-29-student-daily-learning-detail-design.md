# 学员单日学习明细设计

## 目标

让教师或管理员从学员的每日进度列表进入某一天的学习详情，按单词聚合查看学习情况，并准确统计当天各练习题型的完成与正确情况。

## 范围

- 在教师端学员详情的“进度/正确率”列表中，让每个日期行可点击。
- 新建独立的学员单日详情页，而不是在长列表内展开或使用弹窗。
- 教师端日汇总和单日详情统一以 `grade >= 1` 为正确、`grade = 0` 为错误。
- 从本次上线起记录练习的具体题型；历史练习记录保留可见，但归类为“历史练习（题型未知）”。

## 用户流程

1. 教师打开某学员的详情页，保留现有词本筛选。
2. 在“进度/正确率”中点击某个日期。
3. 进入“学员名 / YYYY-MM-DD”详情页，沿用该词本筛选。
4. 顶部查看新词数、复习词数、总作答数、正确率。
5. 查看题型统计：默写、选择、词组默写、词组填空、例句选择、历史练习（题型未知）。每项包含题数、正确数和正确率。
6. 在按单词聚合的列表中查看单词、释义、学习/练习/复习次数、正确/错误次数、最后一次结果与最后活动时间。

## 数据设计

### StudyLog

为 `StudyLog` 新增可空字符串字段 `activity_type`，仅表示练习题型：

- `dictation`
- `choice`
- `phrase`
- `phrase-blank`
- `sentence-choice`

`study` 与旧的 `review` 记录不写题型。历史 `source='quiz'` 且 `activity_type IS NULL` 的记录聚合到“历史练习（题型未知）”。

前端 `QuizRunner` 在调用 `postStudyLogs` 时把当前题目的类型写入日志。学习页的巩固 `QuizRunner` 同样获得题型记录；非题型化学习记录保持空值。

### 聚合口径

- 单日范围使用本地日历日 `[00:00, 次日 00:00)`，与现有每日统计一致。
- 一个单词当日只占一行；`total` 是所有学习日志次数，`correct_count` 是 `grade >= 1` 的次数，`wrong_count` 是 `grade = 0` 的次数。
- `study_count`、`quiz_count`、`review_count` 依据 `source` 分别累计。
- `last_grade`、`last_source`、`last_ts` 取该词当天按时间排序的最后一条日志。
- 题型统计只统计 `source='quiz'` 的日志；空题型归入历史未知题型。

## API

新增只对教师或管理员开放的接口：

`GET /api/teacher/students/<user_id>/daily/<YYYY-MM-DD>/detail/?wordbook_id=`

响应结构：

```ts
{
  date: string;
  summary: {
    new_words: number;
    review_words: number;
    total_attempts: number;
    correct_attempts: number;
    correct_rate: number;
  };
  practice_types: Array<{
    activity_type: 'dictation' | 'choice' | 'phrase' | 'phrase-blank' | 'sentence-choice' | 'unknown';
    total: number;
    correct: number;
    correct_rate: number;
  }>;
  words: Array<{
    word_id: number;
    word: string;
    translation: string;
    total: number;
    study_count: number;
    quiz_count: number;
    review_count: number;
    correct_count: number;
    wrong_count: number;
    last_grade: number;
    last_source: 'study' | 'quiz' | 'review';
    last_ts: number;
  }>;
}
```

接口必须验证调用者是教师或管理员；词本筛选仅影响该词本内的日志。日期参数格式非法时返回 400。

## 前端设计

- `app/teacher/students/[id].tsx` 的日期行增加点击能力，路由传递学员 ID、日期和当前词本 ID。
- 新页 `app/teacher/students/[id]/daily/[date].tsx` 使用紧凑的运营型布局：返回按钮、标题、汇总数据、题型统计、单词表。
- 单词表按最后活动时间倒序，方便教师先看最近表现。
- 无记录、加载失败、权限不足都有明确状态；不会将空数据误呈现为学习完成。

## 测试

- 后端：题型字段的序列化与默认空值；新旧日志写入；详情接口的权限、日期边界、词本筛选、同词聚合、最后记录选择、正确率口径、未知题型归类。
- 前端：HTTP 映射正确；题型随 `QuizRunner` 日志上报；日期行路由参数正确。
- 回归：现有每日汇总正确率从 `grade >= 3` 修正为 `grade >= 1`，且不影响弱词、错题、学习统计。
