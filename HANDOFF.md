# HANDOFF — 御算词擎（高中词汇学习 PWA）开发交接

> 本文件供接手开发的 AI 阅读。最后更新：2026-07-24（练习模块UX修复 + 全局Alert兼容 + 部署路径修正）。

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
d42027a feat: 加练模式只学新词，跳过复习词
4395cf7 fix: 练习模块5项UX修复（提示位置/默写无提示/选择无大写/加练弹窗）
be59c66 fix: 全局Alert.alert替换为Web兼容浮层(WebAlertProvider)
d9dbe8f fix: 修复QuizRunner hooks顺序违规(React error 310)
(prev)  fix: 练习模块6项UX改进（下划线/提示按钮/返回按钮/首字母大写）
(prev)  fix: 统计页滚动 + 每日学习完成后重启又进入学习
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

## 13. 功能修复（2026-07-23 深夜）：学习环节闪卡无限循环 + 数据清理 + 部署阻塞

### 13.1 Bug 描述
学员 zhangshanzhi（user_id=42）反馈：学习环节翻卡后不停加载同一个词，无法前进。后续其他学员也有同样问题。

### 13.2 根因（两个 Bug）

**Bug A — handleGrade 竞态（`app/(tabs)/index.tsx`）**
`handleGrade` 调用 `loadNext()` 未 `await`，导致「选中下一词（读进度）」与 `reviewWord` 内部 `setProgress`（PUT 写进度落库）并发执行。`setProgress` 中 `invalidateProgressCache()` 在 `await api(PUT)` 之前调用 → 缓存先失效 → 并发的 `getProgressCache()` 重新拉取全量进度 → GET 在 PUT 落库前返回旧值 → 刚学过的词仍被当作新词（fresh[0]，字母序第一个未学词）选中 → 永远卡在同一词。

**Bug B — 每日新词计数未去重（`lib/data/quiz.ts`）**
`getTodayNewWordCount` 只数 `isNew` 日志条数，未按 `wordId` 去重。Bug A 循环期间同一词产生 N 条 `isNew` 日志 → `todayCount` 被高估 → 提前触发 `dailyNewWordGoal` 上限 → `allowNew=false` + 无到期复习词 → 返回 `null` → 显示"今日新词已学完"但实际大量词未学。

### 13.3 已完成的修复（3 个文件）

| 文件 | 改动 |
|------|------|
| `app/(tabs)/index.tsx:178` | `loadNext()` → `await loadNext()` |
| `lib/data/httpRepo.ts:395` | `setProgress` 中 `invalidateProgressCache()` 移到 `await api(PUT)` 之后 |
| `lib/data/quiz.ts:111` | `getTodayNewWordCount` 返回 `new Set(logs.map(l=>l.wordId)).size` 去重 |

同时在 `index.tsx` 首行加了一个 `BUILD_MARKER` 注释（用于部署验证，可删除）。

### 13.4 已完成的 Git 操作
- 分支 `fix/study-loop-race` → 已合并到 `main`（commit `f7c3a45`）
- 已 `git push origin main`（`102b86c..f7c3a45`）
- 本地 main 工作区干净；服务器 `/opt/learning` 有 3 个文件的未提交修改（通过 SFTP 上传）

### 13.5 已完成的数据库清理
通过 SSH (paramiko, admin@learning.yusuan.xyz, MySQL learning 库)：
- **zhangshanzhi (user_id=42)**：删除 2026-07-23 全部 study_logs（30条 → 0条）+ 关联的 7 个 word 的 progress
- **admin (user_id=1)**：删除 2026-07-23 全部 study_logs（93条 → 0条）+ 关联的 23 个 word 的 progress
- **firm (user 42)**：单独清理了 firm 的 3 条循环日志 + progress（residual from 旧代码）

### 13.6 关键发现：服务器连接信息
- SSH：`admin@learning.yusuan.xyz:22`，密码同服务器 sudo 密码
- MySQL：`sudo mysql -u root learning`（本机可访问，公网 3306 被挡）
- gesp_trainer 库中用户查 `auth_user` 表（`user_profile` 无 username 字段）
- 仓库路径：`/opt/learning/`（**不是** `/opt/learning/wordhoard/`）
- Node：v20.20.2，npm：10.8.2，已配置阿里镜像 `npmmirror.com`
- npm 依赖已于 2026-07-23 首次安装到 `/opt/learning/node_modules`

### 13.7 ⚠️ 未解决 — 部署阻塞问题

**现象**：服务器源码已更新（MD5 确认），但 `expo export --platform web` 构建产物与旧版**字节级完全相同**（entry JS hash 始终为 `1493fc9766b64761acfdd64fed9ce6d4`）。即使：
- 源码添加了 `BUILD_MARKER` 注释
- 清除了 `.expo/`、`node_modules/.cache/`、`/tmp/metro-cache/`、`/home/admin/.expo/`
- 使用 `--clear` 参数

