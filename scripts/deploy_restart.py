"""B1 finalize: migrate (idempotent) + sudo restart + verify status."""
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


def main():
    with SSHClient() as c:
        if step(c, "F1 migrate (idempotent)",
                "cd /opt/learning/backend && ./venv/bin/python manage.py migrate", timeout=180) != 0:
            print("MIGRATE FAILED"); sys.exit(1)
        if sudo_step(c, "F2 restart learning", "systemctl restart learning", timeout=60) != 0:
            print("RESTART FAILED"); sys.exit(1)
        if step(c, "F3 status",
                "systemctl is-active learning && sleep 2 && systemctl status learning --no-pager | head -8", timeout=30) != 0:
            print("STATUS WARN")
        print("\n===== B1 FINALIZE DONE =====")


if __name__ == "__main__":
    main()
