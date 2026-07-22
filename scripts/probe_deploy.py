"""
只读确认部署前置信息：
- /opt/learning/backend 是否为 git 仓库（能否 git pull 部署）
- 服务器当前 StudyLog 模型是否缺 source/is_new（确认 gap）
- systemd unit 的工作目录与重启方式
- DB 环境变量来源（/opt/learning/backend/.env）
绝不写任何东西。
"""
from ssh_client import SSHClient

PROBES = [
    "# === git 仓库状态 ===",
    "cd /opt/learning/backend && git rev-parse --show-toplevel 2>/dev/null && git branch --show-current 2>/dev/null && git log --oneline -3 2>/dev/null && git status --short 2>/dev/null | head",
    "# === 服务器 StudyLog 模型(确认 source/is_new 是否缺失) ===",
    "grep -nE 'class StudyLog|source|is_new|isNew' /opt/learning/backend/apps/vocab/models.py 2>/dev/null || echo '(no match)'",
    "# === systemd unit ===",
    "cat /etc/systemd/system/learning.service 2>/dev/null || systemctl cat learning.service 2>/dev/null || echo '(cannot read)'",
    "# === .env (仅看键名, 不打印值) ===",
    "test -f /opt/learning/backend/.env && grep -oE '^[A-Z_]+=' /opt/learning/backend/.env || echo '(no .env)'",
    "# === nginx learning 站点(端口/upstream) ===",
    "grep -nE 'proxy_pass|server_name|listen|location' /etc/nginx/sites-enabled/learning 2>/dev/null",
]


def main():
    with SSHClient() as c:
        for probe in PROBES:
            if probe.startswith("#"):
                print(f"\n\033[1m{probe}\033[0m")
                continue
            code, out, err = c.run(probe, timeout=30)
            text = out + err
            print(text if text.strip() else f"(exit={code}, empty)")


if __name__ == "__main__":
    main()
