# 生产环境部署文档

> 御算词擎（learning.yusuan.xyz）生产部署操作手册。

## 1. 服务器基本信息

| 项目 | 值 |
|------|-----|
| IP | 47.103.133.232 |
| 用户 | admin |
| 域名 | learning.yusuan.xyz（HTTPS，Let's Encrypt 证书） |
| OS | Linux（阿里云 ECS） |
| Node.js | v20.20.2 |
| 项目根目录 | `/opt/learning/` |
| 前端静态文件 | `/opt/learning/frontend/dist/`（Nginx root） |
| 后端代码 | `/opt/learning/backend/` |
| 后端端口 | 127.0.0.1:8003（Gunicorn，仅本机） |
| MySQL | learning 库，utf8mb4，仅本机 3306 可访问 |
| Redis | db0（GESP 共享）/ db1（learning 专用） |

## 2. 架构总览

```
浏览器 PWA (learning.yusuan.xyz)
    │
    ├── 静态资源 ──► Nginx (443 SSL)
    │                  root: /opt/learning/frontend/dist
    │                  ├── *.html → no-cache
    │                  └── _expo/static/* → 1y immutable
    │
    └── /api/* ──► Nginx proxy_pass → 127.0.0.1:8003
                     ├── Gunicorn (2 workers, gevent)
                     ├── Django 5.x + DRF
                     ├── MySQL (learning 库)
                     └── Redis (缓存 + 补全任务进度)
```

## 3. 前端部署（日常最常用）

### 3.1 完整流程

```bash
# ① 本地构建（在项目根目录执行）
cd /Users/michael/Workbuddy/高中学习工具/wordhoard
npx expo export --platform web
# 输出到 dist/ 目录

# ② rsync 上传到服务器
sshpass -p '<PW>' rsync -avz --delete \
  --exclude='.expo' \
  --exclude='words/similar/' \
  -e "ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no" \
  dist/ admin@47.103.133.232:/opt/learning/frontend/dist/

# ③ 无需重启任何服务（纯静态文件，Nginx 直接读取）
```

### 3.2 关键参数说明

| 参数 | 作用 |
|------|------|
| `--delete` | 删除远端多余文件（清理旧版本 hash 文件） |
| `--exclude='.expo'` | 排除 Expo 缓存目录 |
| `--exclude='words/similar/'` | 排除本地近义词缓存（体积大，线上不需要） |
| `-avz` | 归档模式 + 详细输出 + 压缩传输 |

### 3.3 ⚠️ 致命坑：部署路径

**Nginx root 是 `/opt/learning/frontend/dist/`，不是 `/opt/learning/dist/`！**

之前曾因 rsync 到错误路径导致多天代码改动未上线。务必确认目标路径包含 `frontend/`。

### 3.4 验证部署成功

```bash
# 对比本地和远端 index.html 的 MD5
md5 -q dist/index.html  # 本地
sshpass -p '<PW>' ssh admin@47.103.133.232 "md5sum /opt/learning/frontend/dist/index.html"  # 远端

# 或用 curl 验证线上返回
curl -s https://learning.yusuan.xyz/ | md5
```

### 3.5 用户端生效方式

- **桌面浏览器**：刷新页面（Ctrl/Cmd+Shift+R 强刷）
- **手机 PWA**：从后台划掉应用 → 重新打开
- HTML 文件配置了 `no-cache`，每次访问都会拉最新；JS/CSS 带 hash 指纹，文件名变则自动更新

## 4. 后端部署

### 4.1 无 Model 变更（最常见）

```bash
# SSH 到服务器
sshpass -p '<PW>' ssh admin@47.103.133.232

# 拉取最新代码
cd /opt/learning
git pull origin main

# 重启服务
echo '<PW>' | sudo -S systemctl restart learning.service

# 验证
systemctl is-active learning.service  # 应输出 active
```

### 4.2 有 Model 变更（新增/改字段）

```bash
cd /opt/learning/backend

# ⚠️ 必须指定 prod settings，否则操作的是 SQLite 而非 MySQL！
DJANGO_SETTINGS_MODULE=config.settings.prod ./venv/bin/python manage.py migrate

# 然后重启
echo '<PW>' | sudo -S systemctl restart learning.service
```

### 4.3 ⚠️ 致命坑：Django Settings

