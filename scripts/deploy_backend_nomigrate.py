"""B1 (no-migrate): server-side backend deploy via git.

Used when there is NO Django model change (no migration needed).
Steps: backup-commit -> fetch -> merge origin/main -> sudo restart learning.
"""
import sys
from scripts.ssh_client import SSHClient


def step(c, label, cmd, sudo=False, timeout=120):
    print(f"\n===== [STEP] {label} =====")
    print(f"$ {cmd}{' (sudo)' if sudo else ''}")
    code, out, err = (c.sudo_run(cmd, timeout=timeout) if sudo else c.run(cmd, timeout=timeout))
    sys.stdout.write(out)
    sys.stderr.write(err)
    print(f"--- exit code: {code} ---")
    return code


def main():
    with SSHClient() as c:
        if step(c, "pre: branch + status",
                "cd /opt/learning && git branch --show-current && echo '---' && git status --short") != 0:
            print("PRE-CHECK FAILED"); sys.exit(1)

        step(c, "B1.0 set local git identity",
             "cd /opt/learning && git config user.name deploy && git config user.email deploy@local")

        code = step(c, "B1.1 backup commit",
                    "cd /opt/learning && git add -A && git commit -m \"backup: pre-cloud-deploy $(date +%Y%m%d-%H%M%S)\"")
        if code != 0:
            _, out, _ = c.run("cd /opt/learning && git status --porcelain | head", timeout=20)
            if out.strip():
                print("ABORT: uncommitted changes remain and commit failed"); sys.exit(1)
            print("Tree was clean; continuing.")

        if step(c, "B1.2 fetch", "cd /opt/learning && git fetch origin", timeout=120) != 0:
            print("FETCH FAILED"); sys.exit(1)
        if step(c, "B1.3 merge origin/main",
                "cd /opt/learning && git merge origin/main --no-edit", timeout=120) != 0:
            print("MERGE FAILED/CONFLICT — aborting. Resolve manually on server.")
            sys.exit(1)

        # 无 model 变更 → 跳过 migrate

        if step(c, "B1.4 (sudo) restart learning", "systemctl restart learning", sudo=True, timeout=60) != 0:
            print("RESTART FAILED"); sys.exit(1)
        if step(c, "B1.5 service status",
                "systemctl is-active learning && sleep 2 && systemctl status learning --no-pager | head -8",
                sudo=True, timeout=30) != 0:
            print("STATUS CHECK WARN")

        print("\n===== B1 (no-migrate) DONE =====")


if __name__ == "__main__":
    main()
