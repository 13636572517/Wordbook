"""B1: server-side backend deploy via git (方案B).
Reads credentials from gitignored server-credentials.json.
Steps: backup-commit -> fetch -> merge origin/main -> migrate -> restart.
Prints each step; aborts on first non-zero exit.
"""
import sys
from scripts.ssh_client import SSHClient


def step(c, label, cmd, timeout=120):
    print(f"\n===== [STEP] {label} =====")
    print(f"$ {cmd}")
    code, out, err = c.run(cmd, timeout=timeout)
    sys.stdout.write(out)
    sys.stderr.write(err)
    print(f"--- exit code: {code} ---")
    return code


def main():
    with SSHClient() as c:
        # pre-check
        if step(c, "pre: branch + status", "cd /opt/learning && git branch --show-current && echo '---' && git status --short") != 0:
            print("PRE-CHECK FAILED"); sys.exit(1)

        # 0) ensure a local git identity exists for this repo (needed for commits/merges)
        step(c, "B1.0 set local git identity",
             "cd /opt/learning && git config user.name deploy && git config user.email deploy@local")

        # 1) backup commit of current uncommitted changes
        code = step(c, "B1.1 backup commit",
                    "cd /opt/learning && git add -A && git commit -m \"backup: pre-cloud-deploy $(date +%Y%m%d-%H%M%S)\"")
        if code != 0:
            # nothing to commit is fine; other errors abort
            print("NOTE: backup commit returned non-zero; checking if tree was clean")
            _, out, _ = c.run("cd /opt/learning && git status --porcelain | head", timeout=20)
            if out.strip():
                print("ABORT: uncommitted changes remain and commit failed"); sys.exit(1)
            print("Tree was clean; continuing.")

        # 2) fetch + merge origin/main
        if step(c, "B1.2 fetch", "cd /opt/learning && git fetch origin", timeout=120) != 0:
            print("FETCH FAILED"); sys.exit(1)
        code = step(c, "B1.3 merge origin/main",
                    "cd /opt/learning && git merge origin/main --no-edit", timeout=120)
        if code != 0:
            print("MERGE FAILED/CONFLICT — aborting. Resolve manually on server.")
            sys.exit(1)

        # 3) migrate (MySQL)
        if step(c, "B1.4 migrate",
                "cd /opt/learning/backend && ./venv/bin/python manage.py migrate", timeout=180) != 0:
            print("MIGRATE FAILED"); sys.exit(1)

        # 4) restart service
        if step(c, "B1.5 restart learning", "systemctl restart learning", timeout=60) != 0:
            print("RESTART FAILED"); sys.exit(1)
        if step(c, "B1.6 service status", "systemctl is-active learning && sleep 2 && systemctl status learning --no-pager | head -8", timeout=30) != 0:
            print("STATUS CHECK WARN"); 

        print("\n===== B1 DONE =====")


if __name__ == "__main__":
    main()
