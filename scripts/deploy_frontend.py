"""B2: deploy frontend dist to server via SFTP (backup + clean + upload)."""
import os
import sys
import paramiko
from scripts.ssh_client import load_creds

LOCAL_DIST = "/Users/michael/WorkBuddy/高中学习工具/wordhoard/dist"
REMOTE_DIST = "/opt/learning/frontend/dist"


def connect():
    creds = load_creds()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=creds["host"],
        port=int(creds.get("port", 22)),
        username=creds["user"],
        password=creds["password"],
        timeout=15,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def run(client, cmd, timeout=60):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def main():
    client = connect()
    try:
        # 1) backup existing dist (reversible)
        ts = run(client, "date +%Y%m%d-%H%M%S")[2].strip() or "bak"
        bak = f"{REMOTE_DIST}.bak.{ts}"
        code, out, err = run(client, f"cp -r {REMOTE_DIST} {bak} && echo backed_up_to {bak}")
        print(f"[backup] exit={code} {out.strip()} {err.strip()}")
        if code != 0:
            print("BACKUP FAILED"); sys.exit(1)

        # 2) clean remote dist contents
        code, out, err = run(client, f"rm -rf {REMOTE_DIST} && mkdir -p {REMOTE_DIST}")
        print(f"[clean] exit={code} {err.strip()}")
        if code != 0:
            print("CLEAN FAILED"); sys.exit(1)

        # 3) upload local dist recursively
        sftp = client.open_sftp()

        def put_dir(local, remote):
            count = 0
            for name in os.listdir(local):
                lpath = os.path.join(local, name)
                rpath = remote + "/" + name
                if os.path.isdir(lpath):
                    try:
                        sftp.stat(rpath)
                    except IOError:
                        sftp.mkdir(rpath)
                    count += put_dir(lpath, rpath)
                else:
                    sftp.put(lpath, rpath)
                    count += 1
            return count

        n = put_dir(LOCAL_DIST, REMOTE_DIST)
        sftp.close()
        print(f"[upload] uploaded {n} files to {REMOTE_DIST}")

        # 4) verify remote count
        code, out, err = run(client, f"find {REMOTE_DIST} -type f | wc -l")
        print(f"[verify] remote file count = {out.strip()}")
        # 5) reload nginx (static files; harmless) — skip if not needed
        print("\n===== B2 DONE =====")
    finally:
        client.close()


if __name__ == "__main__":
    main()
