# 实现计划：单词本 + 云端账户（SSO）

> 工作流：superpowers Phase 2。每个任务 = 写失败测试(RED) → 实现(GREEN) → 提交。后端用 Django 测试（pytest）；App 端复用现有 `tsx` 测试（见 trio 分支测试方式）。
> **约束**：凡涉及服务器写操作（建库 / migrate / 部署）的任务，执行前单独显式确认；其余本地可测任务直接按 TDD 推进。

## P1 — 后端 + 账户（SSO）

### T1 后端脚手架（Django + DRF + SimpleJWT + CORS）
- 目标：`server/` 下新建 Django 项目 `learning`，配置 DRF、simplejwt、cors-headers；敏感配置（DB、JWT 密钥）全走 env。
- 文件：`server/learning/settings.py`、`server/manage.py`、`server/requirements.txt`、`server/.env.example`
- RED：`server` 能 `manage.py check` 通过；`pytest` 加载 settings 不报错。
- GREEN：最小可运行项目 + 依赖锁。
- commit：`chore: scaffold Django backend (learning)`

### T2 数据模型
- 目标：Django models 对应 §5 五张表；`user_id` 用 `BigIntegerField`（无 User 模型 / 无 FK）。
- 文件：`server/words/models.py`、`server/words/migrations/`
- RED：`models.py` import 即报错（未建）。
- GREEN：model + migration 生成；`assert Wordbook/Word/...` 可实例化。
- commit：`feat: wordbook/word/progress models`

### T3 JWT 校验（SSO 核心）
- 目标：词汇后端校验 gesp 签发的 JWT，注入 `request.user_id`。两种实现二选一（推荐 A）：
  - A：共享 gesp 的 JWT 签名密钥（env 注入），用 simplejwt 本地验签；
  - B：调 gesp 的 `api/auth/token/verify/` 或 `/me` 端点拿 user_id（不持有密钥）。
- 文件：`server/words/auth.py`（认证类 / 中间件）、测试 `server/words/tests/test_auth.py`
- RED：带无效/过期 token 的请求被 401；不带 token 的受保护接口 401。
- GREEN：合法 gesp JWT → `request.user_id` 被正确设置；下游 API 可用。
- commit：`feat: validate gesp JWT, inject user_id (SSO)`

### T4 词本 API
- 目标：列表/详情/创建/删除。系统词本只读；自定义词本仅 owner 可改。
- 文件：`server/words/views.py`、`serializers.py`、`urls.py`
- RED：未授权创建被拒；删他人词本被拒；系统词本 DELETE 被拒。
- GREEN：自定义词本 CRUD 正常；系统词本只读。
- commit：`feat: wordbook CRUD API`

### T5 单词 API + 词本成员关系
- 目标：单词列表/搜索；把单词加入/移出多个词本（一词多本）。
- RED：同一 word 加入两个 wordbook 均成功；移出不串扰。
- GREEN：`POST /wordbooks/{id}/words`、`DELETE ...` 正确维护 `wordbook_words`。
- commit：`feat: word + wordbook_words API`

### T6 进度 API（quiz + SM-2）
- 目标：`GET /wordbooks/{id}/next` 按 due/overdue 取下一词；`POST .../review` 用 SM-2 更新 `user_word_progress`。
- 文件：`server/words/sm2.py`（与 App 现有 `sm2` 同算法）、`views_progress.py`
- RED：review 后 ef/interval/due 不合预期 → 测试失败；next 不返回未到期词。
- GREEN：SM-2 与 App 端算法一致；next 优先返回 overdue → new。
- commit：`feat: study progress + SM-2 API`

### T7 统计 API
- 目标：按词本返回 total/due/mastered/accuracy + 连续天数（streak）。
- RED：空词本统计为 0；复习后 accuracy 变化正确。
- GREEN：`GET /wordbooks/{id}/stats` 正确聚合。
- commit：`feat: per-wordbook stats API`

