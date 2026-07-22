# HANDOFF — 御算词擎（高中词汇学习 PWA）开发交接

> 本文件供接手开发的 AI 阅读。最后更新：2026-07-22 晚间（Phase B 云端部署 + 数据修复 + 自定义词本删除 + PWA 图标修复 均已完成上线）。

## 0. 最重要的约定（铁律，务必遵守）

1. **Git 发布工作流**：所有改动**先在开发分支**（如 `feature/*`）上开发并验证，完成后**合并（merge）到 `main`**，再**从 `main` 发布/部署**。禁止直接在 `main` 上改动，禁止跳过合并直接发布开发分支。
2. **服务器写操作必须确认**：任何服务器写操作（建库 / migrate / 部署 / 改数据 / 重启服务）**必须先显式向用户确认**后再执行，绝不擅自动服务器数据。只读探查（查表、看日志、看状态）可直接进行。
3. **凭证不落地**：服务器密码、数据库密码、token 等敏感凭证**严禁写进任何文件 / 记忆 / 日志 / 提交**。下文涉及密码处一律用 `<PW>` 占位，实际值向用户索取。
4. **版权约束**：内置词表只能用开放授权源（如课标词表），不可用受保护的教材（如《高考词汇全攻略》）。

## 1. 项目位置与状态

- **项目路径**：`/Users/michael/Workbuddy/高中学习工具/wordhoard`
- **当前分支**：`main`（工作区干净，HEAD 与 `origin/main` 一致）。近期修复（逐词删除、释义修复、PWA 图标）均**直接合入 `main` 并部署**（经用户确认），不再走 feature 分支。历史 `feature/wordbook-account` 的架构改动已随这些修复并入。
- **远程**：`origin` = `git@github.com:13636572517/Wordbook.git`；另有 `upstream`（指向模板仓库）。
- **线上地址**：`https://learning.yusuan.xyz`（PWA，桌面/手机浏览器可加桌面，桌面快捷名「御算词擎」）。
- **技术栈**：
  - 前端：Expo SDK 54 + React Native Web + React 19 + TypeScript + expo-router + Metro。
  - 后端：Django 5.x + DRF + MySQL（`learning` 库，utf8mb4）+ Redis（django-redis）+ Gunicorn（gevent worker）+ systemd。
  - 认证：复用 GESP（`yusuan.xyz`，gesp_trainer Django）已签发的 JWT（SSO），词汇后端**不建 users 表**。
- **本地预览**：`npx expo start --web`（默认 8081；如需指定端口 `--port 19006`）。**预览时由 AI 主动启动并把网址贴给用户**。
- **类型检查**：`./node_modules/.bin/tsc --noEmit`。
- **测试**：`node_modules/.bin/tsx lib/data/__tests__/repo.test.ts`（tsx 跑纯逻辑测试）。