| 场景 | 设置 |
|------|------|
| 生产运行（Gunicorn） | `config.settings.prod` + `.env` → **MySQL** |
| 默认 `manage.py` | `config.settings.dev` → **SQLite** |

**服务器上任何 `manage.py` 命令必须加 `DJANGO_SETTINGS_MODULE=config.settings.prod`**，否则悄悄操作 SQLite，线上 MySQL 无变化。

### 4.4 后端服务配置

```ini
# /etc/systemd/system/learning.service
[Service]
User=admin
WorkingDirectory=/opt/learning/backend
Environment="DJANGO_SETTINGS_MODULE=config.settings.prod"
EnvironmentFile=/opt/learning/backend/.env
ExecStart=/opt/learning/backend/venv/bin/gunicorn \
    --workers 2 \
    --worker-class gevent \
    --bind 127.0.0.1:8003 \
    --timeout 60 \
    config.wsgi:application
Restart=always
```

### 4.5 查看日志

```bash
tail -f /var/log/learning/access.log   # 访问日志
tail -f /var/log/learning/error.log    # 错误日志
journalctl -u learning.service -f      # systemd 日志
```

## 5. Nginx 配置

```nginx
server {
    server_name learning.yusuan.xyz;
    listen 443 ssl;

    # 前端静态文件
    location / {
        root /opt/learning/frontend/dist;
        try_files $uri $uri/ /index.html;

        # HTML 不缓存（确保每次拿最新入口）
        location ~* \.html$ {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }

        # JS/CSS/字体等带 hash 的资源 → 长期缓存
        location ~* ^/_expo/.+\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|ico|json)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 反代
    location /api/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_cache learning_cache;
        proxy_cache_valid 200 30s;

        # 以下端点跳过缓存（高频变动）
        set $skip_cache 0;
        if ($request_method = POST) { set $skip_cache 1; }
        if ($request_method = PUT) { set $skip_cache 1; }
        if ($request_method = DELETE) { set $skip_cache 1; }
        if ($request_uri ~* "^/api/(me/|settings/|teacher/|enrich/|progress/|stats/)") {
            set $skip_cache 1;
        }
        proxy_cache_bypass $skip_cache;
        proxy_no_cache $skip_cache;
    }
}
```

修改 Nginx 配置后：
```bash
echo '<PW>' | sudo -S nginx -t && sudo -S systemctl reload nginx
```

## 6. 数据库操作

```bash
# 登录 MySQL（仅服务器本机可访问）
sudo mysql -u root learning

# 常用查询
SELECT COUNT(*) FROM words;
SELECT * FROM user_word_progress WHERE user_id = 42 LIMIT 5;
SELECT * FROM study_logs WHERE user_id = 42 ORDER BY ts DESC LIMIT 10;
```

⚠️ 生产库写操作（UPDATE/DELETE）**必须先向用户确认**，并保留可逆信息。

## 7. 完整部署检查清单

### 前端改动
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx expo export --platform web` 构建成功
- [ ] rsync 到 `/opt/learning/frontend/dist/`（注意路径！）
- [ ] MD5 对比验证
- [ ] 手机 PWA 划掉重开验证

### 后端改动
- [ ] `git pull origin main` 拉取最新
- [ ] 有 Model 变更？→ 先 `migrate`（加 prod settings）
- [ ] `systemctl restart learning.service`
- [ ] `systemctl is-active learning.service` → active
- [ ] curl API 端点验证

## 8. 回滚

### 前端回滚
```bash
# 服务器上查看备份（deploy_frontend.py 会自动备份）
ls /opt/learning/frontend/dist.bak.*

# 恢复
cp -r /opt/learning/frontend/dist.bak.<timestamp> /opt/learning/frontend/dist
```

### 后端回滚
```bash
cd /opt/learning
git log --oneline -5        # 找到要回退的 commit
git checkout <commit>       # 或 git revert
sudo systemctl restart learning.service
```

## 9. 环境变量与凭证

| 文件 | 位置 | 说明 |
|------|------|------|
| `.env` | `/opt/learning/backend/.env` | DB 密码、SECRET_KEY、ALLOWED_HOSTS |
| `server-credentials.json` | 本地（gitignored） | SSH 连接信息 |

**凭证绝不进 Git 提交、日志、文档。** 本文档中密码均以 `<PW>` 占位。
