"""应用词组补丁到生产库。

将 scripts/.phrase_backfill/patch.json 上传到服务器，
用 Django ORM 写回 words.phrases（仅对仍无词组的词，幂等可重复执行）。

用法：python3 scripts/apply_phrase_patch.py
"""
import json
import os

from scripts.ssh_client import SSHClient

BASE = os.path.dirname(os.path.abspath(__file__))
PATCH_PATH = os.path.join(BASE, ".phrase_backfill", "patch.json")
REMOTE_PATCH = "/tmp/phrase_patch.json"

APPLY_SNIPPET = r'''
import os, sys, json, django
sys.path.insert(0, "/opt/learning/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
django.setup()
from apps.vocab.models import Word

patch = json.load(open("/tmp/phrase_patch.json", encoding="utf-8"))
updated = skipped = missing = 0
for item in patch:
    w = Word.objects.filter(id=item["id"]).first()
    if w is None:
        missing += 1
        continue
    if w.phrases:  # 已有词组则跳过（幂等）
        skipped += 1
        continue
    w.phrases = item["phrases"]
    w.save()
    updated += 1
print(f"updated={updated} skipped={skipped} missing={missing}")
'''


def main():
    if not os.path.exists(PATCH_PATH):
        print(f"补丁文件不存在: {PATCH_PATH}")
        raise SystemExit(1)
    with open(PATCH_PATH, encoding="utf-8") as f:
        patch = json.load(f)
    print(f"补丁共 {len(patch)} 词，开始上传 ...")

    with SSHClient() as c:
        sftp = c._client.open_sftp()
        with sftp.open(REMOTE_PATCH, "w") as f:
            f.write(json.dumps(patch, ensure_ascii=False))
        sftp.close()
        print("上传完成，开始写库 ...")

        sftp = c._client.open_sftp()
        with sftp.open("/tmp/apply_phrase_patch.py", "w") as f:
            f.write(APPLY_SNIPPET)
        sftp.close()

        code, out, err = c.run(
            "cd /opt/learning/backend && ./venv/bin/python /tmp/apply_phrase_patch.py",
            timeout=600,
        )
        print(f"exit={code}\n{out}")
        if err.strip():
            print("STDERR:", err.strip()[-500:])


if __name__ == "__main__":
    main()