### 最近提交（main，新→旧）
```
2361344 fix: 补齐 PWA 图标与 manifest，修复 iOS 添加到主屏幕无图标
4d1c88e feat: 自定义词本管理员可逐词删除单词
b505286 fix: 词本列表「单词数」添加单词后不刷新
1ab6c71 fix: 模态弹窗左上角叉无法关闭（web/HarmonyOS 上 router.back() 为 no-op）
0b7485b feat: 练习 Tab 前移 + 题库仅测已学词 + 修复自建词本自动匹配释义
aed3ec7 feat: 同源词典代理 + 练习题库仅已学词 + Tab 排序
0131097 feat: 同源 TTS 代理（HarmonyOS 发音静音修复）
8a7d43b feat: PWA 品牌化(御算词擎) + 云端性能优化 + 数据完整性修复
7e02f47 feat: Phase B backend (Django API + JWT SSO) + httpRepo + migration
6ed543e feat: 中文化UI + 离线词典缓存 + 用户系统UI + 发音修复
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
- 应用名「御算词擎」（`app.json`），图标「墨金印章」方案（`assets/images/`，`icon.png` 1024 带透明）。
- PWA 标签在 `app/+html.tsx`：`theme-color` / `mobile-web-app-capable` / `manifest` / `apple-touch-icon`（180 + 1024）/ `apple-mobile-web-app-title` / `application-name` / `description`。
- PWA 资源放 `public/`（`manifest.json` + `icons/*.png`），Expo `web.output:"static"` 构建时自动拷贝到 `dist/` 根。**iOS 只用 `apple-touch-icon`，不读 manifest 图标**，故 `public/icons/icon-1024.png` 必须存在，否则主屏无图标（见 §12.3）。
- 改图标流程：更新 `assets/images/icon.png` → 用 Pillow 重生成 `public/icons/*`（压主题深底 `#0D0D0D` 消透明）→ 重新 `expo export`。

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
# 1. 云端模式构建（输出到 dist/，PWA 资源由 public/ 自动拷贝，无需额外后处理）
CI=true EXPO_PUBLIC_USE_CLOUD=true npx expo export --platform web
# 2. 上传到服务器（凭证在 gitignored 的 server-credentials.json，绝不进提交）
PYTHONPATH=/abs/path/to/wordhoard python3 scripts/deploy_frontend.py
#    → 备份旧 dist 为 dist.bak.bak，B2 SFTP 上传 dist/ 到 /opt/learning/frontend/dist
#    → 纯静态，无需 reload nginx
```
- PWA 图标/manifest 来自 `public/`（Expo `output:"static"` 自动拷贝）。改图标：更新 `assets/images/icon.png` → 用 Pillow 重新生成 `public/icons/*` → 重新构建。

### 后端（Django + Gunicorn + systemd）
```bash
# 无 model 变更的部署（git merge origin/main + sudo restart，跳过 migrate 规避 SQLite 陷阱）：
PYTHONPATH=/abs/path/to/wordhoard python3 scripts/deploy_backend_nomigrate.py
# 有 model 变更时，服务器端再执行迁移：
cd /opt/learning/backend && DJANGO_SETTINGS_MODULE=config.settings.prod ./venv/bin/python manage.py migrate
# 重启服务（sudo 密码同服务器密码）：
echo '<PW>' | sudo -S systemctl restart learning.service && systemctl is-active learning.service
```
- ⚠️ **致命坑**：`manage.py` 默认连 **SQLite**（`dev.py`），运行的 gunicorn 才用 `config.settings.prod` + `.env` → MySQL。服务器上任何 `manage.py` 探查/迁移**必须加 `DJANGO_SETTINGS_MODULE=config.settings.prod`**，否则悄悄操作 SQLite，线上无变化。
- 后端运行需 `DJANGO_SETTINGS_MODULE=config.settings.prod`。
- MySQL 本机读：`sudo mysql -u root learning`（公网 3306 被挡，仅本机可访问）。
- 凭证：`server-credentials.json`（gitignored，绝不写进任何提交/日志）。

### 数据库迁移
```bash
# 仅当有 model 变更（新增/改字段）时才需要；否则跳过
cd /opt/learning/backend && DJANGO_SETTINGS_MODULE=config.settings.prod ./venv/bin/python manage.py migrate
```
- 生产库写（修数据）可直接用 `PYTHONPATH=<repo> python3` 跑临时 Django 脚本（务必加 prod settings），执行前**必须向用户确认**，并回读验证、保留可逆信息。

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

- **发布分支**：当前发布分支为 `main`（近期修复均直接合入 `main` 并经用户确认后部署，遵循第 0 节工作流）。下次发布前确认 `main` 与服务器 `/opt/learning/frontend/dist` 一致即可。
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

## 11. 功能更新（2026-07-22）：今日报告 / 每日新词上限 / 测试模块 / 复习

分支 `feature/daily-report-quiz`（基于 main @ 63e0e1d，14 commit，**已于 `c4a1fc7` 合并入 main**）。由 superpowers subagent 驱动 TDD 完成 T1–T12，全部 tsx 测试绿、tsc 0、expo export 17 路由成功。

新增能力：
- **修 StudyLog 断点**：`app/(tabs)/index.tsx` 的 `handleGrade` 评分后调 `postStudyLogs`（本地经 `repo.addStudyLog`，云端经 `httpRepo.postStudyLogs`）。studylog 本地结构含 `source`/`isNew`。
- **今日报告**（统计页）：`getTodayStats` → 今日学习数 / 今日掌握率 / 今日词明细（评级+时间）。
- **每日新词上限**：每用户全局（默认 20），`getDailyNewWordGoal`/`setDailyNewWordGoal`（AsyncStorage `wb_daily_goal_{userId}`）；`getNextQuizWord` 加 `allowNew` 闸门，达上限只推到期复习；`index.tsx` 的 `loadNext` 已接（取 goal + 今日计数传入）。
- **练习 Tab**（新增，测试+复习合并入口）：
  - 每日测试：范围（全部/薄弱词/最近7天/自选-TODO）/ 题型（默写/选择/词组多选）；`QuizRunner` 对=Good(2)/错=Again(0) + `addStudyLog source:'quiz'`。
  - 复习：最近 N 天（7/14/30）翻卡四档评分 + `addStudyLog source:'review'`。
- 数据层：`lib/data/quiz.ts`(闸门+getTodayNewWordCount)、`stats.ts`(getTodayStats)、`settings.ts`、`review-scope.ts`(getRecentWords)、`quizgen.ts`(题目生成)、`repo.ts`(+addStudyLog/listStudyLogs)、`memoryRepo`/`asyncStorageRepo` 实现、`lib/__tests__/quizgen.test.ts` 等。

设计/计划：`docs/plans/2026-07-22-daily-report-quiz-design.md` + `2026-07-22-daily-report-quiz.md`。

服务器写操作（**已完成**）：`d5ad027` 云端同步新增 `settings/`、`study-logs/list/` 端点；migration **0003**（`user_settings` 表 + `study_logs.source`/`is_new` 字段）**已在生产库执行**（2026-07-22 只读核查确认：`user_settings` 表与 `source`/`is_new` 字段均存在、`django_migrations` 含 `vocab 0003`）。

状态：**已合并 main（`c4a1fc7`）+ 云端同步（`d5ad027`）+ 已部署 `learning.yusuan.xyz`**。本地 `feature/daily-report-quiz` 分支已完全并入 main（可删除，未单独推送 GitHub）。

## 12. 功能更新（2026-07-22 晚间）：自定义词本逐词删除 / 释义错乱修复 / PWA 图标

### 12.1 自定义词本管理员逐词删除（commit `4d1c88e`，已部署）
- **后端** `backend/apps/vocab/views.py` — `WordbookViewSet.words` 的 DELETE 分支权限收口：
  - 系统词本仅**管理员**可删；自定义词本仅**所有者或管理员**可删（无权限返回 403）。
  - 兼容 `word_id` 走 body 或 query 参数。
  - 删除 `WordbookWord` 关联时，一并 `UserWordProgress.objects.filter(wordbook, word).delete()` 清理孤儿进度（避免重加时误判已掌握）。
- **前端** `app/wordbook-detail.tsx` — 仅当词本 `type==='custom'` 且当前用户为管理员/所有者时，每个单词行显示删除按钮（垃圾桶图标）；点击弹确认框，确认后调 `repo.removeWordFromWordbook` 即时移除该词并 `refreshBooks()` 同步词本计数。
- **DAL** `lib/data/repo.ts` 的 `removeWordFromWordbook` 在 `httpRepo` / `asyncStorageRepo` / `memoryRepo` 均已实现，本地/云端一致。
- 无 model 变更 → 部署跳过 migrate。

### 12.2 词本单词 `translation` 错乱修复（生产库写，已确认执行，无代码变更）
- **现象**：自定义词本「默写错误词汇」中 `source` / `reliability` / `innovation` / `modify` / `well-defined` 共 5 词的 `translation`（列表/卡面主释义）被历史旧版查词流程误填成**别的词目**意思（sou 法币 / re: 邮件前缀 / se / mo / well），但 `definitions`（展开详查）正确——即"后面一个释义才对"。
- **根因**：旧版解析误取别的词目；当前 `app/add-modal.tsx` 已用 `formatChineseSummary(definitions)` 取正确值，不会复发。
- **修复**：对 5 个 `Word` 行执行 `UPDATE words SET translation = definitions[0] 主义`（生产库写，用户确认），DB 回读确认。高中系统词本干净；全库 3749 词中"释义与主词零字重叠"仅此 5 个（另 3 个 none/hooray/pop 为正常异义，非错乱）。

### 12.3 iOS PWA 添加到主屏幕无图标（commit `2361344`，已部署）
- **根因**：`app/+html.tsx` 硬编码引用 `/manifest.json` 与 `/icons/icon-1024.png`，但项目**无 `public/` 目录**；Expo `web.output:"static"` 只把 `public/` 拷贝进 `dist`，故构建产物缺这俩文件。线上 nginx 对缺失路径回退到 SPA 的 `index.html`，把 404 伪装成 `200 text/html`（实测 `/icons/icon-1024.png` 返回 19817 字节 HTML）。**iOS 不读 manifest 图标、只用 `apple-touch-icon`**，拿不到真图 → 主屏图标空白/截图。
- **修复**：
  - 新增 `public/manifest.json`（192/512/1024 + `maskable` 声明），Expo 构建自动拷贝到 dist 根 → `/manifest.json`。
  - 新增 `public/icons/`：用 Pillow 把 `assets/images/icon.png`（1024、带透明）压到主题深底 `#0D0D0D` 消除透明通道，生成 1024/512/192/180 及 `maskable` 共 5 张 PNG。
  - `app/+html.tsx`：`apple-touch-icon` 补 `sizes="180x180"` 并保留 1024，iOS 优先取精确尺寸。
- **线上验证**：`/icons/icon-1024.png` → `200 image/png`（43094B）；`/icons/icon-180.png` → `200 image/png`（9181B）；`/manifest.json` → `200 application/json`（892B，此前为 `text/html`）。
- **用户侧**：已加过旧图标的主屏入口需先删除 → 刷新页面 → 重新「添加到主屏幕」，iOS 才会重新抓取图标。
- **注意**：PWA 资源走 Expo `public/` 机制；若日后换图标，改 `assets/images/icon.png` 后重新构建即可，`public/icons/` 由脚本生成（见仓库根 `icon-generate` 流程或手动 Pillow 脚本）。
