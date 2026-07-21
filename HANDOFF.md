# HANDOFF — 背单词工具（单词本 + 云端账户）开发交接

> 本文件供接手开发的 AI 阅读。最后更新：2026-07-21（本地开发阶段 LA1–LA9 已完成）。

## 1. 项目位置与状态

- **项目路径**：`/Users/michael/WorkBuddy/高中学习工具/wordhoard`
- **当前分支**：`feature/wordbook-account`（工作区干净，已提交 10 个 commit）
- **技术栈**：Expo SDK 54 + React Native Web + React 19 + TypeScript + Metro
- **本地预览**：`http://localhost:19006`（Expo Web，`expo start --web --port 19006`）
- **测试运行**：`tsx` 在隔离环境跑纯逻辑测试，例：`node_modules/.bin/tsx lib/data/__tests__/repo.test.ts`
  - 也可用项目本地 tsc 类型检查：`./node_modules/.bin/tsc --noEmit`
- **Node 路径（沙箱隔离）**：`/Users/michael/.workbuddy/binaries/node/versions/22.22.2/bin/node`，tsx 在 `/Users/michael/.workbuddy/binaries/node/workspace/node_modules/.bin/tsx`

## 2. 需求与架构（已批准）

详见 `docs/plans/2026-07-21-wordbook-account-design.md`（权威架构）与 `docs/plans/2026-07-21-wordbook-account.md`（任务级计划）。要点：

- **Library 词本**：按级别建不同单词本（高中 / 四级 / 六级 …）+ 用户自定义词本。
- **账户系统**：不同用户登录有各自独立学习进度（真·云端）。
- **执行策略（用户拍板）**：**先本地开发，再 migrate 到服务器**。本地阶段用「多用户档案」占位账户，部署阶段只替换 auth 为 gesp 的 JWT 校验。
- **SSO 方案**：复用现有 yusuan.xyz（gesp_trainer，Django 5.2）已签发的 JWT；词汇后端**不建 users 表**，只校验 JWT 得到 `user_id`，进度按 `user_id` 隔离。
- **部署目标**：阿里云服务器 `47.103.133.232`，子域名 `learning.yusuan.xyz`；服务器端 MySQL（backend 经 `localhost:3306` 访问，公网 3306 被挡）；新建 `learning` 库（utf8mb4）。
- **版权约束**：内置词表只能用开放授权源（如已用的课标词表），不可用受保护的教材（如《高考词汇全攻略》）。

## 3. 数据模型（字段全程对齐服务器 `learning` 库）

见 `lib/data/types.ts`：
- `User(id, username, createdAt)`
- `Wordbook(id, ownerId|null, name, level, type['system'|'custom'], source, createdAt)`
- `Word(id, word, translation, pronunciation)`
- `WordbookWord(wordbookId, wordId)` —— 一词可属多本
- `UserWordProgress(userId, wordbookId, wordId, ef, interval, repetitions, due, correct, wrong, lastReviewTs?)`
- `StudyLog`（可选，统计/连续天数）

## 4. 已完成工作（LA1–LA9，全部 TDD 绿 + tsc 0 错误）

**核心抽象层 `lib/data/`**
- `types.ts` — 数据模型（字段对齐服务器表）
- `repo.ts` — `Repository` 接口（纯 TS，无 RN 依赖）
- `asyncStorageRepo.ts` — App 用 AsyncStorage 实现（**带内存快照缓存**，避免 6000+ 词逐词读全量 progress 卡死）
- `memoryRepo.ts` — 测试用内存实现
- `index.ts` — 导出当前 `asyncStorageRepo`
- `session.ts` — 当前用户/当前词本持久化（`getActiveUser/setActiveUser/getActiveWordbook/setActiveWordbook`）
- `weak.ts` — `getWeakWordIds`（基于 DAL 进度判薄弱）
- `seedWordbooks.ts` — 幂等 seed 内置词本（高中 6008 词带 IPA、四级/六级占位）
- `quiz.ts` — `getNextQuizWord(repo, userId, wordbookId, priorityWordIds, now)`
- `stats.ts` — `getWordbookStats(repo, userId, wordbookId)` → `{total,newCount,due,learning,mastered,accuracy,streak}`
- `review.ts` — `reviewWord(repo, userId, wordbookId, wordId, grade, now)`（SM-2）
- `sm2.ts` — 纯 SM-2 调度（`sm2(p, grade, now)`，注入 `now` 可测）