构建产物分析和线索：
- entry JS 中搜索不到 `loadNext`、`handleGrade`、`BUILD_MARKER` 字符串
- dist 只有两个 JS 文件：`entry-*.js`（4.12MB）和 `dictCache-*.js`（2.53MB）
- 每个路由生成静态 HTML（~20.8kB），可能 JS 在 HTML 中内联
- Nginx 对 `_expo/static/js/` 设了 `Cache-Control: public, immutable + expires 1y`
- `package.json` 中有 `build:web:cloud` 脚本：`EXPO_PUBLIC_USE_CLOUD=true expo export --platform web && node scripts/pwa-postbuild.mjs`
  — **此前未使用 `pwa-postbuild.mjs`**，可能缺少后处理步骤

**建议排查方向**：
1. 先跑完整的 `npm run build:web:cloud`（而非裸 `npx expo export`），看 `pwa-postbuild.mjs` 是否影响
2. 检查静态 HTML 中是否内联了页面组件 JS（`dist/index.html` 可能内嵌 `index.tsx` 的编译代码）
3. 尝试用 `npx expo start --web` 启动开发服务器验证修复生效，再处理生产构建问题
4. 检查 Metro 是否有额外的系统级缓存（`/root/.cache`、systemd 临时目录等）

### 13.8 临时脚本（本地，未提交）
`scripts/` 下曾创建多个一次性探查/部署/清理脚本（`probe_*.py`、`cleanup_*.py`、`check_*.py`、`deploy_now.py`、`deploy.sh`、`compare_files.py` 等）。`deploy.sh` 已上传至服务器 `/opt/learning/`。本地尝试删除失败后手动清理。

## 14. 功能修复（2026-07-24）：部署路径修正 + 练习模块UX + 全局Alert兼容

### 14.1 部署路径修正（关键发现）

**现象**：所有代码改动在手机端/桌面端均不生效。

**根因**：Nginx 配置的前端静态文件目录是 `/opt/learning/frontend/dist/`，而之前所有 rsync 部署都发到了 `/opt/learning/dist/`（错误路径）。导致多天以来的代码改动均未上线。

**修复**：重新 rsync 到正确路径 `/opt/learning/frontend/dist/`，已验证 MD5 一致 + `Cache-Control: no-cache` 生效。

ℹ️ **部署命令（正确版）**：
```bash
sshpass -p '<PW>' rsync -avz --delete --exclude='.expo' --exclude='words/similar/' \
  -e "ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no" \
  dist/ admin@47.103.133.232:/opt/learning/frontend/dist/
```

### 14.2 统计页滚动 + 每日学习完成状态修复

| 文件 | 改动 |
|------|------|
| `app/(tabs)/stats.tsx` | 外层 `<View>` → `<ScrollView>`，解决手机端无法滚动 |
| `app/(tabs)/index.tsx` | `loadNext` 增加 early return：当 `!inExtra && todayCount >= goal && goal > 0 && prio.length === 0` 时直接 `setWord(null)` 显示“今日已学完”页面 |

**根因**：每日目标完成后 `getNextQuizWord(allowNew=false)` 仍返回到期复习词（如 grade=Again 的词 due=now），导致重启后又直接进入学习。

### 14.3 练习模块 UX 改进（两轮修复）

**第一轮**（分支 `fix/quiz-ux-improvements`）：

| 问题 | 修复 |
|------|------|
| 词组默写下划线太短 | 改为连续等宽格式 `_____ ___ ___`（monospace 字体，每字母一个 `_`） |
| 提示按钮 | 新增「提示（填30%字母）」按钮，随机揭示答案中 30% 的字母，每题限用一次 |
| 词组填空不体现字母数 | 下划线长度改为与答案字母数一致（`lib/quizgen.ts` 中 `'___'` → `'_'.repeat(target.length)`） |
| 例句选择首字母大写 | 移除句子的 `textTransform: 'capitalize'` |
| 返回按钮无效 | `Alert.alert()` 在 Web/PWA 不生效 → 改为自定义确认浮层（取消/确定退出） |

**React error 310 紧急修复**：`useState(showExitConfirm)` 误放在条件 `return` 之后，违反 React hooks 规则。手机端崩溃（error 310），桌面端显示“该范围暂无单词”。已将 `useState` 移到组件顶层。

**第二轮**（分支 `fix/quiz-ux-v2`）：

| 问题 | 修复 |
|------|------|
| 默写题型不应有提示 | 提示按钮仅限 `phrase`/`phrase-blank` 题型显示 |
| 选择题单词首字母大写 | 移除 `qHeadlineEn` 样式（`textTransform: 'capitalize'`） |
| 词组默写/填空提示位置 | 提示不再填入输入框，改为在题干区显示（如 `提示：b___ _he i__`） |
| 加练确认弹窗无响应 | `webAlert` 加入 `useCallback` 依赖数组 |

### 14.4 全局 Alert.alert 替换为 Web 兼容浮层

**问题**：React Native Web 的 `Alert.alert()` 在 PWA 环境下不弹窗、回调不触发，影响 16 处功能（加练确认、删除词本、保存反馈等）。

**方案**：新建 `components/WebAlert.tsx`：
- `WebAlertProvider`：全局 Context Provider，渲染自定义浮层（支持 1/2/多按钮，cancel/destructive 样式）
- `useWebAlert()` hook：返回 `webAlert(title, message?, buttons?)` 函数，API 兼容 `Alert.alert()`
- 已在 `app/_layout.tsx` 根布局中接入 Provider

