# HANDOFF — 御算词擎（高中词汇学习 PWA）开发交接

> 本文件供接手开发的 AI 阅读。最后更新：2026-07-22（Phase B 云端部署已完成 + 数据修复工程已完成）。

## 0. 最重要的约定（铁律，务必遵守）

1. **Git 发布工作流**：所有改动**先在开发分支**（如 `feature/*`）上开发并验证，完成后**合并（merge）到 `main`**，再**从 `main` 发布/部署**。禁止直接在 `main` 上改动，禁止跳过合并直接发布开发分支。
2. **服务器写操作必须确认**：任何服务器写操作（建库 / migrate / 部署 / 改数据 / 重启服务）**必须先显式向用户确认**后再执行，绝不擅自动服务器数据。只读探查（查表、看日志、看状态）可直接进行。
3. **凭证不落地**：服务器密码、数据库密码、token 等敏感凭证**严禁写进任何文件 / 记忆 / 日志 / 提交**。下文涉及密码处一律用 `<PW>` 占位，实际值向用户索取。
4. **版权约束**：内置词表只能用开放授权源（如课标词表），不可用受保护的教材（如《高考词汇全攻略》）。

## 1. 项目位置与状态

- **项目路径**：`/Users/michael/Workbuddy/高中学习工具/wordhoard`
- **当前分支**：`feature/wordbook-account`（工作区干净）。⚠️ 本分支的大量改动**尚未合并到 `main`**，下次发布前需先 merge。
- **远程**：`origin` = `git@github.com:13636572517/Wordbook.git`；另有 `upstream`（指向模板仓库）。
- **线上地址**：`https://learning.yusuan.xyz`（PWA，桌面/手机浏览器可加桌面，桌面快捷名「御算词擎」）。
- **技术栈**：
  - 前端：Expo SDK 54 + React Native Web + React 19 + TypeScript + expo-router + Metro。
  - 后端：Django 5.x + DRF + MySQL（`learning` 库，utf8mb4）+ Redis（django-redis）+ Gunicorn（gevent worker）+ systemd。
  - 认证：复用 GESP（`yusuan.xyz`，gesp_trainer Django）已签发的 JWT（SSO），词汇后端**不建 users 表**。
- **本地预览**：`npx expo start --web`（默认 8081；如需指定端口 `--port 19006`）。**预览时由 AI 主动启动并把网址贴给用户**。
- **类型检查**：`./node_modules/.bin/tsc --noEmit`。
- **测试**：`node_modules/.bin/tsx lib/data/__tests__/repo.test.ts`（tsx 跑纯逻辑测试）。

### 最近提交（feature/wordbook-account，新→旧）
```
4eda885 fix: 修复脚本增强(HTML损坏检测+本地校验降速续跑合并)
7fc340c fix: 释义错位修复工具链(本地校验+HTML补救+应用命令)
8a7d43b feat: PWA 品牌化(御算词擎) + 云端性能优化 + 数据完整性修复
7e02f47 feat: Phase B backend (Django API + JWT SSO) + httpRepo + migration
6ed543e feat: 中文化UI + 离线词典缓存 + 用户系统UI + 发音修复
df9ae7b feat(ui): wire DAL+session into tabs (LA7-LA9) ...
```

## 2. 架构总览

```
浏览器 PWA (learning.yusuan.xyz)
   │  EXPO_PUBLIC_USE_CLOUD=true → httpRepo
   │
   ├─ 登录/鉴权 ──► yusuan.xyz/api/auth/login/username/  (GESP SSO，签发 JWT)
   │
   └─ 业务 API ──► learning.yusuan.xyz/api/  (Nginx 反代 → Gunicorn/Django)
                        │
                        ├─ MySQL learning 库 (words/wordbooks/progress/...)
                        └─ Redis (补全任务进度 + 管理员状态缓存)
```