**算法/复用**
- `lib/quizSelection.ts` — `selectQuizWord<T extends QuizCandidate>` 泛型化（App 旧调用与 DAL 复用同一逻辑）；模块级 `setPriorityIds/clearPriorityIds`（类型 `string[]`，用于薄弱词重练注入）

**UI（App + 组件）**
- `components/SessionProvider.tsx` — Context + 账户登录页（选/建账户，本地占位）
- `components/FlashCard.tsx` — 背面显示 `pronunciation`（音标）
- `app/_layout.tsx` — 启动 `seedBuiltInWordbooks(repo)`，外层包 SessionProvider
- `app/(tabs)/index.tsx` — quiz 按「当前用户+词本」取词/复习，顶栏显示词本名
- `app/(tabs)/library.tsx` — 书架（系统/自定义词本，选为当前、新建/删除、显示词数）
- `app/(tabs)/stats.tsx` — 词本级统计
- `app/(tabs)/weak.tsx` — DAL 薄弱词，一键重练注入优先队列
- `app/add-modal.tsx` — 加词到当前词本

**测试**：`lib/data/__tests__/` 下 repo/account/wordbook/seed/membership/quiz/stats/review；`lib/__tests__/` 下 sm2/quizSelection/weakWords/ipaData。共 12 个测试全绿。

## 5. 待办 / 下一步（Phase B：服务器部署，TB1–TB9）

**尚未开始**。任务级计划见 `docs/plans/2026-07-21-wordbook-account.md` 的 Phase B。概要：
- 阿里云建 `learning` 库（utf8mb4）+ `learning` MySQL 用户
- 词汇后端（Python，与 gesp 同栈：Django/FastAPI 待定，用户选 Python）
- SSO 接 gesp JWT（校验 token → 得到 yusuan `user_id`）
- 词本/单词/进度 CRUD API
- nginx 子域名 `learning.yusuan.xyz` 反代 + 托管 Expo Web 构建
- 把 `asyncStorageRepo` 换成 HTTP API 实现（DAL 接口不变，业务/UI 不动）
- 旧 `vocabulary_words_en`（database.ts 旧层）进度迁移（TB7）

⚠️ **铁律**：任何服务器写操作（建库 / migrate / 部署）**必须显式向用户确认**后再执行，绝不擅自动服务器数据。用户服务器密码属敏感凭证，不写进任何文件/记忆/日志。

## 6. 已知坑 / 注意事项

- **数据不兼容**：切到 DAL 后，旧 `database.ts` 的 `vocabulary_words_en` 数据废弃，本地开发阶段从零开始（旧进度需走 TB7 迁移）。
- **性能**：`AsyncStorageRepo` 已加内存缓存；改 `getProgress` 等读取逻辑时注意别退化成逐词全量读。
- **沙箱网络**：仅 `api.github.com` 可靠，`raw.githubusercontent.com` 被挡；`dictionaryapi.dev` 被 Cloudflare 限流，离线词表已用 CMUdict 生成（`lib/ipaData.ts`，覆盖率 99.2%）。
- 服务器只读探查可走 SSH（`sshpass -p <pw> ssh admin@47.103.133.232`，MySQL 用 `sudo mysql -u root` 本机读），但**写操作需确认**。

## 7. 必读文件清单（接手优先级）

1. 本文件 `HANDOFF.md`
2. `docs/plans/2026-07-21-wordbook-account-design.md`
3. `docs/plans/2026-07-21-wordbook-account.md`
4. `lib/data/types.ts`、`lib/data/repo.ts`、`lib/data/index.ts`
5. 项目记忆：`/Users/michael/WorkBuddy/高中学习工具/.workbuddy/memory/MEMORY.md` 与 `2026-07-21.md`