### T8 建库 + 部署（⚠️ 需显式确认后执行）
- 目标：服务器上 `CREATE DATABASE learning`、`CREATE USER learning@localhost`、`GRANT`、`migrate`、gunicorn 起服务、nginx 加 `learning.yusuan.xyz` 反代 + CORS_ORIGINS 加该域、HTTPS。
- 文件：`server/requirements.txt`、nginx 配置片段、systemd/启动脚本
- 执行前：单独征得用户同意；先在 dry-run / 本地 sqlite 验证全部测试通过。
- commit：`deploy: learning backend on ali server (subdomain + db)`

## P2 — 词本功能（App 端）

### T9 内置词表导入
- 目标：开放词表（高中/四级/六级）脚本导入 `words` 并建 `system` 词本（版权安全源）。
- 文件：`server/words/management/commands/import_wordlists.py`、词表数据（开源）
- RED：重复导入产生重复词 → 测试失败（应幂等）。
- GREEN：幂等导入；system 词本含正确词数。
- commit：`feat: import open wordlists as system wordbooks`

### T10 App API 客户端（替换本地存储）
- 目标：在 App 端抽象"数据源"层，将 `lib/database.ts` 的本地读写替换为调后端 API；登录走 gesp `api/auth/` 拿 JWT 并存安全存储。
- 文件：`lib/api.ts`（HTTP 客户端 + token 管理）、改造 `lib/database.ts` 接口
- RED：mock 后端返回错误时客户端抛错；无 token 调用受保护接口被拦。
- GREEN：单词/进度读写经 API；离线时降级本地缓存（接 T16）。
- commit：`feat: app API client (auth via gesp JWT)`

### T11 Library → 书架 UI
- 目标：Library Tab 改为分级词本书架 + 自定义词本入口 + 进入词本学习。
- 文件：`app/(tabs)/library.tsx` 改造、`components/WordbookCard.tsx`
- RED：渲染测试（快照/存在性）。
- GREEN：展示系统词本 + 自定义词本；点击进入。
- commit：`feat: library as wordbook shelf UI`

### T12 quiz 按词本取词
- 目标：学习前选词本，`getQuizWord` 限定 wordbook_id。
- 文件：`lib/database.ts`、`app/(tabs)/index.tsx`
- RED：选 B 本时不出现 A 本进度。
- GREEN：quiz 范围正确限定。
- commit：`feat: scope quiz to selected wordbook`

### T13 旧数据迁移
- 目标：首次登录把现有 `en` 桶（AsyncStorage）映射到"高中"词本并上报云端。
- 文件：`lib/migrateLegacy.ts`
- RED：重复迁移产生重复进度 → 失败。
- GREEN：幂等迁移；旧进度落到对应用户的高中词本。
- commit：`feat: migrate legacy en bucket to high-school wordbook`

## P3 — 云同步 + 统计 + 离线

### T14 实时同步
- 目标：进度变更上报后端；多端拉取；冲突策略（last-write-wins 或 SM-2 合并）。
- RED：两设备各学一词后拉取，进度互不覆盖（按预期合并）。
- GREEN：`sync pull/push` 正确。
- commit：`feat: realtime cloud sync`

### T15 词本级统计 UI
- 目标：统计 Tab 按词本展示（复用 T7 API）。
- RED：渲染测试。
- GREEN：各词本统计独立正确。
- commit：`feat: per-wordbook stats UI`

### T16 离线兜底
- 目标：无网时可学，操作入本地队列，上线后合并（接 T10 降级 + T14 推送）。
- RED：离线复习后仍能在恢复后同步。
- GREEN：离线队列 flush 成功。
- commit：`feat: offline queue + merge`

### T17 部署收尾
- 目标：Expo Web 构建托管于 `learning.yusuan.xyz`、HTTPS 证书、基础监控。
- commit：`deploy: expo web hosting + https`

## 执行方式（待用户选择）
- **A. Subagent 驱动（本会话）**：每个任务用 Agent 工具派 `general-purpose` 子代理实现（可 `run_in_background` 并行多角色），两阶段评审（spec + 质量）后合并。
- **B. 手动执行**：用户自行按任务实现，我负责评审/答疑。
- 注：T8/T17 等服务器写操作，无论哪种方式都需在对应步骤前单独显式确认。
