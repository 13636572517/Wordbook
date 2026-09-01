"""只读诊断：学员 zhangshanzhi 每日新词目标(50)不生效排查。

在生产服务器执行只读 SQL，输出：
1. 学员 user_id（gesp_trainer.user_profile）
2. user_settings 中的 daily_new_word_goal
3. 今日 daily_study_sessions 与会话创建时间
4. 今日会话中 word_new 项数量 / 总项数
5. 今日 study_logs 中 is_new 去重计数
6. Nginx skip_cache 是否排除 /settings/
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ssh_client import SSHClient

REMOTE_CMD = r'''
set -e
echo "=== 服务器时间 ==="
date '+%Y-%m-%d %H:%M:%S %Z (%z)'
echo
echo "=== 1. zhangshanzhi 学员信息 ==="
cd /opt/learning/backend
DJANGO_SETTINGS_MODULE=config.settings.prod ./venv/bin/python - <<'PYEOF'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
django.setup()

from datetime import datetime
from django.db import connection
from django.utils import timezone

def q(sql, args=None):
    with connection.cursor() as cur:
        cur.execute(sql, args or [])
        return cur.fetchall()

print("--- user_profile 匹配 zhangshanzhi ---")
try:
    rows = q(
        "SELECT user_id, nickname, phone FROM gesp_trainer.user_profile "
        "WHERE nickname LIKE %s OR phone LIKE %s",
        ["%zhangshanzhi%", "%zhangshanzhi%"],
    )
    for r in rows:
        print(r)
except Exception as e:
    print("ERR:", e)
    rows = []

user_ids = [r[0] for r in rows]
if not user_ids:
    print("未找到学员，终止。")
    raise SystemExit(0)

for uid in user_ids:
    print(f"\n===== 学员 user_id={uid} =====")
    # 2. 设置
    print("--- user_settings ---")
    for r in q("SELECT * FROM user_settings WHERE user_id=%s", [uid]):
        print(r)
    # 3. 今日会话
    today = datetime.now().date()
    print(f"--- 今日({today}) daily_study_sessions ---")
    sess = q(
        "SELECT id, wordbook_id, study_date, status, current_position, created_at, updated_at "
        "FROM daily_study_sessions WHERE user_id=%s AND study_date=%s",
        [uid, today.isoformat()],
    )
    for r in sess:
        sid, wb, sdate, status, pos, cts, uts = r
        print(f"session_id={sid} wordbook={wb} status={status} pos={pos} "
              f"created={datetime.fromtimestamp(cts/1000) if cts else None} "
              f"updated={datetime.fromtimestamp(uts/1000) if uts else None}")
        # 4. 会话项统计
        print("--- 该会话 items 统计 ---")
        for r in q(
            "SELECT kind, COUNT(*), SUM(status='pending') FROM daily_study_session_items "
            "WHERE session_id=%s GROUP BY kind",
            [sid],
        ):
            print(r)
        total = q("SELECT COUNT(*) FROM daily_study_session_items WHERE session_id=%s", [sid])[0][0]
        print("TOTAL items:", total)
    # 5. 今日新词日志（全局）
    print("--- 今日 study_logs is_new 去重计数 ---")
    for r in q(
        "SELECT COUNT(DISTINCT word_id) FROM study_logs "
        "WHERE user_id=%s AND is_new=1 AND ts>=UNIX_TIMESTAMP(CURDATE())*1000",
        [uid],
    ):
        print("today_new_words:", r)
    # 5b. 最近几天每天新词数
    print("--- 近5天每日新词数(去重) ---")
    for r in q(
        "SELECT DATE_FORMAT(FROM_UNIXTIME(ts/1000), '%%Y-%%m-%%d') d, COUNT(DISTINCT word_id) "
        "FROM study_logs WHERE user_id=%s AND is_new=1 AND ts>=UNIX_TIMESTAMP(CURDATE()-INTERVAL 4 DAY)*1000 "
        "GROUP BY d ORDER BY d",
        [uid],
    ):
        print(r)

print("\n=== 6. Nginx skip_cache 配置 ===")
import subprocess
PYEOF
'''

# 单独执行 nginx 配置检查（不在 python heredoc 里）
NGINX_CMD = (
    "grep -n 'skip_cache\\|settings\\|proxy_cache_valid\\|proxy_cache_path' "
    "/etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/* 2>/dev/null "
    "| head -60"
)

if __name__ == "__main__":
    with SSHClient() as c:
        code, out, err = c.run(REMOTE_CMD, timeout=120)
        sys.stdout.write(out)
        sys.stderr.write(err)
        print(f"--- python 诊断 exit code: {code} ---")
        if code == 0:
            code2, out2, err2 = c.run(NGINX_CMD, timeout=30)
            sys.stdout.write(out2)
            sys.stderr.write(err2)
            print(f"--- nginx 检查 exit code: {code2} ---")
