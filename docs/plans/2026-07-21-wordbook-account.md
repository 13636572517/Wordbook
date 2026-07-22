# 实现计划：单词本 + 云端账户（SSO）

> 工作流：superpowers Phase 2。每个任务 = 写失败测试(RED) → 实现(GREEN) → 提交。
> 后端逻辑用 Django 测试（pytest）；App 端纯逻辑用现有 `tsx` 测试（参考 trio 分支）。
> **约束**：凡涉及服务器写操作（建库 / migrate / 部署）的任务，执行前单独显式确认。

## 执行策略（2026-07-21 用户拍板：先本地开发，再 migrate 到服务器）

- **Phase A 本地优先**：在本地用 AsyncStorage 把账户（本地多档案占位）+ 词本（分级内置 + 自定义）+ 词本级进度/统计/quiz 全部做通，App 可本地完整运行、可演示。
- **数据访问层（DAL）抽象**：所有数据读写走 `lib/data/` 定义的 Repository 接口。现提供 AsyncStorage 实现（App 用）；测试用内存实现（无 RN 依赖，tsx 可跑）。
  - **关键收益**：将来"migrate 到服务器"时，只需新增 HTTP API 实现替换 AsyncStorage 实现，业务/UI 代码几乎不动。
- **数据模型字段全程与服务器对齐**：`user_id` / `wordbook_id` / `word_id` / SM-2 字段（ef/interval/repetitions/due/correct/wrong）与 `learning` 库表一一对应。
- **账户占位**：本地阶段用「本地多用户档案」（username + 本地生成的 user_id），无密码/无后端。部署阶段把鉴权切到 gesp SSO（只换 auth，progress 模型不变）。
- **Phase B 服务器迁移**：搭建 Django 后端 + `learning` 库 + gesp SSO + nginx/子域名/HTTPS；把 DAL 的 AsyncStorage 实现换成 HTTP API 实现即可。

## Phase A — 本地开发（AsyncStorage + DAL 抽象）

### LA1 数据访问层骨架
- 目标：`lib/data/types.ts`（User/Wordbook/Word/WordbookWord/UserWordProgress）、`lib/data/repo.ts`（Repository 接口，纯 TS 无 RN 依赖）、`lib/data/memoryRepo.ts`（测试用内存实现）、`lib/data/asyncStorageRepo.ts`（App 用）、`lib/data/index.ts`（导出当前实现）。
- 存储键约定（对齐服务器表）：`vocab_users` / `vocab_active_user` / `vocab_wordbooks` / `vocab_words` / `vocab_wordbook_words` / `vocab_user_progress`。
- RED：`lib/data/__tests__/repo.test.ts` 对 memoryRepo 断言 CRUD 行为，运行失败（未实现）。
- GREEN：memoryRepo 全部 CRUD 通过；asyncStorageRepo 结构对齐。
- commit：`feat(data): DAL skeleton + memory/async-storage repos`

### LA2 本地多用户档案（账户占位）
- 目标：创建/列出/切换用户；`getActiveUser/setActiveUser/createUser`。user_id 本地生成（uuid），字段对齐服务器 `user_id`。
- RED：创建同名用户、切换不存在用户 → 测试失败/抛错。
- GREEN：多档案独立存在；切换生效。
- commit：`feat(data): local multi-user profiles`

### LA3 词本模型 + 内置/自定义词本
- 目标：`listWordbooks(ownerId?)` / `createWordbook` / `deleteWordbook`；内置 system 词本（高中/四级/六级）seeded 一次；自定义 custom 词本仅 owner 可删。
- 文件：`lib/data/seedWordbooks.ts`（用现有高中词表建「高中」词本；四级/六级占位待导入）。
- RED：删 system 词本被拒；删他人 custom 词本被拒。
- GREEN：系统词本只读、自定义 CRUD 正常。
- commit：`feat(data): wordbook model + system/custom wordbooks`

### LA4 词本成员关系（一词多本）
- 目标：`addWordToWordbook` / `removeWordFromWordbook` / `getWordsByWordbook`；同一 word 可属多本、移出不串扰。
- RED：同一 word 加两本均成功；移出不串扰 → 失败（未实现）。
- GREEN：`wordbook_words` 维护正确。
- commit：`feat(data): wordbook-word membership (one word many books)`

### LA5 quiz 按词本取词
- 目标：把现有 `getQuizWord` 改造为 `getQuizWord(userId, wordbookId, now)`，仅在该词本范围内按 due/overdue→new 取词；复用 `quizSelection` 纯逻辑。
- RED：选 B 本不出现 A 本进度 → 失败。
- GREEN：范围正确限定；薄弱词重练注入仍有效。
- commit：`feat: scope quiz to selected wordbook`

### LA6 词本级进度与统计
- 目标：`getProgress(userId,wordbookId,wordId)` / `setProgress`；`getWordbookStats` 返回 total/due/mastered/accuracy + streak（按词本）。
- RED：空词本统计为 0；复习后 accuracy 变化正确 → 失败。
- GREEN：各词本统计独立正确。
- commit：`feat(data): per-wordbook progress + stats`

### LA7 Library → 书架 UI
- 目标：Library Tab 改为分级词本书架 + 自定义词本入口 + 进入词本学习。
- 文件：`app/(tabs)/library.tsx` 改造、`components/WordbookCard.tsx`
- GREEN：展示系统词本 + 自定义词本；点击进入学习。
- commit：`feat(ui): library as wordbook shelf`

### LA8 登录 / 用户切换 UI
- 目标：启动选/建用户（本地档案）；显示当前用户；切换/退出。
- 文件：`app/(tabs)/_layout.tsx` 或新 `app/profile.tsx`；登录态接 DAL。
- commit：`feat(ui): local user switch / login`

### LA9 词本级统计 UI
- 目标：统计 Tab 按当前词本展示（复用 LA6）。
- commit：`feat(ui): per-wordbook stats UI`

## Phase B — 迁移到服务器（Django 后端 + gesp SSO + 部署）

### TB1 后端脚手架（Django + DRF + SimpleJWT + CORS）
### TB2 数据模型（对齐 LA 字段；user_id 用 BigIntegerField，无 FK）
### TB3 JWT 校验（SSO：校验 gesp 签发的 JWT，注入 user_id）
### TB4 词本/单词/进度/统计 API
### TB5 内置词表导入（开放授权源；版权安全）
### TB6 DAL 换 HTTP API 实现（替换 asyncStorageRepo，接 gesp 登录拿 JWT）
### TB7 旧数据迁移（本地 AsyncStorage → 服务器 learning 库，幂等）
### TB8 建库 + 部署（⚠️ 需显式确认：CREATE DATABASE learning / USER / GRANT / migrate / gunicorn / nginx 子域 + HTTPS / CORS）
### TB9 实时同步 + 离线兜底（可选增强）

## 执行方式
- 本地可测任务（LA1–LA9、TB1–TB5 后端单测）按 TDD 直接推进。
- 任何服务器写操作（TB8 等）执行前单独显式确认。