**替换范围**（5 个文件 16 处）：
- `app/(tabs)/index.tsx`：加练确认弹窗
- `app/(tabs)/weak.tsx`：加入重练提示
- `app/(tabs)/library.tsx`：切换词本/删除词本确认
- `app/wordbook-detail.tsx`：删除单词/批量补全确认
- `app/add-modal.tsx`：保存成功/失败/验证提示

保留不动：`lib/syncIo.ts` 的 `Alert.alert`（在 `Platform.OS !== 'web'` 分支内，仅 native 触发）。

### 14.5 其他代码审计发现

- QuizRunner.tsx 变量遮蔽：`const results = await Promise.allSettled(...)` 遮蔽组件 state `results` → 重命名为 `settled`
- 全页面滚动审查：审查所有 15 个 .tsx 页面，仅 stats.tsx 有问题（已修复），其余均正确使用 ScrollView/FlatList

### 14.6 加练模式只学新词（分支 `feature/extra-new-only`）

**需求**：加练的 10 个单词不要再复习，直接进入新单词，但后续逻辑和每日学习一样（学完后可进入巩固测试）。

**实现**：
- `lib/quizSelection.ts`：`selectQuizWord` 新增 `newOnly` 参数，为 `true` 时跳过 priority/due 分支，只从 fresh（从未学过）中按字母序选取
- `lib/data/quiz.ts`：`selectQuizWordForWordbook` / `getNextQuizWord` 透传 `newOnly`
- `app/(tabs)/index.tsx`：`loadNext` 中加练模式（`inExtra=true`）传入 `newOnly=true`

**加练流程（改后）**：
1. 点击「继续学习新词（+10）」→ 确认弹窗
2. 直接进入 10 个纯新词学习（不穿插复习词）
3. 每学完一个 → 闪卡 + 评分（与每日学习一致）
4. 10 个学完 → 回到“今日已学完”页面 → 可点「开始巩固测试」进入复习流程

巩固测试自动包含加练中学的新词（通过 `study_logs` 的 `isNew=true` 记录查询）。

## 15. 功能更新（2026-07-24）：加练模式自动巩固流程

### 15.1 需求
加练模式的巩固流程和每日学习一样：翻卡片学完 N 个新词后 → 闪卡三轮确认 → 选择释义测试 → 默写测试 → 结果。

**改前**：加练学完新词后直接回"今日已学完"页面，没有专属巩固入口。

**改后**：加练学完自动进入巩固流程，仅针对本批加练词。

### 15.2 实现（仅 `app/(tabs)/index.tsx`）

| 改动 | 说明 |
|------|------|
| `extraWordIdsRef`（new） | `useRef<Set<string>>()`，加练期间每学一个 `isNew` 词就 push 进 Set |
| `handleGrade` | 加练词 `isNew` 时 `extraWordIdsRef.add(word.id)`；`extraRemaining` 减到 0 后调 `startExtraReview()` 并 return（跳过 `loadNext`） |
| `startExtraReview`（new） | 取 `extraWordIdsRef` 中所有 ID → `repo.getWord()` 逐个拉完整词数据 → 按字母序排 → 启动 reviewPhase 状态机（fetching→flashcards→choice→dictation→done） |
| `exitReview` | 检测 `extraWordIdsRef.size>0` → 加练巩固结束：重置 `extraWordIdsRef`、`setExtraRemaining(null)`；否则日常巩固：`setReviewCompleted(true)` |
| `confirmExtraPractice.onPress` | 新开一轮加练前先 `extraWordIdsRef = new Set()` 清空上一轮 |
| done 阶段 UI | `extraWordIdsRef.size>0` 时显示「加练巩固完成！」+「本轮 N 个新词已巩固」，否则显示原有文案 |

### 15.3 加练完整流程（改后）

```
用户点"继续学习新词(+10)" → 确认弹窗
  ↓ (extraWordIdsRef 清零)
翻卡片学 10 个新词（newOnly=true，不穿插复习词）
每个 isNew 词 → extraWordIdsRef.add(wordId)
  ↓ extraRemaining → 0
自动触发 startExtraReview()
  ↓
闪卡三轮确认（认识/不认识）
  ↓
选择释义测验（QuizRunner, type=choice）
  ↓
默写测验（QuizRunner, type=dictation）
  ↓
「加练巩固完成！」结果页（选择正确率 + 默写正确率）
  ↓ 点击"返回学习"
回到"今日已学完"页面（可再继续加练或结束）
```

### 15.4 与日常巩固的区别

| | 日常巩固 | 加练巩固 |
|---|---|---|
| 触发 | 手动点「开始巩固测试」 | 加练学完后自动触发 |
| 词源 | 今天全部 isNew 日志 | 本批加练的 wordIds |
| 完成后 | `reviewCompleted=true`，按钮隐藏 | 重置加练状态，可再次加练 |
| 结果页 | 「巩固完成！今日新词已巩固」 | 「加练巩固完成！本轮 N 个新词已巩固」 |


