# 设计文档：单词本 + 云端账户（SSO）

- 日期：2026-07-21
- 状态：**已批准（用户认可，进入 Phase 2 写计划）**
- 分支：`feature/wordbook-account`（基于 `feature/superpowers-trio`）

## 1. 目标
1. Library 按级别组织词本（高中 / 四级 / 六级 …）+ 用户自定义词本。
2. 分析并实现建词本所需的衍生功能（见 §6）。
3. 云端账户系统：不同用户登录 → 各自独立的学习进度。

## 2. 已拍板的决策
| 项 | 决策 |
|---|---|
| 账户 | 真·云端（多设备、跨设备同步） |
| 后端技术栈 | Python（Django 优先，与现有 gesp_trainer 同栈；FastAPI 备选） |
| 账户模型 | **复用 yusuan 现有账号做 SSO**（不新建 users 表） |
| 部署 | 用户阿里云轻量服务器 `47.103.133.232`，子域名 `learning.yusuan.xyz` |
| 数据库 | 新建 `learning` 库（utf8mb4 / utf8mb4_unicode_ci），服务器端 MySQL，backend 经 localhost 访问 |

## 3. 服务器环境（只读探查确认，未改动）
- MySQL 8.0.46，字符集 `utf8mb4 / utf8mb4_unicode_ci`。
- **3306 仅服务器本机可达**（外网防火墙挡；22/80/443 通）→ App 不能直连 MySQL，必须经 backend。
- 现有规范：每系统独立库 + 独立 MySQL 用户（`gesp_trainer`↔`gesp` 用户；`tradingagents` 有 `users` 表）。词汇 App 照此建 `learning` 库 + `learning` 用户。
- gesp（yusuan.xyz，Django 5.2，gunicorn `:8002`，`/opt/gesp/backend`）已装 `djangorestframework_simplejwt` + `django-cors-headers` + DRF + redis；`urls.py` 有 `api/auth/` 路由 → **已在签发 JWT 且支持跨域**。CORS 来源由 env `CORS_ORIGINS` 控制（可加 `https://learning.yusuan.xyz`）。

## 4. 目标架构
```
Expo App (Web + 手机, learning.yusuan.xyz)
   │ HTTPS
   ▼
Nginx (learning.yusuan.xyz 子域)
   ├─ 反代 → 词汇后端 API (Python, 服务器内网端口)
   │              │ 校验 gesp 签发的 JWT → 得到 yusuan user_id
   │              ▼
   │         MySQL localhost → learning 库
   └─ 托管 Expo Web 构建产物
```
- App 登录走 **gesp 的 `api/auth/`**（拿 JWT）；词汇后端**不存密码、不建用户表**。
- 所有进度按 JWT 里的 `user_id` 隔离 → 天然"不同用户不同进度"。

## 5. 数据模型（revised：无 users 表）
```sql
CREATE DATABASE learning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE wordbooks (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id    BIGINT NULL,                 -- NULL = 系统词本；否则为 yusuan user_id
  name        VARCHAR(120) NOT NULL,
  level       VARCHAR(40) NULL,            -- 'highschool' | 'cet4' | 'cet6' | NULL(自定义)
  type        ENUM('system','custom') NOT NULL DEFAULT 'system',
  source      VARCHAR(120) NULL,           -- 内置词表来源标识，如 'open-cet4'
  created_at  BIGINT NOT NULL,
  UNIQUE KEY uq_owner_name (owner_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE words (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  word         VARCHAR(120) NOT NULL,
  translation  TEXT NOT NULL,
  pronunciation VARCHAR(120) NULL,
  UNIQUE KEY uq_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wordbook_words (
  wordbook_id BIGINT NOT NULL,
  word_id     BIGINT NOT NULL,
  PRIMARY KEY (wordbook_id, word_id),
  KEY idx_ww_word (word_id),
  FOREIGN KEY (wordbook_id) REFERENCES wordbooks(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id)     REFERENCES words(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_word_progress (
  user_id     BIGINT NOT NULL,             -- yusuan user_id（来自 JWT）
  wordbook_id BIGINT NOT NULL,
  word_id     BIGINT NOT NULL,
  ef          FLOAT NOT NULL DEFAULT 2.5,
  `interval`  INT NOT NULL DEFAULT 0,
  repetitions INT NOT NULL DEFAULT 0,
  due         BIGINT NOT NULL DEFAULT 0,
  correct     INT NOT NULL DEFAULT 0,
  wrong       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, wordbook_id, word_id),
  KEY idx_progress_due (user_id, wordbook_id, due),
  FOREIGN KEY (wordbook_id) REFERENCES wordbooks(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id)     REFERENCES words(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE study_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  wordbook_id BIGINT NOT NULL,
  word_id     BIGINT NOT NULL,
  grade       TINYINT NOT NULL,
  ts          BIGINT NOT NULL,
  KEY idx_log_user (user_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
- `user_id` = gesp/yusuan 用户 id（跨库，不建外键）。
- SM-2 字段从现有 App 的 `Word` 模型原样搬上来。

## 6. 建词本牵引出的衍生功能（需求分析结论）
1. **内置词库内容源**：高中/四级/六级开放词表（受版权保护教材不可用）+ 导入管道。
2. **自定义词本 CRUD** + 单词可加入多个词本（一词多本）。
3. **学习范围限定**：quiz 改为按"所选词本"取词（现取整个桶）。
4. **词本级进度与统计**（现统计为全局）。
5. **Library 改造成"书架"UI**（分级词本 + 自定义）。
6. **跨词本搜索**。
7. **旧数据迁移**：现有 `en` 桶（AsyncStorage）→ 高中词本（迁到 MySQL）。
8. **云端实时同步**：现有本地导入/导出 → 随账户体系升级为实时云端同步。
9. **离线兜底**（云化后的新需求）：手机无网可学，上线后合并冲突。
10. **部署/运维**：子域名、nginx 反代、Expo Web 托管、HTTPS 证书。

## 7. 实施分期
- **P1 后端 + 账户（SSO）**：learning 库建表、词汇后端（Django）、接 gesp JWT、词本/单词/进度 CRUD API。
- **P2 词本功能**：内置词表导入、自定义词本、Library 书架 UI、quiz 按词本取词、旧数据迁移。
- **P3 云同步 + 统计 + 离线**：实时同步、词本级统计、离线兜底、部署收尾。

## 8. 风险与约定
- **版权**：内置词表只能用开放授权来源（课标词表 / 开源 CET 词表），不得抓取受保护教材。
- **服务器写操作（建库、migrate、部署）需另行显式确认**：当前仅做了只读探查；任何写入 prod 的动作在执行前单独征得同意。
- **JWT 校验**：词汇后端校验 gesp 签发的 JWT（共享签名密钥 或 调 gesp 的 verify/me 端点），不持有用户密码。
- 现有 App 的 IPA / 薄弱词 / 本地同步等已交付功能保持不变，仅在"数据来源"上从 AsyncStorage 切换到后端 API。