- **数据层切换**（`lib/data/index.ts`）：`USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true'`。
  - `true` → `httpRepo`（云端，调 learning.yusuan.xyz/api）；`false` → `asyncStorageRepo`（本地开发）。
  - 业务/UI 代码只依赖 `Repository` 接口（`lib/data/repo.ts`），两种实现可无缝切换。
- **httpRepo 关键配置**（`lib/data/httpRepo.ts`）：
  - `API_BASE`：生产 `https://learning.yusuan.xyz/api`，开发 `http://localhost:8000/api`。
  - `GESP_AUTH_BASE`：生产 `https://yusuan.xyz/api/auth`，开发 `http://localhost:8002/api/auth`。
  - Token 存 AsyncStorage：`vocab_jwt_token`（JWT）、`vocab_active_user`（用户信息）。
  - `api()` 遇 401 会 `clearToken()`（同时删 token 与 user）并抛「登录已过期」。

## 3. 数据模型（`backend/apps/vocab/models.py`，字段对齐 MySQL `learning` 库）

- `Wordbook(id, owner_id[NULL=系统词本], name, level, type[system|custom], source, created_at)`，唯一约束 `(owner_id, name)`。
- `Word(id, word[unique], translation, pronunciation, definitions JSON, phrases JSON, examples JSON)`。
  - `definitions`: `[{"pos":"n.","definition":"..."}]`；`phrases`: `[{"phrase":"...","meaning":"..."}]`；`examples`: `[{"en":"...","zh":"..."}]`（由「一键补全释义」写入）。
- `WordbookWord(wordbook_id, word_id)` 多对多，唯一约束 `(wordbook, word)`。
- `UserWordProgress(user_id, wordbook_id, word_id, ef, interval, repetitions, due, correct, wrong)`，SM-2 字段，唯一约束 `(user_id, wordbook, word)`。
- `StudyLog(user_id, wordbook_id, word_id, grade, ts)`。
- 前端镜像类型见 `lib/data/types.ts`。

## 4. 后端 API（`backend/apps/vocab/urls.py`，均挂 `/api/` 下，需 JWT）

| 路径 | 方法 | 说明 |
|------|------|------|
| `me/` | GET | 当前用户信息（含 `is_admin`） |
| `wordbooks/` | GET/POST | 词本列表 / 创建 |
| `wordbooks/<pk>/` | DELETE | 删除词本 |
| `wordbooks/<pk>/words/` | GET/POST/DELETE | 词本内单词（GET 支持 `slim` 精简返回） |
| `progress/` | GET | 进度批量读取 |
| `progress/due/` | GET | 到期复习词 |
| `stats/` | GET | 词本统计 |
| `study-logs/` | POST | 上报学习日志 |
| `words/search/` | GET | 单词搜索 |
| `words/<pk>/` | GET | 单词详情（含完整释义） |
| `enrich/` | GET/POST | 一键补全释义（管理员，进度查询/启动） |
| `enrich/stop/` | POST | 停止补全任务（管理员） |

- 管理员校验：`admin_check.py` 跨库查 `gesp_trainer.user_profile.is_admin` + Redis 缓存。
- 视图实现：`backend/apps/vocab/views.py`。

## 5. 已完成工作

### 5.1 本地阶段（LA1–LA9，TDD 全绿）
核心抽象层 `lib/data/`（types/repo/asyncStorageRepo[带内存缓存]/memoryRepo/session/weak/seedWordbooks/quiz/stats/review/sm2）+ UI（SessionProvider/FlashCard/library/stats/weak/add-modal）。详见旧版 HANDOFF 第 4 节逻辑，均已上云。

### 5.2 Phase B 云端（已部署上线）
- Django 后端 + DRF + JWT SSO（校验 GESP token 得 `user_id`，进度按 `user_id` 隔离）。
- `httpRepo` 替换 `asyncStorageRepo`（接口不变，UI 不动）；`migrateToCloud.ts` 旧进度迁移。
- Nginx 子域名 `learning.yusuan.xyz` 反代 + 托管 Expo Web 构建。
- 管理员「一键补全释义」：`enrich_service.py`（gevent 兼容后台线程 + Redis 进度 + 断点续传 + 进程管理 + 限流 0.5s/词），前端 `EnrichModal` 弹窗（仅桌面网页显示）。

