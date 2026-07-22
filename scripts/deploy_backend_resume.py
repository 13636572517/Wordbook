"""B1 resume: resolve views.py conflict, finish merge, migrate, restart."""
import sys
from scripts.ssh_client import SSHClient, load_creds

_PW = load_creds()["password"]


def redact(s: str) -> str:
    return s.replace(_PW, "***REDACTED***")


def step(c, label, cmd, timeout=180):
    print(f"\n===== [STEP] {label} =====")
    print(f"$ {cmd}")
    code, out, err = c.run(cmd, timeout=timeout)
    sys.stdout.write(redact(out))
    sys.stderr.write(redact(err))
    print(f"--- exit code: {code} ---")
    return code


def sudo_step(c, label, cmd, timeout=180):
    print(f"\n===== [STEP] {label} (sudo) =====")
    print(f"$ sudo {cmd}")
    code, out, err = c.sudo_run(cmd, timeout=timeout)
    sys.stdout.write(redact(out))
    sys.stderr.write(redact(err))
    print(f"--- exit code: {code} ---")
    return code


CMD_RESOLVE = """cd /opt/learning && python3 - <<'PYEOF'
p = "backend/apps/vocab/views.py"
s = open(p, encoding="utf-8").read()
old = (
    "<<<<<<< HEAD\\n"
    "from .models import StudyLog, UserWordProgress, Word, Wordbook, WordbookWord\\n"
    "=======\\n"
    "from .models import StudyLog, UserSettings, UserWordProgress, Word, Wordbook, WordbookWord\\n"
    ">>>>>>> origin/main\\n"
)
new = "from .models import StudyLog, UserSettings, UserWordProgress, Word, Wordbook, WordbookWord\\n"
assert old in s, "conflict block not found as expected"
s = s.replace(old, new)
open(p, "w", encoding="utf-8").write(s)
print("resolved views.py import conflict")
PYEOF
"""


def main():
    with SSHClient() as c:
        if step(c, "R1 resolve conflict", CMD_RESOLVE, timeout=60) != 0:
            print("RESOLVE FAILED"); sys.exit(1)
        if step(c, "R2 git add resolved",
                "cd /opt/learning && git add backend/apps/vocab/views.py") != 0:
            print("ADD FAILED"); sys.exit(1)
        if step(c, "R3 commit merge",
                "cd /opt/learning && git commit --no-edit", timeout=60) != 0:
            print("MERGE COMMIT FAILED"); sys.exit(1)
        if step(c, "R4 show log",
                "cd /opt/learning && git log --oneline -3") != 0:
            print("LOG WARN")
        if step(c, "R5 migrate",
                "cd /opt/learning/backend && ./venv/bin/python manage.py migrate", timeout=180) != 0:
            print("MIGRATE FAILED"); sys.exit(1)
        if sudo_step(c, "R6 restart learning", "systemctl restart learning", timeout=60) != 0:
            print("RESTART FAILED"); sys.exit(1)
        if step(c, "R7 status",
                "systemctl is-active learning && sleep 2 && systemctl status learning --no-pager | head -6", timeout=30) != 0:
            print("STATUS WARN")
        print("\n===== B1 RESUME DONE =====")


if __name__ == "__main__":
    main()
