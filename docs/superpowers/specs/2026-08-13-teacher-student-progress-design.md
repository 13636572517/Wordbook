# 教师端学员进度详情设计规格

> 状态：已获用户确认（方案 A）
> 日期：2026-08-13
> 分支：feature/teacher-student-progress

## 需求
管理员点开学员详情后参考学员端「进度」页，可看到：学习进度、词本完成情况、
近 30 天打卡、薄弱词（新 4 维口径）、按 A-Z 首字母分组的进展。

## 后端
1. 新增 `GET /teacher/students/<user_id>/progress/?wordbook_id=`（教师/管理员鉴权）：
   - wordbook: {total, learned, mastered(reps>=3), learning, due}
   - today: {new_words, review_words}（当日去重词数）
   - checkin: 近30天 [{date, count, new_count}]（空日补0）
   - progress: 已学词进度列表（word/translation/reps/due/ef/correct/wrong）按字母序
2. `weak-words` 口径升级与学员端一致（4维）：错率>=0.34或EF<1.8、30天练习+复习错>=2、
   逾期超3天、首学超7天且reps<=1；响应加 reason 字段（wrong/recent/overdue/stale）

## 前端
- `httpRepo.ts`：fetchStudentProgress + StudentProgressSummary 类型；TeacherWeakWord 加 reason
- `[id].tsx` 5 Tab：概览（默认，进度条+掌握/学习中/待复习+今日数据）/
  打卡（30天6x5格子日历4档着色，点格显示当日明细）/
  薄弱词（原因标签）/ A-Z（首字母分组折叠：组头「A · 12/89」+迷你进度条，
  展开逐词状态色点：灰未学/黄学习中/绿已掌握/红薄弱）/ 错题（保留现状）
- 词本筛选器保留，作用于全部 Tab

## 实施顺序
后端接口→部署验证→前端数据层→页面重构→合并部署→HANDOFF