### 5.3 PWA 品牌化（御算词擎）
- 应用名「御算词擎」（`app.json`），图标「墨金印章」方案（`assets/images/`）。
- `scripts/pwa-postbuild.mjs`：构建后自动注入 `manifest.json` / `sw.js` 到 `index.html`。

### 5.4 性能与稳定性修复
- 首页加载慢（N+1 请求 + 大响应体）→ `slim` 参数 + 进度缓存 + in-flight 去重。
- 退出登录、PWA 语音（Web Speech API + 有道发音适配 HarmonyOS）、按顺序学习。
- **登录无限转圈修复**（`components/SessionProvider.tsx`）：token 过期后 `fetchMe` 401 → `clearToken` → `createUser` 在 SSO 模式抛未捕获异常 → `setLoading(false)` 永不执行。已加三层防护（整体 try/catch、fetchMe 失败检查 `isLoggedIn`、SSO 无用户直接显示登录）。
- 有道词组嵌套对象脏数据致 React #31 崩溃 → `fix_phrases` 命令 + `_extract_text` 解析器 + 前端 sanitize 三层修复。

### 5.5 数据修复工程（释义错位，已完成）
- **现象**：`although` 卡片显示 `technician` 的数据。
- **根因**：有道 CDN（`dict.youdao.com/jsonapi_s`）偶发返回**其他词条的缓存响应**（缓存投毒），而补全代码未校验响应的 `input` 字段，导致错位数据入库。
- **防投毒**：`enrich_service.py` 的 `_fetch_word` 增加 `input` 校验 + 3 次重试（input 与查询词不一致则重试，连续失败抛错）。**已部署并重启服务生效**。
- **存量修复**：本地全量校验 3743 词 + HTML 页面（`dict.youdao.com/w/<word>`，未投毒）补救，累计修复 **290+ 条**错位数据；JOIN 损坏检测归零（仅剩合法 aluminium/aluminum 同词变体）。
- **抽查通过**：`reading /ˈriːdɪŋ/ 阅读` ✓、`TRUE /truː/ 真实的` ✓、`although /ɔːlˈðoʊ/ 虽然，尽管` ✓。

## 6. 构建与部署

### 前端（Expo Web → 静态文件 → Nginx）
```bash
# 1. 云端模式构建（输出到 dist/，含 PWA 后处理）
npm run build:web:cloud
# 2. 上传到服务器（密码向用户索取，<PW> 占位）
sshpass -p '<PW>' rsync -az --delete dist/ admin@47.103.133.232:/opt/learning/frontend/dist/
```

### 后端（Django + Gunicorn + systemd）
```bash
# 服务器端：代码在 /opt/learning/backend，虚拟环境 venv/，设置 config.settings.prod
# 同步单个文件示例：
sshpass -p '<PW>' rsync -az backend/apps/vocab/enrich_service.py admin@47.103.133.232:/opt/learning/backend/apps/vocab/
# 重启服务（sudo 密码同 <PW>）：
sshpass -p '<PW>' ssh admin@47.103.133.232 "echo '<PW>' | sudo -S systemctl restart learning.service && systemctl is-active learning.service"
```
- 后端运行需 `DJANGO_SETTINGS_MODULE=config.settings.prod`。
- MySQL 本机读：`sudo mysql -u root learning`（公网 3306 被挡，仅本机可访问）。
- ⚠️ SSH 偶发 `Permission denied`（sshpass 认证抖动），失败时重试即可；复杂命令避免多层引号嵌套，宜写成脚本 scp 上去再执行。

### 数据库迁移
```bash
# 服务器端
cd /opt/learning/backend && venv/bin/python manage.py migrate --settings=config.settings.prod
```

## 7. 词典补全与数据修复工具链

