"""
只读探查服务器部署结构（绝不写任何东西）。
用于制定云端部署方案，不执行任何变更。
"""
from ssh_client import SSHClient

PROBES = [
    "# === 进程 ===",
    "ps aux | grep -E 'gunicorn|uwsgi|manage.py|nginx|supervisor' | grep -v grep",
    "# === systemd 服务 ===",
    "systemctl list-units --type=service --no-legend 2>/dev/null | grep -iE 'gunicorn|vocab|learning|nginx|supervisor' || echo '(none)'",
    "# === 找 Django 项目(排除 venv) ===",
    "find / -name manage.py -not -path '*/venv/*' -not -path '*/.venv/*' 2>/dev/null | head",
    "# === nginx 站点 ===",
    "ls -la /etc/nginx/sites-enabled/ 2>/dev/null; ls -la /etc/nginx/conf.d/ 2>/dev/null",
    "# === 项目目录猜测 ===",
    "ls -la /var/www 2>/dev/null; ls -la /srv 2>/dev/null; ls -la /opt 2>/dev/null; ls -la ~/ 2>/dev/null",
    "# === MySQL 是否在跑 ===",
    "systemctl is-active mysql 2>/dev/null; systemctl is-active mariadb 2>/dev/null; (mysqladmin ping 2>/dev/null || echo 'mysql ping failed')",
    "# === python / gunicorn 版本 ===",
    "which python3 gunicorn 2>/dev/null; python3 --version 2>/dev/null",
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