| 文件 | 位置 | 用途 |
|------|------|------|
| `enrich_service.py` | 后端 | 线上「一键补全释义」服务（含 input 防投毒校验） |
| `verify_enrichment.py` | 后端 management/commands | 服务器端全量校验 |
| `apply_fixes.py` | 后端 management/commands | 应用 `word_fixes.json` 修复数据（`--dry-run` 支持） |
| `fix_phrases.py` | 后端 management/commands | 修复词组嵌套脏数据 |
| `import_wordlist.py` | 后端 management/commands | 导入词表 |
| `verify_enrichment_local.py` | `scripts/` | **本地**全量校验（服务器 IP 被反爬限制时用），断点续传（`/tmp/verify_progress.json`），`VERIFY_SLEEP` 调速 |
| `fix_failed_via_html.py` | `scripts/` | 本地 HTML 页面补救失败词 + 损坏检测（音标比对，保护干净词） |

- **限流经验**：本地 Mac 约 400 请求后触发 SSL EOF 限流 → 降速（`VERIFY_SLEEP=1.3`）+ 暂停冷却 + HTML 端点分流。服务器 IP 可能被有道反爬完全封锁（任何词都返回随机词条），此时改用本地校验。
- **损坏检测**：HTML 补救时比对 DB 音标与 HTML 音标——不一致→损坏→修复；一致→纯投毒→跳过（保护 jsonapi 高质量数据）。
- **临时数据文件**（本地 `/tmp/`，非仓库内容）：`words_export.json`（服务器导出）、`word_fixes.json`（修复集）、`verify_progress.json`（进度）。
- 服务器导出脚本（绕过 mysql JSON 转义）：在服务器跑 Django 脚本 `SELECT id, word, IFNULL(definitions,'')... FROM words ORDER BY id` → `/tmp/words_export.json`。

## 8. 已知坑 / 注意事项

- **有道 CDN 投毒**：`jsonapi_s` 偶发返回错误词条缓存。任何新的有道数据抓取**必须校验 `input` 字段**与查询词一致。HTML 页面（`/w/<word>`）相对可靠，可作补救源。
- **gevent 兼容**：后端后台任务用 daemon 线程 + Redis 进度；`CONN_MAX_AGE` 必须为 0。
- **跨库查询**：管理员校验需对 `gesp_trainer` 库显式 GRANT。
- **AsyncStorageRepo 缓存**：改 `getProgress` 等读取逻辑时别退化成逐词全量读（6000+ 词会卡死）。
- **沙箱网络**：仅 `api.github.com` 可靠；`dictionaryapi.dev` 被 Cloudflare 限流，离线词表用 CMUdict 生成（`lib/ipaData.ts`，覆盖率 99.2%）。
- **离线词典缓存**：`lib/data/dictCache.json`（约 1.7MB）由 `scripts/build-dict-cache.ts` / `generate-dict-cache.mjs` 生成。

## 9. 待办 / 下一步

- **合并发布**：将 `feature/wordbook-account` 合并到 `main`，从 `main` 重新构建部署（遵循第 0 节工作流）。
- 后续功能可参考 `docs/plans/` 下的设计文档（IPA / 同步 / 薄弱词 / 词本账户）。
- 持续观察有道数据质量；新增词补全时务必走带 input 校验的 `enrich_service`。

## 10. 必读文件清单（接手优先级）

1. 本文件 `HANDOFF.md`
2. `docs/plans/2026-07-21-wordbook-account-design.md`（权威架构）
3. `lib/data/index.ts`、`lib/data/httpRepo.ts`、`lib/data/repo.ts`、`lib/data/types.ts`
4. `components/SessionProvider.tsx`（登录/初始化流程，含转圈修复）
5. `backend/apps/vocab/enrich_service.py`（补全 + 防投毒）、`backend/apps/vocab/views.py`、`models.py`、`urls.py`
6. `backend/config/settings/prod.py`（部署配置）
7. 数据修复工具链：`scripts/verify_enrichment_local.py`、`scripts/fix_failed_via_html.py`、`backend/apps/vocab/management/commands/apply_fixes.py`
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
